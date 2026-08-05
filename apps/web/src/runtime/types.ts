import type {
  CausalEvidenceNodeV1,
  CausalEvidenceProjectionV1,
  CausalEvidenceQueryOptions,
  CausalEvidenceRef,
  ExperimentOutcomeComparisonV1,
  ExperimentOutcomeV1,
  PlayerCommand,
  RenderSnapshot,
  ScheduledPlayerCommand,
  SettledInterventionOutcomeV1,
  SimulationReplayV1,
  SimulationState,
  ScenarioReferenceV2,
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
  readonly scenario: ScenarioReferenceV2;
  readonly compiledMapHash: string;
  readonly seed: number;
  readonly tick: number;
  /** Present only when this exact authoritative boundary was explicitly hashed. */
  readonly hash: string | null;
  readonly playing: boolean;
  readonly snapshot: RenderSnapshot;
}

export interface RuntimeCanonicalHash {
  readonly tick: number;
  readonly hash: string;
}

export interface RuntimeCheckpoint extends RuntimeCanonicalHash {
  /** Detached authoritative state for explicit save/export/branch workflows. */
  readonly state: SimulationState;
}

export interface RuntimeEntityDetail {
  readonly stateTick: number;
  readonly ref: CausalEvidenceRef;
  readonly node: CausalEvidenceNodeV1 | null;
}

export interface RuntimeInterventionOutcomeProjection {
  readonly commandId: number;
  readonly outcome: SettledInterventionOutcomeV1 | null;
}

export interface RuntimeQueryOptions {
  readonly signal?: AbortSignal;
}

export const MAX_CAPTURE_TICKS = 256;

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
  readonly capturedFrames?: readonly SimulationFrame[];
}

export interface ReplayResult extends RunToTickResult {
  readonly expectedHash: string | null;
  readonly actualHash: string;
  readonly hashMatches: boolean | null;
}

export interface LongRunningOperationOptions {
  readonly signal?: AbortSignal;
  readonly onProgress?: (progress: RuntimeProgress) => void;
  readonly chunkSize?: number;
  readonly captureTicks?: readonly number[];
}

/**
 * Replay request. A target tick may be supplied without a hash for an
 * explicitly unverified reconstruction or preview. A hash always requires
 * its target tick.
 */
export type RuntimeReplay = Omit<SimulationReplayV1, "finalTick" | "finalHash"> & {
  readonly finalTick?: number;
  readonly finalHash?: string;
};
export type SimulationCreation = number | ScenarioReferenceV2;

export interface SimulationRuntime {
  readonly status: SimulationRuntimeStatus;
  create(scenario?: SimulationCreation): SimulationFrame;
  setPlaying(playing: boolean): SimulationFrame;
  /** Clock-driven advancement. It is a no-op while paused. */
  advance(ticks: number): SimulationFrame;
  /** Explicit deterministic advancement, including while paused. */
  step(ticks?: number): SimulationFrame;
  intervene(command: PlayerCommand): InterventionAcknowledgement;
  getFrame(): SimulationFrame;
  /** Returns a detached authoritative checkpoint for an explicit workflow. */
  getState(): SimulationState;
  getCanonicalHash(options?: RuntimeQueryOptions): RuntimeCanonicalHash;
  getCheckpoint(options?: RuntimeQueryOptions): RuntimeCheckpoint;
  getCausalEvidence(
    focus: CausalEvidenceRef,
    query?: CausalEvidenceQueryOptions,
    options?: RuntimeQueryOptions,
  ): CausalEvidenceProjectionV1;
  getEntityDetail(
    ref: CausalEvidenceRef,
    options?: RuntimeQueryOptions,
  ): RuntimeEntityDetail;
  getInterventionOutcomes(
    commands: readonly ScheduledPlayerCommand[],
    options?: RuntimeQueryOptions,
  ): readonly RuntimeInterventionOutcomeProjection[];
  getOutcome(options?: RuntimeQueryOptions): ExperimentOutcomeV1;
  compareOutcome(
    baseline: ExperimentOutcomeV1,
    options?: RuntimeQueryOptions,
  ): ExperimentOutcomeComparisonV1;
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
  create(scenario?: SimulationCreation): Promise<SimulationFrame>;
  play(): Promise<SimulationFrame>;
  pause(): Promise<SimulationFrame>;
  /** Clock-driven advancement. Concurrent calls may be coalesced for backpressure. */
  advance(ticks: number): Promise<SimulationFrame>;
  /** Explicit deterministic advancement, including while paused. */
  step(ticks?: number): Promise<SimulationFrame>;
  intervene(command: PlayerCommand): Promise<InterventionAcknowledgement>;
  getFrame(): Promise<SimulationFrame>;
  /** Returns a detached authoritative checkpoint for an explicit workflow. */
  getState(): Promise<SimulationState>;
  getCanonicalHash(options?: RuntimeQueryOptions): Promise<RuntimeCanonicalHash>;
  getCheckpoint(options?: RuntimeQueryOptions): Promise<RuntimeCheckpoint>;
  getCausalEvidence(
    focus: CausalEvidenceRef,
    query?: CausalEvidenceQueryOptions,
    options?: RuntimeQueryOptions,
  ): Promise<CausalEvidenceProjectionV1>;
  getEntityDetail(
    ref: CausalEvidenceRef,
    options?: RuntimeQueryOptions,
  ): Promise<RuntimeEntityDetail>;
  getInterventionOutcomes(
    commands: readonly ScheduledPlayerCommand[],
    options?: RuntimeQueryOptions,
  ): Promise<readonly RuntimeInterventionOutcomeProjection[]>;
  getOutcome(options?: RuntimeQueryOptions): Promise<ExperimentOutcomeV1>;
  compareOutcome(
    baseline: ExperimentOutcomeV1,
    options?: RuntimeQueryOptions,
  ): Promise<ExperimentOutcomeComparisonV1>;
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
  readonly captureTicks?: readonly number[];
}
