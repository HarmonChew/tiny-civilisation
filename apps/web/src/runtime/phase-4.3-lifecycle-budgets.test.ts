import {
  MAX_LIVING_POPULATION,
  assertCompatibleSimulationState,
  createScenarioReference,
  createSimulation,
  createSimulationReplay,
  deserializeSimulationReplay,
  deserializeSimulationSave,
  executeSimulationReplay,
  finalizeLifecycleDeaths,
  hashSimulationState,
  processPregnanciesAndBirths,
  queryLifeRecords,
  serializeSimulationReplay,
  serializeSimulationSave,
  transitionToDead,
  updateLifecycleGroupExtinction,
  type SimulationState,
} from "@tiny-civ/sim-core";
import { describe, expect, it } from "vitest";

import { CoreSimulationRuntime } from "./core-simulation-runtime";

const BOOTSTRAP_BUDGET_BYTES = 128 * 1_024;
const HOT_FRAME_BUDGET_BYTES = 65_536;
const SAVE_BUDGET_BYTES = 2_500_000;

function jsonBytes(value: unknown): number {
  return new TextEncoder().encode(typeof value === "string" ? value : JSON.stringify(value))
    .byteLength;
}

function bootstrapSizeDiagnostic(
  bootstrap: ReturnType<CoreSimulationRuntime["getFrame"]>,
): string {
  const { snapshot } = bootstrap;
  return JSON.stringify({
    total: jsonBytes(bootstrap),
    snapshot: jsonBytes(snapshot),
    scenario: jsonBytes(snapshot.scenario),
    tiles: jsonBytes(snapshot.tiles),
    creatures: jsonBytes(snapshot.creatures),
    resourceNodes: jsonBytes(snapshot.resourceNodes),
    structures: jsonBytes(snapshot.structures),
    memorials: jsonBytes(snapshot.memorials),
    groups: jsonBytes(snapshot.groups),
    recentEvents: jsonBytes(snapshot.recentEvents),
    historyEvents: jsonBytes(snapshot.historyEvents),
    metrics: jsonBytes(snapshot.metrics),
  });
}

function forcedLivingCapState(): SimulationState {
  const state = createSimulation(createScenarioReference("petri-world", 8_101));
  const mother = state.creatures.find((creature) => creature.sex === "FEMALE");
  const father = state.creatures.find((creature) => creature.sex === "MALE");
  if (!mother || !father) throw new Error("Forced-cap fixture requires two parents.");
  while (
    state.creatures.filter((creature) => creature.alive).length < MAX_LIVING_POPULATION
  ) {
    const before = state.creatures.length;
    mother.pregnancy = {
      fatherId: father.id,
      conceivedTick: state.tick - 1_000,
      dueTick: state.tick,
    };
    processPregnanciesAndBirths(state);
    if (state.creatures.length !== before + 1) {
      throw new Error("Forced-cap fixture did not create exactly one child.");
    }
  }
  assertCompatibleSimulationState(state);
  return state;
}

function forcedZeroLivingState(): SimulationState {
  const state = createSimulation(createScenarioReference("petri-world", 8_102));
  for (const creature of [...state.creatures]) {
    if (!transitionToDead(state, creature, "OLD_AGE")) {
      throw new Error(`Forced-extinction fixture could not record ${creature.id}.`);
    }
  }
  updateLifecycleGroupExtinction(state);
  finalizeLifecycleDeaths(state);
  assertCompatibleSimulationState(state);
  return state;
}

describe("Phase 4.3 forced lifecycle release budgets", () => {
  it.each([
    ["24 living", forcedLivingCapState, 24, 0],
    ["zero living", forcedZeroLivingState, 0, 8],
  ] as const)(
    "keeps %s bootstrap, hot frame, save, and life-record query within the release contract",
    (_label, fixture, expectedLiving, expectedRecords) => {
      const state = fixture();
      const serialized = serializeSimulationSave(state);
      expect(jsonBytes(serialized)).toBeLessThanOrEqual(SAVE_BUDGET_BYTES);
      expect(hashSimulationState(deserializeSimulationSave(serialized))).toBe(
        hashSimulationState(state),
      );

      const runtime = new CoreSimulationRuntime({ yieldControl: () => Promise.resolve() });
      const bootstrap = runtime.load(serialized);
      expect(
        jsonBytes(bootstrap),
        `bootstrap size breakdown: ${bootstrapSizeDiagnostic(bootstrap)}`,
      ).toBeLessThanOrEqual(BOOTSTRAP_BUDGET_BYTES);
      expect(
        bootstrap.snapshot.creatures.filter((creature) => creature.alive),
      ).toHaveLength(expectedLiving);

      const hotFrame = runtime.getFrame();
      expect(jsonBytes(hotFrame)).toBeLessThanOrEqual(HOT_FRAME_BUDGET_BYTES);
      expect(hotFrame.snapshot.tiles).toEqual([]);
      expect(hotFrame.snapshot.scenario.landmarks).toEqual([]);

      const page = runtime.getLifeRecords({ limit: 100 });
      expect(page.records).toHaveLength(expectedRecords);
      expect(page).toEqual(queryLifeRecords(state, { limit: 100 }));
      expect(hashSimulationState(deserializeSimulationSave(runtime.save()))).toBe(
        hashSimulationState(state),
      );
      runtime.dispose();
    },
  );

  it("keeps a replay result navigable and its retained records queryable", async () => {
    const scenario = createScenarioReference("petri-world", 8_103);
    const expected = executeSimulationReplay(createSimulationReplay(scenario, []), {
      finalTick: 2_000,
    });
    const replay = createSimulationReplay(scenario, [], {
      finalTick: expected.finalTick,
      finalHash: expected.finalHash,
    });
    const serializedReplay = serializeSimulationReplay(replay);
    const runtime = new CoreSimulationRuntime({ yieldControl: () => Promise.resolve() });
    const result = await runtime.replay(deserializeSimulationReplay(serializedReplay), {
      chunkSize: 500,
    });

    expect(result.hashMatches).toBe(true);
    expect(result.frame.tick).toBe(2_000);
    expect(result.frame.snapshot.scenario.reference.scenarioId).toBe("petri-world");
    expect(runtime.getLifeRecords({ limit: 100 })).toEqual(
      queryLifeRecords(expected.state, { limit: 100 }),
    );
    expect(
      jsonBytes(result.frame),
      `replay bootstrap size breakdown: ${bootstrapSizeDiagnostic(result.frame)}`,
    ).toBeLessThanOrEqual(BOOTSTRAP_BUDGET_BYTES);
    runtime.dispose();
  });
});
