import type {
  CausalEvidenceProjectionV1,
  CausalEvidenceQueryOptions,
  CausalEvidenceRef,
  ExperimentOutcomeComparisonV1,
  ExperimentOutcomeV1,
  PlayerCommand,
  ScheduledPlayerCommand,
  ScenarioReferenceV2,
  SimulationState,
} from "@tiny-civ/sim-core";
import type {
  InterventionAcknowledgement,
  ReplayResult,
  RunToTickResult,
  RuntimeCanonicalHash,
  RuntimeCheckpoint,
  RuntimeEntityDetail,
  RuntimeInterventionOutcomeProjection,
  RuntimeProgress,
  RuntimeReplay,
  SimulationFrame,
  SimulationRuntimeStatus,
} from "../runtime/types";

/** Changes whenever the Worker transport envelope changes incompatibly. */
export const RUNTIME_PROTOCOL_VERSION = 2 as const;

export type RuntimeOperation =
  | {
      readonly type: "create";
      readonly scenario?: ScenarioReferenceV2;
      /** Legacy direct-seed creation maps explicitly to petri-world@1. */
      readonly seed?: number;
    }
  | { readonly type: "set-playing"; readonly playing: boolean }
  | { readonly type: "advance"; readonly ticks: number }
  | { readonly type: "step"; readonly ticks: number }
  | { readonly type: "intervene"; readonly command: PlayerCommand }
  | { readonly type: "get-frame" }
  | { readonly type: "get-state" }
  | { readonly type: "get-canonical-hash" }
  | { readonly type: "get-checkpoint" }
  | {
      readonly type: "get-causal-evidence";
      readonly focus: CausalEvidenceRef;
      readonly query?: CausalEvidenceQueryOptions;
    }
  | { readonly type: "get-entity-detail"; readonly ref: CausalEvidenceRef }
  | {
      readonly type: "get-intervention-outcomes";
      readonly commands: readonly ScheduledPlayerCommand[];
    }
  | { readonly type: "get-outcome" }
  | { readonly type: "compare-outcome"; readonly baseline: ExperimentOutcomeV1 }
  | { readonly type: "save" }
  | { readonly type: "load"; readonly serialized: string }
  | {
      readonly type: "run-to-tick";
      readonly targetTick: number;
      readonly chunkSize?: number;
      readonly captureTicks?: readonly number[];
    }
  | {
      readonly type: "replay";
      readonly replay: RuntimeReplay;
      readonly chunkSize?: number;
      readonly captureTicks?: readonly number[];
    }
  | { readonly type: "dispose" };

export type RuntimeOperationResult =
  | SimulationFrame
  | InterventionAcknowledgement
  | RunToTickResult
  | ReplayResult
  | SimulationRuntimeStatus
  | SimulationState
  | RuntimeCanonicalHash
  | RuntimeCheckpoint
  | CausalEvidenceProjectionV1
  | RuntimeEntityDetail
  | readonly RuntimeInterventionOutcomeProjection[]
  | ExperimentOutcomeV1
  | ExperimentOutcomeComparisonV1
  | string;

export interface RuntimeRequestMessage {
  readonly kind: "tiny-civilisation/runtime-request";
  readonly protocolVersion: typeof RUNTIME_PROTOCOL_VERSION;
  readonly requestId: number;
  readonly operation: RuntimeOperation;
}

export interface RuntimeCancelMessage {
  readonly kind: "tiny-civilisation/runtime-cancel";
  readonly protocolVersion: typeof RUNTIME_PROTOCOL_VERSION;
  readonly requestId: number;
}

export interface RuntimeSuccessMessage {
  readonly kind: "tiny-civilisation/runtime-response";
  readonly protocolVersion: typeof RUNTIME_PROTOCOL_VERSION;
  readonly requestId: number;
  readonly ok: true;
  readonly status: SimulationRuntimeStatus;
  readonly value: RuntimeOperationResult;
}

export interface SerializedRuntimeError {
  readonly name: string;
  readonly message: string;
  readonly stack?: string;
}

export interface RuntimeFailureMessage {
  readonly kind: "tiny-civilisation/runtime-response";
  readonly protocolVersion: typeof RUNTIME_PROTOCOL_VERSION;
  readonly requestId: number;
  readonly ok: false;
  readonly status: SimulationRuntimeStatus;
  readonly error: SerializedRuntimeError;
}

export interface RuntimeProgressMessage {
  readonly kind: "tiny-civilisation/runtime-progress";
  readonly protocolVersion: typeof RUNTIME_PROTOCOL_VERSION;
  readonly requestId: number;
  readonly progress: RuntimeProgress;
}

export type RuntimeClientMessage = RuntimeRequestMessage | RuntimeCancelMessage;
export type RuntimeWorkerMessage =
  RuntimeSuccessMessage | RuntimeFailureMessage | RuntimeProgressMessage;

export function isRuntimeWorkerMessage(value: unknown): value is RuntimeWorkerMessage {
  if (typeof value !== "object" || value === null) return false;
  const envelope = value as {
    readonly kind?: unknown;
    readonly protocolVersion?: unknown;
  };
  if (envelope.protocolVersion !== RUNTIME_PROTOCOL_VERSION) return false;
  const kind = envelope.kind;
  return (
    kind === "tiny-civilisation/runtime-response" ||
    kind === "tiny-civilisation/runtime-progress"
  );
}
