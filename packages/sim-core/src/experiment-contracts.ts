import {
  assertScheduledPlayerCommand,
  assertStateHash,
  type SimulationReplayV1,
} from "./contracts.js";
import {
  assertSerializedSize,
  MAX_PERSISTED_COLLECTION_ITEMS,
  MAX_PERSISTED_STRING_CHARACTERS,
} from "./state-validation.js";
import type { ScheduledPlayerCommand } from "./types.js";
import {
  assertInterventionResponseTrace,
  freezeInterventionResponseTrace,
  type InterventionResponseTrace,
} from "./intervention-response.js";
import {
  EXPERIMENT_SCHEMA_VERSION,
  REPLAY_SCHEMA_VERSION,
  SIMULATION_BEHAVIOR_VERSION,
  SIMULATION_STATE_VERSION,
} from "./versions.js";
import {
  DEFAULT_SCENARIO_ID,
  DEFAULT_SCENARIO_VERSION,
  assertScenarioReference,
  createScenarioReference,
  isScenarioId,
  type ScenarioReferenceV2,
} from "./scenarios/index.js";

export {
  DEFAULT_SCENARIO_ID,
  DEFAULT_SCENARIO_VERSION,
  assertScenarioReference,
  createScenarioReference,
};
export type { ScenarioReferenceV2 } from "./scenarios/index.js";

type UnknownRecord = Record<string, unknown>;

export const DEFAULT_EXPERIMENT_BRANCH_ID = "baseline" as const;

/** @deprecated Use ScenarioReferenceV2. Retained as a source-compatible alias. */
export type ScenarioReferenceV1 = ScenarioReferenceV2;

export interface PendingInterventionOutcomeV1 {
  readonly status: "PENDING";
}

export interface SettledInterventionOutcomeV1 {
  readonly status: "APPLIED" | "REJECTED";
  readonly appliedAtTick: number;
  readonly resolvedTileIndex: number;
  readonly quantity: number;
  readonly blocked: boolean | null;
  readonly eventIds: readonly number[];
  readonly reason: string | null;
}

export type InterventionOutcomeV1 =
  PendingInterventionOutcomeV1 | SettledInterventionOutcomeV1;

export interface InterventionLogEntryV1 {
  readonly command: Readonly<ScheduledPlayerCommand>;
  readonly outcome: InterventionOutcomeV1;
  readonly responseTrace: InterventionResponseTrace | null;
}

export interface ExperimentBranchV1 {
  readonly id: string;
  readonly label: string;
  readonly parentBranchId: string | null;
  readonly forkTick: number;
  readonly targetTick: number | null;
  readonly expectedHash: string | null;
  readonly commandLog: readonly InterventionLogEntryV1[];
}

export interface ExperimentBookmarkV1 {
  readonly id: string;
  readonly branchId: string;
  readonly tick: number;
  readonly label: string;
}

export interface ExperimentCheckpointV1 {
  readonly id: string;
  readonly branchId: string;
  readonly tick: number;
  readonly stateHash: string;
}

export interface ExperimentV1 {
  readonly kind: "tiny-civilisation/experiment";
  readonly schemaVersion: typeof EXPERIMENT_SCHEMA_VERSION;
  readonly behaviorVersion: typeof SIMULATION_BEHAVIOR_VERSION;
  readonly stateSchemaVersion: typeof SIMULATION_STATE_VERSION;
  readonly scenario: ScenarioReferenceV1;
  readonly rootBranchId: string;
  readonly branches: readonly ExperimentBranchV1[];
  readonly bookmarks: readonly ExperimentBookmarkV1[];
  readonly checkpoints: readonly ExperimentCheckpointV1[];
}

export interface CreateExperimentOptions {
  readonly rootBranchId?: string;
  readonly rootLabel?: string;
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exactObject(
  value: unknown,
  keys: readonly string[],
  label: string,
): UnknownRecord {
  if (!isRecord(value)) throw new Error(`${label} must be an object.`);
  const allowed = new Set(keys);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw new Error(`${label} contains unsupported field ${key}.`);
  }
  return value;
}

function nonnegativeInteger(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label} must be a nonnegative safe integer.`);
  }
  return value;
}

function boundedString(value: unknown, label: string, allowEmpty = false): string {
  if (typeof value !== "string" || (!allowEmpty && value.length === 0)) {
    throw new Error(`${label} must be ${allowEmpty ? "a" : "a non-empty"} string.`);
  }
  if (value.length > MAX_PERSISTED_STRING_CHARACTERS) {
    throw new Error(
      `${label} exceeds the ${MAX_PERSISTED_STRING_CHARACTERS.toString()} character limit.`,
    );
  }
  return value;
}

function contractId(value: unknown, label: string): string {
  const id = boundedString(value, label);
  if (!/^[a-z0-9][a-z0-9._-]{0,127}$/u.test(id)) {
    throw new Error(
      `${label} must use lowercase letters, digits, dots, dashes, or underscores.`,
    );
  }
  return id;
}

function boundedArray(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array.`);
  if (value.length > MAX_PERSISTED_COLLECTION_ITEMS) {
    throw new Error(
      `${label} exceeds the ${MAX_PERSISTED_COLLECTION_ITEMS.toString()} item limit.`,
    );
  }
  return value;
}

function assertUniqueStrings(values: readonly string[], label: string): void {
  if (new Set(values).size !== values.length) throw new Error(`${label} must be unique.`);
}

function assertVersion(
  record: UnknownRecord,
  key: string,
  expected: number,
  label: string,
): void {
  if (record[key] !== expected) {
    throw new Error(
      `${label} ${String(record[key])} is incompatible with ${expected.toString()}.`,
    );
  }
}

export function serializeScenarioReference(scenario: ScenarioReferenceV1): string {
  assertScenarioReference(scenario);
  const serialized = JSON.stringify(scenario);
  assertSerializedSize(serialized, "Scenario data");
  return serialized;
}

export function deserializeScenarioReference(serialized: string): ScenarioReferenceV1 {
  assertSerializedSize(serialized, "Scenario data");
  let value: unknown;
  try {
    value = JSON.parse(serialized) as unknown;
  } catch (error) {
    throw new Error("Scenario data is not valid JSON.", { cause: error });
  }
  if (!isRecord(value)) throw new Error("Scenario must be an object.");
  if (isRecord(value) && value.schemaVersion === 1) {
    const legacy = exactObject(
      value,
      ["kind", "schemaVersion", "behaviorVersion", "scenarioId", "scenarioVersion", "seed"],
      "Scenario",
    );
    if (
      legacy.kind !== "tiny-civilisation/scenario" ||
      (legacy.behaviorVersion !== 1 && legacy.behaviorVersion !== 3) ||
      legacy.scenarioId !== DEFAULT_SCENARIO_ID ||
      legacy.scenarioVersion !== 1
    ) {
      throw new Error("Legacy scenario uses an unsupported definition or behavior.");
    }
    return createScenarioReference(nonnegativeInteger(legacy.seed, "Scenario seed"));
  }
  if (isRecord(value) && value.schemaVersion === 2 && value.behaviorVersion === 3) {
    const legacy = exactObject(
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
      "Scenario",
    );
    if (
      legacy.kind !== "tiny-civilisation/scenario" ||
      legacy.scenarioVersion !== 1 ||
      legacy.mapGenerationVersion !== 1 ||
      !isScenarioId(legacy.scenarioId)
    ) {
      throw new Error("Phase 3 scenario uses an unsupported definition or behavior.");
    }
    return createScenarioReference(
      legacy.scenarioId,
      nonnegativeInteger(legacy.seed, "Scenario seed"),
    );
  }
  assertScenarioReference(value);
  return createScenarioReference(value.scenarioId, value.seed);
}

function assertOutcome(
  value: unknown,
  label: string,
): asserts value is InterventionOutcomeV1 {
  if (!isRecord(value)) throw new Error(`${label} must be an object.`);
  if (value.status === "PENDING") {
    exactObject(value, ["status"], label);
    return;
  }
  const outcome = exactObject(
    value,
    [
      "status",
      "appliedAtTick",
      "resolvedTileIndex",
      "quantity",
      "blocked",
      "eventIds",
      "reason",
    ],
    label,
  );
  if (outcome.status !== "APPLIED" && outcome.status !== "REJECTED") {
    throw new Error(`${label}.status is not supported.`);
  }
  nonnegativeInteger(outcome.appliedAtTick, `${label}.appliedAtTick`);
  nonnegativeInteger(outcome.resolvedTileIndex, `${label}.resolvedTileIndex`);
  nonnegativeInteger(outcome.quantity, `${label}.quantity`);
  if (outcome.blocked !== null && typeof outcome.blocked !== "boolean") {
    throw new Error(`${label}.blocked must be boolean or null.`);
  }
  const eventIds = boundedArray(outcome.eventIds, `${label}.eventIds`).map((eventId) =>
    nonnegativeInteger(eventId, `${label}.eventIds[]`),
  );
  if (eventIds.some((eventId) => eventId === 0)) {
    throw new Error(`${label}.eventIds must contain positive IDs.`);
  }
  if (outcome.reason !== null) boundedString(outcome.reason, `${label}.reason`);
  if (outcome.status === "REJECTED" && outcome.reason === null) {
    throw new Error(`${label}.reason is required when rejected.`);
  }
}

export function assertInterventionLogEntry(
  value: unknown,
  label = "Intervention",
): asserts value is InterventionLogEntryV1 {
  const entry = exactObject(value, ["command", "outcome", "responseTrace"], label);
  assertScheduledPlayerCommand(entry.command, `${label}.command`);
  assertOutcome(entry.outcome, `${label}.outcome`);
  if (entry.responseTrace !== null) {
    assertInterventionResponseTrace(entry.responseTrace, `${label}.responseTrace`);
    if (
      entry.responseTrace.command.commandId !== entry.command.commandId ||
      entry.responseTrace.command.applyAtTick !== entry.command.applyAtTick ||
      entry.responseTrace.command.type !== entry.command.type ||
      entry.responseTrace.command.tileIndex !== entry.command.tileIndex
    ) {
      throw new Error(`${label}.responseTrace command must match the intervention.`);
    }
    if (
      entry.outcome.status === "PENDING" &&
      entry.responseTrace.phase !== "WAITING_FOR_OUTCOME"
    ) {
      throw new Error(`${label}.responseTrace cannot settle before its intervention.`);
    }
    if (
      entry.outcome.status !== "PENDING" &&
      entry.responseTrace.outcome !== null &&
      (entry.responseTrace.outcome.status !== entry.outcome.status ||
        !entry.outcome.eventIds.includes(entry.responseTrace.outcome.eventId))
    ) {
      throw new Error(`${label}.responseTrace outcome must match the intervention.`);
    }
  }
  if (
    entry.outcome.status !== "PENDING" &&
    entry.outcome.resolvedTileIndex !== entry.command.tileIndex
  ) {
    throw new Error(`${label}.outcome resolved tile must match the scheduled command.`);
  }
  if (
    entry.outcome.status !== "PENDING" &&
    entry.outcome.appliedAtTick !== entry.command.applyAtTick
  ) {
    throw new Error(`${label}.outcome tick must match the scheduled command.`);
  }
}

function frozenOutcome(outcome: InterventionOutcomeV1): InterventionOutcomeV1 {
  if (outcome.status === "PENDING") return Object.freeze({ status: "PENDING" });
  return Object.freeze({
    ...outcome,
    eventIds: Object.freeze([...outcome.eventIds]),
  });
}

function frozenEntry(entry: InterventionLogEntryV1): InterventionLogEntryV1 {
  assertInterventionLogEntry(entry);
  return Object.freeze({
    command: Object.freeze({ ...entry.command }),
    outcome: frozenOutcome(entry.outcome),
    responseTrace:
      entry.responseTrace === null
        ? null
        : freezeInterventionResponseTrace(entry.responseTrace),
  });
}

export function createPendingIntervention(
  command: ScheduledPlayerCommand,
): InterventionLogEntryV1 {
  return frozenEntry({
    command,
    outcome: { status: "PENDING" },
    responseTrace: null,
  });
}

export function createSettledIntervention(
  command: ScheduledPlayerCommand,
  outcome: SettledInterventionOutcomeV1,
): InterventionLogEntryV1 {
  return frozenEntry({ command, outcome, responseTrace: null });
}

function assertBranch(value: unknown, label: string): asserts value is ExperimentBranchV1 {
  const branch = exactObject(
    value,
    [
      "id",
      "label",
      "parentBranchId",
      "forkTick",
      "targetTick",
      "expectedHash",
      "commandLog",
    ],
    label,
  );
  contractId(branch.id, `${label}.id`);
  boundedString(branch.label, `${label}.label`);
  if (branch.parentBranchId !== null) {
    contractId(branch.parentBranchId, `${label}.parentBranchId`);
  }
  const forkTick = nonnegativeInteger(branch.forkTick, `${label}.forkTick`);
  const targetTick =
    branch.targetTick === null
      ? null
      : nonnegativeInteger(branch.targetTick, `${label}.targetTick`);
  if (targetTick !== null && targetTick < forkTick) {
    throw new Error(`${label}.targetTick precedes its fork.`);
  }
  if (branch.expectedHash !== null) {
    assertStateHash(branch.expectedHash, `${label}.expectedHash`);
    if (targetTick === null) {
      throw new Error(`${label}.expectedHash requires targetTick.`);
    }
  }
  const commandLog = boundedArray(branch.commandLog, `${label}.commandLog`);
  let lastCommandTick = -1;
  for (const [index, entry] of commandLog.entries()) {
    assertInterventionLogEntry(entry, `${label}.commandLog[${index.toString()}]`);
    if (entry.command.commandId !== index + 1) {
      throw new Error(`${label} command IDs must be contiguous and begin at 1.`);
    }
    lastCommandTick = Math.max(lastCommandTick, entry.command.applyAtTick);
  }
  if (targetTick !== null && targetTick <= lastCommandTick) {
    throw new Error(`${label}.targetTick must be after its last command tick.`);
  }
}

function assertBookmark(
  value: unknown,
  label: string,
): asserts value is ExperimentBookmarkV1 {
  const bookmark = exactObject(value, ["id", "branchId", "tick", "label"], label);
  contractId(bookmark.id, `${label}.id`);
  contractId(bookmark.branchId, `${label}.branchId`);
  nonnegativeInteger(bookmark.tick, `${label}.tick`);
  boundedString(bookmark.label, `${label}.label`);
}

function assertCheckpoint(
  value: unknown,
  label: string,
): asserts value is ExperimentCheckpointV1 {
  const checkpoint = exactObject(value, ["id", "branchId", "tick", "stateHash"], label);
  contractId(checkpoint.id, `${label}.id`);
  contractId(checkpoint.branchId, `${label}.branchId`);
  nonnegativeInteger(checkpoint.tick, `${label}.tick`);
  assertStateHash(checkpoint.stateHash, `${label}.stateHash`);
}

function sameCommand(
  left: Readonly<ScheduledPlayerCommand>,
  right: Readonly<ScheduledPlayerCommand>,
): boolean {
  return (
    left.commandId === right.commandId &&
    left.applyAtTick === right.applyAtTick &&
    left.type === right.type &&
    left.tileIndex === right.tileIndex &&
    left.amount === right.amount &&
    left.blocked === right.blocked
  );
}

export function assertExperiment(value: unknown): asserts value is ExperimentV1 {
  const experiment = exactObject(
    value,
    [
      "kind",
      "schemaVersion",
      "behaviorVersion",
      "stateSchemaVersion",
      "scenario",
      "rootBranchId",
      "branches",
      "bookmarks",
      "checkpoints",
    ],
    "Experiment",
  );
  if (experiment.kind !== "tiny-civilisation/experiment") {
    throw new Error("Invalid Tiny Civilisation experiment envelope.");
  }
  assertVersion(
    experiment,
    "schemaVersion",
    EXPERIMENT_SCHEMA_VERSION,
    "Experiment schema version",
  );
  assertVersion(
    experiment,
    "behaviorVersion",
    SIMULATION_BEHAVIOR_VERSION,
    "Experiment behavior version",
  );
  assertVersion(
    experiment,
    "stateSchemaVersion",
    SIMULATION_STATE_VERSION,
    "Experiment state version",
  );
  assertScenarioReference(experiment.scenario);
  const rootBranchId = contractId(experiment.rootBranchId, "Experiment.rootBranchId");
  const branches = boundedArray(experiment.branches, "Experiment.branches");
  if (branches.length === 0) throw new Error("Experiment must contain a root branch.");
  for (const [index, branch] of branches.entries()) {
    assertBranch(branch, `Experiment.branches[${index.toString()}]`);
  }
  const typedBranches = branches as unknown as ExperimentBranchV1[];
  assertUniqueStrings(
    typedBranches.map((branch) => branch.id),
    "Experiment branch IDs",
  );
  const byId = new Map(typedBranches.map((branch) => [branch.id, branch]));
  const root = byId.get(rootBranchId);
  if (!root || root.parentBranchId !== null || root.forkTick !== 0) {
    throw new Error(
      "Experiment root branch must exist, have no parent, and fork at tick 0.",
    );
  }
  for (const branch of typedBranches) {
    if (branch.id === rootBranchId) continue;
    const parent = branch.parentBranchId === null ? null : byId.get(branch.parentBranchId);
    if (!parent) throw new Error(`Experiment branch ${branch.id} has a missing parent.`);
    if (branch.forkTick < parent.forkTick) {
      throw new Error(`Experiment branch ${branch.id} forks before its parent.`);
    }
    const expectedPrefix = parent.commandLog.filter(
      (entry) => entry.command.applyAtTick < branch.forkTick,
    );
    if (branch.commandLog.length < expectedPrefix.length) {
      throw new Error(
        `Experiment branch ${branch.id} is missing its common command prefix.`,
      );
    }
    for (const [index, parentEntry] of expectedPrefix.entries()) {
      const childEntry = branch.commandLog[index];
      if (!childEntry || !sameCommand(parentEntry.command, childEntry.command)) {
        throw new Error(`Experiment branch ${branch.id} diverges before its fork tick.`);
      }
    }
    for (const entry of branch.commandLog.slice(expectedPrefix.length)) {
      if (entry.command.applyAtTick < branch.forkTick) {
        throw new Error(
          `Experiment branch ${branch.id} adds a command before its fork tick.`,
        );
      }
    }
    const seen = new Set<string>();
    let cursor: ExperimentBranchV1 | undefined = branch;
    while (cursor) {
      if (seen.has(cursor.id)) throw new Error("Experiment branches contain a cycle.");
      seen.add(cursor.id);
      cursor = cursor.parentBranchId === null ? undefined : byId.get(cursor.parentBranchId);
    }
  }

  const bookmarks = boundedArray(experiment.bookmarks, "Experiment.bookmarks");
  for (const [index, bookmark] of bookmarks.entries()) {
    assertBookmark(bookmark, `Experiment.bookmarks[${index.toString()}]`);
  }
  const typedBookmarks = bookmarks as unknown as ExperimentBookmarkV1[];
  assertUniqueStrings(
    typedBookmarks.map((bookmark) => bookmark.id),
    "Experiment bookmark IDs",
  );
  for (const bookmark of typedBookmarks) {
    const branch = byId.get(bookmark.branchId);
    if (!branch) {
      throw new Error(`Experiment bookmark ${bookmark.id} has a missing branch.`);
    }
    if (bookmark.tick < branch.forkTick) {
      throw new Error(`Experiment bookmark ${bookmark.id} precedes its branch fork.`);
    }
    if (branch.targetTick !== null && bookmark.tick > branch.targetTick) {
      throw new Error(`Experiment bookmark ${bookmark.id} exceeds its branch horizon.`);
    }
  }

  const checkpoints = boundedArray(experiment.checkpoints, "Experiment.checkpoints");
  for (const [index, checkpoint] of checkpoints.entries()) {
    assertCheckpoint(checkpoint, `Experiment.checkpoints[${index.toString()}]`);
  }
  const typedCheckpoints = checkpoints as unknown as ExperimentCheckpointV1[];
  assertUniqueStrings(
    typedCheckpoints.map((checkpoint) => checkpoint.id),
    "Experiment checkpoint IDs",
  );
  for (const checkpoint of typedCheckpoints) {
    if (!byId.has(checkpoint.branchId)) {
      throw new Error(`Experiment checkpoint ${checkpoint.id} has a missing branch.`);
    }
  }
}

function frozenBranch(branch: ExperimentBranchV1): ExperimentBranchV1 {
  return Object.freeze({
    ...branch,
    commandLog: Object.freeze(branch.commandLog.map(frozenEntry)),
  });
}

function frozenExperiment(experiment: ExperimentV1): ExperimentV1 {
  assertExperiment(experiment);
  return Object.freeze({
    ...experiment,
    scenario: createScenarioReference(
      experiment.scenario.scenarioId,
      experiment.scenario.seed,
    ),
    branches: Object.freeze(experiment.branches.map(frozenBranch)),
    bookmarks: Object.freeze(
      experiment.bookmarks.map((bookmark) => Object.freeze({ ...bookmark })),
    ),
    checkpoints: Object.freeze(
      experiment.checkpoints.map((checkpoint) => Object.freeze({ ...checkpoint })),
    ),
  });
}

export function createExperiment(
  scenario: ScenarioReferenceV1,
  options: CreateExperimentOptions = {},
): ExperimentV1 {
  assertScenarioReference(scenario);
  const rootBranchId = options.rootBranchId ?? DEFAULT_EXPERIMENT_BRANCH_ID;
  const experiment: ExperimentV1 = {
    kind: "tiny-civilisation/experiment",
    schemaVersion: EXPERIMENT_SCHEMA_VERSION,
    behaviorVersion: SIMULATION_BEHAVIOR_VERSION,
    stateSchemaVersion: SIMULATION_STATE_VERSION,
    scenario,
    rootBranchId,
    branches: [
      {
        id: rootBranchId,
        label: options.rootLabel ?? "Baseline",
        parentBranchId: null,
        forkTick: 0,
        targetTick: null,
        expectedHash: null,
        commandLog: [],
      },
    ],
    bookmarks: [],
    checkpoints: [],
  };
  return frozenExperiment(experiment);
}

function updateBranch(
  experiment: ExperimentV1,
  branchId: string,
  update: (branch: ExperimentBranchV1) => ExperimentBranchV1,
): ExperimentV1 {
  const index = experiment.branches.findIndex((branch) => branch.id === branchId);
  if (index < 0) throw new Error(`Experiment branch ${branchId} does not exist.`);
  const branch = experiment.branches[index];
  if (!branch) throw new Error(`Experiment branch ${branchId} does not exist.`);
  const updated = update(branch);
  if (updated === branch) return experiment;
  const branches = experiment.branches.map((candidate) =>
    candidate.id === branchId ? updated : candidate,
  );
  return frozenExperiment({ ...experiment, branches });
}

export function appendExperimentIntervention(
  experiment: ExperimentV1,
  branchId: string,
  entry: InterventionLogEntryV1,
): ExperimentV1 {
  assertExperiment(experiment);
  const immutableEntry = frozenEntry(entry);
  return updateBranch(experiment, branchId, (branch) => {
    const expectedCommandId = branch.commandLog.length + 1;
    if (immutableEntry.command.commandId !== expectedCommandId) {
      throw new Error(
        `Branch ${branchId} expected command ID ${expectedCommandId.toString()}.`,
      );
    }
    if (immutableEntry.command.applyAtTick < branch.forkTick) {
      throw new Error(`Branch ${branchId} cannot add a command before its fork tick.`);
    }
    return {
      ...branch,
      targetTick: null,
      expectedHash: null,
      commandLog: [...branch.commandLog, immutableEntry],
    };
  });
}

export function settleExperimentIntervention(
  experiment: ExperimentV1,
  branchId: string,
  commandId: number,
  outcome: SettledInterventionOutcomeV1,
): ExperimentV1 {
  assertExperiment(experiment);
  return updateBranch(experiment, branchId, (branch) => {
    const commandIndex = branch.commandLog.findIndex(
      (entry) => entry.command.commandId === commandId,
    );
    const existing = branch.commandLog[commandIndex];
    if (!existing)
      throw new Error(`Branch ${branchId} has no command ${commandId.toString()}.`);
    if (existing.outcome.status !== "PENDING") {
      throw new Error(
        `Branch ${branchId} command ${commandId.toString()} is already settled.`,
      );
    }
    const settled = frozenEntry({
      command: existing.command,
      outcome,
      responseTrace: existing.responseTrace,
    });
    return {
      ...branch,
      commandLog: branch.commandLog.map((entry, index) =>
        index === commandIndex ? settled : entry,
      ),
    };
  });
}

export function setExperimentInterventionResponseTrace(
  experiment: ExperimentV1,
  branchId: string,
  commandId: number,
  responseTrace: InterventionResponseTrace | null,
): ExperimentV1 {
  assertExperiment(experiment);
  if (nonnegativeInteger(commandId, "Intervention command ID") === 0) {
    throw new Error("Intervention command ID must be positive.");
  }
  const immutableTrace =
    responseTrace === null ? null : freezeInterventionResponseTrace(responseTrace);
  return updateBranch(experiment, branchId, (branch) => {
    const commandIndex = branch.commandLog.findIndex(
      (entry) => entry.command.commandId === commandId,
    );
    const existing = branch.commandLog[commandIndex];
    if (!existing) {
      throw new Error(`Branch ${branchId} has no command ${commandId.toString()}.`);
    }
    if (existing.responseTrace === responseTrace) return branch;
    const updated = frozenEntry({
      ...existing,
      responseTrace: immutableTrace,
    });
    return {
      ...branch,
      commandLog: branch.commandLog.map((entry, index) =>
        index === commandIndex ? updated : entry,
      ),
    };
  });
}

export function forkExperimentBranch(
  experiment: ExperimentV1,
  parentBranchId: string,
  branchId: string,
  label: string,
  forkTick: number,
): ExperimentV1 {
  assertExperiment(experiment);
  contractId(branchId, "Branch ID");
  boundedString(label, "Branch label");
  nonnegativeInteger(forkTick, "Branch forkTick");
  if (experiment.branches.some((branch) => branch.id === branchId)) {
    throw new Error(`Experiment branch ${branchId} already exists.`);
  }
  const parent = experiment.branches.find((branch) => branch.id === parentBranchId);
  if (!parent) throw new Error(`Experiment branch ${parentBranchId} does not exist.`);
  if (forkTick < parent.forkTick) throw new Error("Branch cannot fork before its parent.");
  const commandLog = parent.commandLog
    .filter((entry) => entry.command.applyAtTick < forkTick)
    .map((entry) => {
      const trace = entry.responseTrace;
      const containsFutureEvidence =
        trace !== null &&
        ((trace.outcome !== null && trace.outcome.tick > forkTick) ||
          (trace.observedThroughTick !== null && trace.observedThroughTick > forkTick) ||
          (trace.closedAtTick !== null && trace.closedAtTick > forkTick) ||
          trace.responses.some(
            (response) =>
              response.firstObservedTick > forkTick ||
              response.beats.some((beat) => beat.tick > forkTick) ||
              (response.failure !== null && response.failure.tick > forkTick),
          ));
      return containsFutureEvidence ? { ...entry, responseTrace: null } : entry;
    });
  return frozenExperiment({
    ...experiment,
    branches: [
      ...experiment.branches,
      {
        id: branchId,
        label,
        parentBranchId,
        forkTick,
        targetTick: null,
        expectedHash: null,
        commandLog,
      },
    ],
  });
}

export function setExperimentBranchResult(
  experiment: ExperimentV1,
  branchId: string,
  targetTick: number,
  expectedHash: string,
): ExperimentV1 {
  nonnegativeInteger(targetTick, "Branch targetTick");
  assertStateHash(expectedHash, "Branch expectedHash");
  return updateBranch(experiment, branchId, (branch) => {
    const lastCommandTick = branch.commandLog.reduce(
      (latest, entry) => Math.max(latest, entry.command.applyAtTick),
      -1,
    );
    if (targetTick <= lastCommandTick) {
      throw new Error("Branch targetTick must be after its last command tick.");
    }
    return { ...branch, targetTick, expectedHash };
  });
}

export function addExperimentBookmark(
  experiment: ExperimentV1,
  bookmark: ExperimentBookmarkV1,
): ExperimentV1 {
  assertExperiment(experiment);
  assertBookmark(bookmark, "Bookmark");
  return frozenExperiment({
    ...experiment,
    bookmarks: [...experiment.bookmarks, bookmark],
  });
}

export function addExperimentCheckpoint(
  experiment: ExperimentV1,
  checkpoint: ExperimentCheckpointV1,
): ExperimentV1 {
  assertExperiment(experiment);
  assertCheckpoint(checkpoint, "Checkpoint");
  return frozenExperiment({
    ...experiment,
    checkpoints: [...experiment.checkpoints, checkpoint],
  });
}

export function createBranchReplay(
  experiment: ExperimentV1,
  branchId: string,
): SimulationReplayV1 {
  assertExperiment(experiment);
  const branch = experiment.branches.find((candidate) => candidate.id === branchId);
  if (!branch) throw new Error(`Experiment branch ${branchId} does not exist.`);
  return {
    kind: "tiny-civilisation/replay",
    schemaVersion: REPLAY_SCHEMA_VERSION,
    behaviorVersion: SIMULATION_BEHAVIOR_VERSION,
    stateSchemaVersion: SIMULATION_STATE_VERSION,
    scenario: createScenarioReference(
      experiment.scenario.scenarioId,
      experiment.scenario.seed,
    ),
    seed: experiment.scenario.seed,
    commands: branch.commandLog.map((entry) => ({ ...entry.command })),
    ...(branch.targetTick === null ? {} : { finalTick: branch.targetTick }),
    ...(branch.expectedHash === null ? {} : { finalHash: branch.expectedHash }),
  };
}

export function serializeExperiment(experiment: ExperimentV1): string {
  assertExperiment(experiment);
  const serialized = JSON.stringify(experiment);
  assertSerializedSize(serialized, "Experiment data");
  return serialized;
}

export function migrateExperiment(value: unknown): ExperimentV1 {
  if (
    isRecord(value) &&
    value.kind === "tiny-civilisation/experiment" &&
    (value.schemaVersion === 1 || value.schemaVersion === 2 || value.schemaVersion === 3)
  ) {
    const legacySchemaVersion = value.schemaVersion;
    const legacy = exactObject(
      value,
      [
        "kind",
        "schemaVersion",
        "behaviorVersion",
        "stateSchemaVersion",
        "scenario",
        "rootBranchId",
        "branches",
        "bookmarks",
        "checkpoints",
      ],
      "Experiment",
    );
    const legacyBehavior = legacy.behaviorVersion;
    const legacyState = legacy.stateSchemaVersion;
    const isBehaviorV1 = legacyBehavior === 1 && legacyState === 1;
    const isPhaseTwoBehavior = legacyBehavior === 3 && legacyState === 2;
    const isPhaseThreeBehavior =
      legacySchemaVersion === 3 && legacyBehavior === 3 && legacyState === 3;
    const supportedLegacyEnvelope =
      legacySchemaVersion === 3 ? isPhaseThreeBehavior : isBehaviorV1 || isPhaseTwoBehavior;
    if (!supportedLegacyEnvelope) {
      throw new Error(
        `Experiment schema version ${legacySchemaVersion.toString()} has incompatible behavior/state versions ${String(legacyBehavior)}/${String(legacyState)}.`,
      );
    }
    const scenario = exactObject(
      legacy.scenario,
      isPhaseThreeBehavior
        ? [
            "kind",
            "schemaVersion",
            "behaviorVersion",
            "scenarioId",
            "scenarioVersion",
            "mapGenerationVersion",
            "seed",
          ]
        : [
            "kind",
            "schemaVersion",
            "behaviorVersion",
            "scenarioId",
            "scenarioVersion",
            "seed",
          ],
      "Scenario",
    );
    let migratedScenario: ScenarioReferenceV2;
    if (isPhaseThreeBehavior) {
      if (
        scenario.kind !== "tiny-civilisation/scenario" ||
        scenario.schemaVersion !== 2 ||
        scenario.behaviorVersion !== 3 ||
        scenario.scenarioVersion !== 1 ||
        scenario.mapGenerationVersion !== 1 ||
        !isScenarioId(scenario.scenarioId)
      ) {
        throw new Error("Phase 3 experiment uses an unsupported scenario definition.");
      }
      migratedScenario = createScenarioReference(
        scenario.scenarioId,
        nonnegativeInteger(scenario.seed, "Scenario seed"),
      );
    } else {
      const expectedScenarioBehavior = isBehaviorV1 ? 1 : 3;
      if (
        scenario.kind !== "tiny-civilisation/scenario" ||
        scenario.schemaVersion !== 1 ||
        scenario.behaviorVersion !== expectedScenarioBehavior ||
        scenario.scenarioId !== DEFAULT_SCENARIO_ID ||
        scenario.scenarioVersion !== 1
      ) {
        throw new Error("Legacy experiment uses an unsupported scenario definition.");
      }
      migratedScenario = createScenarioReference(
        nonnegativeInteger(scenario.seed, "Scenario seed"),
      );
    }
    const branches = boundedArray(legacy.branches, "Experiment.branches").map(
      (branchValue, branchIndex) => {
        const branch = exactObject(
          branchValue,
          [
            "id",
            "label",
            "parentBranchId",
            "forkTick",
            "targetTick",
            "expectedHash",
            "commandLog",
          ],
          `Experiment.branches[${branchIndex.toString()}]`,
        );
        const commandLog = boundedArray(
          branch.commandLog,
          `Experiment.branches[${branchIndex.toString()}].commandLog`,
        ).map((entryValue, entryIndex) => {
          const entry = exactObject(
            entryValue,
            legacySchemaVersion === 1
              ? ["command", "outcome"]
              : ["command", "outcome", "responseTrace"],
            `Experiment.branches[${branchIndex.toString()}].commandLog[${entryIndex.toString()}]`,
          );
          return {
            command: entry.command,
            outcome: { status: "PENDING" as const },
            responseTrace: null,
          };
        });
        return {
          ...branch,
          // Adding authoritative scenario identity changes state hashes. Older
          // horizons remain replayable, but their verification claims do not.
          targetTick: branch.targetTick,
          expectedHash: null,
          commandLog,
        };
      },
    );
    const migrated = {
      ...legacy,
      schemaVersion: EXPERIMENT_SCHEMA_VERSION,
      behaviorVersion: SIMULATION_BEHAVIOR_VERSION,
      stateSchemaVersion: SIMULATION_STATE_VERSION,
      scenario: migratedScenario,
      branches,
      checkpoints: [],
    };
    assertExperiment(migrated);
    return frozenExperiment(migrated);
  }
  assertExperiment(value);
  return frozenExperiment(value);
}

export function deserializeExperiment(serialized: string): ExperimentV1 {
  assertSerializedSize(serialized, "Experiment data");
  let value: unknown;
  try {
    value = JSON.parse(serialized) as unknown;
  } catch (error) {
    throw new Error("Experiment data is not valid JSON.", { cause: error });
  }
  return migrateExperiment(value);
}
