import { describe, expect, it } from "vitest";
import {
  COMMAND_SCHEMA_VERSION,
  REPLAY_SCHEMA_VERSION,
  SAVE_SCHEMA_VERSION,
  SIMULATION_BEHAVIOR_VERSION,
  SIMULATION_STATE_VERSION,
  SNAPSHOT_SCHEMA_VERSION,
  advanceSimulation,
  createPlayerCommandEnvelope,
  createRenderSnapshot,
  createRenderSnapshotEnvelope,
  createSimulation,
  createSimulationReplay,
  createSimulationSave,
  deserializeSimulationSave,
  hashSimulationState,
  migrateSimulationReplay,
  migrateSimulationSave,
  queuePlayerCommand,
  serializeSimulationSave,
} from "../src/index.js";

function utf8ByteLength(value: string): number {
  let length = 0;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 0x7f) length += 1;
    else if (code <= 0x7ff) length += 2;
    else if (
      code >= 0xd800 &&
      code <= 0xdbff &&
      index + 1 < value.length &&
      value.charCodeAt(index + 1) >= 0xdc00 &&
      value.charCodeAt(index + 1) <= 0xdfff
    ) {
      length += 4;
      index += 1;
    } else length += 3;
  }
  return length;
}

type UnknownRecord = Record<string, unknown>;

function record(value: unknown): UnknownRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Expected a record fixture.");
  }
  return value as UnknownRecord;
}

function legacyStateFixture(): UnknownRecord {
  const state = createSimulation(41);
  advanceSimulation(state, 12);
  const legacy = record(JSON.parse(JSON.stringify(state)) as unknown);
  legacy.schemaVersion = 1;
  const configuration = record(legacy.configuration);
  delete configuration.maxIntentHistoryPerCreature;
  delete configuration.maxRouteSamplesPerCreature;
  const metrics = record(legacy.metrics);
  delete metrics.interactionContentions;
  delete metrics.failedInteractionClaims;
  for (const value of legacy.creatures as unknown[]) {
    const creature = record(value);
    delete creature.activeDesire;
    delete creature.activePlan;
    delete creature.intentHistory;
    delete creature.recentRoute;
    if (creature.activeAction) delete record(creature.activeAction).interactionClaim;
  }
  for (const value of legacy.decisionRecords as unknown[]) {
    const decision = record(value);
    delete decision.selectedDesire;
    delete decision.selectedPlan;
    delete decision.strongestReason;
    for (const candidateValue of decision.candidates as unknown[]) {
      const candidate = record(candidateValue);
      delete candidate.desire;
      delete candidate.plan;
      for (const factorValue of candidate.factors as unknown[]) {
        delete record(factorValue).fact;
      }
    }
  }
  legacy.domainEvents = (legacy.domainEvents as unknown[])
    .filter((value) => {
      const type = record(value).type;
      return (
        type !== "DESIRE_CHANGED" && type !== "PLAN_CHANGED" && type !== "PLAN_BLOCKED"
      );
    })
    .map((value) => {
      const event = record(value);
      delete event.attentionTier;
      delete event.clusterKey;
      delete event.commandId;
      delete event.commandOutcome;
      delete event.commandRejectionReason;
      return event;
    });
  return legacy;
}

describe("versioned simulation contracts", () => {
  it("publishes independent command, snapshot, replay, state, and save versions", () => {
    const command = createPlayerCommandEnvelope({
      type: "ADD_FOOD",
      tileIndex: 10,
      amount: 3,
    });
    expect(command.schemaVersion).toBe(COMMAND_SCHEMA_VERSION);
    expect(command.behaviorVersion).toBe(SIMULATION_BEHAVIOR_VERSION);

    const state = createSimulation(41);
    const snapshot = createRenderSnapshot(state);
    expect(snapshot.schemaVersion).toBe(SNAPSHOT_SCHEMA_VERSION);
    expect(snapshot.behaviorVersion).toBe(SIMULATION_BEHAVIOR_VERSION);
    expect(createRenderSnapshotEnvelope(snapshot).snapshot).toBe(snapshot);

    const scheduled = queuePlayerCommand(state, command.command);
    const replay = createSimulationReplay(state.seed, [scheduled]);
    expect(replay.schemaVersion).toBe(REPLAY_SCHEMA_VERSION);
    expect(replay.stateSchemaVersion).toBe(SIMULATION_STATE_VERSION);
    expect(replay.commands).toEqual([scheduled]);
    expect(replay.commands).not.toBe(state.commandQueue);
  });

  it("round trips a save without changing its authoritative hash", () => {
    const state = createSimulation(921);
    advanceSimulation(state, 1_200);
    const before = hashSimulationState(state);
    const serialized = serializeSimulationSave(state);
    const loaded = deserializeSimulationSave(serialized);

    expect(createSimulationSave(state).schemaVersion).toBe(SAVE_SCHEMA_VERSION);
    expect(hashSimulationState(loaded)).toBe(before);
    expect(loaded).not.toBe(state);
  });

  it("keeps a 10,000-tick reference save within the Phase 2.5 persistence budget", () => {
    const state = createSimulation(4_182);
    advanceSimulation(state, 10_000);

    const bytes = utf8ByteLength(serializeSimulationSave(state));
    expect(bytes).toBeLessThanOrEqual(2_500_000);
  });

  it("fails clearly on invalid and incompatible save data", () => {
    expect(() => deserializeSimulationSave("not json")).toThrow(
      "Save data is not valid JSON",
    );
    expect(() => migrateSimulationSave({ schemaVersion: 1 })).toThrow(
      "Invalid Tiny Civilisation save envelope",
    );

    const save = createSimulationSave(createSimulation(7));
    expect(() => migrateSimulationSave({ ...save, schemaVersion: 999 })).toThrow(
      "Unsupported save schema version 999",
    );
    expect(() => migrateSimulationSave({ ...save, behaviorVersion: 999 })).toThrow(
      "Save behavior version 999 is incompatible",
    );
    expect(() =>
      migrateSimulationSave({ ...save, state: { ...save.state, creatures: null } }),
    ).toThrow("creatures must be an array");
  });

  it("deterministically migrates v1 saves and rebuilds v2 observation state", () => {
    const legacyState = legacyStateFixture();
    const legacySave = {
      kind: "tiny-civilisation/save",
      schemaVersion: SAVE_SCHEMA_VERSION,
      behaviorVersion: 1,
      stateSchemaVersion: 1,
      state: legacyState,
    };
    const first = migrateSimulationSave(legacySave).state;
    const second = migrateSimulationSave(
      JSON.parse(JSON.stringify(legacySave)) as unknown,
    ).state;

    expect(first.schemaVersion).toBe(SIMULATION_STATE_VERSION);
    expect(first.metrics).toMatchObject({
      interactionContentions: 0,
      failedInteractionClaims: 0,
    });
    expect(hashSimulationState(first)).toBe(hashSimulationState(second));
    expect(
      first.creatures.every(
        (creature) =>
          creature.recentRoute.length > 0 &&
          (creature.activeAction === null ||
            (creature.activeDesire !== null && creature.activePlan !== null)),
      ),
    ).toBe(true);
    expect(
      first.domainEvents.every(
        (event) => event.attentionTier !== undefined && event.clusterKey.length > 0,
      ),
    ).toBe(true);
  });

  it("preserves v1 replay commands but drops hashes that cannot verify v2 behavior", () => {
    const migrated = migrateSimulationReplay({
      kind: "tiny-civilisation/replay",
      schemaVersion: REPLAY_SCHEMA_VERSION,
      behaviorVersion: 1,
      stateSchemaVersion: 1,
      seed: 41,
      commands: [],
      finalTick: 500,
      finalHash: "0123456789abcdef",
    });
    expect(migrated).toMatchObject({
      behaviorVersion: SIMULATION_BEHAVIOR_VERSION,
      stateSchemaVersion: SIMULATION_STATE_VERSION,
      seed: 41,
      commands: [],
    });
    expect(migrated.finalTick).toBeUndefined();
    expect(migrated.finalHash).toBeUndefined();
  });
});
