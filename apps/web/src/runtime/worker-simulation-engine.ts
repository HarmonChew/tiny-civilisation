import type {
  CausalEvidenceProjectionV1,
  CausalEvidenceQueryOptions,
  CausalEvidenceRef,
  ExperimentOutcomeComparisonV1,
  ExperimentOutcomeV1,
  PlayerCommand,
  ScheduledPlayerCommand,
  SimulationState,
} from "@tiny-civ/sim-core";
import type {
  RuntimeClientMessage,
  RuntimeOperation,
  RuntimeOperationResult,
} from "../workers/protocol";
import { isRuntimeWorkerMessage } from "../workers/protocol";
import type {
  InterventionAcknowledgement,
  LongRunningOperationOptions,
  ReplayResult,
  RunToTickResult,
  RuntimeCanonicalHash,
  RuntimeCheckpoint,
  RuntimeEntityDetail,
  RuntimeInterventionOutcomeProjection,
  RuntimeProgress,
  RuntimeQueryOptions,
  RuntimeReplay,
  SimulationEngine,
  SimulationEngineListener,
  SimulationFrame,
  SimulationRuntimeStatus,
} from "./types";

export interface SimulationWorkerLike {
  onmessage: ((event: MessageEvent<unknown>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  postMessage(message: RuntimeClientMessage): void;
  terminate(): void;
}

export interface WorkerSimulationEngineOptions {
  readonly worker?: SimulationWorkerLike;
}

interface PendingRequest<Result extends RuntimeOperationResult = RuntimeOperationResult> {
  readonly resolve: (value: Result) => void;
  readonly reject: (reason: Error) => void;
  readonly onProgress?: (progress: RuntimeProgress) => void;
  readonly removeAbortListener?: () => void;
}

interface AdvanceWaiter {
  readonly resolve: (frame: SimulationFrame) => void;
  readonly reject: (reason: Error) => void;
}

interface AdvanceBatch {
  ticks: number;
  readonly waiters: AdvanceWaiter[];
}

const INITIAL_STATUS: SimulationRuntimeStatus = {
  phase: "idle",
  playing: false,
  revision: 0,
  tick: null,
  latestRequestId: 0,
  error: null,
};

export class StaleRuntimeResponseError extends Error {
  constructor(
    readonly requestId: number,
    readonly latestResponseId: number,
  ) {
    super(
      `Ignored stale simulation response ${requestId}; response ${latestResponseId} is newer.`,
    );
    this.name = "StaleRuntimeResponseError";
  }
}

export class SimulationWorkerCrashedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SimulationWorkerCrashedError";
  }
}

function createDefaultWorker(): SimulationWorkerLike {
  return new Worker(new URL("../workers/simulation.worker.ts", import.meta.url), {
    type: "module",
    name: "tiny-civilisation-simulation",
  }) as unknown as SimulationWorkerLike;
}

function normalizeAdvanceTicks(ticks: number): number {
  if (!Number.isFinite(ticks) || ticks < 0) {
    throw new RangeError("Advance tick count must be a nonnegative finite number.");
  }
  return Math.floor(ticks);
}

function deserializeError(error: {
  readonly name: string;
  readonly message: string;
  readonly stack?: string;
}): Error {
  const result = new Error(error.message);
  result.name = error.name;
  if (error.stack) result.stack = error.stack;
  return result;
}

export class WorkerSimulationEngine implements SimulationEngine {
  readonly kind = "worker" as const;
  private readonly worker: SimulationWorkerLike;
  private readonly listeners = new Set<SimulationEngineListener>();
  private readonly pending = new Map<number, PendingRequest>();
  private currentStatus: SimulationRuntimeStatus = INITIAL_STATUS;
  private requestId = 0;
  private latestResponseId = 0;
  private disposed = false;
  private advanceInFlight = false;
  private advanceBatch: AdvanceBatch | null = null;
  private advanceDrainScheduled = false;

  constructor(options: WorkerSimulationEngineOptions = {}) {
    this.worker = options.worker ?? createDefaultWorker();
    this.worker.onmessage = (event) => this.handleMessage(event.data);
    this.worker.onerror = (event) => {
      event.preventDefault?.();
      this.crash(
        new SimulationWorkerCrashedError(
          event.message || "The simulation Worker stopped unexpectedly.",
        ),
      );
    };
  }

  get status(): SimulationRuntimeStatus {
    return this.currentStatus;
  }

  subscribe(listener: SimulationEngineListener): () => void {
    this.assertNotDisposed();
    this.listeners.add(listener);
    listener(this.status);
    return () => this.listeners.delete(listener);
  }

  create(seed?: number): Promise<SimulationFrame> {
    return this.request({ type: "create", ...(seed === undefined ? {} : { seed }) });
  }

  play(): Promise<SimulationFrame> {
    return this.request({ type: "set-playing", playing: true });
  }

  pause(): Promise<SimulationFrame> {
    return this.request({ type: "set-playing", playing: false });
  }

  advance(ticks: number): Promise<SimulationFrame> {
    this.assertNotDisposed();
    let count: number;
    try {
      count = normalizeAdvanceTicks(ticks);
    } catch (error) {
      return Promise.reject(
        error instanceof Error ? error : new Error("Invalid advance tick count."),
      );
    }
    return new Promise<SimulationFrame>((resolve, reject) => {
      if (this.advanceBatch) {
        this.advanceBatch.ticks += count;
        this.advanceBatch.waiters.push({ resolve, reject });
      } else {
        this.advanceBatch = { ticks: count, waiters: [{ resolve, reject }] };
      }
      this.scheduleAdvanceDrain();
    });
  }

  step(ticks = 1): Promise<SimulationFrame> {
    return this.request({ type: "step", ticks });
  }

  intervene(command: PlayerCommand): Promise<InterventionAcknowledgement> {
    return this.request({ type: "intervene", command });
  }

  getFrame(): Promise<SimulationFrame> {
    return this.request({ type: "get-frame" });
  }

  getState(): Promise<SimulationState> {
    return this.request({ type: "get-state" });
  }

  getCanonicalHash(options: RuntimeQueryOptions = {}): Promise<RuntimeCanonicalHash> {
    return this.request<RuntimeCanonicalHash>({ type: "get-canonical-hash" }, options);
  }

  getCheckpoint(options: RuntimeQueryOptions = {}): Promise<RuntimeCheckpoint> {
    return this.request<RuntimeCheckpoint>({ type: "get-checkpoint" }, options);
  }

  getCausalEvidence(
    focus: CausalEvidenceRef,
    query: CausalEvidenceQueryOptions = {},
    options: RuntimeQueryOptions = {},
  ): Promise<CausalEvidenceProjectionV1> {
    return this.request<CausalEvidenceProjectionV1>(
      {
        type: "get-causal-evidence",
        focus,
        ...(Object.keys(query).length === 0 ? {} : { query }),
      },
      options,
    );
  }

  getEntityDetail(
    ref: CausalEvidenceRef,
    options: RuntimeQueryOptions = {},
  ): Promise<RuntimeEntityDetail> {
    return this.request<RuntimeEntityDetail>({ type: "get-entity-detail", ref }, options);
  }

  getInterventionOutcomes(
    commands: readonly ScheduledPlayerCommand[],
    options: RuntimeQueryOptions = {},
  ): Promise<readonly RuntimeInterventionOutcomeProjection[]> {
    return this.request<readonly RuntimeInterventionOutcomeProjection[]>(
      { type: "get-intervention-outcomes", commands: [...commands] },
      options,
    );
  }

  getOutcome(options: RuntimeQueryOptions = {}): Promise<ExperimentOutcomeV1> {
    return this.request<ExperimentOutcomeV1>({ type: "get-outcome" }, options);
  }

  compareOutcome(
    baseline: ExperimentOutcomeV1,
    options: RuntimeQueryOptions = {},
  ): Promise<ExperimentOutcomeComparisonV1> {
    return this.request<ExperimentOutcomeComparisonV1>(
      { type: "compare-outcome", baseline },
      options,
    );
  }

  save(): Promise<string> {
    return this.request({ type: "save" });
  }

  load(serialized: string): Promise<SimulationFrame> {
    return this.request({ type: "load", serialized });
  }

  runToTick(
    targetTick: number,
    options: LongRunningOperationOptions = {},
  ): Promise<RunToTickResult> {
    return this.request(
      {
        type: "run-to-tick",
        targetTick,
        ...(options.chunkSize === undefined ? {} : { chunkSize: options.chunkSize }),
        ...(options.captureTicks === undefined
          ? {}
          : { captureTicks: [...options.captureTicks] }),
      },
      options,
    );
  }

  replay(
    replay: RuntimeReplay,
    options: LongRunningOperationOptions = {},
  ): Promise<ReplayResult> {
    return this.request(
      {
        type: "replay",
        replay,
        ...(options.chunkSize === undefined ? {} : { chunkSize: options.chunkSize }),
        ...(options.captureTicks === undefined
          ? {}
          : { captureTicks: [...options.captureTicks] }),
      },
      options,
    );
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    const error = new Error("Simulation engine is disposed.");
    for (const request of this.pending.values()) {
      request.removeAbortListener?.();
      request.reject(error);
    }
    this.pending.clear();
    this.rejectAdvanceBatch(error);
    this.worker.onmessage = null;
    this.worker.onerror = null;
    this.worker.terminate();
    this.currentStatus = {
      ...this.currentStatus,
      phase: "disposed",
      playing: false,
      error: null,
    };
    this.emit();
    this.listeners.clear();
  }

  private request<Result extends RuntimeOperationResult>(
    operation: RuntimeOperation,
    options: LongRunningOperationOptions = {},
  ): Promise<Result> {
    this.assertNotDisposed();
    const requestId = ++this.requestId;
    this.currentStatus = {
      ...this.currentStatus,
      ...(operation.type === "run-to-tick" || operation.type === "replay"
        ? { phase: "replaying" as const, playing: false }
        : {}),
      latestRequestId: requestId,
    };
    this.emit();

    return new Promise<Result>((resolve, reject) => {
      const abort = (): void => {
        this.worker.postMessage({
          kind: "tiny-civilisation/runtime-cancel",
          requestId,
        });
      };
      options.signal?.addEventListener("abort", abort, { once: true });
      const pending: PendingRequest<Result> = {
        resolve,
        reject,
        ...(options.onProgress ? { onProgress: options.onProgress } : {}),
        ...(options.signal
          ? {
              removeAbortListener: () =>
                options.signal?.removeEventListener("abort", abort),
            }
          : {}),
      };
      this.pending.set(requestId, pending as PendingRequest);
      this.worker.postMessage({
        kind: "tiny-civilisation/runtime-request",
        requestId,
        operation,
      });
      if (options.signal?.aborted) abort();
    });
  }

  private handleMessage(value: unknown): void {
    if (this.disposed || !isRuntimeWorkerMessage(value)) return;
    const pending = this.pending.get(value.requestId);
    if (!pending) return;
    if (value.kind === "tiny-civilisation/runtime-progress") {
      pending.onProgress?.(value.progress);
      return;
    }

    this.pending.delete(value.requestId);
    pending.removeAbortListener?.();
    if (value.requestId < this.latestResponseId) {
      if (value.status.revision > this.currentStatus.revision) {
        this.currentStatus = value.status;
        this.emit();
      }
      pending.reject(new StaleRuntimeResponseError(value.requestId, this.latestResponseId));
      return;
    }
    this.latestResponseId = value.requestId;
    this.currentStatus = value.status;
    this.emit();
    if (value.ok) pending.resolve(value.value);
    else pending.reject(deserializeError(value.error));
  }

  private scheduleAdvanceDrain(): void {
    if (this.advanceDrainScheduled || this.advanceInFlight) return;
    this.advanceDrainScheduled = true;
    queueMicrotask(() => {
      this.advanceDrainScheduled = false;
      this.drainAdvanceBatch();
    });
  }

  private drainAdvanceBatch(): void {
    if (this.advanceInFlight || !this.advanceBatch || this.disposed) return;
    const batch = this.advanceBatch;
    this.advanceBatch = null;
    this.advanceInFlight = true;
    void this.request<SimulationFrame>({ type: "advance", ticks: batch.ticks })
      .then((frame) => {
        for (const waiter of batch.waiters) waiter.resolve(frame);
      })
      .catch((error: unknown) => {
        const reason = error instanceof Error ? error : new Error(String(error));
        for (const waiter of batch.waiters) waiter.reject(reason);
      })
      .finally(() => {
        this.advanceInFlight = false;
        this.scheduleAdvanceDrain();
      });
  }

  private rejectAdvanceBatch(error: Error): void {
    if (!this.advanceBatch) return;
    for (const waiter of this.advanceBatch.waiters) waiter.reject(error);
    this.advanceBatch = null;
  }

  private crash(error: SimulationWorkerCrashedError): void {
    if (this.disposed) return;
    for (const pending of this.pending.values()) {
      pending.removeAbortListener?.();
      pending.reject(error);
    }
    this.pending.clear();
    this.rejectAdvanceBatch(error);
    this.currentStatus = {
      ...this.currentStatus,
      phase: "crashed",
      playing: false,
      error: error.message,
    };
    this.emit();
  }

  private emit(): void {
    for (const listener of this.listeners) listener(this.currentStatus);
  }

  private assertNotDisposed(): void {
    if (this.disposed) throw new Error("Simulation engine is disposed.");
    if (this.currentStatus.phase === "crashed") {
      throw new SimulationWorkerCrashedError(
        this.currentStatus.error ?? "The simulation Worker has crashed.",
      );
    }
  }
}
