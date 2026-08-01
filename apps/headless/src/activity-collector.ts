import {
  availableInteractionSlots,
  interactionPurpose,
  TILE_FIXED_UNITS,
  type ActionKind,
  type AttentionTier,
  type CreatureState,
  type DecisionCandidate,
  type DecisionRecord,
  type DesireKind,
  type DomainEvent,
  type DomainEventType,
  type InteractionClaim,
  type InteractionPurpose,
  type SimulationState,
} from "@tiny-civ/sim-core";

export const ACTIVITY_PROFILE_SCHEMA_VERSION = 2 as const;
export const ACTIVITY_SAMPLE_EVERY_TICKS = 1 as const;
export const SIGNIFICANT_EVENT_TIERS = [
  "SIGNIFICANT",
  "CRITICAL",
] as const satisfies readonly AttentionTier[];
export const INTERVENTION_RESPONSE_WINDOW_TICKS = 120 as const;

export const ACTION_KINDS = [
  "EXPLORE",
  "GATHER_FOOD",
  "GATHER_MATERIAL",
  "EAT",
  "REST",
  "SHARE",
  "KEEP",
  "STEAL",
  "DEPOSIT",
  "WITHDRAW",
  "BUILD_STORAGE",
  "GUARD",
  "ATTACK",
  "FLEE",
  "JOIN_GROUP",
] as const satisfies readonly ActionKind[];

export const INTERACTION_EVENT_TYPES = [
  "FOOD_SHARED",
  "MATERIAL_DEPOSITED",
  "STORAGE_SITE_STARTED",
  "STORAGE_COMPLETED",
  "CREATURE_GUARDED",
  "THEFT_COMMITTED",
  "THEFT_WITNESSED",
  "CREATURE_ATTACKED",
  "CREATURE_FLED",
  "CREATURE_JOINED_GROUP",
  "GROUP_FOUNDED",
  "LEADER_SELECTED",
] as const satisfies readonly DomainEventType[];

export const INTERACTION_PURPOSES = [
  "EXPLORE",
  "GATHER",
  "REST",
  "SOCIAL",
  "STORAGE_ACCESS",
  "CONSTRUCTION",
  "GUARD",
  "CONFLICT",
  "FLIGHT",
] as const satisfies readonly InteractionPurpose[];

export const INTERVENTION_CHANGE_KINDS = [
  "RECONSIDERED_DESIRE",
  "RECONSIDERED_PLAN",
  "CHANGED_ACTION",
  "CHANGED_DESTINATION",
  "REROUTED",
] as const;

type InteractionEventType = (typeof INTERACTION_EVENT_TYPES)[number];
type InterventionChangeKind = (typeof INTERVENTION_CHANGE_KINDS)[number];
type InteractionAnchorKind = InteractionClaim["anchorKind"];

export interface NumericDistribution {
  samples: number;
  min: number | null;
  p10: number | null;
  median: number | null;
  p90: number | null;
  max: number | null;
  mean: number | null;
}

export interface ActionCountProfile {
  kind: ActionKind;
  count: number;
  share: number;
}

export interface CreatureActionProfile {
  creatureId: number;
  name: string;
  completedActions: number;
  byKind: ActionCountProfile[];
}

export interface ActionTransitionProfile {
  from: ActionKind | null;
  to: ActionKind;
  count: number;
  totalDwellTicks: number;
  meanDwellTicks: number;
}

export interface CreatureMovementProfile {
  creatureId: number;
  name: string;
  distanceFixedUnits: number;
  distanceTiles: number;
  fixedUnitsPerSimulatedMinute: number;
}

export interface InteractionCountProfile {
  eventType: InteractionEventType;
  count: number;
  per1_000Ticks: number;
}

export interface SlotUtilisationProfile {
  sampledAnchorPurposeTicks: number;
  claimedSlotTicks: number;
  availableSlotTicks: number;
  capacitySlotTicks: number;
  utilisation: number;
  saturatedAnchorPurposeTicks: number;
}

export interface SlotPurposeProfile extends SlotUtilisationProfile {
  purpose: InteractionPurpose;
}

export interface SlotAnchorProfile extends SlotUtilisationProfile {
  anchorKind: InteractionAnchorKind;
  anchorId: number;
  purpose: InteractionPurpose;
}

export interface InterventionChangeProfile {
  kind: InterventionChangeKind;
  count: number;
}

export interface ActivityMilestones {
  firstGroupTick: number | null;
  firstStorageSiteTick: number | null;
  firstStorageTick: number | null;
  firstTheftTick: number | null;
  firstConflictTick: number | null;
  firstRecoveryTick: number | null;
  firstInterventionTick: number | null;
  firstInterventionResponseTick: number | null;
}

export interface ActivityProfile {
  schemaVersion: typeof ACTIVITY_PROFILE_SCHEMA_VERSION;
  seed: number;
  window: {
    startTick: number;
    endTick: number;
    observedTicks: number;
    sampledStates: number;
    sampleEveryTicks: typeof ACTIVITY_SAMPLE_EVERY_TICKS;
    ticksPerSecond: number;
  };
  actions: {
    completedActions: number;
    byKind: ActionCountProfile[];
    byCreature: CreatureActionProfile[];
    transitions: ActionTransitionProfile[];
  };
  movement: {
    distanceFixedUnits: number;
    distanceTiles: number;
    fixedUnitsPerSimulatedMinute: number;
    byCreature: CreatureMovementProfile[];
  };
  spatial: {
    occupiedTiles: NumericDistribution;
    crowding: {
      creaturesPerMostCrowdedTile: NumericDistribution;
      maximumCreaturesPerTile: number;
      creaturesPerMostCrowdedInteractionAnchor: NumericDistribution;
      maximumCreaturesPerInteractionAnchor: number;
    };
    exactOverlap: {
      overlappingCreatureTicks: number;
      livingCreatureTicks: number;
      rate: number;
      overlapGroups: number;
      maximumConsecutiveTicks: number;
    };
    slots: SlotUtilisationProfile & {
      byPurpose: SlotPurposeProfile[];
      byAnchor: SlotAnchorProfile[];
      contentionCount: number;
      failedClaimCount: number;
    };
  };
  interactions: {
    count: number;
    per1_000Ticks: number;
    byType: InteractionCountProfile[];
  };
  significantEvents: {
    tiers: typeof SIGNIFICANT_EVENT_TIERS;
    count: number;
    per1_000Ticks: number;
    intervals: NumericDistribution;
    trailingSilenceTicks: number;
    byType: Array<{ type: DomainEventType; count: number }>;
  };
  interventionResponses: {
    windowTicks: typeof INTERVENTION_RESPONSE_WINDOW_TICKS;
    changes: number;
    respondingCreatures: number;
    firstResponseTick: number | null;
    byKind: InterventionChangeProfile[];
  };
  milestones: ActivityMilestones;
}

export interface ActivityProfileAggregate {
  runCount: number;
  totalObservedTicks: number;
  completedActions: number;
  actionShares: ActionCountProfile[];
  movementDistanceFixedUnits: number;
  interactionCount: number;
  significantEventCount: number;
  claimedSlotTicks: number;
  capacitySlotTicks: number;
  slotUtilisation: number;
  contentionCount: number;
  failedClaimCount: number;
  interventionResponseChanges: number;
  seedDistributions: {
    keepShare: NumericDistribution;
    occupiedTileMedian: NumericDistribution;
    exactOverlapRate: NumericDistribution;
    maximumTileCrowding: NumericDistribution;
    maximumInteractionAnchorCrowding: NumericDistribution;
    movementPerSimulatedMinute: NumericDistribution;
    interactionsPer1_000Ticks: NumericDistribution;
    significantEventsPer1_000Ticks: NumericDistribution;
    trailingSilenceTicks: NumericDistribution;
    slotUtilisation: NumericDistribution;
    saturatedAnchorPurposeTicks: NumericDistribution;
    interventionResponseChanges: NumericDistribution;
  };
  warnings: string[];
}

interface TransitionAccumulator {
  from: ActionKind | null;
  to: ActionKind;
  count: number;
  totalDwellTicks: number;
}

interface CreatureAccumulator {
  id: number;
  name: string;
  alive: boolean;
  x: number;
  y: number;
  desire: DesireKind | null;
  planSignature: string | null;
  hasSelectedIntent: boolean;
  lastSelectedAction: ActionKind | null;
  lastSelectedTargetTileIndex: number | null;
  activeActionLineage: string | null;
  activeActionRoute: string | null;
  activeActionNavigationRevision: number | null;
  lastActionCounts: Record<ActionKind, number>;
  completedActionCounts: Record<ActionKind, number>;
  lastCompletedAction: ActionKind | null;
  lastCompletionTick: number;
  movementDistance: number;
}

interface SlotAccumulator {
  sampledAnchorPurposeTicks: number;
  claimedSlotTicks: number;
  availableSlotTicks: number;
  capacitySlotTicks: number;
  saturatedAnchorPurposeTicks: number;
}

interface SlotAnchorAccumulator extends SlotAccumulator {
  anchorKind: InteractionAnchorKind;
  anchorId: number;
  purpose: InteractionPurpose;
}

interface AppliedIntervention {
  eventId: number;
  tick: number;
  targetEntityIds: number[];
}

interface ClaimedAnchorPurpose {
  anchorKind: InteractionAnchorKind;
  anchorId: number;
  purpose: InteractionPurpose;
  anchorTileIndex: number;
  action: ActionKind;
  claimed: number;
}

const actionOrder = new Map<ActionKind, number>(
  ACTION_KINDS.map((kind, index) => [kind, index]),
);
const interactionEventTypes = new Set<DomainEventType>(INTERACTION_EVENT_TYPES);
const significantEventTiers = new Set<AttentionTier>(SIGNIFICANT_EVENT_TIERS);
const interactionPurposeOrder = new Map<InteractionPurpose, number>(
  INTERACTION_PURPOSES.map((purpose, index) => [purpose, index]),
);
const interactionAnchorKindOrder = new Map<InteractionAnchorKind, number>(
  (["RESOURCE", "STRUCTURE", "GROUP_HOME", "CREATURE", "TILE"] as const).map(
    (kind, index) => [kind, index],
  ),
);

function round(value: number, decimalPlaces = 6): number {
  const scale = 10 ** decimalPlaces;
  return Math.round(value * scale) / scale;
}

function rate(count: number, ticks: number, scale: number): number {
  return ticks === 0 ? 0 : round((count * scale) / ticks);
}

function emptyActionCounts(): Record<ActionKind, number> {
  return Object.fromEntries(ACTION_KINDS.map((kind) => [kind, 0])) as Record<
    ActionKind,
    number
  >;
}

function copyActionCounts(creature: CreatureState): Record<ActionKind, number> {
  return Object.fromEntries(
    ACTION_KINDS.map((kind) => [kind, creature.actionCounts[kind]]),
  ) as Record<ActionKind, number>;
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

class DistributionAccumulator {
  private readonly frequencies = new Map<number, number>();
  private sampleCount = 0;
  private total = 0;
  private minimum: number | null = null;
  private maximum: number | null = null;

  add(value: number): void {
    if (!Number.isFinite(value)) {
      throw new RangeError("Distribution samples must be finite numbers.");
    }
    this.sampleCount += 1;
    this.total += value;
    this.minimum = this.minimum === null ? value : Math.min(this.minimum, value);
    this.maximum = this.maximum === null ? value : Math.max(this.maximum, value);
    this.frequencies.set(value, (this.frequencies.get(value) ?? 0) + 1);
  }

  report(): NumericDistribution {
    if (this.sampleCount === 0) {
      return {
        samples: 0,
        min: null,
        p10: null,
        median: null,
        p90: null,
        max: null,
        mean: null,
      };
    }

    return {
      samples: this.sampleCount,
      min: this.minimum,
      p10: this.percentile(0.1),
      median: this.percentile(0.5),
      p90: this.percentile(0.9),
      max: this.maximum,
      mean: round(this.total / this.sampleCount),
    };
  }

  private percentile(fraction: number): number {
    const rank = Math.max(1, Math.ceil(fraction * this.sampleCount));
    let visited = 0;
    for (const [value, count] of [...this.frequencies.entries()].sort(
      ([left], [right]) => left - right,
    )) {
      visited += count;
      if (visited >= rank) return value;
    }
    throw new Error("Distribution percentile could not be resolved.");
  }
}

function summarize(values: readonly number[]): NumericDistribution {
  const accumulator = new DistributionAccumulator();
  for (const value of values) accumulator.add(value);
  return accumulator.report();
}

function transitionKey(from: ActionKind | null, to: ActionKind): string {
  return `${from ?? "NONE"}->${to}`;
}

function initialCreatureAccumulator(
  creature: CreatureState,
  tick: number,
): CreatureAccumulator {
  const action = creature.activeAction;
  return {
    id: creature.id,
    name: creature.name,
    alive: creature.alive,
    x: creature.x,
    y: creature.y,
    desire: creature.activeDesire?.kind ?? null,
    planSignature: activePlanSignature(creature),
    hasSelectedIntent: creature.activeGoal !== null,
    lastSelectedAction: creature.activeGoal?.kind ?? null,
    lastSelectedTargetTileIndex: creature.activeGoal?.targetTileIndex ?? null,
    activeActionLineage: activeActionLineage(creature),
    activeActionRoute: action ? action.path.join(",") : null,
    activeActionNavigationRevision: action?.navigationRevision ?? null,
    lastActionCounts: copyActionCounts(creature),
    completedActionCounts: emptyActionCounts(),
    lastCompletedAction: null,
    lastCompletionTick: tick,
    movementDistance: 0,
  };
}

function emptySlotAccumulator(): SlotAccumulator {
  return {
    sampledAnchorPurposeTicks: 0,
    claimedSlotTicks: 0,
    availableSlotTicks: 0,
    capacitySlotTicks: 0,
    saturatedAnchorPurposeTicks: 0,
  };
}

function activePlanSignature(creature: CreatureState): string | null {
  const plan = creature.activePlan;
  return plan
    ? `${plan.kind}:${plan.desireKind}:${plan.targetEntityId ?? "NONE"}:${plan.targetTileIndex ?? "NONE"}`
    : null;
}

function activeActionLineage(creature: CreatureState): string | null {
  const action = creature.activeAction;
  return action
    ? `${action.kind}:${action.startedAtTick}:${action.targetEntityId ?? "NONE"}:${action.targetTileIndex ?? "NONE"}`
    : null;
}

function slotUtilisation(accumulator: SlotAccumulator): SlotUtilisationProfile {
  return {
    ...accumulator,
    utilisation:
      accumulator.capacitySlotTicks === 0
        ? 0
        : round(accumulator.claimedSlotTicks / accumulator.capacitySlotTicks),
  };
}

function selectedCandidate(record: DecisionRecord): DecisionCandidate | null {
  return (
    record.candidates.find(
      (candidate) =>
        candidate.action === record.selectedAction &&
        candidate.desire === record.selectedDesire &&
        candidate.plan === record.selectedPlan &&
        candidate.targetEntityId === record.selectedTargetId,
    ) ?? null
  );
}

function interactionAnchorTileIndex(
  state: SimulationState,
  claim: InteractionClaim,
): number {
  const tileIndex =
    claim.anchorId < 0
      ? -claim.anchorId - 1
      : claim.anchorKind === "RESOURCE"
        ? state.resourceNodes.find((node) => node.id === claim.anchorId)?.tileIndex
        : claim.anchorKind === "STRUCTURE"
          ? state.structures.find((structure) => structure.id === claim.anchorId)?.tileIndex
          : claim.anchorKind === "GROUP_HOME"
            ? state.groups.find((group) => group.id === claim.anchorId)?.homeTileIndex
            : claim.anchorKind === "CREATURE"
              ? state.creatures.find((creature) => creature.id === claim.anchorId)
                  ?.tileIndex
              : -claim.anchorId - 1;
  if (tileIndex === undefined || tileIndex < 0 || !state.world.tiles[tileIndex]) {
    throw new Error(
      `Interaction claim anchor ${claim.anchorKind}:${claim.anchorId} has no authoritative tile.`,
    );
  }
  return tileIndex;
}

function addSlotObservation(
  accumulator: SlotAccumulator,
  claimed: number,
  available: number,
): void {
  accumulator.sampledAnchorPurposeTicks += 1;
  accumulator.claimedSlotTicks += claimed;
  accumulator.availableSlotTicks += available;
  accumulator.capacitySlotTicks += claimed + available;
  if (available === 0) accumulator.saturatedAnchorPurposeTicks += 1;
}

function firstTick(current: number | null, candidate: number): number {
  return current === null ? candidate : Math.min(current, candidate);
}

function actionShare(kind: ActionKind, count: number, total: number): ActionCountProfile {
  return {
    kind,
    count,
    share: total === 0 ? 0 : round(count / total),
  };
}

export class StreamingActivityCollector {
  private readonly seed: number;
  private readonly startTick: number;
  private readonly ticksPerSecond: number;
  private lastObservedTick: number;
  private lastSeenEventId: number;
  private sampledStates = 0;
  private completedActions = 0;
  private movementDistance = 0;
  private overlappingCreatureTicks = 0;
  private livingCreatureTicks = 0;
  private overlapGroups = 0;
  private maximumOverlapStreak = 0;
  private interactionCount = 0;
  private significantEventCount = 0;
  private readonly initialInteractionContentions: number;
  private readonly initialFailedInteractionClaims: number;
  private lastInteractionContentions: number;
  private lastFailedInteractionClaims: number;
  private lastSignificantEventTick: number | null = null;
  private readonly creatures = new Map<number, CreatureAccumulator>();
  private readonly totalActionCounts = emptyActionCounts();
  private readonly transitions = new Map<string, TransitionAccumulator>();
  private readonly occupiedTiles = new DistributionAccumulator();
  private readonly maximumTileCrowding = new DistributionAccumulator();
  private readonly maximumInteractionAnchorCrowding = new DistributionAccumulator();
  private readonly totalSlotUtilisation = emptySlotAccumulator();
  private readonly slotsByPurpose = new Map<InteractionPurpose, SlotAccumulator>(
    INTERACTION_PURPOSES.map((purpose) => [purpose, emptySlotAccumulator()]),
  );
  private readonly slotsByAnchor = new Map<string, SlotAnchorAccumulator>();
  private overlapStreaks = new Map<string, number>();
  private readonly interactionCounts = new Map<InteractionEventType, number>(
    INTERACTION_EVENT_TYPES.map((type) => [type, 0]),
  );
  private readonly significantEventIntervals = new DistributionAccumulator();
  private readonly significantEventCounts = new Map<DomainEventType, number>();
  private readonly damagedHealthByCreature = new Map<number, number>();
  private readonly appliedInterventions = new Map<number, AppliedIntervention>();
  private readonly interventionChangeCounts = new Map<InterventionChangeKind, number>(
    INTERVENTION_CHANGE_KINDS.map((kind) => [kind, 0]),
  );
  private readonly interventionRespondingCreatureIds = new Set<number>();
  private interventionResponseChanges = 0;
  private readonly milestones: ActivityMilestones = {
    firstGroupTick: null,
    firstStorageSiteTick: null,
    firstStorageTick: null,
    firstTheftTick: null,
    firstConflictTick: null,
    firstRecoveryTick: null,
    firstInterventionTick: null,
    firstInterventionResponseTick: null,
  };

  constructor(initialState: SimulationState) {
    this.seed = initialState.seed;
    this.startTick = initialState.tick;
    this.lastObservedTick = initialState.tick;
    this.ticksPerSecond = initialState.configuration.ticksPerSecond;
    this.lastSeenEventId = initialState.nextEventId - 1;
    this.initialInteractionContentions = initialState.metrics.interactionContentions;
    this.initialFailedInteractionClaims = initialState.metrics.failedInteractionClaims;
    this.lastInteractionContentions = initialState.metrics.interactionContentions;
    this.lastFailedInteractionClaims = initialState.metrics.failedInteractionClaims;
    for (const creature of initialState.creatures) {
      this.creatures.set(
        creature.id,
        initialCreatureAccumulator(creature, initialState.tick),
      );
    }
    for (const event of initialState.domainEvents) {
      this.registerAppliedIntervention(event);
    }
    this.pruneAppliedInterventions(initialState.tick);
    this.observeSpatial(initialState);
  }

  observe(state: SimulationState): void {
    if (state.seed !== this.seed) {
      throw new Error(
        `Activity collector seed changed from ${this.seed} to ${state.seed}.`,
      );
    }
    if (state.tick !== this.lastObservedTick + ACTIVITY_SAMPLE_EVERY_TICKS) {
      throw new Error(
        `Activity collector expected tick ${this.lastObservedTick + ACTIVITY_SAMPLE_EVERY_TICKS}, received ${state.tick}.`,
      );
    }
    if (state.configuration.ticksPerSecond !== this.ticksPerSecond) {
      throw new Error("Activity collector ticks-per-second changed inside one window.");
    }
    if (
      state.metrics.interactionContentions < this.lastInteractionContentions ||
      state.metrics.failedInteractionClaims < this.lastFailedInteractionClaims
    ) {
      throw new Error("Interaction claim metrics decreased inside one profile window.");
    }
    this.lastInteractionContentions = state.metrics.interactionContentions;
    this.lastFailedInteractionClaims = state.metrics.failedInteractionClaims;

    const events = this.newEvents(state);
    for (const event of events) this.registerAppliedIntervention(event);
    this.observeInterventionChanges(state, events);
    this.observeInterventionReroutes(state, events);
    this.observeCreatures(state);
    for (const event of events) this.observeEvent(state, event);
    this.observeRecovery(state);
    this.observeSpatial(state);
    this.pruneAppliedInterventions(state.tick);
    this.lastObservedTick = state.tick;
  }

  report(): ActivityProfile {
    const observedTicks = this.lastObservedTick - this.startTick;
    const simulatedMinutes =
      observedTicks === 0 ? 0 : observedTicks / this.ticksPerSecond / 60;
    const byCreature = [...this.creatures.values()]
      .sort((left, right) => left.id - right.id)
      .map((creature): CreatureActionProfile => {
        const completed = ACTION_KINDS.reduce(
          (total, kind) => total + creature.completedActionCounts[kind],
          0,
        );
        return {
          creatureId: creature.id,
          name: creature.name,
          completedActions: completed,
          byKind: ACTION_KINDS.map((kind) =>
            actionShare(kind, creature.completedActionCounts[kind], completed),
          ),
        };
      });
    const movementByCreature = [...this.creatures.values()]
      .sort((left, right) => left.id - right.id)
      .map((creature): CreatureMovementProfile => ({
        creatureId: creature.id,
        name: creature.name,
        distanceFixedUnits: creature.movementDistance,
        distanceTiles: round(creature.movementDistance / TILE_FIXED_UNITS),
        fixedUnitsPerSimulatedMinute:
          simulatedMinutes === 0 ? 0 : round(creature.movementDistance / simulatedMinutes),
      }));
    const transitions = [...this.transitions.values()]
      .sort(
        (left, right) =>
          (left.from === null ? -1 : (actionOrder.get(left.from) ?? 0)) -
            (right.from === null ? -1 : (actionOrder.get(right.from) ?? 0)) ||
          (actionOrder.get(left.to) ?? 0) - (actionOrder.get(right.to) ?? 0),
      )
      .map((transition): ActionTransitionProfile => ({
        from: transition.from,
        to: transition.to,
        count: transition.count,
        totalDwellTicks: transition.totalDwellTicks,
        meanDwellTicks: round(transition.totalDwellTicks / transition.count),
      }));
    const significantByType = [...this.significantEventCounts.entries()]
      .sort(([left], [right]) => compareText(left, right))
      .map(([type, count]) => ({ type, count }));
    const tileCrowding = this.maximumTileCrowding.report();
    const anchorCrowding = this.maximumInteractionAnchorCrowding.report();
    const slots = slotUtilisation(this.totalSlotUtilisation);
    const slotsByPurpose = INTERACTION_PURPOSES.map((purpose): SlotPurposeProfile => ({
      purpose,
      ...slotUtilisation(this.slotsByPurpose.get(purpose) ?? emptySlotAccumulator()),
    }));
    const slotsByAnchor = [...this.slotsByAnchor.values()]
      .sort(
        (left, right) =>
          (interactionAnchorKindOrder.get(left.anchorKind) ?? 0) -
            (interactionAnchorKindOrder.get(right.anchorKind) ?? 0) ||
          left.anchorId - right.anchorId ||
          (interactionPurposeOrder.get(left.purpose) ?? 0) -
            (interactionPurposeOrder.get(right.purpose) ?? 0),
      )
      .map((anchor): SlotAnchorProfile => ({
        anchorKind: anchor.anchorKind,
        anchorId: anchor.anchorId,
        purpose: anchor.purpose,
        ...slotUtilisation(anchor),
      }));

    return {
      schemaVersion: ACTIVITY_PROFILE_SCHEMA_VERSION,
      seed: this.seed,
      window: {
        startTick: this.startTick,
        endTick: this.lastObservedTick,
        observedTicks,
        sampledStates: this.sampledStates,
        sampleEveryTicks: ACTIVITY_SAMPLE_EVERY_TICKS,
        ticksPerSecond: this.ticksPerSecond,
      },
      actions: {
        completedActions: this.completedActions,
        byKind: ACTION_KINDS.map((kind) =>
          actionShare(kind, this.totalActionCounts[kind], this.completedActions),
        ),
        byCreature,
        transitions,
      },
      movement: {
        distanceFixedUnits: this.movementDistance,
        distanceTiles: round(this.movementDistance / TILE_FIXED_UNITS),
        fixedUnitsPerSimulatedMinute:
          simulatedMinutes === 0 ? 0 : round(this.movementDistance / simulatedMinutes),
        byCreature: movementByCreature,
      },
      spatial: {
        occupiedTiles: this.occupiedTiles.report(),
        crowding: {
          creaturesPerMostCrowdedTile: tileCrowding,
          maximumCreaturesPerTile: tileCrowding.max ?? 0,
          creaturesPerMostCrowdedInteractionAnchor: anchorCrowding,
          maximumCreaturesPerInteractionAnchor: anchorCrowding.max ?? 0,
        },
        exactOverlap: {
          overlappingCreatureTicks: this.overlappingCreatureTicks,
          livingCreatureTicks: this.livingCreatureTicks,
          rate:
            this.livingCreatureTicks === 0
              ? 0
              : round(this.overlappingCreatureTicks / this.livingCreatureTicks),
          overlapGroups: this.overlapGroups,
          maximumConsecutiveTicks: this.maximumOverlapStreak,
        },
        slots: {
          ...slots,
          byPurpose: slotsByPurpose,
          byAnchor: slotsByAnchor,
          contentionCount:
            this.lastInteractionContentions - this.initialInteractionContentions,
          failedClaimCount:
            this.lastFailedInteractionClaims - this.initialFailedInteractionClaims,
        },
      },
      interactions: {
        count: this.interactionCount,
        per1_000Ticks: rate(this.interactionCount, observedTicks, 1_000),
        byType: INTERACTION_EVENT_TYPES.map((eventType) => ({
          eventType,
          count: this.interactionCounts.get(eventType) ?? 0,
          per1_000Ticks: rate(
            this.interactionCounts.get(eventType) ?? 0,
            observedTicks,
            1_000,
          ),
        })),
      },
      significantEvents: {
        tiers: SIGNIFICANT_EVENT_TIERS,
        count: this.significantEventCount,
        per1_000Ticks: rate(this.significantEventCount, observedTicks, 1_000),
        intervals: this.significantEventIntervals.report(),
        trailingSilenceTicks:
          this.lastSignificantEventTick === null
            ? observedTicks
            : Math.max(0, this.lastObservedTick - this.lastSignificantEventTick),
        byType: significantByType,
      },
      interventionResponses: {
        windowTicks: INTERVENTION_RESPONSE_WINDOW_TICKS,
        changes: this.interventionResponseChanges,
        respondingCreatures: this.interventionRespondingCreatureIds.size,
        firstResponseTick: this.milestones.firstInterventionResponseTick,
        byKind: INTERVENTION_CHANGE_KINDS.map((kind) => ({
          kind,
          count: this.interventionChangeCounts.get(kind) ?? 0,
        })),
      },
      milestones: { ...this.milestones },
    };
  }

  private observeCreatures(state: SimulationState): void {
    for (const creature of [...state.creatures].sort((left, right) => left.id - right.id)) {
      const existing = this.creatures.get(creature.id);
      if (!existing) {
        this.creatures.set(creature.id, initialCreatureAccumulator(creature, state.tick));
        continue;
      }

      if (existing.alive && creature.alive) {
        const distance =
          Math.abs(creature.x - existing.x) + Math.abs(creature.y - existing.y);
        existing.movementDistance += distance;
        this.movementDistance += distance;
      }
      existing.alive = creature.alive;
      existing.x = creature.x;
      existing.y = creature.y;
      existing.desire = creature.activeDesire?.kind ?? null;
      existing.planSignature = activePlanSignature(creature);
      existing.activeActionLineage = activeActionLineage(creature);
      existing.activeActionRoute = creature.activeAction
        ? creature.activeAction.path.join(",")
        : null;
      existing.activeActionNavigationRevision =
        creature.activeAction?.navigationRevision ?? null;

      let completionsThisTick = 0;
      let completedKind: ActionKind | null = null;
      for (const kind of ACTION_KINDS) {
        const previous = existing.lastActionCounts[kind];
        const current = creature.actionCounts[kind];
        const delta = current - previous;
        if (delta < 0) {
          throw new Error(
            `Action count ${kind} decreased for creature ${creature.id} inside one profile window.`,
          );
        }
        if (delta > 0) {
          completionsThisTick += delta;
          completedKind = kind;
          existing.completedActionCounts[kind] += delta;
          this.totalActionCounts[kind] += delta;
          this.completedActions += delta;
        }
        existing.lastActionCounts[kind] = current;
      }
      if (
        completionsThisTick > 1 ||
        (completionsThisTick === 1 && completedKind === null)
      ) {
        throw new Error(
          `Creature ${creature.id} completed ${completionsThisTick} actions in one sampled tick.`,
        );
      }
      if (completedKind !== null) {
        const completedAtTick = creature.lastActionTick;
        const key = transitionKey(existing.lastCompletedAction, completedKind);
        const transition = this.transitions.get(key) ?? {
          from: existing.lastCompletedAction,
          to: completedKind,
          count: 0,
          totalDwellTicks: 0,
        };
        transition.count += 1;
        transition.totalDwellTicks += Math.max(
          0,
          completedAtTick - existing.lastCompletionTick,
        );
        this.transitions.set(key, transition);
        existing.lastCompletedAction = completedKind;
        existing.lastCompletionTick = completedAtTick;
      }
    }
  }

  private newEvents(state: SimulationState): DomainEvent[] {
    const events: DomainEvent[] = [];
    for (let index = state.domainEvents.length - 1; index >= 0; index -= 1) {
      const event = state.domainEvents[index];
      if (!event || event.id <= this.lastSeenEventId) break;
      events.push(event);
    }
    events.reverse();
    for (const event of events) {
      this.lastSeenEventId = Math.max(this.lastSeenEventId, event.id);
    }
    this.lastSeenEventId = Math.max(this.lastSeenEventId, state.nextEventId - 1);
    return events;
  }

  private registerAppliedIntervention(event: DomainEvent): void {
    if (event.commandId === null || event.commandOutcome !== "APPLIED") return;
    this.appliedInterventions.set(event.id, {
      eventId: event.id,
      tick: event.tick,
      targetEntityIds: [...event.targetIds],
    });
  }

  private pruneAppliedInterventions(observedStateTick: number): void {
    const latestEventTick = Math.max(0, observedStateTick - 1);
    for (const [eventId, intervention] of this.appliedInterventions) {
      if (latestEventTick - intervention.tick > INTERVENTION_RESPONSE_WINDOW_TICKS) {
        this.appliedInterventions.delete(eventId);
      }
    }
  }

  private interventionLinked(event: DomainEvent, record: DecisionRecord): boolean {
    const candidate = selectedCandidate(record);
    const evidenceIds = new Set([
      ...event.causedByEventIds,
      ...(candidate?.factors.flatMap((factor) => [
        ...factor.evidenceEventIds,
        ...(factor.fact?.sourceEventIds ?? []),
      ]) ?? []),
    ]);
    for (const intervention of this.appliedInterventions.values()) {
      const elapsed = event.tick - intervention.tick;
      if (elapsed < 0 || elapsed > INTERVENTION_RESPONSE_WINDOW_TICKS) continue;
      if (evidenceIds.has(intervention.eventId)) return true;
      if (
        record.selectedTargetId !== null &&
        intervention.targetEntityIds.includes(record.selectedTargetId)
      ) {
        return true;
      }
    }
    return false;
  }

  private recordInterventionChange(
    kind: InterventionChangeKind,
    creatureId: number,
    tick: number,
  ): void {
    this.interventionChangeCounts.set(
      kind,
      (this.interventionChangeCounts.get(kind) ?? 0) + 1,
    );
    this.interventionResponseChanges += 1;
    this.interventionRespondingCreatureIds.add(creatureId);
    this.milestones.firstInterventionResponseTick = firstTick(
      this.milestones.firstInterventionResponseTick,
      tick,
    );
  }

  private observeInterventionChanges(
    state: SimulationState,
    events: readonly DomainEvent[],
  ): void {
    const decisions = new Map(
      state.decisionRecords.map((record) => [record.id, record] as const),
    );
    for (const event of events) {
      if (
        event.type !== "DESIRE_CHANGED" &&
        event.type !== "PLAN_CHANGED" &&
        event.type !== "ACTION_STARTED"
      ) {
        continue;
      }
      const record = event.decisionRecordIds
        .map((id) => decisions.get(id))
        .find((candidate) => candidate !== undefined);
      if (!record) continue;
      const creature = state.creatures.find((candidate) => candidate.id === record.actorId);
      const previous = this.creatures.get(record.actorId);
      if (!creature || !previous) continue;
      const linked = this.interventionLinked(event, record);

      if (
        linked &&
        event.type === "DESIRE_CHANGED" &&
        previous.desire !== null &&
        creature.activeDesire !== null &&
        previous.desire !== creature.activeDesire.kind
      ) {
        this.recordInterventionChange("RECONSIDERED_DESIRE", creature.id, event.tick);
      } else if (
        linked &&
        event.type === "PLAN_CHANGED" &&
        previous.planSignature !== null &&
        activePlanSignature(creature) !== null &&
        previous.planSignature !== activePlanSignature(creature)
      ) {
        this.recordInterventionChange("RECONSIDERED_PLAN", creature.id, event.tick);
      } else if (event.type === "ACTION_STARTED") {
        const candidate = selectedCandidate(record);
        if (linked && candidate && previous.hasSelectedIntent) {
          if (previous.lastSelectedAction !== candidate.action) {
            this.recordInterventionChange("CHANGED_ACTION", creature.id, event.tick);
          }
          if (previous.lastSelectedTargetTileIndex !== candidate.targetTileIndex) {
            this.recordInterventionChange("CHANGED_DESTINATION", creature.id, event.tick);
          }
        }
        if (candidate) {
          previous.hasSelectedIntent = true;
          previous.lastSelectedAction = candidate.action;
          previous.lastSelectedTargetTileIndex = candidate.targetTileIndex;
        }
      }
    }
  }

  private observeInterventionReroutes(
    state: SimulationState,
    events: readonly DomainEvent[],
  ): void {
    const obstacleTicks = events
      .filter(
        (event) =>
          event.type === "PLAYER_TOGGLED_OBSTACLE" &&
          event.commandId !== null &&
          event.commandOutcome === "APPLIED",
      )
      .map((event) => event.tick)
      .sort((left, right) => left - right);
    const responseTick = obstacleTicks[0];
    if (responseTick === undefined) return;
    for (const creature of [...state.creatures].sort((left, right) => left.id - right.id)) {
      const previous = this.creatures.get(creature.id);
      const action = creature.activeAction;
      if (!previous || !action) continue;
      const route = action.path.join(",");
      if (
        previous.activeActionLineage !== null &&
        previous.activeActionLineage === activeActionLineage(creature) &&
        previous.activeActionRoute !== null &&
        previous.activeActionRoute !== route &&
        previous.activeActionNavigationRevision !== null &&
        action.navigationRevision > previous.activeActionNavigationRevision
      ) {
        this.recordInterventionChange("REROUTED", creature.id, responseTick);
      }
    }
  }

  private observeEvent(state: SimulationState, event: DomainEvent): void {
    if (interactionEventTypes.has(event.type)) {
      const eventType = event.type as InteractionEventType;
      this.interactionCounts.set(
        eventType,
        (this.interactionCounts.get(eventType) ?? 0) + 1,
      );
      this.interactionCount += 1;
    }

    if (significantEventTiers.has(event.attentionTier)) {
      if (this.lastSignificantEventTick !== null) {
        this.significantEventIntervals.add(event.tick - this.lastSignificantEventTick);
      }
      this.lastSignificantEventTick = event.tick;
      this.significantEventCount += 1;
      this.significantEventCounts.set(
        event.type,
        (this.significantEventCounts.get(event.type) ?? 0) + 1,
      );
    }

    switch (event.type) {
      case "GROUP_FOUNDED":
        this.milestones.firstGroupTick = firstTick(
          this.milestones.firstGroupTick,
          event.tick,
        );
        break;
      case "STORAGE_SITE_STARTED":
        this.milestones.firstStorageSiteTick = firstTick(
          this.milestones.firstStorageSiteTick,
          event.tick,
        );
        break;
      case "STORAGE_COMPLETED":
        this.milestones.firstStorageTick = firstTick(
          this.milestones.firstStorageTick,
          event.tick,
        );
        break;
      case "THEFT_COMMITTED":
        this.milestones.firstTheftTick = firstTick(
          this.milestones.firstTheftTick,
          event.tick,
        );
        break;
      case "CREATURE_ATTACKED":
        this.milestones.firstConflictTick = firstTick(
          this.milestones.firstConflictTick,
          event.tick,
        );
        if (event.quantity > 0) {
          for (const id of event.targetIds) {
            const health = state.creatures.find((creature) => creature.id === id)?.health;
            if (health !== undefined) {
              this.damagedHealthByCreature.set(
                id,
                Math.min(this.damagedHealthByCreature.get(id) ?? health, health),
              );
            }
          }
        }
        break;
      case "PLAYER_ADDED_FOOD":
      case "PLAYER_REMOVED_FOOD":
      case "PLAYER_TOGGLED_OBSTACLE":
        this.milestones.firstInterventionTick = firstTick(
          this.milestones.firstInterventionTick,
          event.tick,
        );
        break;
      default:
        break;
    }
  }

  private observeRecovery(state: SimulationState): void {
    if (this.milestones.firstRecoveryTick !== null) return;
    for (const [id, damagedHealth] of [...this.damagedHealthByCreature.entries()].sort(
      ([left], [right]) => left - right,
    )) {
      const creature = state.creatures.find((candidate) => candidate.id === id);
      if (creature && creature.health > damagedHealth) {
        this.milestones.firstRecoveryTick = state.tick;
        return;
      }
    }
  }

  private observeSpatial(state: SimulationState): void {
    const living = state.creatures
      .filter((creature) => creature.alive)
      .sort((left, right) => left.id - right.id);
    const byTile = new Map<number, number>();
    const byInteractionAnchor = new Map<string, number>();
    const claimedAnchorPurposes = new Map<string, ClaimedAnchorPurpose>();
    const byCoordinate = new Map<string, number[]>();
    for (const creature of living) {
      byTile.set(creature.tileIndex, (byTile.get(creature.tileIndex) ?? 0) + 1);
      const action = creature.activeAction;
      const claim = action?.interactionClaim;
      if (action && claim) {
        if (interactionPurpose(action.kind) !== claim.purpose) {
          throw new Error(
            `Creature ${creature.id} claim purpose ${claim.purpose} does not match action ${action.kind}.`,
          );
        }
        const anchor = `${claim.anchorKind}:${claim.anchorId}:${claim.purpose}`;
        byInteractionAnchor.set(anchor, (byInteractionAnchor.get(anchor) ?? 0) + 1);
        const existing = claimedAnchorPurposes.get(anchor);
        if (existing) {
          existing.claimed += 1;
        } else {
          claimedAnchorPurposes.set(anchor, {
            anchorKind: claim.anchorKind,
            anchorId: claim.anchorId,
            purpose: claim.purpose,
            anchorTileIndex: interactionAnchorTileIndex(state, claim),
            action: action.kind,
            claimed: 1,
          });
        }
      }
      const coordinate = `${creature.x},${creature.y}`;
      const ids = byCoordinate.get(coordinate) ?? [];
      ids.push(creature.id);
      byCoordinate.set(coordinate, ids);
    }

    this.occupiedTiles.add(byTile.size);
    this.maximumTileCrowding.add(byTile.size === 0 ? 0 : Math.max(...byTile.values()));
    this.maximumInteractionAnchorCrowding.add(
      byInteractionAnchor.size === 0 ? 0 : Math.max(...byInteractionAnchor.values()),
    );
    for (const anchor of [...claimedAnchorPurposes.values()].sort(
      (left, right) =>
        (interactionAnchorKindOrder.get(left.anchorKind) ?? 0) -
          (interactionAnchorKindOrder.get(right.anchorKind) ?? 0) ||
        left.anchorId - right.anchorId ||
        (interactionPurposeOrder.get(left.purpose) ?? 0) -
          (interactionPurposeOrder.get(right.purpose) ?? 0),
    )) {
      const available = availableInteractionSlots(
        state,
        anchor.action,
        anchor.anchorId,
        anchor.anchorTileIndex,
      ).length;
      addSlotObservation(this.totalSlotUtilisation, anchor.claimed, available);
      const purposeAccumulator = this.slotsByPurpose.get(anchor.purpose);
      if (!purposeAccumulator) {
        throw new Error(`Unknown interaction purpose ${anchor.purpose}.`);
      }
      addSlotObservation(purposeAccumulator, anchor.claimed, available);
      const key = `${anchor.anchorKind}:${anchor.anchorId}:${anchor.purpose}`;
      let accumulator = this.slotsByAnchor.get(key);
      if (!accumulator) {
        accumulator = {
          anchorKind: anchor.anchorKind,
          anchorId: anchor.anchorId,
          purpose: anchor.purpose,
          ...emptySlotAccumulator(),
        };
        this.slotsByAnchor.set(key, accumulator);
      }
      addSlotObservation(accumulator, anchor.claimed, available);
    }
    this.livingCreatureTicks += living.length;
    const nextStreaks = new Map<string, number>();
    for (const ids of byCoordinate.values()) {
      if (ids.length < 2) continue;
      this.overlappingCreatureTicks += ids.length;
      this.overlapGroups += 1;
      for (let left = 0; left < ids.length; left += 1) {
        for (let right = left + 1; right < ids.length; right += 1) {
          const leftId = ids[left];
          const rightId = ids[right];
          if (leftId === undefined || rightId === undefined) continue;
          const pair = `${leftId}:${rightId}`;
          const streak = (this.overlapStreaks.get(pair) ?? 0) + 1;
          nextStreaks.set(pair, streak);
          this.maximumOverlapStreak = Math.max(this.maximumOverlapStreak, streak);
        }
      }
    }
    this.overlapStreaks = nextStreaks;
    this.sampledStates += 1;
  }
}

export function summarizeActivityProfiles(
  profiles: readonly ActivityProfile[],
): ActivityProfileAggregate {
  const totalObservedTicks = profiles.reduce(
    (total, profile) => total + profile.window.observedTicks,
    0,
  );
  const completedActions = profiles.reduce(
    (total, profile) => total + profile.actions.completedActions,
    0,
  );
  const actionCounts = emptyActionCounts();
  for (const profile of profiles) {
    for (const item of profile.actions.byKind) actionCounts[item.kind] += item.count;
  }
  const actionShares = ACTION_KINDS.map((kind) =>
    actionShare(kind, actionCounts[kind], completedActions),
  );
  const claimedSlotTicks = profiles.reduce(
    (total, profile) => total + profile.spatial.slots.claimedSlotTicks,
    0,
  );
  const capacitySlotTicks = profiles.reduce(
    (total, profile) => total + profile.spatial.slots.capacitySlotTicks,
    0,
  );
  const warnings: string[] = [];
  const keepShare = actionShares.find((item) => item.kind === "KEEP")?.share ?? 0;
  if (keepShare > 0.35) {
    warnings.push(`KEEP share ${keepShare} exceeds the 0.35 corpus target.`);
  }
  for (const profile of [...profiles].sort((left, right) => left.seed - right.seed)) {
    const seedKeepShare =
      profile.actions.byKind.find((item) => item.kind === "KEEP")?.share ?? 0;
    if (seedKeepShare > 0.5) {
      warnings.push(`Seed ${profile.seed} KEEP share ${seedKeepShare} exceeds 0.5.`);
    }
    const occupied = profile.spatial.occupiedTiles;
    if ((occupied.median ?? 0) < 4 || (occupied.p10 ?? 0) < 3) {
      warnings.push(
        `Seed ${profile.seed} occupied tiles are below target (median ${occupied.median ?? "n/a"}, p10 ${occupied.p10 ?? "n/a"}).`,
      );
    }
    if (profile.spatial.exactOverlap.rate >= 0.01) {
      warnings.push(
        `Seed ${profile.seed} exact-overlap rate ${profile.spatial.exactOverlap.rate} meets or exceeds 0.01.`,
      );
    }
  }

  return {
    runCount: profiles.length,
    totalObservedTicks,
    completedActions,
    actionShares,
    movementDistanceFixedUnits: profiles.reduce(
      (total, profile) => total + profile.movement.distanceFixedUnits,
      0,
    ),
    interactionCount: profiles.reduce(
      (total, profile) => total + profile.interactions.count,
      0,
    ),
    significantEventCount: profiles.reduce(
      (total, profile) => total + profile.significantEvents.count,
      0,
    ),
    claimedSlotTicks,
    capacitySlotTicks,
    slotUtilisation:
      capacitySlotTicks === 0 ? 0 : round(claimedSlotTicks / capacitySlotTicks),
    contentionCount: profiles.reduce(
      (total, profile) => total + profile.spatial.slots.contentionCount,
      0,
    ),
    failedClaimCount: profiles.reduce(
      (total, profile) => total + profile.spatial.slots.failedClaimCount,
      0,
    ),
    interventionResponseChanges: profiles.reduce(
      (total, profile) => total + profile.interventionResponses.changes,
      0,
    ),
    seedDistributions: {
      keepShare: summarize(
        profiles.map(
          (profile) =>
            profile.actions.byKind.find((item) => item.kind === "KEEP")?.share ?? 0,
        ),
      ),
      occupiedTileMedian: summarize(
        profiles.map((profile) => profile.spatial.occupiedTiles.median ?? 0),
      ),
      exactOverlapRate: summarize(
        profiles.map((profile) => profile.spatial.exactOverlap.rate),
      ),
      maximumTileCrowding: summarize(
        profiles.map((profile) => profile.spatial.crowding.maximumCreaturesPerTile),
      ),
      maximumInteractionAnchorCrowding: summarize(
        profiles.map(
          (profile) => profile.spatial.crowding.maximumCreaturesPerInteractionAnchor,
        ),
      ),
      movementPerSimulatedMinute: summarize(
        profiles.map((profile) => profile.movement.fixedUnitsPerSimulatedMinute),
      ),
      interactionsPer1_000Ticks: summarize(
        profiles.map((profile) => profile.interactions.per1_000Ticks),
      ),
      significantEventsPer1_000Ticks: summarize(
        profiles.map((profile) => profile.significantEvents.per1_000Ticks),
      ),
      trailingSilenceTicks: summarize(
        profiles.map((profile) => profile.significantEvents.trailingSilenceTicks),
      ),
      slotUtilisation: summarize(
        profiles.map((profile) => profile.spatial.slots.utilisation),
      ),
      saturatedAnchorPurposeTicks: summarize(
        profiles.map((profile) => profile.spatial.slots.saturatedAnchorPurposeTicks),
      ),
      interventionResponseChanges: summarize(
        profiles.map((profile) => profile.interventionResponses.changes),
      ),
    },
    warnings: warnings.sort(compareText),
  };
}
