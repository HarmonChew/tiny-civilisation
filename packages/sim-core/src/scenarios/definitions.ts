import {
  PETRI_CREATURE_PROTOTYPES,
  PETRI_RESOURCE_PROTOTYPES,
  SCENARIO_WORLD_HEIGHT,
  SCENARIO_WORLD_WIDTH,
  petriWorldTileAt,
  type CreaturePrototype,
  type ResourceNodePrototype,
  type WorldTileResolver,
  type WorldTileTemplate,
} from "../world.js";
import { getScenarioMetadata } from "./catalog.js";
import type { ScenarioId, ScenarioMetadata } from "./types.js";

export interface ScenarioCoordinate {
  readonly x: number;
  readonly y: number;
}

export interface ScenarioRegionDefinition {
  readonly id: string;
  readonly label: string;
  readonly contains: (x: number, y: number) => boolean;
}

export interface ScenarioChokepointDefinition {
  readonly id: string;
  readonly label: string;
  readonly tiles: readonly ScenarioCoordinate[];
  readonly connects: readonly [string, string];
}

export interface ScenarioDefinition {
  readonly metadata: ScenarioMetadata;
  readonly width: typeof SCENARIO_WORLD_WIDTH;
  readonly height: typeof SCENARIO_WORLD_HEIGHT;
  readonly resolveTile: WorldTileResolver;
  readonly creatures: readonly CreaturePrototype[];
  readonly resourceNodes: readonly ResourceNodePrototype[];
  readonly regions: readonly ScenarioRegionDefinition[];
  readonly chokepoints: readonly ScenarioChokepointDefinition[];
  readonly interventionDefaults: {
    readonly food: ScenarioCoordinate;
    readonly obstacle: ScenarioCoordinate;
  };
}

function frozenCoordinates(
  coordinates: readonly ScenarioCoordinate[],
): readonly ScenarioCoordinate[] {
  return Object.freeze(coordinates.map((coordinate) => Object.freeze({ ...coordinate })));
}

function frozenCreatures(
  creatures: readonly CreaturePrototype[],
): readonly CreaturePrototype[] {
  return Object.freeze(creatures.map((creature) => Object.freeze({ ...creature })));
}

function frozenResources(
  resources: readonly ResourceNodePrototype[],
): readonly ResourceNodePrototype[] {
  return Object.freeze(resources.map((resource) => Object.freeze({ ...resource })));
}

function regions(): readonly ScenarioRegionDefinition[] {
  return Object.freeze([
    Object.freeze({
      id: "west-bank",
      label: "West bank",
      contains: (x: number) => x > 0 && x < 24,
    }),
    Object.freeze({
      id: "east-bank",
      label: "East bank",
      contains: (x: number) => x > 24 && x < SCENARIO_WORLD_WIDTH - 1,
    }),
  ]);
}

function centralPassage(
  startY: number,
  endY: number,
  xCoordinates: readonly number[] = [24],
): readonly ScenarioChokepointDefinition[] {
  return Object.freeze([
    Object.freeze({
      id: "central-passage",
      label: "Central passage",
      tiles: frozenCoordinates(
        xCoordinates.flatMap((x) =>
          Array.from({ length: endY - startY + 1 }, (_, offset) => ({
            x,
            y: startY + offset,
          })),
        ),
      ),
      connects: Object.freeze(["west-bank", "east-bank"] as const),
    }),
  ]);
}

function atPositions(
  positions: Readonly<Record<string, ScenarioCoordinate>>,
): readonly CreaturePrototype[] {
  return frozenCreatures(
    PETRI_CREATURE_PROTOTYPES.map((creature) => {
      const position = positions[creature.name];
      if (!position) throw new Error(`Missing start position for ${creature.name}.`);
      return { ...creature, ...position };
    }),
  );
}

function splitBanksTileAt(x: number, y: number): WorldTileTemplate {
  const border =
    x === 0 || y === 0 || x === SCENARIO_WORLD_WIDTH - 1 || y === SCENARIO_WORLD_HEIGHT - 1;
  const bankWall = (x === 23 || x === 24) && (y < 15 || y > 16);
  const westRock = (y === 22 && x >= 4 && x <= 9) || (x === 5 && y >= 5 && y <= 8);
  const eastRock = (y === 8 && x >= 37 && x <= 42) || (x === 41 && y >= 23 && y <= 26);
  const shallowWater =
    !border &&
    !bankWall &&
    ((x >= 19 && x <= 28 && (y === 13 || y === 18)) ||
      ((x === 22 || x === 25) && y >= 14 && y <= 17));
  const blocked = border || bankWall || westRock || eastRock;
  return {
    terrain: blocked ? "ROCK" : shallowWater ? "SHALLOW_WATER" : "GROUND",
    walkCost: shallowWater ? 18 : 10,
    blocked,
  };
}

function scatteredPlentyTileAt(x: number, y: number): WorldTileTemplate {
  const border =
    x === 0 || y === 0 || x === SCENARIO_WORLD_WIDTH - 1 || y === SCENARIO_WORLD_HEIGHT - 1;
  const rock =
    ((x === 18 || x === 29) && y >= 4 && y <= 8) ||
    ((x === 18 || x === 29) && y >= 23 && y <= 27) ||
    (y === 15 && ((x >= 8 && x <= 12) || (x >= 35 && x <= 39)));
  const shallowWater =
    !border &&
    !rock &&
    ((y === 12 && x >= 20 && x <= 27) || (y === 19 && x >= 20 && x <= 27));
  const blocked = border || rock;
  return {
    terrain: blocked ? "ROCK" : shallowWater ? "SHALLOW_WATER" : "GROUND",
    walkCost: shallowWater ? 18 : 10,
    blocked,
  };
}

function definition(
  scenarioId: ScenarioId,
  values: Omit<ScenarioDefinition, "metadata" | "width" | "height">,
): ScenarioDefinition {
  return Object.freeze({
    metadata: getScenarioMetadata(scenarioId),
    width: SCENARIO_WORLD_WIDTH,
    height: SCENARIO_WORLD_HEIGHT,
    ...values,
    creatures: frozenCreatures(values.creatures),
    resourceNodes: frozenResources(values.resourceNodes),
    regions: Object.freeze([...values.regions]),
    chokepoints: Object.freeze([...values.chokepoints]),
    interventionDefaults: Object.freeze({
      food: Object.freeze({ ...values.interventionDefaults.food }),
      obstacle: Object.freeze({ ...values.interventionDefaults.obstacle }),
    }),
  });
}

const PETRI_POSITIONS = Object.fromEntries(
  PETRI_CREATURE_PROTOTYPES.map((creature) => [
    creature.name,
    { x: creature.x, y: creature.y },
  ]),
) as Readonly<Record<string, ScenarioCoordinate>>;

const PETRI_WORLD = definition("petri-world", {
  resolveTile: petriWorldTileAt,
  creatures: atPositions(PETRI_POSITIONS),
  resourceNodes: PETRI_RESOURCE_PROTOTYPES,
  regions: regions(),
  chokepoints: centralPassage(14, 17),
  interventionDefaults: { food: { x: 10, y: 7 }, obstacle: { x: 24, y: 15 } },
});

const SPLIT_BANKS = definition("split-banks", {
  resolveTile: splitBanksTileAt,
  creatures: atPositions({
    Iri: { x: 8, y: 10 },
    Nalo: { x: 11, y: 10 },
    Ves: { x: 8, y: 13 },
    Aro: { x: 37, y: 18 },
    Meka: { x: 11, y: 13 },
    Sori: { x: 40, y: 18 },
    Pela: { x: 37, y: 21 },
    Taro: { x: 40, y: 21 },
  }),
  resourceNodes: [
    {
      kind: "FOOD",
      x: 10,
      y: 8,
      currentStock: 64,
      maximumStock: 75,
      regenerationEveryTicks: 27,
      regenerationAmount: 1,
    },
    {
      kind: "FOOD",
      x: 38,
      y: 23,
      currentStock: 65,
      maximumStock: 75,
      regenerationEveryTicks: 27,
      regenerationAmount: 1,
    },
    {
      kind: "MATERIAL",
      x: 24,
      y: 15,
      currentStock: 80,
      maximumStock: 80,
      regenerationEveryTicks: 80,
      regenerationAmount: 1,
    },
  ],
  regions: regions(),
  chokepoints: centralPassage(15, 16, [23, 24]),
  interventionDefaults: { food: { x: 10, y: 8 }, obstacle: { x: 23, y: 15 } },
});

const SCATTERED_PLENTY = definition("scattered-plenty", {
  resolveTile: scatteredPlentyTileAt,
  creatures: atPositions({
    Iri: { x: 7, y: 7 },
    Nalo: { x: 10, y: 7 },
    Ves: { x: 37, y: 7 },
    Aro: { x: 40, y: 7 },
    Meka: { x: 7, y: 24 },
    Sori: { x: 10, y: 24 },
    Pela: { x: 37, y: 24 },
    Taro: { x: 40, y: 24 },
  }),
  resourceNodes: [
    {
      kind: "FOOD",
      x: 8,
      y: 10,
      currentStock: 70,
      maximumStock: 80,
      regenerationEveryTicks: 18,
      regenerationAmount: 2,
    },
    {
      kind: "FOOD",
      x: 39,
      y: 10,
      currentStock: 70,
      maximumStock: 80,
      regenerationEveryTicks: 18,
      regenerationAmount: 2,
    },
    {
      kind: "FOOD",
      x: 8,
      y: 21,
      currentStock: 70,
      maximumStock: 80,
      regenerationEveryTicks: 18,
      regenerationAmount: 2,
    },
    {
      kind: "FOOD",
      x: 39,
      y: 21,
      currentStock: 70,
      maximumStock: 80,
      regenerationEveryTicks: 18,
      regenerationAmount: 2,
    },
    {
      kind: "MATERIAL",
      x: 24,
      y: 16,
      currentStock: 80,
      maximumStock: 80,
      regenerationEveryTicks: 80,
      regenerationAmount: 1,
    },
  ],
  regions: Object.freeze([
    Object.freeze({
      id: "north-west",
      label: "North-west meadow",
      contains: (x: number, y: number) => x > 0 && x < 24 && y > 0 && y < 16,
    }),
    Object.freeze({
      id: "north-east",
      label: "North-east meadow",
      contains: (x: number, y: number) =>
        x >= 24 && x < SCENARIO_WORLD_WIDTH - 1 && y > 0 && y < 16,
    }),
    Object.freeze({
      id: "south-west",
      label: "South-west meadow",
      contains: (x: number, y: number) =>
        x > 0 && x < 24 && y >= 16 && y < SCENARIO_WORLD_HEIGHT - 1,
    }),
    Object.freeze({
      id: "south-east",
      label: "South-east meadow",
      contains: (x: number, y: number) =>
        x >= 24 && x < SCENARIO_WORLD_WIDTH - 1 && y >= 16 && y < SCENARIO_WORLD_HEIGHT - 1,
    }),
  ]),
  chokepoints: Object.freeze([]),
  interventionDefaults: { food: { x: 8, y: 10 }, obstacle: { x: 24, y: 15 } },
});

const UNEQUAL_TABLE = definition("unequal-table", {
  resolveTile: petriWorldTileAt,
  creatures: atPositions({
    Iri: { x: 8, y: 9 },
    Nalo: { x: 11, y: 9 },
    Ves: { x: 8, y: 12 },
    Aro: { x: 37, y: 19 },
    Meka: { x: 11, y: 12 },
    Sori: { x: 39, y: 22 },
    Pela: { x: 10, y: 15 },
    Taro: { x: 36, y: 22 },
  }),
  resourceNodes: PETRI_RESOURCE_PROTOTYPES,
  regions: regions(),
  chokepoints: centralPassage(14, 17),
  interventionDefaults: { food: { x: 10, y: 7 }, obstacle: { x: 24, y: 15 } },
});

const DEFINITIONS = new Map<ScenarioId, ScenarioDefinition>([
  ["petri-world", PETRI_WORLD],
  ["split-banks", SPLIT_BANKS],
  ["scattered-plenty", SCATTERED_PLENTY],
  ["unequal-table", UNEQUAL_TABLE],
]);

export function getScenarioDefinition(scenarioId: ScenarioId): ScenarioDefinition {
  const value = DEFINITIONS.get(scenarioId);
  if (!value) throw new Error(`Unsupported scenario ${scenarioId}.`);
  return value;
}
