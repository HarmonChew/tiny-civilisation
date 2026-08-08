import { describe, expect, it } from "vitest";
import { createSimulation } from "../src/creation.js";
import { hashSimulationState } from "../src/state-hash.js";
import { assertCompatibleSimulationState } from "../src/state-validation.js";
import { advanceSimulation } from "../src/tick.js";
import type { SimulationState, WorldState } from "../src/types.js";
import {
  PETRI_CREATURE_PROTOTYPES,
  PETRI_RESOURCE_PROTOTYPES,
  createPetriWorld,
  populateInitialWorld,
  populateWorld,
} from "../src/world.js";
import {
  SCENARIO_CATALOG,
  SCENARIO_CANONICAL_SEEDS,
  SCENARIO_IDS,
  SCENARIO_PR_SMOKE_SEEDS,
  assertScenarioReference,
  cloneScenarioReference,
  compileScenario,
  createScenarioReference,
  hashCompiledScenario,
  sameScenarioReference,
  scenarioCatalogProjection,
  scenarioValidationErrors,
} from "../src/scenarios/index.js";

const EXPECTED_MAP_HASHES = {
  "petri-world": "d6c6639633238a1e",
  "split-banks": "15e9997e7c266d0a",
  "scattered-plenty": "8176efc0f41f2c1b",
  "unequal-table": "9b2e6824c0b608e4",
} as const;

const HISTORICAL_V4_CANONICAL_STATE_HASHES = {
  "petri-world": { tick0: "871cc930ea04d4ab", tick2000: "6679af5deb9edd92" },
  "split-banks": { tick0: "3516765c3026bd7c", tick2000: "881fd2b2153f9e0a" },
  "scattered-plenty": {
    tick0: "24425d9bc3f7e32c",
    tick2000: "9f078c57d55ced42",
  },
  "unequal-table": { tick0: "ab1614171e7e0400", tick2000: "41308c6a4f4ba239" },
} as const;

const EXPECTED_CANONICAL_STATE_HASHES = {
  "petri-world": { tick0: "e50a32ae9ecb1d9e", tick2000: "82222fd2343d1e53" },
  "split-banks": { tick0: "6647a04748bacca8", tick2000: "86b87cb4061a3e33" },
  "scattered-plenty": {
    tick0: "5bd7ab1ad7b02dd5",
    tick2000: "0b53cd51ed7f2df3",
  },
  "unequal-table": { tick0: "48584c454e8d58d5", tick2000: "06191fafb6131d6f" },
} as const;

function populationHarness(world: WorldState, seed = 4_182): SimulationState {
  return {
    seed,
    randomState: (seed ^ 0xa5a5a5a5) >>> 0,
    world,
    nextEntityId: 1,
    creatures: [],
    resourceNodes: [],
  } as unknown as SimulationState;
}

function traitSignature(creature: (typeof PETRI_CREATURE_PROTOTYPES)[number]): string {
  return JSON.stringify({
    name: creature.name,
    color: creature.color,
    hunger: creature.hunger,
    generosity: creature.generosity,
    aggression: creature.aggression,
    sociability: creature.sociability,
    loyalty: creature.loyalty,
    foraging: creature.foraging,
    combat: creature.combat,
  });
}

describe("scenario references and catalog", () => {
  it("publishes four immutable, versioned scenario descriptions", () => {
    expect(SCENARIO_CATALOG.map((scenario) => scenario.scenarioId)).toEqual(SCENARIO_IDS);
    expect(scenarioCatalogProjection()).toEqual(SCENARIO_CATALOG);
    expect(Object.isFrozen(SCENARIO_CATALOG)).toBe(true);
    for (const scenario of SCENARIO_CATALOG) {
      expect(Object.isFrozen(scenario)).toBe(true);
      expect(Object.isFrozen(scenario.startingFacts)).toBe(true);
      expect(Object.isFrozen(scenario.observableTensions)).toBe(true);
      expect(scenario.startingFacts.length).toBeGreaterThanOrEqual(2);
      expect(scenario.startingFacts.length).toBeLessThanOrEqual(4);
      expect(scenario.dramaticQuestion.endsWith("?")).toBe(true);
    }
  });

  it("creates, clones, compares, and strictly validates full references", () => {
    const legacyCompatible = createScenarioReference(4_182);
    const explicit = createScenarioReference("petri-world", 4_182);
    const split = createScenarioReference("split-banks", 4_182);

    expect(legacyCompatible).toEqual(explicit);
    expect(sameScenarioReference(legacyCompatible, explicit)).toBe(true);
    expect(sameScenarioReference(explicit, split)).toBe(false);
    expect(cloneScenarioReference(split)).toEqual(split);
    expect(Object.isFrozen(explicit)).toBe(true);
    expect(() => assertScenarioReference({ ...explicit, unexpected: true })).toThrow(
      "unsupported field unexpected",
    );
    expect(() => createScenarioReference("split-banks", -1)).toThrow(
      "unsigned 32-bit integer",
    );
    expect(() => assertScenarioReference({ ...split, mapGenerationVersion: 999 })).toThrow(
      "map-generation version 999",
    );
  });
});

describe("deterministic scenario compilation", () => {
  it("compiles every catalog entry with locked structural hashes", () => {
    const hashes = new Set<string>();
    for (const scenarioId of SCENARIO_IDS) {
      const first = compileScenario(createScenarioReference(scenarioId, 4_182));
      const repeated = compileScenario(createScenarioReference(scenarioId, 4_182));
      const otherSeed = compileScenario(createScenarioReference(scenarioId, 921));

      expect(first.compiledMapHash).toBe(EXPECTED_MAP_HASHES[scenarioId]);
      expect(repeated.compiledMapHash).toBe(first.compiledMapHash);
      expect(otherSeed.compiledMapHash).toBe(first.compiledMapHash);
      expect(repeated.world).toEqual(first.world);
      expect(first.world).not.toBe(repeated.world);
      expect(first.world).toMatchObject({ width: 48, height: 32 });
      expect(first.world.tiles).toHaveLength(48 * 32);
      expect(first.creatures).toHaveLength(8);
      expect(first.regions.every((region) => region.tileIndices.length > 0)).toBe(true);
      expect(scenarioValidationErrors(first)).toEqual([]);
      hashes.add(first.compiledMapHash);
    }
    expect(hashes.size).toBe(SCENARIO_IDS.length);
  });

  it("preserves the reference terrain, population order, resources, and RNG stream", () => {
    const compiled = compileScenario(createScenarioReference("petri-world", 4_182));
    expect(compiled.world).toEqual(createPetriWorld());
    expect(compiled.creatures).toEqual(PETRI_CREATURE_PROTOTYPES);
    expect(compiled.resourceNodes).toEqual(PETRI_RESOURCE_PROTOTYPES);

    const established = populationHarness(createPetriWorld());
    const extracted = populationHarness(compiled.world);
    populateInitialWorld(established);
    populateWorld(extracted, compiled);

    expect(extracted.randomState).toBe(3_228_164_019);
    expect(extracted.randomState).toBe(established.randomState);
    expect(extracted.nextEntityId).toBe(13);
    expect(extracted.creatures).toEqual(established.creatures);
    expect(extracted.resourceNodes).toEqual(established.resourceNodes);
    expect(extracted.creatures.map((creature) => creature.name)).toEqual([
      "Iri",
      "Nalo",
      "Ves",
      "Aro",
      "Meka",
      "Sori",
      "Pela",
      "Taro",
    ]);
  });

  it("changes structural inputs while retaining the declared trait multiset", () => {
    const scenarios = SCENARIO_IDS.map((scenarioId) =>
      compileScenario(createScenarioReference(scenarioId, 17)),
    );
    const referenceTraits = scenarios[0]!.creatures.map(traitSignature).sort();
    for (const scenario of scenarios.slice(1)) {
      expect(scenario.creatures.map(traitSignature).sort()).toEqual(referenceTraits);
    }

    const petri = scenarios[0]!;
    const split = scenarios[1]!;
    const plentiful = scenarios[2]!;
    const unequal = scenarios[3]!;
    const foodStock = (scenario: typeof petri) =>
      scenario.resourceNodes.reduce(
        (total, resource) => total + (resource.kind === "FOOD" ? resource.currentStock : 0),
        0,
      );
    const foodCapacity = (scenario: typeof petri) =>
      scenario.resourceNodes.reduce(
        (total, resource) => total + (resource.kind === "FOOD" ? resource.maximumStock : 0),
        0,
      );

    expect(foodStock(split)).toBe(foodStock(petri));
    expect(foodCapacity(split)).toBe(foodCapacity(petri));
    expect(foodStock(plentiful)).toBeGreaterThan(foodStock(petri));
    expect(split.creatures.filter((creature) => creature.x < 24)).toHaveLength(4);
    expect(split.creatures.filter((creature) => creature.x > 24)).toHaveLength(4);
    expect(unequal.world).toEqual(petri.world);
    expect(unequal.resourceNodes.filter((resource) => resource.kind !== "WATER")).toEqual(
      petri.resourceNodes.filter((resource) => resource.kind !== "WATER"),
    );
    expect(unequal.creatures.map((creature) => [creature.x, creature.y])).not.toEqual(
      petri.creatures.map((creature) => [creature.x, creature.y]),
    );
  });

  it("locks Phase 4 water placement and scenario-specific initial thirst", () => {
    const expected = {
      "petri-world": {
        sources: [[34, 20, 24, 40, 180]],
        thirst: () => 2_500,
      },
      "split-banks": {
        sources: [[22, 16, 18, 30, 240]],
        thirst: () => 3_200,
      },
      "scattered-plenty": {
        sources: [
          [20, 12, 18, 24, 140],
          [27, 12, 18, 24, 140],
          [20, 19, 18, 24, 140],
          [27, 19, 18, 24, 140],
        ],
        thirst: () => 1_800,
      },
      "unequal-table": {
        sources: [
          [34, 18, 16, 28, 220],
          [34, 22, 16, 28, 220],
        ],
        thirst: (x: number) => (x < 24 ? 4_500 : 2_200),
      },
    } as const;

    for (const scenarioId of SCENARIO_IDS) {
      const compiled = compileScenario(createScenarioReference(scenarioId, 17));
      const water = compiled.resourceNodes.filter((resource) => resource.kind === "WATER");
      expect(
        water.map((resource) => [
          resource.x,
          resource.y,
          resource.currentStock,
          resource.maximumStock,
          resource.regenerationEveryTicks,
        ]),
      ).toEqual(expected[scenarioId].sources);
      expect(
        water.every(
          (resource) =>
            compiled.world.tiles[resource.y * compiled.world.width + resource.x]
              ?.terrain === "SHALLOW_WATER",
        ),
      ).toBe(true);
      expect(compiled.creatures.map((creature) => creature.thirst)).toEqual(
        compiled.creatures.map((creature) => expected[scenarioId].thirst(creature.x)),
      );

      const state = createSimulation(createScenarioReference(scenarioId, 17));
      expect(
        state.creatures.every((creature, index) => {
          const baseline = compiled.creatures[index]!.thirst;
          return (
            creature.needs.thirst >= baseline - 700 &&
            creature.needs.thirst <= baseline + 700
          );
        }),
      ).toBe(true);
    }
  });

  it("hashes compiled structure rather than the mutable object identity", () => {
    const compiled = compileScenario(createScenarioReference("split-banks", 7_319));
    expect(hashCompiledScenario(compiled)).toBe(compiled.compiledMapHash);
    const changed = {
      ...compiled,
      world: {
        ...compiled.world,
        tiles: compiled.world.tiles.map((tile, index) =>
          index === compiled.interventionDefaults.obstacleTileIndex
            ? { ...tile, walkCost: tile.walkCost + 1 }
            : { ...tile },
        ),
      },
    };
    expect(hashCompiledScenario(changed)).not.toBe(compiled.compiledMapHash);
  });

  it("installs and advances every compiled scenario through the common simulation", () => {
    for (const scenarioId of SCENARIO_IDS) {
      const reference = createScenarioReference(scenarioId, 17);
      const state = createSimulation(reference);
      expect(state.scenario).toEqual(reference);
      expect(state.compiledMapHash).toBe(EXPECTED_MAP_HASHES[scenarioId]);
      expect(state.creatures.map((creature) => creature.id)).toEqual([
        1, 2, 3, 4, 5, 6, 7, 8,
      ]);
      expect(state.resourceNodes.map((resource) => resource.id)).toEqual(
        Array.from(
          { length: state.resourceNodes.length },
          (_, index) => state.creatures.length + index + 1,
        ),
      );

      advanceSimulation(state, 400);
      expect(state.metrics.invalidPathFailures).toBe(0);
      expect(() => assertCompatibleSimulationState(state)).not.toThrow();
    }
  });

  it("locks each canonical story seed at its initial and 2,000-tick states", () => {
    expect(EXPECTED_CANONICAL_STATE_HASHES).not.toEqual(
      HISTORICAL_V4_CANONICAL_STATE_HASHES,
    );
    const observed: Record<
      (typeof SCENARIO_IDS)[number],
      { tick0: string; tick2000: string }
    > = {} as Record<(typeof SCENARIO_IDS)[number], { tick0: string; tick2000: string }>;
    for (const scenarioId of SCENARIO_IDS) {
      const state = createSimulation(
        createScenarioReference(scenarioId, SCENARIO_CANONICAL_SEEDS[scenarioId]),
      );
      const tick0 = hashSimulationState(state);
      advanceSimulation(state, 2_000);
      observed[scenarioId] = { tick0, tick2000: hashSimulationState(state) };
    }
    expect(observed).toEqual(EXPECTED_CANONICAL_STATE_HASHES);
  });

  it("repeats the locked portable scenario matrix without long-run drift", () => {
    const runMatrix = () =>
      SCENARIO_IDS.flatMap((scenarioId) =>
        SCENARIO_PR_SMOKE_SEEDS.map((seed) => {
          const state = createSimulation(createScenarioReference(scenarioId, seed));
          advanceSimulation(state, 2_000);
          expect(state.metrics.invalidPathFailures).toBe(0);
          expect(() => assertCompatibleSimulationState(state)).not.toThrow();
          return {
            scenarioId,
            seed,
            hash: hashSimulationState(state),
          };
        }),
      );

    const first = runMatrix();
    const repeated = runMatrix();
    expect(repeated).toEqual(first);
  }, 30_000);
});

describe("scenario structural validation", () => {
  it("detects overlapping starts and inaccessible interaction footprints", () => {
    const compiled = compileScenario(createScenarioReference("petri-world", 4_182));
    const first = compiled.creatures[0]!;
    const overlapping = compiled.creatures.map((creature, index) =>
      index === 1 ? { ...creature, x: first.x, y: first.y } : creature,
    );
    expect(scenarioValidationErrors({ ...compiled, creatures: overlapping })).toContain(
      `Scenario creature ${compiled.creatures[1]!.name} overlaps another creature at ${first.x.toString()},${first.y.toString()}.`,
    );

    const resource = compiled.resourceNodes.find((candidate) => candidate.kind === "FOOD")!;
    const blockedWorld = JSON.parse(JSON.stringify(compiled.world)) as WorldState;
    for (let y = resource.y - 1; y <= resource.y + 1; y += 1) {
      for (let x = resource.x - 1; x <= resource.x + 1; x += 1) {
        if (x === resource.x && y === resource.y) continue;
        const tile = blockedWorld.tiles[y * blockedWorld.width + x];
        if (!tile) continue;
        tile.blocked = true;
        tile.terrain = "ROCK";
      }
    }
    expect(
      scenarioValidationErrors({ ...compiled, world: blockedWorld }).some((error) =>
        error.includes("has no legal interaction footprint"),
      ),
    ).toBe(true);
  });

  it("rejects potable water sources that are detached from shallow-water terrain", () => {
    const compiled = compileScenario(createScenarioReference("petri-world", 4_182));
    const resources = compiled.resourceNodes.map((resource) =>
      resource.kind === "WATER" ? { ...resource, x: 33, y: 20 } : resource,
    );
    expect(scenarioValidationErrors({ ...compiled, resourceNodes: resources })).toContain(
      "Scenario water resource 3 must be on shallow-water terrain.",
    );
  });

  it("verifies declared chokepoints against the navigation graph", () => {
    const compiled = compileScenario(createScenarioReference("petri-world", 4_182));
    const chokepoint = compiled.chokepoints[0]!;
    const incomplete = {
      ...chokepoint,
      tileIndices: chokepoint.tileIndices.slice(1),
    };
    expect(scenarioValidationErrors({ ...compiled, chokepoints: [incomplete] })).toContain(
      "Scenario chokepoint central-passage does not separate its regions.",
    );
  });
});
