import {
  TILE_FIXED_UNITS,
  type DomainEvent,
  type RenderResourceNode,
  type RenderSnapshot,
  type SimulationState,
} from "./types.js";
import { projectCreatureObservationSummary } from "./observation-summary.js";
import { SIMULATION_BEHAVIOR_VERSION, SNAPSHOT_SCHEMA_VERSION } from "./versions.js";
import {
  cloneScenarioReference,
  compileScenario,
  getScenarioMetadata,
} from "./scenarios/index.js";
import {
  estimateInteractionTravelIgnoringOccupancy,
  interactionCapacity,
} from "./interaction-slots.js";
import {
  SHELTER_MAINTENANCE_THRESHOLD,
  effectiveShelterCapacity,
  isShelterStructure,
  shelterEligibility,
  shelterOccupancy,
} from "./shelters.js";

const HISTORY_TICKS_PER_MINUTE = 10;
const HISTORY_MINUTES_PER_DAY = 24 * 60;
const MAX_PROJECTED_ROUTE_SAMPLES = 12;
const MAX_PROJECTED_MEMORIES_PER_CREATURE = 4;
const MAX_PROJECTED_RELATIONSHIPS_PER_CREATURE = 6;
const MAX_PROJECTED_ATTENTION_EVENTS = 24;
const MAX_PROJECTED_FACTORS_PER_CANDIDATE = 3;

const ROUTINE_WATER_DRINKING_CLUSTER_KEY = "presentation:water-drinking:routine";
const ROUTINE_SHELTER_REST_CLUSTER_KEY = "presentation:shelter-rest:routine";
const ROUTINE_SHELTER_MAINTENANCE_CLUSTER_KEY = "presentation:shelter-maintenance:routine";
const FIRST_WATER_SHARE_CLUSTER_KEY = "presentation:water-share:first";
const CONTINUED_WATER_SHARE_CLUSTER_KEY = "presentation:water-share:continued";

function compareEvents(left: DomainEvent, right: DomainEvent): number {
  return left.tick - right.tick || left.id - right.id;
}

function latestAggregate(
  events: readonly DomainEvent[],
  clusterKey: string,
  summary: string,
  quantity: number,
): DomainEvent | null {
  const latest = events.at(-1);
  if (!latest) return null;
  return {
    ...latest,
    quantity,
    clusterKey,
    summary,
  };
}

function groupShelterEvents(
  events: readonly DomainEvent[],
): Array<readonly [number, DomainEvent[]]> {
  const grouped = new Map<number, DomainEvent[]>();
  for (const event of events) {
    const shelterId = event.targetIds[0];
    if (shelterId === undefined) continue;
    const retained = grouped.get(shelterId) ?? [];
    retained.push(event);
    grouped.set(shelterId, retained);
  }
  return [...grouped.entries()].sort(([left], [right]) => left - right);
}

function latestShelterAggregate(
  shelterId: number,
  events: readonly DomainEvent[],
  clusterKey: string,
  summary: string,
  quantity: number,
): DomainEvent | null {
  const aggregate = latestAggregate(
    events,
    `${clusterKey}:${shelterId.toString()}`,
    summary,
    quantity,
  );
  if (!aggregate) return null;
  return {
    ...aggregate,
    actorIds: [...new Set(events.flatMap((event) => event.actorIds))].sort(
      (left, right) => left - right,
    ),
    targetIds: [shelterId],
    groupIds: [...new Set(events.flatMap((event) => event.groupIds))].sort(
      (left, right) => left - right,
    ),
  };
}

/**
 * Keeps the observation stream compact without altering authoritative events.
 * Routine drinking is represented by its latest causally linked event, while
 * sharing retains the first observation and one rolling continuation.
 */
function projectRecentEvents(state: SimulationState): DomainEvent[] {
  const routineDrinks = state.domainEvents
    .filter((event) => event.type === "WATER_DRUNK" && event.attentionTier === "ROUTINE")
    .sort(compareEvents);
  const routineShelterRests = state.domainEvents
    .filter((event) => event.type === "SHELTER_RESTED" && event.attentionTier === "ROUTINE")
    .sort(compareEvents);
  const routineShelterMaintenance = state.domainEvents
    .filter(
      (event) => event.type === "SHELTER_MAINTAINED" && event.attentionTier === "ROUTINE",
    )
    .sort(compareEvents);
  const waterShares = state.domainEvents
    .filter((event) => event.type === "WATER_SHARED")
    .sort(compareEvents);
  const projected = state.domainEvents.filter(
    (event) =>
      event.type !== "WATER_SHARED" &&
      (event.attentionTier !== "ROUTINE" ||
        event.type === "SIMULATION_STARTED" ||
        event.type.startsWith("PLAYER_")),
  );

  const latestRoutineDrink = routineDrinks.at(-1);
  if (latestRoutineDrink) {
    const count = routineDrinks.reduce(
      (total, event) => total + Math.max(0, event.quantity),
      0,
    );
    const drinkSummary =
      count === latestRoutineDrink.quantity
        ? latestRoutineDrink.summary
        : `${count} routine drinks were recorded; latest: ${latestRoutineDrink.summary}`;
    const aggregate = latestAggregate(
      routineDrinks,
      ROUTINE_WATER_DRINKING_CLUSTER_KEY,
      drinkSummary,
      count,
    );
    if (aggregate) projected.push(aggregate);
  }

  for (const [shelterId, shelterEvents] of groupShelterEvents(routineShelterRests)) {
    const latestRoutineShelterRest = shelterEvents.at(-1)!;
    const count = shelterEvents.length;
    const aggregate = latestShelterAggregate(
      shelterId,
      shelterEvents,
      ROUTINE_SHELTER_REST_CLUSTER_KEY,
      count === 1
        ? latestRoutineShelterRest.summary
        : `${count.toString()} routine sheltered rests were recorded at this shelter; latest: ${latestRoutineShelterRest.summary}`,
      count,
    );
    if (aggregate) projected.push(aggregate);
  }

  for (const [shelterId, shelterEvents] of groupShelterEvents(routineShelterMaintenance)) {
    const latestRoutineShelterMaintenance = shelterEvents.at(-1)!;
    const material = shelterEvents.reduce(
      (total, event) => total + Math.max(0, event.quantity),
      0,
    );
    const aggregate = latestShelterAggregate(
      shelterId,
      shelterEvents,
      ROUTINE_SHELTER_MAINTENANCE_CLUSTER_KEY,
      shelterEvents.length === 1
        ? latestRoutineShelterMaintenance.summary
        : `${shelterEvents.length.toString()} routine upkeep actions at this shelter used ${material.toString()} material; latest: ${latestRoutineShelterMaintenance.summary}`,
      material,
    );
    if (aggregate) projected.push(aggregate);
  }

  const retainedShareCount = waterShares.reduce(
    (total, event) => total + Math.max(0, event.quantity),
    0,
  );
  const firstShareIsRetained =
    waterShares.length > 0 && retainedShareCount === state.metrics.waterShared;
  const firstShare = firstShareIsRetained ? waterShares[0] : undefined;
  if (firstShare) {
    projected.push({
      ...firstShare,
      clusterKey: FIRST_WATER_SHARE_CLUSTER_KEY,
      summary: `${firstShare.summary} This was the first recorded water share.`,
    });
  }

  const continuedShares = firstShare ? waterShares.slice(1) : waterShares;
  const latestContinuedShare = continuedShares.at(-1);
  if (latestContinuedShare) {
    const observedCount = continuedShares.reduce(
      (total, event) => total + Math.max(0, event.quantity),
      0,
    );
    const totalCount = firstShareIsRetained ? observedCount : state.metrics.waterShared;
    const shareSummary =
      totalCount === 1
        ? `${latestContinuedShare.summary} This was the next recorded water share.`
        : `${totalCount} later water shares were recorded; latest: ${latestContinuedShare.summary}`;
    const aggregate = latestAggregate(
      continuedShares,
      CONTINUED_WATER_SHARE_CLUSTER_KEY,
      shareSummary,
      totalCount,
    );
    if (aggregate) projected.push(aggregate);
  }

  return projected.sort(compareEvents).slice(-MAX_PROJECTED_ATTENTION_EVENTS);
}

function relationshipSalience(relationship: SimulationState["relationships"][number]) {
  return Math.max(
    Math.abs(relationship.trust),
    relationship.fear,
    relationship.familiarity,
    relationship.rivalry,
  );
}

export function formatSimulationTime(tick: number): string {
  const totalMinutes = Math.max(0, Math.floor(tick / HISTORY_TICKS_PER_MINUTE));
  const day = Math.floor(totalMinutes / HISTORY_MINUTES_PER_DAY) + 1;
  const minutesInDay = totalMinutes % HISTORY_MINUTES_PER_DAY;
  const hour = Math.floor(minutesInDay / 60);
  const minute = minutesInDay % 60;
  return `Day ${day} · ${hour.toString().padStart(2, "0")}:${minute
    .toString()
    .padStart(2, "0")}`;
}

function claimedWaterInteractionSlots(state: SimulationState, sourceId: number): number {
  return new Set(
    state.creatures.flatMap((creature) => {
      const claim = creature.activeAction?.interactionClaim;
      return creature.alive &&
        creature.activeAction?.kind === "GATHER_WATER" &&
        claim?.anchorKind === "RESOURCE" &&
        claim.anchorId === sourceId
        ? [claim.slotIndex]
        : [];
    }),
  ).size;
}

function projectCreatureWaterAccess(
  state: SimulationState,
  creature: SimulationState["creatures"][number],
) {
  if (!creature.alive) return null;
  const sources = state.resourceNodes.filter((node) => node.kind === "WATER");
  const reachable = sources
    .map((source) => ({
      source,
      route: estimateInteractionTravelIgnoringOccupancy(
        state,
        creature,
        "GATHER_WATER",
        source.id,
        source.tileIndex,
      ),
    }))
    .filter((candidate) => candidate.route !== null)
    .sort(
      (left, right) =>
        left.route!.cost - right.route!.cost || left.source.id - right.source.id,
    );
  const nearest = reachable[0];
  if (!nearest || nearest.route === null) return null;
  return {
    sourceId: nearest.source.id,
    sourceStock: nearest.source.currentStock,
    sourceCapacity: nearest.source.maximumStock,
    weightedCost: nearest.route.cost,
    reachableSources: reachable.length,
    totalSources: sources.length,
    interactionCapacity: interactionCapacity("GATHER_WATER"),
    claimedInteractionSlots: claimedWaterInteractionSlots(state, nearest.source.id),
  };
}

function projectCreatureShelterAccess(
  state: SimulationState,
  creature: SimulationState["creatures"][number],
) {
  if (!creature.alive) return null;
  const candidates = state.structures
    .filter(isShelterStructure)
    .filter((structure) => structure.kind === "SHELTER")
    .map((shelter) => ({
      shelter,
      eligibility: shelterEligibility(state, creature, shelter),
      route: estimateInteractionTravelIgnoringOccupancy(
        state,
        creature,
        "REST_SHELTERED",
        shelter.id,
        shelter.tileIndex,
      ),
    }))
    .sort(
      (left, right) =>
        (left.route === null ? 1 : 0) - (right.route === null ? 1 : 0) ||
        (left.eligibility === "MEMBER" ? 0 : left.eligibility === "TRUSTED_GUEST" ? 1 : 2) -
          (right.eligibility === "MEMBER"
            ? 0
            : right.eligibility === "TRUSTED_GUEST"
              ? 1
              : 2) ||
        (left.route?.cost ?? Number.MAX_SAFE_INTEGER) -
          (right.route?.cost ?? Number.MAX_SAFE_INTEGER) ||
        left.shelter.id - right.shelter.id,
    );
  const destination =
    creature.activeAction?.kind === "REST_SHELTERED"
      ? "SHELTERED"
      : creature.activeAction?.kind === "REST"
        ? "OUTDOOR"
        : "NONE";
  const selected =
    candidates.find(
      (candidate) => creature.activeAction?.targetEntityId === candidate.shelter.id,
    ) ?? candidates[0];
  if (!selected) {
    return {
      shelterId: null,
      weightedCost: null,
      eligibility: null,
      condition: null,
      effectiveCapacity: 0,
      reservedSpaces: 0,
      restingCreatures: 0,
      destination,
      reason:
        destination === "OUTDOOR"
          ? "No active communal shelter exists, so outdoor rest is the available fallback."
          : "No active communal shelter is currently available.",
    } as const;
  }
  const occupancy = shelterOccupancy(state, selected.shelter.id);
  return {
    shelterId: selected.shelter.id,
    weightedCost: selected.route?.cost ?? null,
    eligibility: selected.eligibility,
    condition: selected.shelter.condition,
    effectiveCapacity: effectiveShelterCapacity(selected.shelter),
    reservedSpaces: occupancy.reserved,
    restingCreatures: occupancy.resting,
    destination,
    reason:
      destination === "SHELTERED"
        ? "A reachable, eligible shelter offered stronger recovery."
        : destination === "OUTDOOR"
          ? selected.route === null
            ? "The active shelter was unreachable, so outdoor rest remained available."
            : selected.eligibility === "INELIGIBLE"
              ? "The reachable shelter did not admit this creature as a member or trusted guest, so outdoor rest remained available."
              : occupancy.reserved >= effectiveShelterCapacity(selected.shelter)
                ? "The reachable shelter had no unreserved place, so outdoor rest remained available."
                : "Outdoor rest won the retained decision despite an eligible, reachable shelter."
          : selected.route === null
            ? "An active shelter exists but is currently unreachable."
            : selected.eligibility === "INELIGIBLE"
              ? "The nearest reachable shelter requires group membership or directed trust of at least 2500."
              : "This shelter is reachable and may be chosen when fatigue becomes important.",
  } as const;
}

function projectResourceNodes(state: SimulationState): RenderResourceNode[] {
  const livingCreatures = state.creatures.filter((creature) => creature.alive);
  return state.resourceNodes.map((node) => {
    if (node.kind !== "WATER") {
      return {
        id: node.id,
        kind: node.kind,
        tileIndex: node.tileIndex,
        currentStock: node.currentStock,
        maximumStock: node.maximumStock,
        waterAccess: null,
      };
    }

    const accessCosts: number[] = [];
    for (const creature of livingCreatures) {
      const route = estimateInteractionTravelIgnoringOccupancy(
        state,
        creature,
        "GATHER_WATER",
        node.id,
        node.tileIndex,
      );
      if (route !== null) accessCosts.push(route.cost);
    }
    const totalCost = accessCosts.reduce((total, cost) => total + cost, 0);
    return {
      id: node.id,
      kind: node.kind,
      tileIndex: node.tileIndex,
      currentStock: node.currentStock,
      maximumStock: node.maximumStock,
      waterAccess: {
        interactionCapacity: interactionCapacity("GATHER_WATER"),
        claimedInteractionSlots: claimedWaterInteractionSlots(state, node.id),
        reachableCreatures: accessCosts.length,
        livingCreatures: livingCreatures.length,
        nearestWeightedCost: accessCosts.length === 0 ? null : Math.min(...accessCosts),
        meanWeightedCost:
          accessCosts.length === 0 ? null : Math.round(totalCost / accessCosts.length),
      },
    };
  });
}

export function createRenderSnapshot(
  state: SimulationState,
  includeStaticWorld = true,
): RenderSnapshot {
  const scenarioMetadata = getScenarioMetadata(state.scenario.scenarioId);
  const compiledScenario = includeStaticWorld ? compileScenario(state.scenario) : null;
  return {
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    behaviorVersion: SIMULATION_BEHAVIOR_VERSION,
    scenario: {
      reference: cloneScenarioReference(state.scenario),
      compiledMapHash: state.compiledMapHash,
      name: scenarioMetadata.name,
      role: includeStaticWorld ? scenarioMetadata.role : "",
      dramaticQuestion: includeStaticWorld ? scenarioMetadata.dramaticQuestion : "",
      startingFacts: includeStaticWorld ? [...scenarioMetadata.startingFacts] : [],
      observableTensions: includeStaticWorld
        ? [...scenarioMetadata.observableTensions]
        : [],
      landmarks:
        compiledScenario === null
          ? []
          : [
              ...compiledScenario.regions.map((region) => ({
                kind: "REGION" as const,
                id: region.id,
                label: region.label,
                tileIndices: [...region.tileIndices],
              })),
              ...compiledScenario.chokepoints.map((chokepoint) => ({
                kind: "CHOKEPOINT" as const,
                id: chokepoint.id,
                label: chokepoint.label,
                tileIndices: [...chokepoint.tileIndices],
              })),
            ],
    },
    tick: state.tick,
    timeLabel: formatSimulationTime(state.tick),
    width: state.world.width,
    height: state.world.height,
    navigationRevision: state.world.navigationRevision,
    tiles: includeStaticWorld
      ? state.world.tiles.map((tile) => ({
          index: tile.index,
          x: tile.x,
          y: tile.y,
          terrain: tile.terrain,
          blocked: tile.blocked,
        }))
      : [],
    creatures: state.creatures.map((creature) => ({
      id: creature.id,
      name: creature.name,
      color: creature.color,
      alive: creature.alive,
      x: creature.x / TILE_FIXED_UNITS,
      y: creature.y / TILE_FIXED_UNITS,
      tileIndex: creature.tileIndex,
      health: creature.health,
      hunger: creature.needs.hunger,
      fatigue: creature.needs.fatigue,
      thirst: creature.needs.thirst,
      groupId: creature.groupId,
      role: creature.role,
      traits: { ...creature.traits },
      skills: { ...creature.skills },
      inventory: { ...creature.inventory },
      desire: creature.activeDesire?.kind ?? null,
      plan: creature.activePlan?.kind ?? null,
      action: creature.activeAction?.kind ?? null,
      actionPhase: creature.activeAction?.phase ?? null,
      targetTileIndex: creature.activeAction?.targetTileIndex ?? null,
      destinationX:
        creature.activeAction?.interactionClaim?.targetX === undefined
          ? null
          : creature.activeAction.interactionClaim.targetX / TILE_FIXED_UNITS,
      destinationY:
        creature.activeAction?.interactionClaim?.targetY === undefined
          ? null
          : creature.activeAction.interactionClaim.targetY / TILE_FIXED_UNITS,
      waterAccess: projectCreatureWaterAccess(state, creature),
      shelterAccess: projectCreatureShelterAccess(state, creature),
      recentRoute: creature.recentRoute
        .slice(-MAX_PROJECTED_ROUTE_SAMPLES)
        .map((sample) => ({
          tick: sample.tick,
          x: sample.x / TILE_FIXED_UNITS,
          y: sample.y / TILE_FIXED_UNITS,
        })),
      summary: projectCreatureObservationSummary(creature),
      latestDecision: (() => {
        const decision = [...state.decisionRecords]
          .reverse()
          .find((candidate) => candidate.actorId === creature.id);
        return decision
          ? {
              ...decision,
              strongestReason: decision.strongestReason
                ? {
                    ...decision.strongestReason,
                    sourceEventIds: [...decision.strongestReason.sourceEventIds],
                  }
                : null,
              candidates: decision.candidates.map((candidate) => ({
                ...candidate,
                factors: [...candidate.factors]
                  .sort(
                    (left, right) =>
                      Math.abs(right.contribution) - Math.abs(left.contribution) ||
                      left.key.localeCompare(right.key),
                  )
                  .slice(0, MAX_PROJECTED_FACTORS_PER_CANDIDATE)
                  .map((factor) => ({
                    ...factor,
                    evidenceEventIds: [...factor.evidenceEventIds],
                    fact: factor.fact
                      ? {
                          ...factor.fact,
                          sourceEventIds: [...factor.fact.sourceEventIds],
                        }
                      : null,
                  })),
              })),
            }
          : null;
      })(),
      memories: state.memories
        .filter((memory) => memory.ownerId === creature.id)
        .sort(
          (left, right) =>
            right.strength - left.strength ||
            right.importance - left.importance ||
            right.createdTick - left.createdTick ||
            left.id - right.id,
        )
        .slice(0, MAX_PROJECTED_MEMORIES_PER_CREATURE)
        .map((memory) => ({
          ...memory,
          sourceEventIds: [...memory.sourceEventIds],
        })),
      relationships: state.relationships
        .filter(
          (relationship) =>
            relationship.fromId === creature.id || relationship.toId === creature.id,
        )
        .sort(
          (left, right) =>
            relationshipSalience(right) - relationshipSalience(left) || left.id - right.id,
        )
        .slice(0, MAX_PROJECTED_RELATIONSHIPS_PER_CREATURE)
        .map((relationship) => ({
          ...relationship,
          significantEventIds: [...relationship.significantEventIds],
        })),
    })),
    resourceNodes: projectResourceNodes(state),
    structures: state.structures.map((structure) => {
      const shelter = isShelterStructure(structure) ? structure : null;
      const occupancy = shelter
        ? shelterOccupancy(state, shelter.id)
        : { reserved: 0, resting: 0, members: 0, guests: 0 };
      return {
        id: structure.id,
        kind: structure.kind,
        tileIndex: structure.tileIndex,
        groupId: structure.groupId,
        progress: structure.progress,
        workRequired: structure.workRequired,
        food: structure.inventory.food,
        material: structure.material,
        storedMaterial: structure.inventory.material,
        storageCapacity: structure.inventory.capacity,
        materialRequired: structure.materialRequired,
        water: structure.inventory.water,
        guardIds: [...structure.guardIds],
        condition: shelter?.condition ?? null,
        baseCapacity: shelter?.baseCapacity ?? null,
        effectiveCapacity:
          shelter?.kind === "SHELTER" ? effectiveShelterCapacity(shelter) : null,
        reservedSpaces: occupancy.reserved,
        restingCreatures: occupancy.resting,
        memberOccupancy: occupancy.members,
        guestOccupancy: occupancy.guests,
        upkeepNeeded:
          shelter?.kind === "SHELTER" && shelter.condition < SHELTER_MAINTENANCE_THRESHOLD,
        siteAssessment: shelter ? { ...shelter.siteAssessment } : null,
        builtFromShelterId: shelter?.builtFromShelterId ?? null,
      };
    }),
    groups: state.groups.map((group) => ({
      ...group,
      memberIds: [...group.memberIds],
      majorEventIds: [...group.majorEventIds],
    })),
    recentEvents: projectRecentEvents(state).map((event) => ({
      ...event,
      actorIds: [...event.actorIds],
      targetIds: [...event.targetIds],
      groupIds: [...event.groupIds],
      causedByEventIds: [...event.causedByEventIds],
      decisionRecordIds: [...event.decisionRecordIds],
    })),
    historyEvents: state.historyEvents.map((event) => ({
      ...event,
      sourceEventIds: [...event.sourceEventIds],
      actorIds: [...event.actorIds],
      groupIds: [...event.groupIds],
    })),
    metrics: { ...state.metrics },
  };
}
