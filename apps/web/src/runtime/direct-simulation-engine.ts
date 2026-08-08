import type {
  CausalEvidenceQueryOptions,
  CausalEvidenceRef,
  ExperimentOutcomeComparisonV1,
  ExperimentOutcomeV1,
  PlayerCommand,
  ScheduledPlayerCommand,
  SimulationState,
} from "@tiny-civ/sim-core";
import { CoreSimulationRuntime } from "./core-simulation-runtime";
import type {
  InterventionAcknowledgement,
  LongRunningOperationOptions,
  ReplayResult,
  RunToTickResult,
  RuntimeCanonicalHash,
  RuntimeCheckpoint,
  RuntimeEntityDetail,
  RuntimeInterventionOutcomeProjection,
  RuntimeLifeRecordPage,
  RuntimeLifeRecordQuery,
  RuntimeQueryOptions,
  RuntimeReplay,
  SimulationEngine,
  SimulationEngineListener,
  SimulationCreation,
  SimulationFrame,
  SimulationRuntime,
  SimulationRuntimeStatus,
} from "./types";

export interface DirectSimulationEngineOptions {
  readonly runtime?: SimulationRuntime;
}

export class DirectSimulationEngine implements SimulationEngine {
  readonly kind = "direct" as const;
  private readonly runtime: SimulationRuntime;
  private readonly listeners = new Set<SimulationEngineListener>();
  private requestId = 0;
  private disposed = false;

  constructor(options: DirectSimulationEngineOptions = {}) {
    this.runtime = options.runtime ?? new CoreSimulationRuntime();
  }

  get status(): SimulationRuntimeStatus {
    return this.runtime.status;
  }

  subscribe(listener: SimulationEngineListener): () => void {
    this.assertNotDisposed();
    this.listeners.add(listener);
    listener(this.status);
    return () => this.listeners.delete(listener);
  }

  create(scenario?: SimulationCreation): Promise<SimulationFrame> {
    return this.perform(() => this.runtime.create(scenario));
  }

  play(): Promise<SimulationFrame> {
    return this.perform(() => this.runtime.setPlaying(true));
  }

  pause(): Promise<SimulationFrame> {
    return this.perform(() => this.runtime.setPlaying(false));
  }

  advance(ticks: number): Promise<SimulationFrame> {
    return this.perform(() => this.runtime.advance(ticks));
  }

  step(ticks = 1): Promise<SimulationFrame> {
    return this.perform(() => this.runtime.step(ticks));
  }

  intervene(command: PlayerCommand): Promise<InterventionAcknowledgement> {
    return this.perform(() => this.runtime.intervene(command));
  }

  getFrame(): Promise<SimulationFrame> {
    return this.perform(() => this.runtime.getFrame());
  }

  getState(): Promise<SimulationState> {
    return this.perform(() => this.runtime.getState());
  }

  getCanonicalHash(options: RuntimeQueryOptions = {}): Promise<RuntimeCanonicalHash> {
    return this.perform(() => this.runtime.getCanonicalHash(options));
  }

  getCheckpoint(options: RuntimeQueryOptions = {}): Promise<RuntimeCheckpoint> {
    return this.perform(() => this.runtime.getCheckpoint(options));
  }

  getCausalEvidence(
    focus: CausalEvidenceRef,
    query: CausalEvidenceQueryOptions = {},
    options: RuntimeQueryOptions = {},
  ) {
    return this.perform(() => this.runtime.getCausalEvidence(focus, query, options));
  }

  getEntityDetail(
    ref: CausalEvidenceRef,
    options: RuntimeQueryOptions = {},
  ): Promise<RuntimeEntityDetail> {
    return this.perform(() => this.runtime.getEntityDetail(ref, options));
  }

  getLifeRecords(
    query: RuntimeLifeRecordQuery = {},
    options: RuntimeQueryOptions = {},
  ): Promise<RuntimeLifeRecordPage> {
    return this.perform(() => this.runtime.getLifeRecords(query, options));
  }

  getInterventionOutcomes(
    commands: readonly ScheduledPlayerCommand[],
    options: RuntimeQueryOptions = {},
  ): Promise<readonly RuntimeInterventionOutcomeProjection[]> {
    return this.perform(() => this.runtime.getInterventionOutcomes(commands, options));
  }

  getOutcome(options: RuntimeQueryOptions = {}): Promise<ExperimentOutcomeV1> {
    return this.perform(() => this.runtime.getOutcome(options));
  }

  compareOutcome(
    baseline: ExperimentOutcomeV1,
    options: RuntimeQueryOptions = {},
  ): Promise<ExperimentOutcomeComparisonV1> {
    return this.perform(() => this.runtime.compareOutcome(baseline, options));
  }

  save(): Promise<string> {
    return this.perform(() => this.runtime.save());
  }

  load(serialized: string): Promise<SimulationFrame> {
    return this.perform(() => this.runtime.load(serialized));
  }

  runToTick(
    targetTick: number,
    options: LongRunningOperationOptions = {},
  ): Promise<RunToTickResult> {
    return this.performAsync(() => this.runtime.runToTick(targetTick, options));
  }

  replay(
    replay: RuntimeReplay,
    options: LongRunningOperationOptions = {},
  ): Promise<ReplayResult> {
    return this.performAsync(() => this.runtime.replay(replay, options));
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.runtime.dispose();
    this.emit();
    this.listeners.clear();
  }

  private perform<Result>(operation: () => Result): Promise<Result> {
    this.assertNotDisposed();
    this.noteRequest();
    try {
      const result = operation();
      this.emit();
      return Promise.resolve(result);
    } catch (error) {
      this.emit();
      return Promise.reject(error instanceof Error ? error : new Error(String(error)));
    }
  }

  private async performAsync<Result>(operation: () => Promise<Result>): Promise<Result> {
    this.assertNotDisposed();
    this.noteRequest();
    this.emit();
    try {
      const result = await operation();
      this.emit();
      return result;
    } catch (error) {
      this.emit();
      throw error;
    }
  }

  private noteRequest(): void {
    this.requestId += 1;
    if (this.runtime instanceof CoreSimulationRuntime) {
      this.runtime.noteRequest(this.requestId);
    }
  }

  private emit(): void {
    for (const listener of this.listeners) listener(this.status);
  }

  private assertNotDisposed(): void {
    if (this.disposed) throw new Error("Simulation engine is disposed.");
  }
}
