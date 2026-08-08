import { describe, expect, it } from "vitest";
import {
  COMMAND_SCHEMA_VERSION,
  REPLAY_SCHEMA_VERSION,
  SAVE_SCHEMA_VERSION,
  SCENARIO_CANONICAL_SEEDS,
  SCENARIO_IDS,
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
  createScenarioReference,
  deserializeSimulationSave,
  executeSimulationReplay,
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
  delete metrics.waterGathered;
  delete metrics.waterDrunk;
  delete metrics.waterShared;
  delete metrics.severeThirstCreatureTicks;
  delete metrics.waterGatherContentions;
  legacy.resourceNodes = (legacy.resourceNodes as unknown[]).filter(
    (value) => record(value).kind !== "WATER",
  );
  const entityIds = [
    ...(legacy.creatures as unknown[]),
    ...(legacy.resourceNodes as unknown[]),
    ...(legacy.structures as unknown[]),
  ].map((value) => record(value).id as number);
  legacy.nextEntityId = Math.max(...entityIds) + 1;
  for (const value of legacy.creatures as unknown[]) {
    const creature = record(value);
    delete record(creature.needs).thirst;
    delete record(creature.inventory).water;
    delete record(creature.actionCounts).GATHER_WATER;
    delete record(creature.actionCounts).DRINK;
    delete record(creature.actionCounts).SHARE_WATER;
    delete creature.activeDesire;
    delete creature.activePlan;
    delete creature.intentHistory;
    delete creature.recentRoute;
    if (creature.activeAction) delete record(creature.activeAction).interactionClaim;
  }
  for (const value of legacy.structures as unknown[]) {
    delete record(record(value).inventory).water;
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
        type !== "DESIRE_CHANGED" &&
        type !== "PLAN_CHANGED" &&
        type !== "PLAN_BLOCKED" &&
        type !== "HYDRATION_RULES_ENABLED" &&
        !String(type).includes("WATER") &&
        !String(type).includes("THIRST")
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

function phaseThreeStateFixture(): UnknownRecord {
  const state = createSimulation(createScenarioReference("split-banks", 91));
  advanceSimulation(state, 12);
  const legacy = record(JSON.parse(JSON.stringify(state)) as unknown);
  legacy.schemaVersion = 3;
  const scenario = record(legacy.scenario);
  scenario.behaviorVersion = 3;
  scenario.scenarioVersion = 1;
  legacy.compiledMapHash = "1111111111111111";
  legacy.resourceNodes = (legacy.resourceNodes as unknown[]).filter(
    (value) => record(value).kind !== "WATER",
  );
  const entityIds = [
    ...(legacy.creatures as unknown[]),
    ...(legacy.resourceNodes as unknown[]),
    ...(legacy.structures as unknown[]),
  ].map((value) => record(value).id as number);
  legacy.nextEntityId = Math.max(...entityIds) + 1;
  for (const value of legacy.creatures as unknown[]) {
    const creature = record(value);
    delete record(creature.needs).thirst;
    delete record(creature.inventory).water;
    delete record(creature.actionCounts).GATHER_WATER;
    delete record(creature.actionCounts).DRINK;
    delete record(creature.actionCounts).SHARE_WATER;
  }
  for (const value of legacy.structures as unknown[]) {
    delete record(record(value).inventory).water;
  }
  const metrics = record(legacy.metrics);
  delete metrics.waterGathered;
  delete metrics.waterDrunk;
  delete metrics.waterShared;
  delete metrics.severeThirstCreatureTicks;
  delete metrics.waterGatherContentions;
  legacy.domainEvents = (legacy.domainEvents as unknown[]).filter((value) => {
    const type = String(record(value).type);
    return (
      type !== "HYDRATION_RULES_ENABLED" &&
      !type.includes("WATER") &&
      !type.includes("THIRST")
    );
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
    expect(snapshot.tiles).toHaveLength(snapshot.width * snapshot.height);
    expect(Object.keys(snapshot.tiles[0]!).sort()).toEqual(["blocked", "terrain"]);
    for (const [index, tile] of snapshot.tiles.entries()) {
      expect(tile).toEqual({
        terrain: state.world.tiles[index]!.terrain,
        blocked: state.world.tiles[index]!.blocked,
      });
      expect(index % snapshot.width).toBe(state.world.tiles[index]!.x);
      expect(Math.floor(index / snapshot.width)).toBe(state.world.tiles[index]!.y);
    }

    const scheduled = queuePlayerCommand(state, command.command);
    const replay = createSimulationReplay(state.seed, [scheduled]);
    expect(replay.schemaVersion).toBe(REPLAY_SCHEMA_VERSION);
    expect(replay.stateSchemaVersion).toBe(SIMULATION_STATE_VERSION);
    expect(replay.commands).toEqual([scheduled]);
    expect(replay.commands).not.toBe(state.commandQueue);
  });

  it("round trips a save without changing its authoritative hash", () => {
    const scenario = createScenarioReference("split-banks", 921);
    const state = createSimulation(scenario);
    advanceSimulation(state, 1_200);
    const before = hashSimulationState(state);
    const serialized = serializeSimulationSave(state);
    const loaded = deserializeSimulationSave(serialized);

    expect(createSimulationSave(state).schemaVersion).toBe(SAVE_SCHEMA_VERSION);
    expect(loaded.scenario).toEqual(scenario);
    expect(loaded.compiledMapHash).toBe(state.compiledMapHash);
    expect(hashSimulationState(loaded)).toBe(before);
    expect(loaded).not.toBe(state);
  });

  it("replays a non-reference scenario and rejects contradictory identity", () => {
    const scenario = createScenarioReference("scattered-plenty", 1_203);
    const replay = createSimulationReplay(scenario, []);
    const executed = migrateSimulationReplay(replay);

    expect(executed.scenario).toEqual(scenario);
    expect(executed.seed).toBe(scenario.seed);
    expect(() => migrateSimulationReplay({ ...replay, seed: scenario.seed + 1 })).toThrow(
      "scenario seed must match",
    );
    expect(() =>
      migrateSimulationReplay({
        ...replay,
        scenario: { ...scenario, scenarioId: "unknown-world" },
      }),
    ).toThrow("Unsupported scenario unknown-world");
  });

  it("continues saves and verifies replay hashes for every scenario identity", () => {
    for (const [index, scenarioId] of SCENARIO_IDS.entries()) {
      const reference = createScenarioReference(scenarioId, 700 + index);
      const uninterrupted = createSimulation(reference);
      advanceSimulation(uninterrupted, 800);

      const checkpointed = createSimulation(reference);
      advanceSimulation(checkpointed, 300);
      const continued = deserializeSimulationSave(serializeSimulationSave(checkpointed));
      advanceSimulation(continued, 500);
      expect(hashSimulationState(continued)).toBe(hashSimulationState(uninterrupted));

      const replay = createSimulationReplay(reference, [], {
        finalTick: 800,
        finalHash: hashSimulationState(uninterrupted),
      });
      const replayed = executeSimulationReplay(replay, { requireHashMatch: true });
      expect(replayed.hashStatus).toBe("VERIFIED");
      expect(replayed.state.scenario).toEqual(reference);
    }
  });

  it("keeps every 10,000-tick canonical save within the persistence budget", () => {
    for (const scenarioId of SCENARIO_IDS) {
      const state = createSimulation(
        createScenarioReference(scenarioId, SCENARIO_CANONICAL_SEEDS[scenarioId]),
      );
      advanceSimulation(state, 10_000);

      const bytes = utf8ByteLength(serializeSimulationSave(state));
      expect(bytes, `${scenarioId} save bytes`).toBeLessThanOrEqual(2_500_000);
    }
  }, 20_000);

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

  it("deterministically migrates v1 saves and rebuilds current observation state", () => {
    const legacyState = legacyStateFixture();
    const legacySave = {
      kind: "tiny-civilisation/save",
      schemaVersion: 1,
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
    expect(
      first.decisionRecords.every(
        (decision) =>
          decision.strongestReason === null &&
          decision.candidates.every((candidate) =>
            candidate.factors.every((factor) => factor.fact === null),
          ),
      ),
    ).toBe(true);
  });

  it("preserves v1 replay commands and horizon but drops hashes that cannot verify current state", () => {
    const migrated = migrateSimulationReplay({
      kind: "tiny-civilisation/replay",
      schemaVersion: 1,
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
    expect(migrated.finalTick).toBe(500);
    expect(migrated.finalHash).toBeUndefined();
  });

  it("atomically migrates Phase 3 saves through deterministic hydration and shelter boundaries", () => {
    const legacyState = phaseThreeStateFixture();
    const original = JSON.stringify(legacyState);
    const legacySave = {
      kind: "tiny-civilisation/save",
      schemaVersion: 2,
      behaviorVersion: 3,
      stateSchemaVersion: 3,
      state: legacyState,
    };
    const first = migrateSimulationSave(legacySave).state;
    const second = migrateSimulationSave(
      JSON.parse(JSON.stringify(legacySave)) as unknown,
    ).state;

    expect(JSON.stringify(legacyState)).toBe(original);
    const activeLegacyCreature = (legacyState.creatures as unknown[])
      .map(record)
      .find((creature) => creature.activeAction !== null);
    expect(activeLegacyCreature).toBeDefined();
    expect(
      first.creatures.find((creature) => creature.id === activeLegacyCreature?.id)
        ?.activeAction,
    ).toEqual(activeLegacyCreature?.activeAction);
    expect(hashSimulationState(first)).toBe(hashSimulationState(second));
    expect(first.scenario).toEqual(createScenarioReference("split-banks", 91));
    expect(first.creatures.every((creature) => creature.needs.thirst === 2_500)).toBe(true);
    expect(first.creatures.every((creature) => creature.inventory.water === 0)).toBe(true);
    expect(first.structures.every((structure) => structure.inventory.water === 0)).toBe(
      true,
    );
    expect(first.resourceNodes.filter((node) => node.kind === "WATER")).toHaveLength(1);
    expect(first.metrics).toMatchObject({
      waterGathered: 0,
      waterDrunk: 0,
      waterShared: 0,
    });
    const hydrationMigration = first.domainEvents.at(-3);
    expect(hydrationMigration).toMatchObject({
      tick: legacyState.tick,
      type: "HYDRATION_RULES_ENABLED",
      resourceKind: "WATER",
      quantity: 1,
    });
    const shelterMigration = first.domainEvents.at(-2);
    expect(shelterMigration).toMatchObject({
      tick: legacyState.tick,
      type: "SHELTER_RULES_ENABLED",
      resourceKind: null,
      quantity: 0,
    });
    expect(
      first.domainEvents
        .slice(0, -3)
        .every(
          (event) =>
            event.resourceKind !== "WATER" &&
            !event.type.includes("WATER") &&
            !event.type.includes("THIRST"),
        ),
    ).toBe(true);
  });

  it("migrates Phase 3 replays by preserving commands and clearing parity claims", () => {
    const scenario = {
      ...createScenarioReference("unequal-table", 73),
      behaviorVersion: 3,
      scenarioVersion: 1,
    };
    const legacy = {
      kind: "tiny-civilisation/replay",
      schemaVersion: 2,
      behaviorVersion: 3,
      stateSchemaVersion: 3,
      scenario,
      seed: 73,
      commands: [
        {
          commandId: 1,
          applyAtTick: 4,
          type: "ADD_FOOD",
          tileIndex: 340,
          amount: 2,
          blocked: null,
        },
      ],
      finalTick: 20,
      finalHash: "0123456789abcdef",
    };
    const migrated = migrateSimulationReplay(legacy);
    expect(migrated.scenario).toEqual(createScenarioReference("unequal-table", 73));
    expect(migrated.commands).toEqual(legacy.commands);
    expect(migrated.finalTick).toBe(20);
    expect(migrated.finalHash).toBeUndefined();
  });
});
