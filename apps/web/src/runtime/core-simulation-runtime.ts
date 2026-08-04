import {
  advanceSimulation,
  assertSimulationReplay,
  compareExperimentOutcomes,
  createCausalEvidenceProjection,
  createExperimentOutcome,
  createRenderSnapshot,
  createSimulation,
  deserializeSimulationSave,
  hashSimulationState,
  queuePlayerCommand,
  serializeSimulationSave,
  type CausalEvidenceQueryOptions,
  type CausalEvidenceRef,
  type ExperimentOutcomeV1,
  type PlayerCommand,
  type ScheduledPlayerCommand,
  type SimulationState,
} from "@tiny-civ/sim-core";
import { detachedClone } from "./clone";
import { projectInterventionOutcomes } from "./state-projections";
import { MAX_CAPTURE_TICKS } from "./types";
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
  SimulationFrame,
  SimulationRuntime,
  SimulationRuntimePhase,
  SimulationRuntimeStatus,
  SimulationCreation,
} from "./types";

const DEFAULT_SEED = 4_182;
const DEFAULT_CHUNK_SIZE = 64;

export interface CoreSimulationRuntimeOptions {
  readonly yieldControl?: () => Promise<void>;
}

function nextTask(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function normalizeTickCount(ticks: number, label: string): number {
  if (!Number.isFinite(ticks) || ticks < 0) {
    throw new RangeError(`${label} must be a nonnegative finite number.`);
  }
  return Math.floor(ticks);
}

function normalizeCaptureTicks(
  captureTicks: readonly number[] | undefined,
  startTick: number,
  targetTick: number,
): number[] | null {
  if (captureTicks === undefined) return null;
  if (!Array.isArray(captureTicks)) {
    throw new TypeError("Capture ticks must be an array.");
  }
  if (captureTicks.length > MAX_CAPTURE_TICKS) {
    throw new RangeError(
      `Capture ticks cannot contain more than ${MAX_CAPTURE_TICKS.toString()} entries.`,
    );
  }

  const normalized = captureTicks.map((tick, index) => {
    if (!Number.isFinite(tick) || !Number.isInteger(tick) || tick < 0) {
      throw new RangeError(
        `Capture tick ${index.toString()} must be a nonnegative whole number.`,
      );
    }
    if (tick < startTick || tick > targetTick) {
      throw new RangeError(
        `Capture tick ${tick.toString()} must be between ${startTick.toString()} and ${targetTick.toString()}.`,
      );
    }
    return tick;
  });
  return [...new Set(normalized)].sort((left, right) => left - right);
}

interface PreparedTickExecution {
  readonly startTick: number;
  readonly targetTick: number;
  readonly totalTicks: number;
  readonly chunkSize: number;
  readonly captureTicks: number[] | null;
}

function prepareTickExecution(
  startTick: number,
  targetTickInput: number,
  options: LongRunningOperationOptions,
): PreparedTickExecution {
  const targetTick = normalizeTickCount(targetTickInput, "Target tick");
  if (targetTick < startTick) {
    throw new RangeError(`Target tick ${targetTick} precedes current tick ${startTick}.`);
  }
  const chunkSize = Math.max(
    1,
    normalizeTickCount(options.chunkSize ?? DEFAULT_CHUNK_SIZE, "Chunk size"),
  );
  return {
    startTick,
    targetTick,
    totalTicks: targetTick - startTick,
    chunkSize,
    captureTicks: normalizeCaptureTicks(options.captureTicks, startTick, targetTick),
  };
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (!signal?.aborted) return;
  const error = new Error("The runtime query was cancelled.");
  error.name = "AbortError";
  throw error;
}

function assertReplay(replay: RuntimeReplay): void {
  if (replay.finalTick !== undefined && replay.finalHash === undefined) {
    const { finalTick, finalHash: _finalHash, ...unverified } = replay;
    assertSimulationReplay(unverified);
    if (!Number.isSafeInteger(finalTick) || finalTick < 0) {
      throw new Error("Runtime replay finalTick must be a nonnegative safe integer.");
    }
    const lastCommandTick = replay.commands.reduce(
      (latest, command) => Math.max(latest, command.applyAtTick),
      -1,
    );
    if (finalTick <= lastCommandTick) {
      throw new Error("Runtime replay finalTick must be after its last command tick.");
    }
    return;
  }
  assertSimulationReplay(replay);
}

function playerCommandFromScheduled(command: ScheduledPlayerCommand): PlayerCommand {
  switch (command.type) {
    case "ADD_FOOD":
      return {
        type: command.type,
        applyAtTick: command.applyAtTick,
        tileIndex: command.tileIndex,
        amount: command.amount,
      };
    case "REMOVE_FOOD":
      return {
        type: command.type,
        applyAtTick: command.applyAtTick,
        tileIndex: command.tileIndex,
        amount: command.amount,
      };
    case "TOGGLE_OBSTACLE":
      return {
        type: command.type,
        applyAtTick: command.applyAtTick,
        tileIndex: command.tileIndex,
        ...(command.blocked === null ? {} : { blocked: command.blocked }),
      };
  }
}

export class CoreSimulationRuntime implements SimulationRuntime {
  private simulation: SimulationState | null = null;
  private playing = false;
  private phase: SimulationRuntimePhase = "idle";
  private revision = 0;
  private latestRequestId = 0;
  private lastError: string | null = null;
  private activeRun = false;
  private activeRunCancellation: AbortController | null = null;
  private lastProjectedNavigationRevision: number | null = null;
  private verifiedCanonicalHash: RuntimeCanonicalHash | null = null;
  private readonly yieldControl: () => Promise<void>;

  constructor(options: CoreSimulationRuntimeOptions = {}) {
    this.yieldControl = options.yieldControl ?? nextTask;
  }

  get status(): SimulationRuntimeStatus {
    return {
      phase: this.phase,
      playing: this.playing,
      revision: this.revision,
      tick: this.simulation?.tick ?? null,
      latestRequestId: this.latestRequestId,
      error: this.lastError,
    };
  }

  /** Used by transports to reflect the latest handled request in diagnostics. */
  noteRequest(requestId: number): void {
    this.latestRequestId = Math.max(this.latestRequestId, requestId);
  }

  create(scenario: SimulationCreation = DEFAULT_SEED): SimulationFrame {
    this.assertNotDisposed();
    if (this.activeRun) throw new Error("Cannot create while a replay is running.");
    try {
      const candidate =
        typeof scenario === "number"
          ? createSimulation(normalizeTickCount(scenario, "Simulation seed") >>> 0)
          : createSimulation(scenario);
      this.simulation = candidate;
      this.playing = false;
      this.phase = "ready";
      this.lastError = null;
      this.lastProjectedNavigationRevision = null;
      this.verifiedCanonicalHash = null;
      this.revision += 1;
      return this.makeFrame();
    } catch (error) {
      this.fail(error, "The simulation could not start.");
    }
  }

  setPlaying(playing: boolean): SimulationFrame {
    this.assertReadyForMutation();
    this.playing = playing;
    this.phase = playing ? "running" : "ready";
    this.revision += 1;
    return this.makeFrame();
  }

  advance(ticks: number): SimulationFrame {
    this.assertReadyForMutation();
    const count = normalizeTickCount(ticks, "Advance tick count");
    if (!this.playing || count === 0) return this.makeFrame();
    return this.advanceAuthoritatively(count);
  }

  step(ticks = 1): SimulationFrame {
    this.assertReadyForMutation();
    const count = normalizeTickCount(ticks, "Step tick count");
    if (count === 0) return this.makeFrame();
    return this.advanceAuthoritatively(count);
  }

  intervene(command: PlayerCommand): InterventionAcknowledgement {
    this.assertReadyForMutation();
    const state = this.requireSimulation();
    try {
      const scheduled = queuePlayerCommand(state, detachedClone(command));
      this.verifiedCanonicalHash = null;
      this.revision += 1;
      return {
        accepted: true,
        outcome: "scheduled",
        command: detachedClone(scheduled),
        frame: this.makeFrame(),
      };
    } catch (error) {
      return {
        accepted: false,
        outcome: "rejected",
        reason: errorMessage(error, "The intervention was rejected."),
        frame: this.makeFrame(),
      };
    }
  }

  getFrame(): SimulationFrame {
    this.assertNotDisposed();
    return this.makeFrame();
  }

  getState(): SimulationState {
    this.assertNotDisposed();
    return detachedClone(this.requireSimulation());
  }

  getCanonicalHash(options: RuntimeQueryOptions = {}): RuntimeCanonicalHash {
    this.assertReadyForQuery(options);
    const state = this.requireSimulation();
    if (this.verifiedCanonicalHash?.tick !== state.tick) {
      this.verifiedCanonicalHash = {
        tick: state.tick,
        hash: hashSimulationState(state),
      };
    }
    return { ...this.verifiedCanonicalHash };
  }

  getCheckpoint(options: RuntimeQueryOptions = {}): RuntimeCheckpoint {
    this.assertReadyForQuery(options);
    const canonical = this.getCanonicalHash(options);
    return {
      ...canonical,
      state: detachedClone(this.requireSimulation()),
    };
  }

  getCausalEvidence(
    focus: CausalEvidenceRef,
    query: CausalEvidenceQueryOptions = {},
    options: RuntimeQueryOptions = {},
  ) {
    this.assertReadyForQuery(options);
    const projection = createCausalEvidenceProjection(
      this.requireSimulation(),
      detachedClone(focus),
      detachedClone(query),
    );
    throwIfAborted(options.signal);
    return detachedClone(projection);
  }

  getEntityDetail(
    ref: CausalEvidenceRef,
    options: RuntimeQueryOptions = {},
  ): RuntimeEntityDetail {
    this.assertReadyForQuery(options);
    const projection = createCausalEvidenceProjection(
      this.requireSimulation(),
      detachedClone(ref),
      { maxDepth: 0, maxNodes: 1 },
    );
    throwIfAborted(options.signal);
    return detachedClone({
      stateTick: projection.stateTick,
      ref,
      node: projection.nodes[0] ?? null,
    });
  }

  getInterventionOutcomes(
    commands: readonly ScheduledPlayerCommand[],
    options: RuntimeQueryOptions = {},
  ): readonly RuntimeInterventionOutcomeProjection[] {
    this.assertReadyForQuery(options);
    const projection = projectInterventionOutcomes(
      this.requireSimulation(),
      detachedClone(commands),
    );
    throwIfAborted(options.signal);
    return detachedClone(projection);
  }

  getOutcome(options: RuntimeQueryOptions = {}) {
    this.assertReadyForQuery(options);
    const outcome = createExperimentOutcome(this.requireSimulation());
    throwIfAborted(options.signal);
    return detachedClone(outcome);
  }

  compareOutcome(baseline: ExperimentOutcomeV1, options: RuntimeQueryOptions = {}) {
    this.assertReadyForQuery(options);
    const comparison = compareExperimentOutcomes(
      detachedClone(baseline),
      createExperimentOutcome(this.requireSimulation()),
    );
    throwIfAborted(options.signal);
    return detachedClone(comparison);
  }

  save(): string {
    this.assertNotDisposed();
    return serializeSimulationSave(this.requireSimulation());
  }

  load(serialized: string): SimulationFrame {
    this.assertNotDisposed();
    if (this.activeRun) throw new Error("Cannot load while a replay is running.");
    try {
      // Parsing and compatibility checks complete before the active run is replaced.
      const candidate = detachedClone(deserializeSimulationSave(serialized));
      const candidateHash = hashSimulationState(candidate);
      this.simulation = candidate;
      this.playing = false;
      this.phase = "ready";
      this.lastError = null;
      this.lastProjectedNavigationRevision = null;
      this.verifiedCanonicalHash = { tick: candidate.tick, hash: candidateHash };
      this.revision += 1;
      return this.makeFrame();
    } catch (error) {
      throw new Error(errorMessage(error, "The save could not be loaded."), {
        cause: error,
      });
    }
  }

  async runToTick(
    targetTick: number,
    options: LongRunningOperationOptions = {},
  ): Promise<RunToTickResult> {
    return this.executeToTick(targetTick, "run-to-tick", options);
  }

  async replay(
    replay: RuntimeReplay,
    options: LongRunningOperationOptions = {},
  ): Promise<ReplayResult> {
    this.assertNotDisposed();
    if (this.activeRun) throw new Error("A replay is already running.");
    assertReplay(replay);

    // Build the replay candidate before replacing the active state.
    const candidate = createSimulation(replay.scenario);
    const commands = [...replay.commands].sort(
      (left, right) => left.commandId - right.commandId,
    );
    for (const command of commands) {
      const scheduled = queuePlayerCommand(candidate, playerCommandFromScheduled(command));
      if (scheduled.commandId !== command.commandId) {
        throw new Error(
          `Replay command sequence is invalid at command ${command.commandId}.`,
        );
      }
    }

    const latestApplicationTick = commands.reduce(
      (latest, command) => Math.max(latest, command.applyAtTick + 1),
      0,
    );
    const targetTick = replay.finalTick ?? latestApplicationTick;
    if (targetTick < latestApplicationTick) {
      throw new Error("Replay final tick precedes a scheduled command.");
    }
    const execution = prepareTickExecution(candidate.tick, targetTick, options);

    this.simulation = candidate;
    this.playing = false;
    this.phase = "ready";
    this.lastError = null;
    this.lastProjectedNavigationRevision = null;
    this.verifiedCanonicalHash = null;
    this.revision += 1;
    const result = await this.executePreparedToTick(
      candidate,
      "replay",
      options,
      execution,
    );
    const canonical = this.getCanonicalHash();
    const frame = { ...result.frame, hash: canonical.hash };
    const capturedFrames = result.capturedFrames?.map((captured) =>
      captured.tick === frame.tick ? frame : captured,
    );
    const expectedHash = replay.finalHash ?? null;
    return {
      ...result,
      frame,
      ...(capturedFrames === undefined ? {} : { capturedFrames }),
      expectedHash,
      actualHash: canonical.hash,
      hashMatches: expectedHash === null ? null : expectedHash === canonical.hash,
    };
  }

  dispose(): void {
    this.activeRunCancellation?.abort();
    this.activeRunCancellation = null;
    this.simulation = null;
    this.playing = false;
    this.activeRun = false;
    this.phase = "disposed";
    this.lastError = null;
    this.lastProjectedNavigationRevision = null;
    this.verifiedCanonicalHash = null;
    this.revision += 1;
  }

  private async executeToTick(
    targetTickInput: number,
    operation: RuntimeProgress["operation"],
    options: LongRunningOperationOptions,
  ): Promise<RunToTickResult> {
    this.assertNotDisposed();
    if (this.activeRun) throw new Error("A replay is already running.");
    const state = this.requireSimulation();
    const execution = prepareTickExecution(state.tick, targetTickInput, options);
    return this.executePreparedToTick(state, operation, options, execution);
  }

  private async executePreparedToTick(
    state: SimulationState,
    operation: RuntimeProgress["operation"],
    options: LongRunningOperationOptions,
    execution: PreparedTickExecution,
  ): Promise<RunToTickResult> {
    const { captureTicks, chunkSize, startTick, targetTick, totalTicks } = execution;
    const capturedFrames: SimulationFrame[] = [];
    let captureIndex = 0;
    const wasPlaying = this.playing;
    const internalCancellation = new AbortController();
    this.activeRun = true;
    this.activeRunCancellation = internalCancellation;
    this.playing = false;
    this.phase = "replaying";

    const report = (): void => {
      const currentTick = this.requireSimulation().tick;
      const completedTicks = currentTick - startTick;
      try {
        options.onProgress?.({
          operation,
          currentTick,
          targetTick,
          completedTicks,
          totalTicks,
          fraction: totalTicks === 0 ? 1 : completedTicks / totalTicks,
        });
      } catch {
        // Observer failures must not corrupt or stop authoritative execution.
      }
    };

    let cancelled = false;
    try {
      if (captureTicks?.[captureIndex] === state.tick) {
        capturedFrames.push(this.makeFrame());
        captureIndex += 1;
      }
      report();
      while (
        state.tick < targetTick &&
        !options.signal?.aborted &&
        !internalCancellation.signal.aborted
      ) {
        const nextCaptureTick = captureTicks?.[captureIndex] ?? targetTick;
        const count = Math.min(
          chunkSize,
          targetTick - state.tick,
          nextCaptureTick - state.tick,
        );
        this.verifiedCanonicalHash = null;
        advanceSimulation(state, count);
        this.revision += 1;
        if (captureTicks?.[captureIndex] === state.tick) {
          capturedFrames.push(this.makeFrame());
          captureIndex += 1;
        }
        report();
        if (state.tick < targetTick) await this.yieldControl();
      }
      cancelled =
        state.tick < targetTick &&
        ((options.signal?.aborted ?? false) || internalCancellation.signal.aborted);
    } catch (error) {
      this.fail(error, "The simulation replay failed.");
    } finally {
      this.activeRun = false;
      this.activeRunCancellation = null;
      const finalPhase = this.phase as SimulationRuntimePhase;
      if (finalPhase !== "error" && finalPhase !== "disposed") {
        this.playing = wasPlaying;
        this.phase = wasPlaying ? "running" : "ready";
      }
    }
    this.assertNotDisposed();
    const lastCapturedFrame = capturedFrames.at(-1);
    const frame =
      lastCapturedFrame?.tick === state.tick
        ? { ...lastCapturedFrame, playing: this.playing }
        : this.makeFrame();
    return {
      cancelled,
      frame,
      ...(captureTicks === null ? {} : { capturedFrames }),
    };
  }

  private advanceAuthoritatively(ticks: number): SimulationFrame {
    try {
      this.verifiedCanonicalHash = null;
      advanceSimulation(this.requireSimulation(), ticks);
      this.revision += 1;
      return this.makeFrame();
    } catch (error) {
      this.fail(error, "The simulation stopped.");
    }
  }

  private makeFrame(): SimulationFrame {
    const state = this.requireSimulation();
    const navigationRevision = state.world.navigationRevision;
    const includeStaticWorld = this.lastProjectedNavigationRevision !== navigationRevision;
    const frame: SimulationFrame = {
      revision: this.revision,
      scenario: { ...state.scenario },
      compiledMapHash: state.compiledMapHash,
      seed: state.seed,
      tick: state.tick,
      hash:
        this.verifiedCanonicalHash?.tick === state.tick
          ? this.verifiedCanonicalHash.hash
          : null,
      playing: this.playing,
      snapshot: detachedClone(createRenderSnapshot(state, includeStaticWorld)),
    };
    this.lastProjectedNavigationRevision = navigationRevision;
    return frame;
  }

  private requireSimulation(): SimulationState {
    if (!this.simulation) throw new Error("Create or load a simulation first.");
    return this.simulation;
  }

  private assertNotDisposed(): void {
    if (this.phase === "disposed") throw new Error("Simulation runtime is disposed.");
  }

  private assertReadyForMutation(): void {
    this.assertNotDisposed();
    if (this.activeRun) throw new Error("The simulation is busy replaying.");
    if (this.phase === "error") {
      throw new Error(this.lastError ?? "The simulation runtime has failed.");
    }
    this.requireSimulation();
  }

  private assertReadyForQuery(options: RuntimeQueryOptions): void {
    this.assertNotDisposed();
    if (this.activeRun) throw new Error("The simulation is busy replaying.");
    throwIfAborted(options.signal);
    this.requireSimulation();
  }

  private fail(error: unknown, fallback: string): never {
    const message = errorMessage(error, fallback);
    this.playing = false;
    this.phase = "error";
    this.lastError = message;
    throw new Error(message, { cause: error });
  }
}
