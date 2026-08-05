import { tileIndexAt } from "../pathfinding.js";
import { createWorldFromTileResolver, type InitialWorldPopulation } from "../world.js";
import { getScenarioDefinition } from "./definitions.js";
import {
  SCENARIO_IDS,
  assertScenarioReference,
  cloneScenarioReference,
  type ScenarioMetadata,
  type ScenarioReferenceV2,
} from "./types.js";
import {
  assertValidCompiledScenario,
  type CompiledScenarioChokepoint,
  type CompiledScenarioRegion,
  type CompiledScenarioStructure,
} from "./validation.js";

export interface CompiledScenario
  extends CompiledScenarioStructure, InitialWorldPopulation {
  readonly compiledMapHash: string;
}

function canonicalStringify(value: unknown): string {
  if (value === null) return "null";
  if (
    typeof value === "number" ||
    typeof value === "boolean" ||
    typeof value === "string"
  ) {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalStringify(item)).join(",")}]`;
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalStringify(record[key])}`)
      .join(",")}}`;
  }
  return "null";
}

function hashCanonical(value: unknown): string {
  const serialized = canonicalStringify(value);
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  const mask = 0xffffffffffffffffn;
  for (let index = 0; index < serialized.length; index += 1) {
    const code = serialized.charCodeAt(index);
    hash ^= BigInt(code & 0xff);
    hash = (hash * prime) & mask;
    hash ^= BigInt((code >>> 8) & 0xff);
    hash = (hash * prime) & mask;
  }
  return hash.toString(16).padStart(16, "0");
}

function compileRegions(
  definition: ReturnType<typeof getScenarioDefinition>,
  world: ReturnType<typeof createWorldFromTileResolver>,
): readonly CompiledScenarioRegion[] {
  return Object.freeze(
    definition.regions.map((region) =>
      Object.freeze({
        id: region.id,
        label: region.label,
        tileIndices: Object.freeze(
          world.tiles
            .filter((tile) => !tile.blocked && region.contains(tile.x, tile.y))
            .map((tile) => tile.index),
        ),
      }),
    ),
  );
}

function compileChokepoints(
  definition: ReturnType<typeof getScenarioDefinition>,
  world: ReturnType<typeof createWorldFromTileResolver>,
): readonly CompiledScenarioChokepoint[] {
  return Object.freeze(
    definition.chokepoints.map((chokepoint) =>
      Object.freeze({
        id: chokepoint.id,
        label: chokepoint.label,
        tileIndices: Object.freeze(
          chokepoint.tiles.map((coordinate) =>
            tileIndexAt(world, coordinate.x, coordinate.y),
          ),
        ),
        connects: Object.freeze([...chokepoint.connects]) as readonly [string, string],
      }),
    ),
  );
}

function mapHashInput(compiled: CompiledScenarioStructure): unknown {
  return {
    scenarioId: compiled.reference.scenarioId,
    scenarioVersion: compiled.reference.scenarioVersion,
    mapGenerationVersion: compiled.reference.mapGenerationVersion,
    world: {
      width: compiled.world.width,
      height: compiled.world.height,
      tiles: compiled.world.tiles.map((tile) => ({
        index: tile.index,
        terrain: tile.terrain,
        walkCost: tile.walkCost,
        blocked: tile.blocked,
      })),
    },
    creatures: compiled.creatures.map((creature) => ({ ...creature })),
    resourceNodes: compiled.resourceNodes.map((resource) => ({ ...resource })),
    regions: compiled.regions.map((region) => ({
      id: region.id,
      tileIndices: [...region.tileIndices],
    })),
    chokepoints: compiled.chokepoints.map((chokepoint) => ({
      id: chokepoint.id,
      tileIndices: [...chokepoint.tileIndices],
      connects: [...chokepoint.connects],
    })),
  };
}

export function hashCompiledScenario(compiled: CompiledScenarioStructure): string {
  return hashCanonical(mapHashInput(compiled));
}

export function compileScenario(reference: ScenarioReferenceV2): CompiledScenario {
  assertScenarioReference(reference);
  const definition = getScenarioDefinition(reference.scenarioId);
  if (
    reference.scenarioVersion !== definition.metadata.scenarioVersion ||
    reference.mapGenerationVersion !== definition.metadata.mapGenerationVersion
  ) {
    throw new Error(
      `Unsupported scenario definition ${reference.scenarioId}@${reference.scenarioVersion.toString()}/${reference.mapGenerationVersion.toString()}.`,
    );
  }
  const world = createWorldFromTileResolver(
    definition.width,
    definition.height,
    definition.resolveTile,
  );
  const compiled: CompiledScenarioStructure = {
    reference: cloneScenarioReference(reference),
    metadata: definition.metadata,
    world,
    creatures: definition.creatures,
    resourceNodes: definition.resourceNodes,
    regions: compileRegions(definition, world),
    chokepoints: compileChokepoints(definition, world),
    interventionDefaults: Object.freeze({
      foodTileIndex: tileIndexAt(
        world,
        definition.interventionDefaults.food.x,
        definition.interventionDefaults.food.y,
      ),
      waterTileIndex: tileIndexAt(
        world,
        definition.interventionDefaults.water.x,
        definition.interventionDefaults.water.y,
      ),
      obstacleTileIndex: tileIndexAt(
        world,
        definition.interventionDefaults.obstacle.x,
        definition.interventionDefaults.obstacle.y,
      ),
    }),
  };
  assertValidCompiledScenario(compiled);
  return Object.freeze({
    ...compiled,
    compiledMapHash: hashCompiledScenario(compiled),
  });
}

export function scenarioCatalogProjection(): readonly ScenarioMetadata[] {
  return Object.freeze(
    // Definitions are the executable source of truth; returning their already
    // frozen metadata keeps applications from maintaining a parallel catalog.
    SCENARIO_IDS.map((scenarioId) => getScenarioDefinition(scenarioId).metadata),
  );
}
