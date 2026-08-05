import { tileIndexAt } from "../pathfinding.js";
import type { WorldState } from "../types.js";
import {
  SCENARIO_WORLD_HEIGHT,
  SCENARIO_WORLD_WIDTH,
  type CreaturePrototype,
  type ResourceNodePrototype,
} from "../world.js";
import type { ScenarioMetadata, ScenarioReferenceV2 } from "./types.js";

const INTERACTION_OFFSETS = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
  [1, -1],
  [1, 1],
  [-1, 1],
  [-1, -1],
] as const;

export interface CompiledScenarioRegion {
  readonly id: string;
  readonly label: string;
  readonly tileIndices: readonly number[];
}

export interface CompiledScenarioChokepoint {
  readonly id: string;
  readonly label: string;
  readonly tileIndices: readonly number[];
  readonly connects: readonly [string, string];
}

export interface CompiledScenarioStructure {
  readonly reference: ScenarioReferenceV2;
  readonly metadata: ScenarioMetadata;
  readonly world: WorldState;
  readonly creatures: readonly CreaturePrototype[];
  readonly resourceNodes: readonly ResourceNodePrototype[];
  readonly regions: readonly CompiledScenarioRegion[];
  readonly chokepoints: readonly CompiledScenarioChokepoint[];
  readonly interventionDefaults: {
    readonly foodTileIndex: number;
    readonly waterTileIndex: number;
    readonly obstacleTileIndex: number;
  };
}

function coordinateKey(x: number, y: number): string {
  return `${x.toString()},${y.toString()}`;
}

function validCoordinate(value: number, maximum: number): boolean {
  return Number.isInteger(value) && value >= 0 && value < maximum;
}

function neighbors(world: WorldState, tileIndex: number): number[] {
  const x = tileIndex % world.width;
  const y = Math.floor(tileIndex / world.width);
  return [
    tileIndexAt(world, x, y - 1),
    tileIndexAt(world, x - 1, y),
    tileIndexAt(world, x + 1, y),
    tileIndexAt(world, x, y + 1),
  ].filter((candidate) => candidate >= 0);
}

function reachableTiles(
  world: WorldState,
  starts: readonly number[],
  excluded: ReadonlySet<number> = new Set<number>(),
): Set<number> {
  const reached = new Set<number>();
  const queue: number[] = [];
  for (const start of starts) {
    if (
      excluded.has(start) ||
      world.tiles[start]?.blocked !== false ||
      reached.has(start)
    ) {
      continue;
    }
    reached.add(start);
    queue.push(start);
  }
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const current = queue[cursor];
    if (current === undefined) continue;
    for (const candidate of neighbors(world, current)) {
      if (
        excluded.has(candidate) ||
        reached.has(candidate) ||
        world.tiles[candidate]?.blocked !== false
      ) {
        continue;
      }
      reached.add(candidate);
      queue.push(candidate);
    }
  }
  return reached;
}

function interactionFootprint(world: WorldState, x: number, y: number): number[] {
  return INTERACTION_OFFSETS.map(([offsetX, offsetY]) =>
    tileIndexAt(world, x + offsetX, y + offsetY),
  ).filter(
    (tileIndex, index, values) =>
      tileIndex >= 0 &&
      world.tiles[tileIndex]?.blocked === false &&
      values.indexOf(tileIndex) === index,
  );
}

function pushIf(condition: boolean, errors: string[], message: string): void {
  if (condition) errors.push(message);
}

export function scenarioValidationErrors(compiled: CompiledScenarioStructure): string[] {
  const errors: string[] = [];
  const { world } = compiled;
  pushIf(
    world.width !== SCENARIO_WORLD_WIDTH || world.height !== SCENARIO_WORLD_HEIGHT,
    errors,
    `Scenario world must be ${SCENARIO_WORLD_WIDTH.toString()} x ${SCENARIO_WORLD_HEIGHT.toString()}.`,
  );
  pushIf(
    world.tiles.length !== world.width * world.height,
    errors,
    "Scenario tile count must match width x height.",
  );
  pushIf(
    world.navigationRevision !== 0,
    errors,
    "Compiled scenario navigation revision must begin at zero.",
  );
  for (const [index, tile] of world.tiles.entries()) {
    if (
      tile.index !== index ||
      tile.x !== index % world.width ||
      tile.y !== Math.floor(index / world.width)
    ) {
      errors.push(`Scenario tile ${index.toString()} has inconsistent index coordinates.`);
    }
    if (
      tile.terrain !== "GROUND" &&
      tile.terrain !== "SHALLOW_WATER" &&
      tile.terrain !== "ROCK"
    ) {
      errors.push(`Scenario tile ${index.toString()} has unsupported terrain.`);
    }
    if (!Number.isSafeInteger(tile.walkCost) || tile.walkCost < 1) {
      errors.push(`Scenario tile ${index.toString()} must have a positive walk cost.`);
    }
    if (tile.navigationRevision !== 0) {
      errors.push(
        `Scenario tile ${index.toString()} must begin at navigation revision zero.`,
      );
    }
  }

  if (
    compiled.reference.scenarioId !== compiled.metadata.scenarioId ||
    compiled.reference.scenarioVersion !== compiled.metadata.scenarioVersion ||
    compiled.reference.mapGenerationVersion !== compiled.metadata.mapGenerationVersion
  ) {
    errors.push(
      "Scenario reference and catalog metadata do not identify the same definition.",
    );
  }

  pushIf(
    compiled.creatures.length !== 8,
    errors,
    "Scenario must begin with eight creatures.",
  );
  const creatureNames = new Set<string>();
  const occupiedCoordinates = new Set<string>();
  const creatureTileIndices: number[] = [];
  for (const [index, creature] of compiled.creatures.entries()) {
    if (creatureNames.has(creature.name)) {
      errors.push(`Scenario creature name ${creature.name} is duplicated.`);
    }
    creatureNames.add(creature.name);
    if (
      !validCoordinate(creature.x, world.width) ||
      !validCoordinate(creature.y, world.height)
    ) {
      errors.push(`Scenario creature ${creature.name} begins outside the world.`);
      continue;
    }
    const key = coordinateKey(creature.x, creature.y);
    if (occupiedCoordinates.has(key)) {
      errors.push(
        `Scenario creature ${creature.name} overlaps another creature at ${key}.`,
      );
    }
    occupiedCoordinates.add(key);
    const tileIndex = tileIndexAt(world, creature.x, creature.y);
    creatureTileIndices.push(tileIndex);
    if (world.tiles[tileIndex]?.blocked !== false) {
      errors.push(`Scenario creature ${creature.name} begins on a blocked tile.`);
    }
    const boundedValues = [
      creature.hunger,
      creature.thirst,
      creature.generosity,
      creature.aggression,
      creature.sociability,
      creature.loyalty,
      creature.foraging,
      creature.combat,
    ];
    if (
      boundedValues.some(
        (value) => !Number.isSafeInteger(value) || value < 0 || value > 10_000,
      )
    ) {
      errors.push(
        `Scenario creature ${index.toString()} has an out-of-range need, trait, or skill.`,
      );
    }
  }

  const resourceCoordinates = new Set<string>();
  const resourcesByKind = new Map<ResourceNodePrototype["kind"], ResourceNodePrototype[]>([
    ["FOOD", []],
    ["MATERIAL", []],
    ["WATER", []],
  ]);
  for (const [index, resource] of compiled.resourceNodes.entries()) {
    if (
      !validCoordinate(resource.x, world.width) ||
      !validCoordinate(resource.y, world.height)
    ) {
      errors.push(`Scenario resource ${index.toString()} is outside the world.`);
      continue;
    }
    const key = coordinateKey(resource.x, resource.y);
    if (resourceCoordinates.has(key)) {
      errors.push(`Scenario resources overlap at ${key}.`);
    }
    resourceCoordinates.add(key);
    if (occupiedCoordinates.has(key)) {
      errors.push(`Scenario resource ${index.toString()} overlaps a creature at ${key}.`);
    }
    const tileIndex = tileIndexAt(world, resource.x, resource.y);
    if (world.tiles[tileIndex]?.blocked !== false) {
      errors.push(`Scenario resource ${index.toString()} is on a blocked tile.`);
    }
    if (resource.kind === "WATER" && world.tiles[tileIndex]?.terrain !== "SHALLOW_WATER") {
      errors.push(
        `Scenario water resource ${index.toString()} must be on shallow-water terrain.`,
      );
    }
    if (
      !Number.isSafeInteger(resource.currentStock) ||
      resource.currentStock < 0 ||
      !Number.isSafeInteger(resource.maximumStock) ||
      resource.maximumStock < 1 ||
      resource.currentStock > resource.maximumStock ||
      !Number.isSafeInteger(resource.regenerationEveryTicks) ||
      resource.regenerationEveryTicks < 1 ||
      !Number.isSafeInteger(resource.regenerationAmount) ||
      resource.regenerationAmount < 1
    ) {
      errors.push(
        `Scenario resource ${index.toString()} has invalid stock or regeneration.`,
      );
    }
    resourcesByKind.get(resource.kind)?.push(resource);
    if (interactionFootprint(world, resource.x, resource.y).length === 0) {
      errors.push(
        `Scenario resource ${index.toString()} has no legal interaction footprint.`,
      );
    }
  }
  for (const kind of ["FOOD", "MATERIAL", "WATER"] as const) {
    if ((resourcesByKind.get(kind)?.length ?? 0) === 0) {
      errors.push(`Scenario must contain at least one ${kind.toLowerCase()} resource.`);
    }
  }

  const regionIds = new Set<string>();
  const regionById = new Map<string, CompiledScenarioRegion>();
  for (const region of compiled.regions) {
    if (regionIds.has(region.id))
      errors.push(`Scenario region ${region.id} is duplicated.`);
    regionIds.add(region.id);
    regionById.set(region.id, region);
    if (region.tileIndices.length === 0)
      errors.push(`Scenario region ${region.id} is empty.`);
    const uniqueTiles = new Set(region.tileIndices);
    if (uniqueTiles.size !== region.tileIndices.length) {
      errors.push(`Scenario region ${region.id} contains duplicate tiles.`);
    }
    for (const tileIndex of region.tileIndices) {
      if (world.tiles[tileIndex]?.blocked !== false) {
        errors.push(`Scenario region ${region.id} contains a blocked or invalid tile.`);
      }
    }
  }

  const chokepointIds = new Set<string>();
  for (const chokepoint of compiled.chokepoints) {
    if (chokepointIds.has(chokepoint.id)) {
      errors.push(`Scenario chokepoint ${chokepoint.id} is duplicated.`);
    }
    chokepointIds.add(chokepoint.id);
    const [leftId, rightId] = chokepoint.connects;
    const left = regionById.get(leftId);
    const right = regionById.get(rightId);
    if (!left || !right) {
      errors.push(`Scenario chokepoint ${chokepoint.id} references a missing region.`);
      continue;
    }
    if (chokepoint.tileIndices.length === 0) {
      errors.push(`Scenario chokepoint ${chokepoint.id} is empty.`);
      continue;
    }
    const excluded = new Set(chokepoint.tileIndices);
    if (excluded.size !== chokepoint.tileIndices.length) {
      errors.push(`Scenario chokepoint ${chokepoint.id} contains duplicate tiles.`);
    }
    for (const tileIndex of excluded) {
      if (world.tiles[tileIndex]?.blocked !== false) {
        errors.push(
          `Scenario chokepoint ${chokepoint.id} contains a blocked or invalid tile.`,
        );
      }
    }
    const connected = reachableTiles(world, left.tileIndices);
    if (!right.tileIndices.some((tileIndex) => connected.has(tileIndex))) {
      errors.push(`Scenario chokepoint ${chokepoint.id} does not connect its regions.`);
    }
    const withoutChokepoint = reachableTiles(world, left.tileIndices, excluded);
    if (right.tileIndices.some((tileIndex) => withoutChokepoint.has(tileIndex))) {
      errors.push(`Scenario chokepoint ${chokepoint.id} does not separate its regions.`);
    }
  }

  if (creatureTileIndices.length > 0) {
    const reachable = reachableTiles(world, [creatureTileIndices[0]!]);
    for (const [index, start] of creatureTileIndices.entries()) {
      const creature = compiled.creatures[index];
      if (!reachable.has(start)) {
        errors.push(
          `Scenario creature ${creature?.name ?? index.toString()} is topologically isolated.`,
        );
        continue;
      }
      if (
        creature &&
        !interactionFootprint(world, creature.x, creature.y).some((tileIndex) =>
          reachable.has(tileIndex),
        )
      ) {
        errors.push(`Scenario creature ${creature.name} has no reachable rest footprint.`);
      }
      for (const kind of ["FOOD", "MATERIAL", "WATER"] as const) {
        const hasReachableResource = (resourcesByKind.get(kind) ?? []).some((resource) =>
          interactionFootprint(world, resource.x, resource.y).some((tileIndex) =>
            reachable.has(tileIndex),
          ),
        );
        if (!hasReachableResource) {
          errors.push(
            `Scenario creature ${creature?.name ?? index.toString()} cannot reach ${kind.toLowerCase()}.`,
          );
        }
      }
    }
  }

  const defaultIndices = [
    ["food", compiled.interventionDefaults.foodTileIndex],
    ["water", compiled.interventionDefaults.waterTileIndex],
    ["obstacle", compiled.interventionDefaults.obstacleTileIndex],
  ] as const;
  for (const [label, tileIndex] of defaultIndices) {
    if (world.tiles[tileIndex]?.blocked !== false) {
      errors.push(`Scenario ${label} intervention default must be a walkable tile.`);
    }
  }
  const waterDefault = compiled.interventionDefaults.waterTileIndex;
  if (
    !compiled.resourceNodes.some(
      (resource) =>
        resource.kind === "WATER" &&
        tileIndexAt(world, resource.x, resource.y) === waterDefault,
    )
  ) {
    errors.push("Scenario water intervention default must target a water resource.");
  }
  if (
    creatureTileIndices.includes(compiled.interventionDefaults.obstacleTileIndex) ||
    compiled.resourceNodes.some(
      (resource) =>
        tileIndexAt(world, resource.x, resource.y) ===
        compiled.interventionDefaults.obstacleTileIndex,
    )
  ) {
    errors.push("Scenario obstacle intervention default must begin unoccupied.");
  }

  return [...new Set(errors)].sort((left, right) => left.localeCompare(right));
}

export function assertValidCompiledScenario(compiled: CompiledScenarioStructure): void {
  const errors = scenarioValidationErrors(compiled);
  if (errors.length > 0) {
    throw new Error(`Invalid compiled scenario:\n- ${errors.join("\n- ")}`);
  }
}
