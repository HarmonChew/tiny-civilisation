import type {
  PlayerCommand,
  RenderSnapshot,
  ScheduledPlayerCommand,
  SimulationReplayV1,
  SimulationState,
} from "@tiny-civ/sim-core";

/** A transport-safe view that callers cannot use to mutate authoritative state. */
export type Immutable<T> = T extends (...args: never[]) => unknown
  ? T
  : T extends readonly (infer Item)[]
    ? readonly Immutable<Item>[]
    : T extends object
      ? { readonly [Key in keyof T]: Immutable<T[Key]> }
      : T;

export type SimulationRuntimePhase =
  "idle" | "ready" | "running" | "replaying" | "error" | "crashed" | "disposed";

export interface SimulationFrame {
  readonly revision: number;
  readonly seed: number;
  readonly tick: number;
  readonly hash: string;
  readonly playing: boolean;
  readonly snapshot: Immutable<RenderSnapshot>;
  /**
   * Transitional compatibility projection for the existing web adapter. It is
   * always a detached clone; mutating it cannot affect the simulation runtime.
   */
  readonly state: Immutable<SimulationState>;
}

export interface SimulationRuntimeStatus {
  readonly phase: SimulationRuntimePhase;
  readonly playing: boolean;
  readonly revision: number;
  readonly tick: number | null;
  readonly latestRequestId: number;
  readonly error: string | null;
}

export interface AcceptedIntervention {
  readonly accepted: true;
  readonly outcome: "scheduled";
  readonly command: Immutable<ScheduledPlayerCommand>;
  readonly frame: SimulationFrame;
}

export interface RejectedIntervention {
  readonly accepted: false;
  readonly outcome: "rejected";
  readonly reason: string;
  readonly frame: SimulationFrame;
}

export type InterventionAcknowledgement = AcceptedIntervention | RejectedIntervention;

export interface RuntimeProgress {
  readonly operation: "run-to-tick" | "replay";
  readonly currentTick: number;
  readonly targetTick: number;
  readonly completedTicks: number;
  readonly totalTicks: number;
  readonly fraction: number;
}

export interface RunToTickResult {
  readonly cancelled: boolean;
  readonly frame: SimulationFrame;
}

export interface ReplayResult extends RunToTickResult {
  readonly expectedHash: string | null;
  readonly hashMatches: boolean | null;
}

export interface LongRunningOperationOptions {
  readonly signal?: AbortSignal;
  readonly onProgress?: (progress: RuntimeProgress) => void;
  readonly chunkSize?: number;
}

export type RuntimeReplay = SimulationReplayV1;

export interface SimulationRuntime {
  readonly status: SimulationRuntimeStatus;
  create(seed?: number): SimulationFrame;
  setPlaying(playing: boolean): SimulationFrame;
  /** Clock-driven advancement. It is a no-op while paused. */
  advance(ticks: number): SimulationFrame;
  /** Explicit deterministic advancement, including while paused. */
  step(ticks?: number): SimulationFrame;
  intervene(command: PlayerCommand): InterventionAcknowledgement;
  getFrame(): SimulationFrame;
  save(): string;
  load(serialized: string): SimulationFrame;
  runToTick(
    targetTick: number,
    options?: LongRunningOperationOptions,
  ): Promise<RunToTickResult>;
  replay(
    replay: RuntimeReplay,
    options?: LongRunningOperationOptions,
  ): Promise<ReplayResult>;
  dispose(): void;
}

export type SimulationEngineListener = (status: SimulationRuntimeStatus) => void;

export interface SimulationEngine {
  readonly kind: "direct" | "worker";
  readonly status: SimulationRuntimeStatus;
  subscribe(listener: SimulationEngineListener): () => void;
  create(seed?: number): Promise<SimulationFrame>;
  play(): Promise<SimulationFrame>;
  pause(): Promise<SimulationFrame>;
  /** Clock-driven advancement. Concurrent calls may be coalesced for backpressure. */
  advance(ticks: number): Promise<SimulationFrame>;
  /** Explicit deterministic advancement, including while paused. */
  step(ticks?: number): Promise<SimulationFrame>;
  intervene(command: PlayerCommand): Promise<InterventionAcknowledgement>;
  getFrame(): Promise<SimulationFrame>;
  save(): Promise<string>;
  load(serialized: string): Promise<SimulationFrame>;
  runToTick(
    targetTick: number,
    options?: LongRunningOperationOptions,
  ): Promise<RunToTickResult>;
  replay(
    replay: RuntimeReplay,
    options?: LongRunningOperationOptions,
  ): Promise<ReplayResult>;
  dispose(): void;
}

export interface RuntimeExecutionContext {
  readonly signal?: AbortSignal;
  readonly onProgress?: (progress: RuntimeProgress) => void;
  readonly chunkSize?: number;
}
