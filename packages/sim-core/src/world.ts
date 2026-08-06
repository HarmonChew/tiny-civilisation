import { keyedRandomUnit, randomRange } from "./rng.js";
import { tileIndexAt } from "./pathfinding.js";
import {
  TILE_FIXED_UNITS,
  type ActionKind,
  type CreatureState,
  type ResourceKind,
  type SimulationState,
  type TileState,
  type WorldState,
} from "./types.js";

export const SCENARIO_WORLD_WIDTH = 48;
export const SCENARIO_WORLD_HEIGHT = 32;

export interface WorldTileTemplate {
  readonly terrain: TileState["terrain"];
  readonly walkCost: number;
  readonly blocked: boolean;
}

export type WorldTileResolver = (x: number, y: number) => WorldTileTemplate;

function clampUnit(value: number): number {
  return Math.max(0, Math.min(10_000, Math.round(value)));
}

export function createEmptyActionCounts(): Record<ActionKind, number> {
  return {
    EXPLORE: 0,
    GATHER_FOOD: 0,
    GATHER_MATERIAL: 0,
    GATHER_WATER: 0,
    EAT: 0,
    DRINK: 0,
    REST: 0,
    ESTABLISH_SHELTER_SITE: 0,
    BUILD_SHELTER: 0,
    REST_SHELTERED: 0,
    MAINTAIN_SHELTER: 0,
    SHARE: 0,
    SHARE_WATER: 0,
    KEEP: 0,
    STEAL: 0,
    DEPOSIT: 0,
    WITHDRAW: 0,
    BUILD_STORAGE: 0,
    GUARD: 0,
    ATTACK: 0,
    FLEE: 0,
    JOIN_GROUP: 0,
  };
}

export function createWorldFromTileResolver(
  width: number,
  height: number,
  resolveTile: WorldTileResolver,
): WorldState {
  const tiles: TileState[] = [];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      const tile = resolveTile(x, y);
      tiles.push({
        index,
        x,
        y,
        terrain: tile.terrain,
        walkCost: tile.walkCost,
        blocked: tile.blocked,
        navigationRevision: 0,
      });
    }
  }
  return {
    width,
    height,
    tiles,
    navigationRevision: 0,
  };
}

export function petriWorldTileAt(x: number, y: number): WorldTileTemplate {
  const border =
    x === 0 || y === 0 || x === SCENARIO_WORLD_WIDTH - 1 || y === SCENARIO_WORLD_HEIGHT - 1;
  const centralBarrier = x === 24 && (y < 14 || y > 17);
  const westRock = (x === 4 && y >= 4 && y <= 8) || (y === 20 && x >= 3 && x <= 8);
  const eastRock = (x === 41 && y >= 8 && y <= 13) || (y === 27 && x >= 33 && x <= 39);
  const shallowWater =
    !border &&
    !centralBarrier &&
    ((x >= 30 && x <= 34 && y === 18) || (x === 34 && y >= 19 && y <= 23));
  const blocked = border || centralBarrier || westRock || eastRock;
  return {
    terrain: blocked ? "ROCK" : shallowWater ? "SHALLOW_WATER" : "GROUND",
    walkCost: shallowWater ? 18 : 10,
    blocked,
  };
}

export function createPetriWorld(): WorldState {
  return createWorldFromTileResolver(
    SCENARIO_WORLD_WIDTH,
    SCENARIO_WORLD_HEIGHT,
    petriWorldTileAt,
  );
}

export interface CreaturePrototype {
  readonly name: string;
  readonly color: number;
  readonly x: number;
  readonly y: number;
  readonly hunger: number;
  readonly thirst: number;
  readonly generosity: number;
  readonly aggression: number;
  readonly sociability: number;
  readonly loyalty: number;
  readonly foraging: number;
  readonly combat: number;
}

export const PETRI_CREATURE_PROTOTYPES: readonly CreaturePrototype[] = [
  {
    name: "Iri",
    color: 0x7dd3fc,
    x: 9,
    y: 9,
    hunger: 4_100,
    thirst: 2_500,
    generosity: 8_000,
    aggression: 1_800,
    sociability: 7_700,
    loyalty: 7_200,
    foraging: 6_200,
    combat: 2_300,
  },
  {
    name: "Nalo",
    color: 0xfde68a,
    x: 11,
    y: 9,
    hunger: 6_800,
    thirst: 2_500,
    generosity: 6_900,
    aggression: 3_300,
    sociability: 8_200,
    loyalty: 6_700,
    foraging: 4_800,
    combat: 4_300,
  },
  {
    name: "Ves",
    color: 0xc4b5fd,
    x: 8,
    y: 11,
    hunger: 3_700,
    thirst: 2_500,
    generosity: 6_100,
    aggression: 2_600,
    sociability: 7_100,
    loyalty: 8_100,
    foraging: 7_500,
    combat: 3_200,
  },
  {
    name: "Aro",
    color: 0x86efac,
    x: 12,
    y: 11,
    hunger: 5_500,
    thirst: 2_500,
    generosity: 5_700,
    aggression: 4_600,
    sociability: 7_500,
    loyalty: 7_600,
    foraging: 5_200,
    combat: 5_800,
  },
  {
    name: "Meka",
    color: 0xf9a8d4,
    x: 9,
    y: 13,
    hunger: 4_600,
    thirst: 2_500,
    generosity: 7_400,
    aggression: 2_200,
    sociability: 6_600,
    loyalty: 7_900,
    foraging: 5_900,
    combat: 2_800,
  },
  {
    name: "Sori",
    color: 0xfdba74,
    x: 13,
    y: 13,
    hunger: 5_000,
    thirst: 2_500,
    generosity: 4_900,
    aggression: 5_000,
    sociability: 6_100,
    loyalty: 7_300,
    foraging: 4_100,
    combat: 6_600,
  },
  {
    name: "Pela",
    color: 0xa7f3d0,
    x: 7,
    y: 13,
    hunger: 6_200,
    thirst: 2_500,
    generosity: 6_500,
    aggression: 2_900,
    sociability: 7_900,
    loyalty: 6_900,
    foraging: 6_700,
    combat: 3_700,
  },
  {
    name: "Taro",
    color: 0xfca5a5,
    x: 14,
    y: 10,
    hunger: 7_100,
    thirst: 2_500,
    generosity: 1_900,
    aggression: 6_000,
    sociability: 3_000,
    loyalty: 1_700,
    foraging: 3_500,
    combat: 7_400,
  },
] as const;

export interface ResourceNodePrototype {
  readonly kind: ResourceKind;
  readonly x: number;
  readonly y: number;
  readonly currentStock: number;
  readonly maximumStock: number;
  readonly regenerationEveryTicks: number;
  readonly regenerationAmount: number;
}

export const PETRI_RESOURCE_PROTOTYPES: readonly ResourceNodePrototype[] = [
  {
    kind: "FOOD",
    x: 10,
    y: 7,
    currentStock: 34,
    maximumStock: 40,
    regenerationEveryTicks: 34,
    regenerationAmount: 1,
  },
  {
    kind: "FOOD",
    x: 37,
    y: 22,
    currentStock: 95,
    maximumStock: 110,
    regenerationEveryTicks: 20,
    regenerationAmount: 2,
  },
  {
    kind: "MATERIAL",
    x: 18,
    y: 15,
    currentStock: 80,
    maximumStock: 80,
    regenerationEveryTicks: 80,
    regenerationAmount: 1,
  },
  {
    kind: "WATER",
    x: 34,
    y: 20,
    currentStock: 24,
    maximumStock: 40,
    regenerationEveryTicks: 180,
    regenerationAmount: 1,
  },
] as const;

export interface InitialWorldPopulation {
  readonly creatures: readonly CreaturePrototype[];
  readonly resourceNodes: readonly ResourceNodePrototype[];
}

function createCreature(
  state: Pick<SimulationState, "randomState" | "seed">,
  world: WorldState,
  id: number,
  prototype: CreaturePrototype,
): CreatureState {
  const ordinaryJitter = (): number => randomRange(state, -700, 700);
  const traitJitter = (channel: string, ordinarySpan: number, taroSpan: number): number => {
    const sequential = randomRange(
      state,
      -(prototype.name === "Taro" ? taroSpan : ordinarySpan),
      prototype.name === "Taro" ? taroSpan : ordinarySpan,
    );
    if (prototype.name !== "Taro") {
      return sequential;
    }
    const keyedChannel =
      channel === "aggression"
        ? "aggression-axis"
        : channel === "sociability"
          ? "creature-sociability"
          : `creature-${channel}`;
    const normalized = keyedRandomUnit(state.seed, keyedChannel, 0, id);
    return Math.floor((normalized * (taroSpan * 2 + 1)) / 10_001) - taroSpan;
  };
  const tileIndex = tileIndexAt(world, prototype.x, prototype.y);
  const thirstRandom = keyedRandomUnit(state.seed, "creature-thirst", 0, id);
  const thirstJitter = Math.floor((thirstRandom * 1_401) / 10_001) - 700;
  return {
    id,
    name: prototype.name,
    color: prototype.color,
    alive: true,
    tileIndex,
    x: prototype.x * TILE_FIXED_UNITS + TILE_FIXED_UNITS / 2,
    y: prototype.y * TILE_FIXED_UNITS + TILE_FIXED_UNITS / 2,
    health: 10_000,
    needs: {
      hunger: clampUnit(prototype.hunger + ordinaryJitter()),
      fatigue: clampUnit(800 + randomRange(state, 0, 900)),
      thirst: clampUnit(prototype.thirst + thirstJitter),
    },
    traits: {
      generosity: clampUnit(prototype.generosity + traitJitter("generosity", 700, 700)),
      aggression: clampUnit(prototype.aggression + traitJitter("aggression", 700, 3_000)),
      sociability: clampUnit(
        prototype.sociability + traitJitter("sociability", 700, 1_800),
      ),
      loyalty: clampUnit(prototype.loyalty + traitJitter("loyalty", 700, 1_000)),
    },
    skills: {
      foraging: clampUnit(prototype.foraging + ordinaryJitter()),
      combat: clampUnit(prototype.combat + ordinaryJitter()),
    },
    inventory: {
      capacity: 6,
      food: 0,
      material: 0,
      water: 0,
    },
    groupId: null,
    role: prototype.name === "Taro" ? "DRIFTER" : "FORAGER",
    activeDesire: null,
    activePlan: null,
    activeGoal: null,
    activeAction: null,
    nextDecisionTick: id % 4,
    lastActionKind: null,
    lastActionTick: -1,
    actionCounts: createEmptyActionCounts(),
    memoryIds: [],
    intentHistory: [],
    recentRoute: [
      {
        tick: 0,
        tileIndex,
        x: prototype.x * TILE_FIXED_UNITS + TILE_FIXED_UNITS / 2,
        y: prototype.y * TILE_FIXED_UNITS + TILE_FIXED_UNITS / 2,
      },
    ],
  };
}

export function populateWorld(
  state: SimulationState,
  population: InitialWorldPopulation,
): void {
  for (const prototype of population.creatures) {
    const creature = createCreature(state, state.world, state.nextEntityId, prototype);
    state.nextEntityId += 1;
    state.creatures.push(creature);
  }

  for (const prototype of population.resourceNodes) {
    state.resourceNodes.push({
      id: state.nextEntityId++,
      kind: prototype.kind,
      tileIndex: tileIndexAt(state.world, prototype.x, prototype.y),
      currentStock: prototype.currentStock,
      maximumStock: prototype.maximumStock,
      regenerationEveryTicks: prototype.regenerationEveryTicks,
      regenerationAmount: prototype.regenerationAmount,
    });
  }
}

export function populateInitialWorld(state: SimulationState): void {
  populateWorld(state, {
    creatures: PETRI_CREATURE_PROTOTYPES,
    resourceNodes: PETRI_RESOURCE_PROTOTYPES,
  });
}
