import { SCENARIO_SCHEMA_VERSION, SIMULATION_BEHAVIOR_VERSION } from "../versions.js";

export const SCENARIO_IDS = [
  "petri-world",
  "split-banks",
  "scattered-plenty",
  "unequal-table",
] as const;

export type ScenarioId = (typeof SCENARIO_IDS)[number];

export const DEFAULT_SCENARIO_ID = "petri-world" as const satisfies ScenarioId;
export const SCENARIO_DEFINITION_VERSION = 2 as const;
export const DEFAULT_SCENARIO_VERSION = SCENARIO_DEFINITION_VERSION;
export const SCENARIO_MAP_GENERATION_VERSION = 1 as const;

export interface ScenarioReferenceV2 {
  readonly kind: "tiny-civilisation/scenario";
  readonly schemaVersion: typeof SCENARIO_SCHEMA_VERSION;
  readonly behaviorVersion: typeof SIMULATION_BEHAVIOR_VERSION;
  readonly scenarioId: ScenarioId;
  readonly scenarioVersion: typeof SCENARIO_DEFINITION_VERSION;
  readonly mapGenerationVersion: typeof SCENARIO_MAP_GENERATION_VERSION;
  readonly seed: number;
}

export interface ScenarioMetadata {
  readonly scenarioId: ScenarioId;
  readonly scenarioVersion: typeof SCENARIO_DEFINITION_VERSION;
  readonly mapGenerationVersion: typeof SCENARIO_MAP_GENERATION_VERSION;
  readonly name: string;
  readonly role: string;
  readonly dramaticQuestion: string;
  readonly startingFacts: readonly string[];
  readonly observableTensions: readonly string[];
}

const REFERENCE_KEYS = [
  "kind",
  "schemaVersion",
  "behaviorVersion",
  "scenarioId",
  "scenarioVersion",
  "mapGenerationVersion",
  "seed",
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isScenarioId(value: unknown): value is ScenarioId {
  return typeof value === "string" && SCENARIO_IDS.some((id) => id === value);
}

function assertUnsignedSeed(value: unknown): asserts value is number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < 0 ||
    value > 0xffff_ffff
  ) {
    throw new Error("Scenario seed must be an unsigned 32-bit integer.");
  }
}

export function assertScenarioReference(
  value: unknown,
): asserts value is ScenarioReferenceV2 {
  if (!isRecord(value) || value.kind !== "tiny-civilisation/scenario") {
    throw new Error("Invalid Tiny Civilisation scenario envelope.");
  }
  const supportedKeys = new Set<string>(REFERENCE_KEYS);
  for (const key of Object.keys(value)) {
    if (!supportedKeys.has(key)) {
      throw new Error(`Scenario contains unsupported field ${key}.`);
    }
  }
  for (const key of REFERENCE_KEYS) {
    if (!(key in value)) throw new Error(`Scenario is missing required field ${key}.`);
  }
  if (value.schemaVersion !== SCENARIO_SCHEMA_VERSION) {
    throw new Error(
      `Scenario schema version ${String(value.schemaVersion)} is incompatible with ${SCENARIO_SCHEMA_VERSION.toString()}.`,
    );
  }
  if (value.behaviorVersion !== SIMULATION_BEHAVIOR_VERSION) {
    throw new Error(
      `Scenario behavior version ${String(value.behaviorVersion)} is incompatible with ${SIMULATION_BEHAVIOR_VERSION.toString()}.`,
    );
  }
  if (!isScenarioId(value.scenarioId)) {
    throw new Error(`Unsupported scenario ${String(value.scenarioId)}.`);
  }
  if (value.scenarioVersion !== SCENARIO_DEFINITION_VERSION) {
    throw new Error(
      `Scenario definition version ${String(value.scenarioVersion)} is incompatible with ${SCENARIO_DEFINITION_VERSION.toString()}.`,
    );
  }
  if (value.mapGenerationVersion !== SCENARIO_MAP_GENERATION_VERSION) {
    throw new Error(
      `Scenario map-generation version ${String(value.mapGenerationVersion)} is incompatible with ${SCENARIO_MAP_GENERATION_VERSION.toString()}.`,
    );
  }
  assertUnsignedSeed(value.seed);
}

export function createScenarioReference(seed?: number): ScenarioReferenceV2;
export function createScenarioReference(
  scenarioId: ScenarioId,
  seed: number,
): ScenarioReferenceV2;
export function createScenarioReference(
  scenarioIdOrSeed: ScenarioId | number = 4_182,
  requestedSeed?: number,
): ScenarioReferenceV2 {
  const scenarioId =
    typeof scenarioIdOrSeed === "string" ? scenarioIdOrSeed : DEFAULT_SCENARIO_ID;
  const seed = typeof scenarioIdOrSeed === "number" ? scenarioIdOrSeed : requestedSeed;
  if (seed === undefined) throw new Error("Scenario seed is required.");
  const reference: ScenarioReferenceV2 = {
    kind: "tiny-civilisation/scenario",
    schemaVersion: SCENARIO_SCHEMA_VERSION,
    behaviorVersion: SIMULATION_BEHAVIOR_VERSION,
    scenarioId,
    scenarioVersion: SCENARIO_DEFINITION_VERSION,
    mapGenerationVersion: SCENARIO_MAP_GENERATION_VERSION,
    seed,
  };
  assertScenarioReference(reference);
  return Object.freeze(reference);
}

export function cloneScenarioReference(
  reference: ScenarioReferenceV2,
): ScenarioReferenceV2 {
  assertScenarioReference(reference);
  return Object.freeze({ ...reference });
}

export function sameScenarioReference(
  left: ScenarioReferenceV2,
  right: ScenarioReferenceV2,
): boolean {
  return (
    left.kind === right.kind &&
    left.schemaVersion === right.schemaVersion &&
    left.behaviorVersion === right.behaviorVersion &&
    left.scenarioId === right.scenarioId &&
    left.scenarioVersion === right.scenarioVersion &&
    left.mapGenerationVersion === right.mapGenerationVersion &&
    left.seed === right.seed
  );
}
