import type {
  PlayerCommand,
  RenderSnapshot,
  ScheduledPlayerCommand,
  SimulationState,
} from "./types.js";
import {
  COMMAND_SCHEMA_VERSION,
  REPLAY_SCHEMA_VERSION,
  SAVE_SCHEMA_VERSION,
  SIMULATION_BEHAVIOR_VERSION,
  SIMULATION_STATE_VERSION,
  SNAPSHOT_SCHEMA_VERSION,
} from "./versions.js";

type UnknownRecord = Record<string, unknown>;

export interface PlayerCommandEnvelopeV1 {
  readonly kind: "tiny-civilisation/command";
  readonly schemaVersion: typeof COMMAND_SCHEMA_VERSION;
  readonly behaviorVersion: typeof SIMULATION_BEHAVIOR_VERSION;
  readonly command: PlayerCommand;
}

export interface RenderSnapshotEnvelopeV1 {
  readonly kind: "tiny-civilisation/snapshot";
  readonly schemaVersion: typeof SNAPSHOT_SCHEMA_VERSION;
  readonly behaviorVersion: typeof SIMULATION_BEHAVIOR_VERSION;
  readonly snapshot: RenderSnapshot;
}

export interface SimulationReplayV1 {
  readonly kind: "tiny-civilisation/replay";
  readonly schemaVersion: typeof REPLAY_SCHEMA_VERSION;
  readonly behaviorVersion: typeof SIMULATION_BEHAVIOR_VERSION;
  readonly stateSchemaVersion: typeof SIMULATION_STATE_VERSION;
  readonly seed: number;
  readonly commands: readonly ScheduledPlayerCommand[];
  readonly finalTick?: number;
  readonly finalHash?: string;
}

export interface SimulationSaveV1 {
  readonly kind: "tiny-civilisation/save";
  readonly schemaVersion: typeof SAVE_SCHEMA_VERSION;
  readonly behaviorVersion: typeof SIMULATION_BEHAVIOR_VERSION;
  readonly stateSchemaVersion: typeof SIMULATION_STATE_VERSION;
  readonly state: SimulationState;
}

export type SimulationSave = SimulationSaveV1;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readVersion(record: UnknownRecord, key: string): number | null {
  const value = record[key];
  return typeof value === "number" && Number.isInteger(value) ? value : null;
}

export function assertCompatibleSimulationState(
  value: unknown,
): asserts value is SimulationState {
  if (!isRecord(value)) {
    throw new Error("Simulation state must be an object.");
  }
  const version = readVersion(value, "schemaVersion");
  if (version !== SIMULATION_STATE_VERSION) {
    throw new Error(
      `Unsupported simulation state version ${String(version)}; expected ${SIMULATION_STATE_VERSION}.`,
    );
  }
  for (const key of [
    "creatures",
    "resourceNodes",
    "structures",
    "groups",
    "relationships",
    "memories",
    "commandQueue",
    "domainEvents",
    "historyEvents",
    "decisionRecords",
  ] as const) {
    if (!Array.isArray(value[key])) {
      throw new Error(`Invalid simulation state: ${key} must be an array.`);
    }
  }
  if (!isRecord(value.world) || !Array.isArray(value.world.tiles)) {
    throw new Error("Invalid simulation state: world.tiles must be an array.");
  }
}

export function createPlayerCommandEnvelope(
  command: PlayerCommand,
): PlayerCommandEnvelopeV1 {
  return {
    kind: "tiny-civilisation/command",
    schemaVersion: COMMAND_SCHEMA_VERSION,
    behaviorVersion: SIMULATION_BEHAVIOR_VERSION,
    command,
  };
}

export function createRenderSnapshotEnvelope(
  snapshot: RenderSnapshot,
): RenderSnapshotEnvelopeV1 {
  return {
    kind: "tiny-civilisation/snapshot",
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    behaviorVersion: SIMULATION_BEHAVIOR_VERSION,
    snapshot,
  };
}

export function createSimulationReplay(
  seed: number,
  commands: readonly ScheduledPlayerCommand[],
  result?: { readonly finalTick: number; readonly finalHash: string },
): SimulationReplayV1 {
  return {
    kind: "tiny-civilisation/replay",
    schemaVersion: REPLAY_SCHEMA_VERSION,
    behaviorVersion: SIMULATION_BEHAVIOR_VERSION,
    stateSchemaVersion: SIMULATION_STATE_VERSION,
    seed,
    commands: commands.map((command) => ({ ...command })),
    ...(result ? { finalTick: result.finalTick, finalHash: result.finalHash } : {}),
  };
}

export function createSimulationSave(state: SimulationState): SimulationSaveV1 {
  assertCompatibleSimulationState(state);
  return {
    kind: "tiny-civilisation/save",
    schemaVersion: SAVE_SCHEMA_VERSION,
    behaviorVersion: SIMULATION_BEHAVIOR_VERSION,
    stateSchemaVersion: SIMULATION_STATE_VERSION,
    state,
  };
}

export function serializeSimulationSave(state: SimulationState): string {
  return JSON.stringify(createSimulationSave(state));
}

/**
 * Central migration boundary. Version 1 is currently the only persisted save
 * format; future migrations are added here rather than scattered through apps.
 */
export function migrateSimulationSave(value: unknown): SimulationSaveV1 {
  if (!isRecord(value) || value.kind !== "tiny-civilisation/save") {
    throw new Error("Invalid Tiny Civilisation save envelope.");
  }
  const schemaVersion = readVersion(value, "schemaVersion");
  if (schemaVersion !== SAVE_SCHEMA_VERSION) {
    throw new Error(
      `Unsupported save schema version ${String(schemaVersion)}; expected ${SAVE_SCHEMA_VERSION}.`,
    );
  }
  const behaviorVersion = readVersion(value, "behaviorVersion");
  if (behaviorVersion !== SIMULATION_BEHAVIOR_VERSION) {
    throw new Error(
      `Save behavior version ${String(behaviorVersion)} is incompatible with ${SIMULATION_BEHAVIOR_VERSION}.`,
    );
  }
  const stateSchemaVersion = readVersion(value, "stateSchemaVersion");
  if (stateSchemaVersion !== SIMULATION_STATE_VERSION) {
    throw new Error(
      `Save state version ${String(stateSchemaVersion)} is incompatible with ${SIMULATION_STATE_VERSION}.`,
    );
  }
  assertCompatibleSimulationState(value.state);
  return value as unknown as SimulationSaveV1;
}

export function deserializeSimulationSave(serialized: string): SimulationState {
  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized) as unknown;
  } catch (error) {
    throw new Error("Save data is not valid JSON.", { cause: error });
  }
  return migrateSimulationSave(parsed).state;
}
