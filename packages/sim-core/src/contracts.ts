import { advanceSimulation } from "./tick.js";
import { createSimulation } from "./creation.js";
import { hashSimulationState } from "./state-hash.js";
import { migrateSimulationState } from "./state-migrations.js";
import {
  assertCompatibleSimulationState,
  assertSerializedSize,
  MAX_PERSISTED_COLLECTION_ITEMS,
} from "./state-validation.js";
import {
  MAX_PLAYER_COMMAND_AMOUNT,
  type PlayerCommand,
  type RenderSnapshot,
  type ScheduledPlayerCommand,
  type SimulationState,
} from "./types.js";
import {
  COMMAND_SCHEMA_VERSION,
  REPLAY_SCHEMA_VERSION,
  SAVE_SCHEMA_VERSION,
  SIMULATION_BEHAVIOR_VERSION,
  SIMULATION_STATE_VERSION,
  SNAPSHOT_SCHEMA_VERSION,
} from "./versions.js";
import {
  assertScenarioReference,
  cloneScenarioReference,
  createScenarioReference,
  isScenarioId,
  type ScenarioReferenceV2,
} from "./scenarios/index.js";

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
  readonly scenario: ScenarioReferenceV2;
  /** Convenience copy retained for older callers; must equal scenario.seed. */
  readonly seed: number;
  readonly commands: readonly Readonly<ScheduledPlayerCommand>[];
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
export type ReplayHashStatus = "VERIFIED" | "MISMATCH" | "UNVERIFIED";

export interface ReplayExecutionOptions {
  readonly finalTick?: number;
  readonly requireHashMatch?: boolean;
}

export interface ReplayExecutionResult {
  readonly state: SimulationState;
  readonly finalTick: number;
  readonly finalHash: string;
  readonly expectedFinalHash: string | null;
  readonly hashStatus: ReplayHashStatus;
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readVersion(record: UnknownRecord, key: string): number | null {
  const value = record[key];
  return typeof value === "number" && Number.isInteger(value) ? value : null;
}

function assertExactKeys(
  record: UnknownRecord,
  keys: readonly string[],
  label: string,
): void {
  const allowed = new Set(keys);
  for (const key of Object.keys(record)) {
    if (!allowed.has(key)) throw new Error(`${label} contains unsupported field ${key}.`);
  }
}

function assertNonnegativeInteger(value: unknown, label: string): asserts value is number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label} must be a nonnegative safe integer.`);
  }
}

function assertPositiveInteger(value: unknown, label: string): asserts value is number {
  assertNonnegativeInteger(value, label);
  if (value < 1) throw new Error(`${label} must be positive.`);
}

export function assertStateHash(
  value: unknown,
  label = "State hash",
): asserts value is string {
  if (typeof value !== "string" || !/^[0-9a-f]{16}$/u.test(value)) {
    throw new Error(`${label} must be a lowercase 64-bit hexadecimal hash.`);
  }
}

function migratePhaseThreeScenarioReference(
  value: unknown,
  expectedSeed: number,
): ScenarioReferenceV2 {
  if (!isRecord(value)) throw new Error("Legacy scenario must be an object.");
  assertExactKeys(
    value,
    [
      "kind",
      "schemaVersion",
      "behaviorVersion",
      "scenarioId",
      "scenarioVersion",
      "mapGenerationVersion",
      "seed",
    ],
    "Legacy scenario",
  );
  if (
    value.kind !== "tiny-civilisation/scenario" ||
    value.schemaVersion !== 2 ||
    value.behaviorVersion !== 3 ||
    value.scenarioVersion !== 1 ||
    value.mapGenerationVersion !== 1 ||
    !isScenarioId(value.scenarioId)
  ) {
    throw new Error(
      "Legacy scenario must use the behavior 3 / scenario 1 / map-generation 1 compatibility tuple.",
    );
  }
  assertNonnegativeInteger(value.seed, "Legacy scenario seed");
  if (value.seed > 0xffffffff) {
    throw new Error("Legacy scenario seed must be an unsigned 32-bit integer.");
  }
  if (value.seed !== expectedSeed) {
    throw new Error("Legacy scenario seed must match its envelope seed.");
  }
  return createScenarioReference(value.scenarioId, value.seed);
}

function migratePhaseFourScenarioReference(
  value: unknown,
  expectedSeed: number,
): ScenarioReferenceV2 {
  if (!isRecord(value)) throw new Error("Phase 4 scenario must be an object.");
  assertExactKeys(
    value,
    [
      "kind",
      "schemaVersion",
      "behaviorVersion",
      "scenarioId",
      "scenarioVersion",
      "mapGenerationVersion",
      "seed",
    ],
    "Phase 4 scenario",
  );
  if (
    value.kind !== "tiny-civilisation/scenario" ||
    value.schemaVersion !== 2 ||
    value.behaviorVersion !== 4 ||
    value.scenarioVersion !== 2 ||
    value.mapGenerationVersion !== 1 ||
    !isScenarioId(value.scenarioId)
  ) {
    throw new Error(
      "Phase 4 scenario must use the behavior 4 / scenario 2 / map-generation 1 compatibility tuple.",
    );
  }
  assertNonnegativeInteger(value.seed, "Phase 4 scenario seed");
  if (value.seed !== expectedSeed) {
    throw new Error("Phase 4 scenario seed must match its envelope seed.");
  }
  return createScenarioReference(value.scenarioId, value.seed);
}

export function assertScheduledPlayerCommand(
  value: unknown,
  label = "Scheduled command",
): asserts value is ScheduledPlayerCommand {
  if (!isRecord(value)) throw new Error(`${label} must be an object.`);
  assertExactKeys(
    value,
    ["commandId", "applyAtTick", "type", "tileIndex", "amount", "blocked"],
    label,
  );
  assertPositiveInteger(value.commandId, `${label}.commandId`);
  assertNonnegativeInteger(value.applyAtTick, `${label}.applyAtTick`);
  assertNonnegativeInteger(value.tileIndex, `${label}.tileIndex`);
  assertNonnegativeInteger(value.amount, `${label}.amount`);
  if (
    value.type !== "ADD_FOOD" &&
    value.type !== "REMOVE_FOOD" &&
    value.type !== "ADD_MATERIAL" &&
    value.type !== "REMOVE_MATERIAL" &&
    value.type !== "REPLENISH_WATER" &&
    value.type !== "DRAIN_WATER" &&
    value.type !== "TOGGLE_OBSTACLE"
  ) {
    throw new Error(`${label}.type is not supported.`);
  }
  if (value.type === "TOGGLE_OBSTACLE") {
    if (value.amount !== 0)
      throw new Error(`${label}.amount must be zero for an obstacle.`);
    if (value.blocked !== null && typeof value.blocked !== "boolean") {
      throw new Error(`${label}.blocked must be boolean or null.`);
    }
  } else {
    if (value.amount < 1) {
      throw new Error(`${label}.amount must be positive for a resource intervention.`);
    }
    if (value.amount > MAX_PLAYER_COMMAND_AMOUNT) {
      throw new Error(
        `${label}.amount must not exceed ${MAX_PLAYER_COMMAND_AMOUNT.toString()}.`,
      );
    }
    if (value.blocked !== null) {
      throw new Error(`${label}.blocked must be null for a resource intervention.`);
    }
  }
}

export function assertSimulationReplay(
  value: unknown,
): asserts value is SimulationReplayV1 {
  if (!isRecord(value) || value.kind !== "tiny-civilisation/replay") {
    throw new Error("Invalid Tiny Civilisation replay envelope.");
  }
  assertExactKeys(
    value,
    [
      "kind",
      "schemaVersion",
      "behaviorVersion",
      "stateSchemaVersion",
      "scenario",
      "seed",
      "commands",
      "finalTick",
      "finalHash",
    ],
    "Replay",
  );
  const schemaVersion = readVersion(value, "schemaVersion");
  if (schemaVersion !== REPLAY_SCHEMA_VERSION) {
    throw new Error(
      `Unsupported replay schema version ${String(schemaVersion)}; expected ${REPLAY_SCHEMA_VERSION}.`,
    );
  }
  const behaviorVersion = readVersion(value, "behaviorVersion");
  if (behaviorVersion !== SIMULATION_BEHAVIOR_VERSION) {
    throw new Error(
      `Replay behavior version ${String(behaviorVersion)} is incompatible with ${SIMULATION_BEHAVIOR_VERSION}.`,
    );
  }
  const stateSchemaVersion = readVersion(value, "stateSchemaVersion");
  if (stateSchemaVersion !== SIMULATION_STATE_VERSION) {
    throw new Error(
      `Replay state version ${String(stateSchemaVersion)} is incompatible with ${SIMULATION_STATE_VERSION}.`,
    );
  }
  assertScenarioReference(value.scenario);
  assertNonnegativeInteger(value.seed, "Replay seed");
  if (value.seed > 0xffffffff)
    throw new Error("Replay seed must be an unsigned 32-bit integer.");
  if (value.scenario.seed !== value.seed) {
    throw new Error("Replay scenario seed must match its seed field.");
  }
  if (!Array.isArray(value.commands)) throw new Error("Replay commands must be an array.");
  if (value.commands.length > MAX_PERSISTED_COLLECTION_ITEMS) {
    throw new Error(
      `Replay commands exceed the ${MAX_PERSISTED_COLLECTION_ITEMS.toString()} item limit.`,
    );
  }
  for (const [index, command] of value.commands.entries()) {
    assertScheduledPlayerCommand(command, `Replay commands[${index.toString()}]`);
    if (command.commandId !== index + 1) {
      throw new Error("Replay command IDs must be contiguous and begin at 1.");
    }
  }
  if (value.finalTick !== undefined) {
    assertNonnegativeInteger(value.finalTick, "Replay finalTick");
    const lastCommandTick = value.commands.reduce(
      (latest, command) => Math.max(latest, command.applyAtTick),
      -1,
    );
    if (value.finalTick <= lastCommandTick) {
      throw new Error("Replay finalTick must be after its last command tick.");
    }
  }
  if (value.finalHash !== undefined) {
    assertStateHash(value.finalHash, "Replay finalHash");
    if (value.finalTick === undefined) {
      throw new Error("Replay finalHash requires finalTick.");
    }
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
  scenarioOrSeed: ScenarioReferenceV2 | number,
  commands: readonly ScheduledPlayerCommand[],
  result?: { readonly finalTick: number; readonly finalHash: string },
): SimulationReplayV1 {
  const scenario =
    typeof scenarioOrSeed === "number"
      ? createScenarioReference(scenarioOrSeed)
      : cloneScenarioReference(scenarioOrSeed);
  const replay: SimulationReplayV1 = {
    kind: "tiny-civilisation/replay",
    schemaVersion: REPLAY_SCHEMA_VERSION,
    behaviorVersion: SIMULATION_BEHAVIOR_VERSION,
    stateSchemaVersion: SIMULATION_STATE_VERSION,
    scenario,
    seed: scenario.seed,
    commands: commands.map((command) => ({ ...command })),
    ...(result ? { finalTick: result.finalTick, finalHash: result.finalHash } : {}),
  };
  assertSimulationReplay(replay);
  return replay;
}

export function serializeSimulationReplay(replay: SimulationReplayV1): string {
  assertSimulationReplay(replay);
  const serialized = JSON.stringify(replay);
  assertSerializedSize(serialized, "Replay data");
  return serialized;
}

export function migrateSimulationReplay(value: unknown): SimulationReplayV1 {
  if (!isRecord(value) || value.kind !== "tiny-civilisation/replay") {
    throw new Error("Invalid Tiny Civilisation replay envelope.");
  }
  const schemaVersion = readVersion(value, "schemaVersion");
  if (schemaVersion === 1) {
    assertExactKeys(
      value,
      [
        "kind",
        "schemaVersion",
        "behaviorVersion",
        "stateSchemaVersion",
        "seed",
        "commands",
        "finalTick",
        "finalHash",
      ],
      "Replay",
    );
    const behaviorVersion = readVersion(value, "behaviorVersion");
    const stateSchemaVersion = readVersion(value, "stateSchemaVersion");
    const supportedLegacyVersion =
      (behaviorVersion === 1 && stateSchemaVersion === 1) ||
      (behaviorVersion === 3 && stateSchemaVersion === 2);
    if (!supportedLegacyVersion) {
      throw new Error(
        `Replay schema version 1 has incompatible behavior/state versions ${String(behaviorVersion)}/${String(stateSchemaVersion)}.`,
      );
    }
    assertNonnegativeInteger(value.seed, "Replay seed");
    if (value.seed > 0xffffffff) {
      throw new Error("Replay seed must be an unsigned 32-bit integer.");
    }
    const migrated: SimulationReplayV1 = {
      kind: "tiny-civilisation/replay" as const,
      schemaVersion: REPLAY_SCHEMA_VERSION,
      behaviorVersion: SIMULATION_BEHAVIOR_VERSION,
      stateSchemaVersion: SIMULATION_STATE_VERSION,
      scenario: createScenarioReference(value.seed),
      seed: value.seed,
      commands: Array.isArray(value.commands)
        ? value.commands.map((command) =>
            isRecord(command)
              ? ({ ...command } as unknown as ScheduledPlayerCommand)
              : command,
          )
        : (value.commands as readonly ScheduledPlayerCommand[]),
      ...(value.finalTick === undefined ? {} : { finalTick: value.finalTick as number }),
    };
    assertSimulationReplay(migrated);
    return migrated;
  }
  if (schemaVersion === 2) {
    assertExactKeys(
      value,
      [
        "kind",
        "schemaVersion",
        "behaviorVersion",
        "stateSchemaVersion",
        "scenario",
        "seed",
        "commands",
        "finalTick",
        "finalHash",
      ],
      "Replay",
    );
    if (
      readVersion(value, "behaviorVersion") !== 3 ||
      readVersion(value, "stateSchemaVersion") !== 3
    ) {
      throw new Error(
        `Replay schema version 2 has incompatible behavior/state versions ${String(value.behaviorVersion)}/${String(value.stateSchemaVersion)}.`,
      );
    }
    assertNonnegativeInteger(value.seed, "Replay seed");
    if (value.seed > 0xffffffff) {
      throw new Error("Replay seed must be an unsigned 32-bit integer.");
    }
    const scenario = migratePhaseThreeScenarioReference(value.scenario, value.seed);
    const migrated: SimulationReplayV1 = {
      kind: "tiny-civilisation/replay",
      schemaVersion: REPLAY_SCHEMA_VERSION,
      behaviorVersion: SIMULATION_BEHAVIOR_VERSION,
      stateSchemaVersion: SIMULATION_STATE_VERSION,
      scenario,
      seed: value.seed,
      commands: Array.isArray(value.commands)
        ? value.commands.map((command) =>
            isRecord(command)
              ? ({ ...command } as unknown as ScheduledPlayerCommand)
              : command,
          )
        : (value.commands as readonly ScheduledPlayerCommand[]),
      ...(value.finalTick === undefined ? {} : { finalTick: value.finalTick as number }),
    };
    assertSimulationReplay(migrated);
    return migrated;
  }
  if (schemaVersion === 3) {
    assertExactKeys(
      value,
      [
        "kind",
        "schemaVersion",
        "behaviorVersion",
        "stateSchemaVersion",
        "scenario",
        "seed",
        "commands",
        "finalTick",
        "finalHash",
      ],
      "Replay",
    );
    if (
      readVersion(value, "behaviorVersion") !== 4 ||
      readVersion(value, "stateSchemaVersion") !== 4
    ) {
      throw new Error(
        `Replay schema version 3 has incompatible behavior/state versions ${String(value.behaviorVersion)}/${String(value.stateSchemaVersion)}.`,
      );
    }
    assertNonnegativeInteger(value.seed, "Replay seed");
    if (value.seed > 0xffffffff) {
      throw new Error("Replay seed must be an unsigned 32-bit integer.");
    }
    if (!Array.isArray(value.commands))
      throw new Error("Replay commands must be an array.");
    for (const [index, command] of value.commands.entries()) {
      if (
        !isRecord(command) ||
        (command.type !== "ADD_FOOD" &&
          command.type !== "REMOVE_FOOD" &&
          command.type !== "REPLENISH_WATER" &&
          command.type !== "DRAIN_WATER" &&
          command.type !== "TOGGLE_OBSTACLE")
      ) {
        throw new Error(`Replay commands[${index.toString()}] is not a Phase 4 command.`);
      }
    }
    const scenario = migratePhaseFourScenarioReference(value.scenario, value.seed);
    const migrated: SimulationReplayV1 = {
      kind: "tiny-civilisation/replay",
      schemaVersion: REPLAY_SCHEMA_VERSION,
      behaviorVersion: SIMULATION_BEHAVIOR_VERSION,
      stateSchemaVersion: SIMULATION_STATE_VERSION,
      scenario,
      seed: value.seed,
      commands: Array.isArray(value.commands)
        ? value.commands.map((command) =>
            isRecord(command)
              ? ({ ...command } as unknown as ScheduledPlayerCommand)
              : command,
          )
        : (value.commands as readonly ScheduledPlayerCommand[]),
      ...(value.finalTick === undefined ? {} : { finalTick: value.finalTick as number }),
      // Behavior changed; a v4 hash cannot verify a v5 rerun.
    };
    assertSimulationReplay(migrated);
    return migrated;
  }
  assertSimulationReplay(value);
  return {
    ...value,
    scenario: cloneScenarioReference(value.scenario),
    commands: value.commands.map((command) => ({ ...command })),
  };
}

export function deserializeSimulationReplay(serialized: string): SimulationReplayV1 {
  assertSerializedSize(serialized, "Replay data");
  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized) as unknown;
  } catch (error) {
    throw new Error("Replay data is not valid JSON.", { cause: error });
  }
  return migrateSimulationReplay(parsed);
}

export function executeSimulationReplay(
  replayValue: SimulationReplayV1 | unknown,
  options: ReplayExecutionOptions = {},
): ReplayExecutionResult {
  const replay = migrateSimulationReplay(replayValue);
  const latestCommandTick = replay.commands.reduce(
    (latest, command) => Math.max(latest, command.applyAtTick),
    -1,
  );
  const finalTick = options.finalTick ?? replay.finalTick ?? latestCommandTick + 1;
  assertNonnegativeInteger(finalTick, "Replay execution finalTick");
  if (latestCommandTick >= finalTick) {
    throw new Error(
      `Replay execution finalTick ${finalTick.toString()} must be after the last command tick ${latestCommandTick.toString()}.`,
    );
  }

  const state = createSimulation(replay.scenario);
  for (const command of replay.commands) {
    if (command.tileIndex >= state.world.tiles.length) {
      throw new Error(
        `Replay command ${command.commandId.toString()} targets invalid tile ${command.tileIndex.toString()}.`,
      );
    }
  }
  state.commandQueue = replay.commands
    .map((command) => ({ ...command }))
    .sort(
      (left, right) =>
        left.applyAtTick - right.applyAtTick || left.commandId - right.commandId,
    );
  state.nextCommandId = replay.commands.length + 1;
  advanceSimulation(state, finalTick);
  const finalHash = hashSimulationState(state);
  const expectedFinalHash = replay.finalHash ?? null;
  const hashStatus: ReplayHashStatus =
    expectedFinalHash === null
      ? "UNVERIFIED"
      : expectedFinalHash === finalHash
        ? "VERIFIED"
        : "MISMATCH";
  if (options.requireHashMatch === true && hashStatus === "MISMATCH") {
    throw new Error(
      `Replay hash mismatch: expected ${expectedFinalHash ?? "none"}, received ${finalHash}.`,
    );
  }
  return { state, finalTick, finalHash, expectedFinalHash, hashStatus };
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
  const serialized = JSON.stringify(createSimulationSave(state));
  assertSerializedSize(serialized, "Save data");
  return serialized;
}

/** Central migration boundary for persisted saves. */
export function migrateSimulationSave(value: unknown): SimulationSaveV1 {
  if (!isRecord(value) || value.kind !== "tiny-civilisation/save") {
    throw new Error("Invalid Tiny Civilisation save envelope.");
  }
  assertExactKeys(
    value,
    ["kind", "schemaVersion", "behaviorVersion", "stateSchemaVersion", "state"],
    "Save",
  );
  const schemaVersion = readVersion(value, "schemaVersion");
  const behaviorVersion = readVersion(value, "behaviorVersion");
  const stateSchemaVersion = readVersion(value, "stateSchemaVersion");
  const supportedLegacyEnvelope =
    (schemaVersion === 1 &&
      ((behaviorVersion === 1 && stateSchemaVersion === 1) ||
        (behaviorVersion === 3 && stateSchemaVersion === 2))) ||
    (schemaVersion === 2 && behaviorVersion === 3 && stateSchemaVersion === 3) ||
    (schemaVersion === 3 && behaviorVersion === 4 && stateSchemaVersion === 4);
  if (supportedLegacyEnvelope) {
    const state = migrateSimulationState(value.state);
    assertCompatibleSimulationState(state);
    return {
      kind: "tiny-civilisation/save",
      schemaVersion: SAVE_SCHEMA_VERSION,
      behaviorVersion: SIMULATION_BEHAVIOR_VERSION,
      stateSchemaVersion: SIMULATION_STATE_VERSION,
      state,
    };
  }
  if (schemaVersion === 1 || schemaVersion === 2 || schemaVersion === 3) {
    throw new Error(
      `Save schema version ${String(schemaVersion)} has incompatible behavior/state versions ${String(behaviorVersion)}/${String(stateSchemaVersion)}.`,
    );
  }
  if (schemaVersion !== SAVE_SCHEMA_VERSION) {
    throw new Error(
      `Unsupported save schema version ${String(schemaVersion)}; expected ${SAVE_SCHEMA_VERSION}.`,
    );
  }
  if (behaviorVersion !== SIMULATION_BEHAVIOR_VERSION) {
    throw new Error(
      `Save behavior version ${String(behaviorVersion)} is incompatible with ${SIMULATION_BEHAVIOR_VERSION}.`,
    );
  }
  if (stateSchemaVersion !== SIMULATION_STATE_VERSION) {
    throw new Error(
      `Save state version ${String(stateSchemaVersion)} is incompatible with ${SIMULATION_STATE_VERSION}.`,
    );
  }
  assertCompatibleSimulationState(value.state);
  return value as unknown as SimulationSaveV1;
}

export function deserializeSimulationSave(serialized: string): SimulationState {
  assertSerializedSize(serialized, "Save data");
  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized) as unknown;
  } catch (error) {
    throw new Error("Save data is not valid JSON.", { cause: error });
  }
  return migrateSimulationSave(parsed).state;
}

export { assertCompatibleSimulationState } from "./state-validation.js";
export {
  MAX_PERSISTED_COLLECTION_ITEMS,
  MAX_PERSISTED_JSON_CHARACTERS,
  MAX_PERSISTED_STRING_CHARACTERS,
  MAX_PERSISTED_WORLD_TILES,
} from "./state-validation.js";
