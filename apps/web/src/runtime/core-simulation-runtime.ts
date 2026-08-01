import {
  REPLAY_SCHEMA_VERSION,
  SIMULATION_BEHAVIOR_VERSION,
  SIMULATION_STATE_VERSION,
  advanceSimulation,
  createRenderSnapshot,
  createSimulation,
  deserializeSimulationSave,
  hashSimulationState,
  queuePlayerCommand,
  serializeSimulationSave,
  type PlayerCommand,
  type ScheduledPlayerCommand,
  type SimulationState,
} from "@tiny-civ/sim-core";
import { detachedClone } from "./clone";
import type {
  InterventionAcknowledgement,
  LongRunningOperationOptions,
  ReplayResult,
  RunToTickResult,
  RuntimeProgress,
  RuntimeReplay,
  SimulationFrame,
  SimulationRuntime,
  SimulationRuntimePhase,
  SimulationRuntimeStatus,
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

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function assertReplay(replay: RuntimeReplay): void {
  if (replay.kind !== "tiny-civilisation/replay") {
    throw new Error("Invalid Tiny Civilisation replay envelope.");
  }
  if (replay.schemaVersion !== REPLAY_SCHEMA_VERSION) {
    throw new Error(`Unsupported replay schema version ${replay.schemaVersion}.`);
  }
  if (replay.behaviorVersion !== SIMULATION_BEHAVIOR_VERSION) {
    throw new Error(`Incompatible replay behavior version ${replay.behaviorVersion}.`);
  }
  if (replay.stateSchemaVersion !== SIMULATION_STATE_VERSION) {
    throw new Error(`Incompatible replay state version ${replay.stateSchemaVersion}.`);
  }
  normalizeTickCount(replay.seed, "Replay seed");
  if (replay.finalTick !== undefined) {
    normalizeTickCount(replay.finalTick, "Replay final tick");
  }
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

  create(seed = DEFAULT_SEED): SimulationFrame {
    this.assertNotDisposed();
    if (this.activeRun) throw new Error("Cannot create while a replay is running.");
    const normalizedSeed = normalizeTickCount(seed, "Simulation seed") >>> 0;
    try {
      const candidate = createSimulation(normalizedSeed);
      this.simulation = candidate;
      this.playing = false;
      this.phase = "ready";
      this.lastError = null;
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
      hashSimulationState(candidate);
      this.simulation = candidate;
      this.playing = false;
      this.phase = "ready";
      this.lastError = null;
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
    const candidate = createSimulation(replay.seed);
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

    this.simulation = candidate;
    this.playing = false;
    this.phase = "ready";
    this.lastError = null;
    this.revision += 1;
    const result = await this.executeToTick(targetTick, "replay", options);
    const expectedHash = replay.finalHash ?? null;
    return {
      ...result,
      expectedHash,
      hashMatches: expectedHash === null ? null : expectedHash === result.frame.hash,
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
    const targetTick = normalizeTickCount(targetTickInput, "Target tick");
    if (targetTick < state.tick) {
      throw new RangeError(
        `Target tick ${targetTick} precedes current tick ${state.tick}.`,
      );
    }
    const chunkSize = Math.max(
      1,
      normalizeTickCount(options.chunkSize ?? DEFAULT_CHUNK_SIZE, "Chunk size"),
    );
    const startTick = state.tick;
    const totalTicks = targetTick - startTick;
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
      report();
      while (
        state.tick < targetTick &&
        !options.signal?.aborted &&
        !internalCancellation.signal.aborted
      ) {
        const count = Math.min(chunkSize, targetTick - state.tick);
        advanceSimulation(state, count);
        this.revision += 1;
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
    return { cancelled, frame: this.makeFrame() };
  }

  private advanceAuthoritatively(ticks: number): SimulationFrame {
    try {
      advanceSimulation(this.requireSimulation(), ticks);
      this.revision += 1;
      return this.makeFrame();
    } catch (error) {
      this.fail(error, "The simulation stopped.");
    }
  }

  private makeFrame(): SimulationFrame {
    const state = this.requireSimulation();
    const stateClone = detachedClone(state);
    return {
      revision: this.revision,
      seed: state.seed,
      tick: state.tick,
      hash: hashSimulationState(state),
      playing: this.playing,
      snapshot: detachedClone(createRenderSnapshot(state)),
      state: stateClone,
    };
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

  private fail(error: unknown, fallback: string): never {
    const message = errorMessage(error, fallback);
    this.playing = false;
    this.phase = "error";
    this.lastError = message;
    throw new Error(message, { cause: error });
  }
}
