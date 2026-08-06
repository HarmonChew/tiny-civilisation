import {
  availableInteractionSlots,
  cloneScenarioReference,
  compileScenario,
  findPath,
  findWeightedPath,
  interactionPurpose,
  manhattanDistance,
  sameScenarioReference,
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
  type RelationshipEdge,
  type ResourceKind,
  type SimulationState,
  type StorageStructureState,
} from "@tiny-civ/sim-core";

import {
  StreamingSettlementActivityCollector,
  summarizeSettlementProfiles,
  type SettlementActivityAggregate,
  type SettlementActivityProfile,
} from "./settlement-activity.js";

export const ACTIVITY_PROFILE_SCHEMA_VERSION = 5 as const;
export const ACTIVITY_SAMPLE_EVERY_TICKS = 1 as const;
export const SIGNIFICANT_EVENT_TIERS = [
  "SIGNIFICANT",
  "CRITICAL",
] as const satisfies readonly AttentionTier[];
export const INTERVENTION_RESPONSE_WINDOW_TICKS = 120 as const;
export const STALEMATE_WINDOW_TICKS = 1_000 as const;
export const STALEMATE_MAX_MOVEMENT_FIXED_UNITS_PER_LIVING_CREATURE_TICK =
  TILE_FIXED_UNITS / 32;
export const STALEMATE_MAX_ACTION_TRANSITIONS = 2 as const;
export const ACTION_DOMINANCE_WARNING_SHARE = 0.6 as const;
export const TRANSITION_DOMINANCE_WARNING_SHARE = 0.5 as const;
export const TRANSITION_REPETITION_WARNING_RATE = 0.5 as const;
export const CONCENTRATION_WARNING_SHARE = 0.6 as const;
export const CONCENTRATION_WARNING_MIN_SAMPLES = 10 as const;
export const SEVERE_THIRST_THRESHOLD = 8_000 as const;
export const CRITICAL_THIRST_THRESHOLD = 9_400 as const;

export const DESIRE_KINDS = [
  "RELIEVE_HUNGER",
  "RELIEVE_THIRST",
  "RECOVER_ENERGY",
  "SECURE_PROVISIONS",
  "PRESERVE_PRIVATE_RESERVE",
  "BELONG",
  "RECIPROCATE_OR_REPAIR",
  "PROTECT_PERSON_OR_GROUP",
  "AVOID_THREAT",
  "COMPLETE_SHARED_WORK",
] as const satisfies readonly DesireKind[];

export const DESIRE_FAMILIES = [
  "SURVIVAL",
  "PROVISIONING",
  "SOCIAL",
  "SAFETY",
  "SHARED_WORK",
] as const;

export type DesireFamily = (typeof DESIRE_FAMILIES)[number];

export const DESIRE_FAMILY_BY_KIND = {
  RELIEVE_HUNGER: "SURVIVAL",
  RELIEVE_THIRST: "SURVIVAL",
  RECOVER_ENERGY: "SURVIVAL",
  SECURE_PROVISIONS: "PROVISIONING",
  PRESERVE_PRIVATE_RESERVE: "PROVISIONING",
  BELONG: "SOCIAL",
  RECIPROCATE_OR_REPAIR: "SOCIAL",
  PROTECT_PERSON_OR_GROUP: "SAFETY",
  AVOID_THREAT: "SAFETY",
  COMPLETE_SHARED_WORK: "SHARED_WORK",
} as const satisfies Record<DesireKind, DesireFamily>;

export const RESOURCE_KINDS = [
  "FOOD",
  "MATERIAL",
  "WATER",
] as const satisfies readonly ResourceKind[];

export const ACTION_KINDS = [
  "EXPLORE",
  "GATHER_FOOD",
  "GATHER_MATERIAL",
  "GATHER_WATER",
  "EAT",
  "DRINK",
  "REST",
  "ESTABLISH_SHELTER_SITE",
  "BUILD_SHELTER",
  "REST_SHELTERED",
  "MAINTAIN_SHELTER",
  "SHARE",
  "SHARE_WATER",
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
  "WATER_SHARED",
  "MATERIAL_DEPOSITED",
  "STORAGE_SITE_STARTED",
  "STORAGE_COMPLETED",
  "SHELTER_SITE_SELECTED",
  "SHELTER_CONSTRUCTION_STARTED",
  "SHELTER_WORK_ADVANCED",
  "SHELTER_COMPLETED",
  "SHELTER_RESTED",
  "SHELTER_MAINTAINED",
  "SHELTER_CONDITION_LOW",
  "SHELTER_CONDITION_RECOVERED",
  "SHELTER_CROWDED",
  "SHELTER_GUEST_USED",
  "SHELTER_ABANDONED",
  "SHELTER_RELOCATED",
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
  "MAINTENANCE",
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

export const ACTIVITY_MILESTONE_KINDS = [
  "GROUP",
  "STORAGE_SITE",
  "STORAGE",
  "THEFT",
  "CONFLICT",
  "RECOVERY",
  "INTERVENTION",
  "INTERVENTION_RESPONSE",
] as const;

type InteractionEventType = (typeof INTERACTION_EVENT_TYPES)[number];
type InterventionChangeKind = (typeof INTERVENTION_CHANGE_KINDS)[number];
type InteractionAnchorKind = InteractionClaim["anchorKind"];
export type ActivityMilestoneKind = (typeof ACTIVITY_MILESTONE_KINDS)[number];

export interface NumericDistribution {
  samples: number;
  min: number | null;
  p10: number | null;
  median: number | null;
  p90: number | null;
  iqr: number | null;
  max: number | null;
  mean: number | null;
}

export interface WilsonInterval95 {
  confidence: 0.95;
  lower: number | null;
  upper: number | null;
}

export interface BinaryOutcomeAggregate {
  runs: number;
  occurrences: number;
  incidence: number | null;
  wilson95: WilsonInterval95;
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

export interface DominantActionProfile {
  kind: ActionKind;
  count: number;
  share: number;
}

export interface DominantTransitionProfile extends ActionTransitionProfile {
  share: number;
}

export interface ActionTransitionAnalysis {
  dominantAction: DominantActionProfile | null;
  totalTransitions: number;
  uniqueTransitions: number;
  dominantTransition: DominantTransitionProfile | null;
  repeatedTransitions: number;
  repetitionRate: number;
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

export interface MilestoneObservation {
  milestone: ActivityMilestoneKind;
  occurred: boolean;
  tick: number | null;
  elapsedTicks: number | null;
  rightCensored: boolean;
  censoringTick: number | null;
  observedDurationTicks: number;
}

export interface MilestoneAggregate {
  milestone: ActivityMilestoneKind;
  occurrence: BinaryOutcomeAggregate;
  timeToEventTicks: NumericDistribution;
  rightCensoredRuns: number;
  censoringDurationTicks: NumericDistribution;
}

export interface GroupPartitionProfile {
  groupId: number | null;
  memberIds: number[];
}

export interface GroupActivityProfile {
  horizon: {
    groupCount: number;
    groupedCreatureCount: number;
    ungroupedCreatureCount: number;
    membershipRate: number;
    partitions: GroupPartitionProfile[];
    ungroupedCreatureIds: number[];
    groupSizes: NumericDistribution;
    largestGroupSize: number;
    groupsWithLeader: number;
  };
  overWindow: {
    groupCount: NumericDistribution;
    groupedCreatureCount: NumericDistribution;
    membershipRate: NumericDistribution;
    groupSizes: NumericDistribution;
    groupedCreatureTicks: number;
    livingCreatureTicks: number;
    timeSpentGroupedRate: number;
    membershipChanges: number;
    partitionChanges: number;
    leaderChanges: number;
  };
}

export interface RelationshipComponentProfile {
  memberIds: number[];
  directedEdgeCount: number;
}

export interface RelationshipGraphProfile {
  vertexCount: number;
  directedEdgeCount: number;
  possibleDirectedEdges: number;
  density: number;
  components: RelationshipComponentProfile[];
  componentCount: number;
  componentSizes: NumericDistribution;
  connectedDyads: number;
  reciprocalDyads: number;
  reciprocatedDirectedEdges: number;
  reciprocity: number;
  mutualDyadRate: number;
  outDegree: NumericDistribution;
  inDegree: NumericDistribution;
  totalDegree: NumericDistribution;
  trust: NumericDistribution;
  rivalry: NumericDistribution;
  fear: NumericDistribution;
}

export interface CreatureDispersionProfile {
  creatureId: number;
  groupId: number | null;
  distanceFromPopulationCentroidTiles: number;
  distanceFromGroupCentroidTiles: number | null;
}

export interface GroupDispersionProfile {
  groupId: number;
  memberIds: number[];
  meanDistanceFromCentroidTiles: number;
  maximumDistanceFromCentroidTiles: number;
}

export interface RouteEdgeProfile {
  fromTileIndex: number;
  toTileIndex: number;
  traversals: number;
  share: number;
}

export interface RouteConcentrationProfile {
  traversals: number;
  uniqueDirectedEdges: number;
  dominantEdge: RouteEdgeProfile | null;
  dominantEdgeShare: number;
  top10PercentEdgeShare: number;
  herfindahlIndex: number;
  byEdge: RouteEdgeProfile[];
}

export interface UndirectedRouteEdgeProfile {
  fromTileIndex: number;
  toTileIndex: number;
  traversals: number;
  share: number;
}

export interface WaterRouteConcentrationProfile {
  traversals: number;
  uniqueUndirectedEdges: number;
  dominantEdge: UndirectedRouteEdgeProfile | null;
  dominantEdgeShare: number;
  herfindahlIndex: number;
  byEdge: UndirectedRouteEdgeProfile[];
}

export interface CreatureHydrationProfile {
  creatureId: number;
  name: string;
  livingCreatureTicks: number;
  thirstUnitTicks: number;
  meanThirst: number;
  severeThirstTicks: number;
  criticalThirstTicks: number;
  severeSpellCount: number;
  resolvedSevereSpellCount: number;
  longestSevereSpellTicks: number;
}

export interface WaterAccessPairProfile {
  creatureId: number;
  sourceId: number;
  weightedCost: number | null;
}

export interface HydrationActivityProfile {
  need: {
    severeThreshold: typeof SEVERE_THIRST_THRESHOLD;
    criticalThreshold: typeof CRITICAL_THIRST_THRESHOLD;
    livingCreatureTicks: number;
    thirstUnitTicks: number;
    meanThirst: number;
    severeThirstCreatureTicks: number;
    criticalThirstCreatureTicks: number;
    severeExposureRate: number;
    criticalExposureRate: number;
    severeSpellCount: number;
    resolvedSevereSpellCount: number;
    longestSevereSpellTicks: number;
    recoveryLatencyTicks: NumericDistribution;
    firstSevereTick: number | null;
    firstDrinkTick: number | null;
    firstRecoveryTick: number | null;
    byCreature: CreatureHydrationProfile[];
  };
  flow: {
    gatheredUnits: number;
    drunkUnits: number;
    sharedUnits: number;
    carriedWaterAtHorizon: number;
    carriedWaterUnitTicks: number;
    carryingCreatureTicks: number;
    donorIds: number[];
    recipientIds: number[];
    distinctDonors: number;
    distinctRecipients: number;
  };
  sources: {
    nodeCount: number;
    initialStock: number;
    stockAtHorizon: number;
    maximumStockAtHorizon: number;
    stockUnitTicks: number;
    capacityUnitTicks: number;
    utilization: number;
    depletedSourceTicks: number;
    anySourceDepletedTicks: number;
    depletionEvents: number;
    replenishedUnits: number;
    drainedUnits: number;
    gatherAttempts: number;
    blockedGatherAttempts: number;
    /** Authoritative gather attempts that encountered at least one occupied slot. */
    contendedGatherAttempts: number;
    /** Fully blocked attempts where every legal source slot was occupied. */
    blockedByContentionGatherAttempts: number;
    contentionRate: number;
    claimedSlotTicks: number;
    capacitySlotTicks: number;
    saturatedSourceTicks: number;
    selection: CategoricalConcentrationProfile;
  };
  access: {
    pairCount: number;
    reachablePairs: number;
    unreachablePairs: number;
    weightedCost: NumericDistribution;
    nearestSourceWeightedCostByCreature: NumericDistribution;
    byPair: WaterAccessPairProfile[];
  };
  routes: WaterRouteConcentrationProfile;
  interventionResponses: {
    windowTicks: typeof INTERVENTION_RESPONSE_WINDOW_TICKS;
    appliedWaterInterventions: number;
    interventionsWithResponse: number;
    firstResponseLatencyTicks: NumericDistribution;
  };
}

export interface SpatialDispersionProfile {
  creaturePairDistanceTiles: NumericDistribution;
  withinGroupPairDistanceTiles: NumericDistribution;
  groupHomeDistanceTiles: NumericDistribution;
  groupCentroidDistanceTiles: NumericDistribution;
  byCreatureAtHorizon: CreatureDispersionProfile[];
  byGroupAtHorizon: GroupDispersionProfile[];
}

export interface ResourceNodeHorizonFact {
  id: number;
  kind: ResourceKind;
  tileIndex: number;
  currentStock: number;
  maximumStock: number;
  stockRatio: number;
  nearestLivingCreatureDistanceTiles: number | null;
  nearestGroupHomeDistanceTiles: number | null;
  nearestGroupIds: number[];
}

export interface ResourceAccessHorizonFact {
  creatureId: number;
  kind: ResourceKind;
  nearestNodeIds: number[];
  distanceTiles: number | null;
  weightedCost: number | null;
}

export interface ResourceKindHorizonFact {
  kind: ResourceKind;
  nodeCount: number;
  currentStock: number;
  maximumStock: number;
  stockRatio: number;
}

export interface StorageHorizonFact {
  id: number;
  kind: "STORAGE" | "STORAGE_SITE";
  groupId: number;
  tileIndex: number;
  completedTick: number | null;
  food: number;
  material: number;
  water: number;
  capacity: number;
  fillRatio: number;
  constructionProgress: number;
}

export interface HorizonFactsProfile {
  tick: number;
  resources: {
    nodeCount: number;
    currentStock: number;
    maximumStock: number;
    stockRatio: number;
    carriedFood: number;
    carriedMaterial: number;
    carriedWater: number;
    groupedCarriedFood: number;
    groupedCarriedMaterial: number;
    groupedCarriedWater: number;
    ungroupedCarriedFood: number;
    ungroupedCarriedMaterial: number;
    ungroupedCarriedWater: number;
    constructionCommittedMaterial: number;
    byKind: ResourceKindHorizonFact[];
    nodes: ResourceNodeHorizonFact[];
    accessDistanceTiles: NumericDistribution;
    accessWeightedCost: NumericDistribution;
    unreachableCreatureResourceKinds: number;
    accessByCreatureAndKind: ResourceAccessHorizonFact[];
  };
  storage: {
    structureCount: number;
    completedStorageCount: number;
    storageSiteCount: number;
    food: number;
    material: number;
    water: number;
    capacity: number;
    fillRatio: number;
    structures: StorageHorizonFact[];
  };
}

export interface StalemateProfile {
  windowTicks: typeof STALEMATE_WINDOW_TICKS;
  observedWindowTicks: number;
  eligible: boolean;
  thresholds: {
    maximumMovementFixedUnitsPerLivingCreatureTick: typeof STALEMATE_MAX_MOVEMENT_FIXED_UNITS_PER_LIVING_CREATURE_TICK;
    maximumActionTransitions: typeof STALEMATE_MAX_ACTION_TRANSITIONS;
  };
  movementFixedUnits: number;
  livingCreatureTicks: number;
  movementFixedUnitsPerLivingCreatureTick: number;
  actionTransitions: number;
  uniqueActionTransitions: number;
  structuralSocialChanges: number;
  significantEvents: number;
  signals: {
    lowMovement: boolean;
    lowActionTransitions: boolean;
    noStructuralSocialChange: boolean;
    noSignificantEvents: boolean;
  };
  declared: boolean;
}

export interface CategoryCountProfile {
  category: string;
  count: number;
  share: number;
}

export interface CategoricalConcentrationProfile {
  samples: number;
  distinctCategories: number;
  dominantCategory: CategoryCountProfile | null;
  dominantShare: number;
  herfindahlIndex: number;
  byCategory: CategoryCountProfile[];
}

export interface SelectionDimensionProfile {
  starts: number;
  actions: CategoricalConcentrationProfile;
  actors: CategoricalConcentrationProfile;
  targets: CategoricalConcentrationProfile;
  targetLocations: CategoricalConcentrationProfile;
  originLocations: CategoricalConcentrationProfile;
  actorGroups: CategoricalConcentrationProfile;
}

export interface CreatureSelectionConcentrationProfile extends SelectionDimensionProfile {
  creatureId: number;
  name: string;
}

export interface ActionSelectionConcentrationProfile extends SelectionDimensionProfile {
  kind: ActionKind;
}

export interface SelectionConcentrationProfile {
  overall: SelectionDimensionProfile;
  byCreature: CreatureSelectionConcentrationProfile[];
  byAction: ActionSelectionConcentrationProfile[];
}

export interface DesireKindExposureProfile {
  kind: DesireKind;
  family: DesireFamily;
  exposureCreatureTicks: number;
  exposureRate: number;
  changesInto: number;
  changesOutOf: number;
  candidateEvaluations: number;
}

export interface DesireFamilyExposureProfile {
  family: DesireFamily;
  exposureCreatureTicks: number;
  exposureRate: number;
  changesInto: number;
  changesOutOf: number;
  candidateEvaluations: number;
}

export interface DesireActivityProfile {
  livingCreatureTicks: number;
  withoutActiveDesireCreatureTicks: number;
  kindChanges: number;
  familyChanges: number;
  changesToNoActiveDesire: number;
  byKind: DesireKindExposureProfile[];
  byFamily: DesireFamilyExposureProfile[];
}

export interface RegionCreatureExposureProfile {
  creatureId: number;
  livingCreatureTicks: number;
  exposureRate: number;
}

export interface ScenarioRegionActivityProfile {
  id: string;
  label: string;
  tileIndices: number[];
  initiallyReachable: boolean;
  occupiedTicks: number;
  livingCreatureTicks: number;
  occupancyExposureRate: number;
  byCreature: RegionCreatureExposureProfile[];
}

export interface ChokepointCreatureCrossingProfile {
  creatureId: number;
  tileTransitions: number;
  entries: number;
  exits: number;
  throughCrossings: number;
}

export interface ScenarioChokepointActivityProfile {
  id: string;
  label: string;
  tileIndices: number[];
  connects: [string, string];
  tileTransitions: number;
  entries: number;
  exits: number;
  throughCrossings: number;
  byCreature: ChokepointCreatureCrossingProfile[];
}

export interface ScenarioSpatialActivityProfile {
  observedTicks: number;
  livingCreatureTicks: number;
  regions: ScenarioRegionActivityProfile[];
  chokepoints: ScenarioChokepointActivityProfile[];
}

export interface ActivityDiagnosticProfile {
  decisionRecordsObserved: number;
  unobservedActions: ActionKind[];
  noCandidateActions: ActionKind[];
  unobservedDesires: DesireKind[];
  noCandidateDesires: DesireKind[];
  unobservedRegions: string[];
  initiallyUnreachableRegions: string[];
  warnings: string[];
  limitations: string[];
}

export interface ActivityProfile {
  schemaVersion: typeof ACTIVITY_PROFILE_SCHEMA_VERSION;
  scenario: SimulationState["scenario"];
  compiledMapHash: string;
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
    analysis: ActionTransitionAnalysis;
    selectionConcentration: SelectionConcentrationProfile;
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
    dispersion: SpatialDispersionProfile;
    routes: RouteConcentrationProfile;
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
  milestoneObservations: MilestoneObservation[];
  groups: GroupActivityProfile;
  relationships: RelationshipGraphProfile;
  horizon: HorizonFactsProfile;
  stalemate: StalemateProfile;
  desires: DesireActivityProfile;
  hydration: HydrationActivityProfile;
  settlement: SettlementActivityProfile;
  scenarioSpatial: ScenarioSpatialActivityProfile;
  diagnostics: ActivityDiagnosticProfile;
}

export interface ScenarioRegionActivityAggregate {
  id: string;
  label: string;
  initiallyReachable: BinaryOutcomeAggregate;
  occupancyExposureRate: NumericDistribution;
  occupiedTicks: NumericDistribution;
}

export interface ScenarioChokepointActivityAggregate {
  id: string;
  label: string;
  throughCrossings: NumericDistribution;
  entries: NumericDistribution;
  exits: NumericDistribution;
  tileTransitions: NumericDistribution;
}

export interface DesireFamilyActivityAggregate {
  family: DesireFamily;
  exposureRate: NumericDistribution;
  changesInto: NumericDistribution;
  changesOutOf: NumericDistribution;
}

export interface HydrationActivityAggregate {
  gatheredUnits: number;
  drunkUnits: number;
  sharedUnits: number;
  donorIds: number[];
  recipientIds: number[];
  seedDistributions: {
    meanThirst: NumericDistribution;
    severeExposureRate: NumericDistribution;
    criticalExposureRate: NumericDistribution;
    longestSevereSpellTicks: NumericDistribution;
    recoveryLatencyMedianTicks: NumericDistribution;
    carriedWaterAtHorizon: NumericDistribution;
    depletedSourceTicks: NumericDistribution;
    sourceUtilization: NumericDistribution;
    sourceSelectionHerfindahlIndex: NumericDistribution;
    gatherContentionRate: NumericDistribution;
    unreachableWaterAccessPairs: NumericDistribution;
    waterAccessWeightedCostMedian: NumericDistribution;
    waterRouteDominantEdgeShare: NumericDistribution;
    waterRouteHerfindahlIndex: NumericDistribution;
    waterInterventionResponseLatencyMedianTicks: NumericDistribution;
  };
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
    groupCount: NumericDistribution;
    groupedMembershipRate: NumericDistribution;
    largestGroupSize: NumericDistribution;
    relationshipComponentCount: NumericDistribution;
    relationshipDensity: NumericDistribution;
    relationshipReciprocity: NumericDistribution;
    relationshipTrustMedian: NumericDistribution;
    relationshipRivalryMedian: NumericDistribution;
    relationshipFearMedian: NumericDistribution;
    creaturePairDistanceMedian: NumericDistribution;
    withinGroupPairDistanceMedian: NumericDistribution;
    groupHomeDistanceMedian: NumericDistribution;
    routeDominantEdgeShare: NumericDistribution;
    routeHerfindahlIndex: NumericDistribution;
    resourceStockRatio: NumericDistribution;
    completedStorageCount: NumericDistribution;
    storedFood: NumericDistribution;
    storedMaterial: NumericDistribution;
    actionDominanceShare: NumericDistribution;
    transitionDominanceShare: NumericDistribution;
    transitionRepetitionRate: NumericDistribution;
    uniqueActionTransitions: NumericDistribution;
    stalemateMovementRate: NumericDistribution;
    stalemateActionTransitions: NumericDistribution;
    stalemateUniqueTransitions: NumericDistribution;
    stalemateStructuralSocialChanges: NumericDistribution;
    stalemateSignificantEvents: NumericDistribution;
    actionStartDominanceShare: NumericDistribution;
    targetDominanceShare: NumericDistribution;
    targetLocationDominanceShare: NumericDistribution;
    actorGroupDominanceShare: NumericDistribution;
    desireFamilyDominanceShare: NumericDistribution;
    totalChokepointThroughCrossings: NumericDistribution;
    unobservedRegionCount: NumericDistribution;
  };
  milestones: MilestoneAggregate[];
  stalemate: BinaryOutcomeAggregate;
  desires: DesireFamilyActivityAggregate[];
  scenarioSpatial: {
    regions: ScenarioRegionActivityAggregate[];
    chokepoints: ScenarioChokepointActivityAggregate[];
  };
  hydration: HydrationActivityAggregate;
  settlement: SettlementActivityAggregate;
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
  tileIndex: number;
  desire: DesireKind | null;
  planSignature: string | null;
  hasSelectedIntent: boolean;
  lastSelectedAction: ActionKind | null;
  lastSelectedTargetTileIndex: number | null;
  activeActionLineage: string | null;
  activeActionRoute: string | null;
  activeActionNavigationRevision: number | null;
  activeActionKind: ActionKind | null;
  lastActionCounts: Record<ActionKind, number>;
  completedActionCounts: Record<ActionKind, number>;
  lastCompletedAction: ActionKind | null;
  lastCompletionTick: number;
  movementDistance: number;
}

interface CreatureHydrationAccumulator {
  id: number;
  name: string;
  livingCreatureTicks: number;
  thirstUnitTicks: number;
  severeThirstTicks: number;
  criticalThirstTicks: number;
  severeAtLastObservation: boolean;
  currentSevereSpellTicks: number;
  severeSpellCount: number;
  resolvedSevereSpellCount: number;
  longestSevereSpellTicks: number;
}

interface WaterInterventionAccumulator extends AppliedIntervention {
  firstResponseTick: number | null;
}

interface StalemateTickSample {
  tick: number;
  movementFixedUnits: number;
  livingCreatureTicks: number;
  actionTransitions: number;
  transitionKeys: string[];
  structuralSocialChanges: number;
  significantEvents: number;
}

interface SelectionDimensionAccumulator {
  starts: number;
  actions: CategoricalAccumulator;
  actors: CategoricalAccumulator;
  targets: CategoricalAccumulator;
  targetLocations: CategoricalAccumulator;
  originLocations: CategoricalAccumulator;
  actorGroups: CategoricalAccumulator;
}

interface CompiledRegionAccumulator {
  id: string;
  label: string;
  tileIndices: number[];
  tileSet: Set<number>;
  initiallyReachable: boolean;
  occupiedTicks: number;
  livingCreatureTicks: number;
  byCreature: Map<number, number>;
}

interface ChokepointCrossingAccumulator {
  tileTransitions: number;
  entries: number;
  exits: number;
  throughCrossings: number;
}

interface CompiledChokepointAccumulator extends ChokepointCrossingAccumulator {
  id: string;
  label: string;
  tileIndices: number[];
  tileSet: Set<number>;
  connects: [string, string];
  byCreature: Map<number, ChokepointCrossingAccumulator>;
  pendingEntryRegionByCreature: Map<number, string>;
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
        iqr: null,
        max: null,
        mean: null,
      };
    }

    const p25 = this.percentile(0.25);
    const p75 = this.percentile(0.75);
    return {
      samples: this.sampleCount,
      min: this.minimum,
      p10: this.percentile(0.1),
      median: this.percentile(0.5),
      p90: this.percentile(0.9),
      iqr: round(p75 - p25),
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

function summarizePresent(values: readonly (number | null)[]): NumericDistribution {
  return summarize(values.filter((value): value is number => value !== null));
}

function wilsonOutcome(occurrences: number, runs: number): BinaryOutcomeAggregate {
  if (occurrences < 0 || runs < 0 || occurrences > runs) {
    throw new RangeError("Wilson interval counts must satisfy 0 <= occurrences <= runs.");
  }
  if (runs === 0) {
    return {
      runs,
      occurrences,
      incidence: null,
      wilson95: { confidence: 0.95, lower: null, upper: null },
    };
  }
  const z = 1.959963984540054;
  const zSquared = z * z;
  const proportion = occurrences / runs;
  const denominator = 1 + zSquared / runs;
  const centre = (proportion + zSquared / (2 * runs)) / denominator;
  const margin =
    (z / denominator) *
    Math.sqrt((proportion * (1 - proportion)) / runs + zSquared / (4 * runs * runs));
  return {
    runs,
    occurrences,
    incidence: round(proportion),
    wilson95: {
      confidence: 0.95,
      lower: round(Math.max(0, centre - margin)),
      upper: round(Math.min(1, centre + margin)),
    },
  };
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
    tileIndex: creature.tileIndex,
    desire: creature.activeDesire?.kind ?? null,
    planSignature: activePlanSignature(creature),
    hasSelectedIntent: creature.activeGoal !== null,
    lastSelectedAction: creature.activeGoal?.kind ?? null,
    lastSelectedTargetTileIndex: creature.activeGoal?.targetTileIndex ?? null,
    activeActionLineage: activeActionLineage(creature),
    activeActionRoute: action ? action.path.join(",") : null,
    activeActionNavigationRevision: action?.navigationRevision ?? null,
    activeActionKind: action?.kind ?? null,
    lastActionCounts: copyActionCounts(creature),
    completedActionCounts: emptyActionCounts(),
    lastCompletedAction: null,
    lastCompletionTick: tick,
    movementDistance: 0,
  };
}

function initialCreatureHydrationAccumulator(
  creature: CreatureState,
): CreatureHydrationAccumulator {
  const severe = creature.alive && creature.needs.thirst >= SEVERE_THIRST_THRESHOLD;
  return {
    id: creature.id,
    name: creature.name,
    livingCreatureTicks: 0,
    thirstUnitTicks: 0,
    severeThirstTicks: 0,
    criticalThirstTicks: 0,
    severeAtLastObservation: severe,
    currentSevereSpellTicks: 0,
    severeSpellCount: severe ? 1 : 0,
    resolvedSevereSpellCount: 0,
    longestSevereSpellTicks: 0,
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

function emptySelectionDimensionAccumulator(): SelectionDimensionAccumulator {
  return {
    starts: 0,
    actions: new CategoricalAccumulator(),
    actors: new CategoricalAccumulator(),
    targets: new CategoricalAccumulator(),
    targetLocations: new CategoricalAccumulator(),
    originLocations: new CategoricalAccumulator(),
    actorGroups: new CategoricalAccumulator(),
  };
}

function recordSelection(
  accumulator: SelectionDimensionAccumulator,
  selection: {
    action: ActionKind;
    actorId: number;
    targetEntityId: number | null;
    targetTileIndex: number | null;
    originTileIndex: number | null;
    actorGroupId: number | null;
  },
): void {
  accumulator.starts += 1;
  accumulator.actions.add(selection.action);
  accumulator.actors.add(`creature:${selection.actorId}`);
  accumulator.targets.add(
    selection.targetEntityId === null ? "NONE" : `entity:${selection.targetEntityId}`,
  );
  accumulator.targetLocations.add(
    selection.targetTileIndex === null ? "NONE" : `tile:${selection.targetTileIndex}`,
  );
  accumulator.originLocations.add(
    selection.originTileIndex === null ? "NONE" : `tile:${selection.originTileIndex}`,
  );
  accumulator.actorGroups.add(
    selection.actorGroupId === null ? "UNGROUPED" : `group:${selection.actorGroupId}`,
  );
}

function selectionDimensionProfile(
  accumulator: SelectionDimensionAccumulator,
): SelectionDimensionProfile {
  return {
    starts: accumulator.starts,
    actions: accumulator.actions.report(),
    actors: accumulator.actors.report(),
    targets: accumulator.targets.report(),
    targetLocations: accumulator.targetLocations.report(),
    originLocations: accumulator.originLocations.report(),
    actorGroups: accumulator.actorGroups.report(),
  };
}

function initialReachableTiles(
  world: SimulationState["world"],
  startTileIndices: readonly number[],
): Set<number> {
  const reachable = new Set<number>();
  const pending = startTileIndices
    .filter((tileIndex) => !world.tiles[tileIndex]?.blocked)
    .sort((left, right) => left - right);
  for (const tileIndex of pending) reachable.add(tileIndex);
  for (let cursor = 0; cursor < pending.length; cursor += 1) {
    const tileIndex = pending[cursor];
    if (tileIndex === undefined) continue;
    const x = tileIndex % world.width;
    const y = Math.floor(tileIndex / world.width);
    const neighbours = [
      y > 0 ? tileIndex - world.width : -1,
      x > 0 ? tileIndex - 1 : -1,
      x < world.width - 1 ? tileIndex + 1 : -1,
      y < world.height - 1 ? tileIndex + world.width : -1,
    ];
    for (const neighbour of neighbours) {
      if (neighbour < 0 || reachable.has(neighbour) || world.tiles[neighbour]?.blocked) {
        continue;
      }
      reachable.add(neighbour);
      pending.push(neighbour);
    }
  }
  return reachable;
}

function sameScenarioDefinition(
  left: SimulationState["scenario"],
  right: SimulationState["scenario"],
): boolean {
  return (
    left.kind === right.kind &&
    left.schemaVersion === right.schemaVersion &&
    left.behaviorVersion === right.behaviorVersion &&
    left.scenarioId === right.scenarioId &&
    left.scenarioVersion === right.scenarioVersion &&
    left.mapGenerationVersion === right.mapGenerationVersion
  );
}

const milestoneFields = {
  GROUP: "firstGroupTick",
  STORAGE_SITE: "firstStorageSiteTick",
  STORAGE: "firstStorageTick",
  THEFT: "firstTheftTick",
  CONFLICT: "firstConflictTick",
  RECOVERY: "firstRecoveryTick",
  INTERVENTION: "firstInterventionTick",
  INTERVENTION_RESPONSE: "firstInterventionResponseTick",
} as const satisfies Record<ActivityMilestoneKind, keyof ActivityMilestones>;

function milestoneObservationProfiles(
  milestones: ActivityMilestones,
  startTick: number,
  endTick: number,
): MilestoneObservation[] {
  return ACTIVITY_MILESTONE_KINDS.map((milestone) => {
    const tick = milestones[milestoneFields[milestone]];
    const elapsedTicks = tick === null ? null : Math.max(0, tick - startTick);
    return {
      milestone,
      occurred: tick !== null,
      tick,
      elapsedTicks,
      rightCensored: tick === null,
      censoringTick: tick === null ? endTick : null,
      observedDurationTicks:
        elapsedTicks === null ? Math.max(0, endTick - startTick) : elapsedTicks,
    };
  });
}

function livingCreatures(state: SimulationState): CreatureState[] {
  return state.creatures
    .filter((creature) => creature.alive)
    .sort((left, right) => left.id - right.id);
}

function groupHorizonProfile(state: SimulationState): GroupActivityProfile["horizon"] {
  const living = livingCreatures(state);
  const membersByGroup = new Map<number, number[]>();
  const ungroupedCreatureIds: number[] = [];
  for (const creature of living) {
    if (creature.groupId === null) {
      ungroupedCreatureIds.push(creature.id);
      continue;
    }
    const members = membersByGroup.get(creature.groupId) ?? [];
    members.push(creature.id);
    membersByGroup.set(creature.groupId, members);
  }
  const partitions = [...membersByGroup.entries()]
    .sort(([left], [right]) => left - right)
    .map(([groupId, memberIds]) => ({ groupId, memberIds }));
  const groupedCreatureCount = partitions.reduce(
    (total, partition) => total + partition.memberIds.length,
    0,
  );
  const groupSizes = summarize(partitions.map((partition) => partition.memberIds.length));
  const groupsById = new Map(state.groups.map((group) => [group.id, group] as const));
  return {
    groupCount: partitions.length,
    groupedCreatureCount,
    ungroupedCreatureCount: ungroupedCreatureIds.length,
    membershipRate: living.length === 0 ? 0 : round(groupedCreatureCount / living.length),
    partitions,
    ungroupedCreatureIds,
    groupSizes,
    largestGroupSize: groupSizes.max ?? 0,
    groupsWithLeader: partitions.filter((partition) => {
      const leaderId = groupsById.get(partition.groupId)?.leaderId ?? null;
      return leaderId !== null && partition.memberIds.includes(leaderId);
    }).length,
  };
}

function socialTopologySignature(state: SimulationState): string {
  const membership = livingCreatures(state)
    .map((creature) => `${creature.id}:${creature.groupId ?? "NONE"}`)
    .join(",");
  const structureKinds = new Map(
    state.structures.map((structure) => [structure.id, structure.kind] as const),
  );
  const groups = [...state.groups]
    .sort((left, right) => left.id - right.id)
    .map(
      (group) =>
        `${group.id}:${group.leaderId ?? "NONE"}:${group.stage}:${group.storageStructureId ?? "NONE"}:${
          group.storageStructureId === null
            ? "NONE"
            : (structureKinds.get(group.storageStructureId) ?? "MISSING")
        }`,
    )
    .join(",");
  const relationshipTopology = [...state.relationships]
    .filter((edge) => edge.fromId !== edge.toId)
    .map((edge) => `${edge.fromId}>${edge.toId}`)
    .sort(compareText)
    .join(",");
  return `${membership}|${groups}|${relationshipTopology}`;
}

function uniqueLivingRelationshipEdges(state: SimulationState): RelationshipEdge[] {
  const livingIds = new Set(livingCreatures(state).map((creature) => creature.id));
  const byPair = new Map<string, RelationshipEdge>();
  for (const edge of [...state.relationships].sort((left, right) => left.id - right.id)) {
    if (
      edge.fromId === edge.toId ||
      !livingIds.has(edge.fromId) ||
      !livingIds.has(edge.toId)
    ) {
      continue;
    }
    const key = `${edge.fromId}:${edge.toId}`;
    if (!byPair.has(key)) byPair.set(key, edge);
  }
  return [...byPair.values()].sort(
    (left, right) => left.fromId - right.fromId || left.toId - right.toId,
  );
}

function relationshipGraphProfile(state: SimulationState): RelationshipGraphProfile {
  const vertexIds = livingCreatures(state).map((creature) => creature.id);
  const edges = uniqueLivingRelationshipEdges(state);
  const adjacency = new Map(vertexIds.map((id) => [id, new Set<number>()] as const));
  const outDegrees = new Map<number, number>(vertexIds.map((id) => [id, 0]));
  const inDegrees = new Map<number, number>(vertexIds.map((id) => [id, 0]));
  const directedPairs = new Set<string>();
  for (const edge of edges) {
    adjacency.get(edge.fromId)?.add(edge.toId);
    adjacency.get(edge.toId)?.add(edge.fromId);
    outDegrees.set(edge.fromId, (outDegrees.get(edge.fromId) ?? 0) + 1);
    inDegrees.set(edge.toId, (inDegrees.get(edge.toId) ?? 0) + 1);
    directedPairs.add(`${edge.fromId}:${edge.toId}`);
  }

  const components: RelationshipComponentProfile[] = [];
  const visited = new Set<number>();
  for (const root of vertexIds) {
    if (visited.has(root)) continue;
    const pending = [root];
    const memberIds: number[] = [];
    visited.add(root);
    while (pending.length > 0) {
      const current = pending.shift();
      if (current === undefined) break;
      memberIds.push(current);
      for (const neighbour of [...(adjacency.get(current) ?? [])].sort(
        (left, right) => left - right,
      )) {
        if (visited.has(neighbour)) continue;
        visited.add(neighbour);
        pending.push(neighbour);
      }
    }
    memberIds.sort((left, right) => left - right);
    const memberSet = new Set(memberIds);
    components.push({
      memberIds,
      directedEdgeCount: edges.filter(
        (edge) => memberSet.has(edge.fromId) && memberSet.has(edge.toId),
      ).length,
    });
  }
  components.sort(
    (left, right) =>
      (left.memberIds[0] ?? 0) - (right.memberIds[0] ?? 0) ||
      left.memberIds.length - right.memberIds.length,
  );

  const dyads = new Set<string>();
  const reciprocalDyads = new Set<string>();
  let reciprocatedDirectedEdges = 0;
  for (const edge of edges) {
    const low = Math.min(edge.fromId, edge.toId);
    const high = Math.max(edge.fromId, edge.toId);
    const dyad = `${low}:${high}`;
    dyads.add(dyad);
    if (directedPairs.has(`${edge.toId}:${edge.fromId}`)) {
      reciprocalDyads.add(dyad);
      reciprocatedDirectedEdges += 1;
    }
  }
  const possibleDirectedEdges = vertexIds.length * Math.max(0, vertexIds.length - 1);
  return {
    vertexCount: vertexIds.length,
    directedEdgeCount: edges.length,
    possibleDirectedEdges,
    density: possibleDirectedEdges === 0 ? 0 : round(edges.length / possibleDirectedEdges),
    components,
    componentCount: components.length,
    componentSizes: summarize(components.map((component) => component.memberIds.length)),
    connectedDyads: dyads.size,
    reciprocalDyads: reciprocalDyads.size,
    reciprocatedDirectedEdges,
    reciprocity: edges.length === 0 ? 0 : round(reciprocatedDirectedEdges / edges.length),
    mutualDyadRate: dyads.size === 0 ? 0 : round(reciprocalDyads.size / dyads.size),
    outDegree: summarize(vertexIds.map((id) => outDegrees.get(id) ?? 0)),
    inDegree: summarize(vertexIds.map((id) => inDegrees.get(id) ?? 0)),
    totalDegree: summarize(
      vertexIds.map((id) => (outDegrees.get(id) ?? 0) + (inDegrees.get(id) ?? 0)),
    ),
    trust: summarize(edges.map((edge) => edge.trust)),
    rivalry: summarize(edges.map((edge) => edge.rivalry)),
    fear: summarize(edges.map((edge) => edge.fear)),
  };
}

function centroid(
  creatures: readonly Pick<CreatureState, "x" | "y">[],
): { x: number; y: number } | null {
  if (creatures.length === 0) return null;
  return {
    x: creatures.reduce((total, creature) => total + creature.x, 0) / creatures.length,
    y: creatures.reduce((total, creature) => total + creature.y, 0) / creatures.length,
  };
}

function fixedDistanceFromCentroidTiles(
  creature: Pick<CreatureState, "x" | "y">,
  centre: { x: number; y: number },
): number {
  return round(
    (Math.abs(creature.x - centre.x) + Math.abs(creature.y - centre.y)) / TILE_FIXED_UNITS,
  );
}

function horizonDispersion(
  state: SimulationState,
): Pick<SpatialDispersionProfile, "byCreatureAtHorizon" | "byGroupAtHorizon"> {
  const living = livingCreatures(state);
  const populationCentroid = centroid(living);
  const membersByGroup = new Map<number, CreatureState[]>();
  for (const creature of living) {
    if (creature.groupId === null) continue;
    const members = membersByGroup.get(creature.groupId) ?? [];
    members.push(creature);
    membersByGroup.set(creature.groupId, members);
  }
  const groupCentroids = new Map(
    [...membersByGroup.entries()].map(([groupId, members]) => [groupId, centroid(members)]),
  );
  const byCreatureAtHorizon = living.map((creature) => {
    const groupCentroid =
      creature.groupId === null ? null : (groupCentroids.get(creature.groupId) ?? null);
    return {
      creatureId: creature.id,
      groupId: creature.groupId,
      distanceFromPopulationCentroidTiles:
        populationCentroid === null
          ? 0
          : fixedDistanceFromCentroidTiles(creature, populationCentroid),
      distanceFromGroupCentroidTiles:
        groupCentroid === null
          ? null
          : fixedDistanceFromCentroidTiles(creature, groupCentroid),
    };
  });
  const byGroupAtHorizon = [...membersByGroup.entries()]
    .sort(([left], [right]) => left - right)
    .map(([groupId, members]) => {
      const centre = groupCentroids.get(groupId);
      const distances = centre
        ? members.map((member) => fixedDistanceFromCentroidTiles(member, centre))
        : [];
      return {
        groupId,
        memberIds: members.map((member) => member.id).sort((left, right) => left - right),
        meanDistanceFromCentroidTiles:
          distances.length === 0
            ? 0
            : round(
                distances.reduce((total, distance) => total + distance, 0) /
                  distances.length,
              ),
        maximumDistanceFromCentroidTiles:
          distances.length === 0 ? 0 : Math.max(...distances),
      };
    });
  return { byCreatureAtHorizon, byGroupAtHorizon };
}

function reachableDistance(
  state: SimulationState,
  fromTileIndex: number,
  toTileIndex: number,
): number | null {
  const path = findPath(state.world, fromTileIndex, toTileIndex);
  return path.length === 0 ? null : path.length - 1;
}

function resourceInteractionDistance(
  state: SimulationState,
  geometryState: SimulationState,
  fromTileIndex: number,
  node: SimulationState["resourceNodes"][number],
): number | null {
  const action: ActionKind =
    node.kind === "FOOD"
      ? "GATHER_FOOD"
      : node.kind === "MATERIAL"
        ? "GATHER_MATERIAL"
        : "GATHER_WATER";
  const distances = availableInteractionSlots(
    geometryState,
    action,
    node.id,
    node.tileIndex,
  )
    .map((slot) => reachableDistance(state, fromTileIndex, slot.tileIndex))
    .filter((distance): distance is number => distance !== null);
  return distances.length === 0 ? null : Math.min(...distances);
}

function resourceInteractionWeightedCost(
  state: SimulationState,
  geometryState: SimulationState,
  fromTileIndex: number,
  node: SimulationState["resourceNodes"][number],
): number | null {
  const action: ActionKind =
    node.kind === "FOOD"
      ? "GATHER_FOOD"
      : node.kind === "MATERIAL"
        ? "GATHER_MATERIAL"
        : "GATHER_WATER";
  const costs = availableInteractionSlots(geometryState, action, node.id, node.tileIndex)
    .map(
      (slot) => findWeightedPath(state.world, fromTileIndex, slot.tileIndex)?.cost ?? null,
    )
    .filter((cost): cost is number => cost !== null);
  return costs.length === 0 ? null : Math.min(...costs);
}

function horizonFacts(state: SimulationState): HorizonFactsProfile {
  const living = livingCreatures(state);
  const activeGroups = groupHorizonProfile(state).partitions;
  const geometryState: SimulationState = { ...state, creatures: [] };
  const accessByCreatureAndKind: ResourceAccessHorizonFact[] = [];
  const accessDistances = new DistributionAccumulator();
  const accessWeightedCosts = new DistributionAccumulator();
  for (const creature of living) {
    for (const kind of RESOURCE_KINDS) {
      const candidates = state.resourceNodes
        .filter((node) => node.kind === kind)
        .map((node) => ({
          nodeId: node.id,
          distance: resourceInteractionDistance(
            state,
            geometryState,
            creature.tileIndex,
            node,
          ),
          weightedCost: resourceInteractionWeightedCost(
            state,
            geometryState,
            creature.tileIndex,
            node,
          ),
        }))
        .filter(
          (
            candidate,
          ): candidate is { nodeId: number; distance: number; weightedCost: number } =>
            candidate.distance !== null && candidate.weightedCost !== null,
        )
        .sort(
          (left, right) =>
            left.weightedCost - right.weightedCost ||
            left.distance - right.distance ||
            left.nodeId - right.nodeId,
        );
      const nearestDistance = candidates[0]?.distance ?? null;
      const nearestWeightedCost = candidates[0]?.weightedCost ?? null;
      if (nearestDistance !== null) accessDistances.add(nearestDistance);
      if (nearestWeightedCost !== null) accessWeightedCosts.add(nearestWeightedCost);
      accessByCreatureAndKind.push({
        creatureId: creature.id,
        kind,
        nearestNodeIds: candidates
          .filter((candidate) => candidate.weightedCost === nearestWeightedCost)
          .map((candidate) => candidate.nodeId),
        distanceTiles: nearestDistance,
        weightedCost: nearestWeightedCost,
      });
    }
  }

  const nodes = [...state.resourceNodes]
    .sort((left, right) => left.id - right.id)
    .map((node): ResourceNodeHorizonFact => {
      const creatureDistances = living
        .map((creature) =>
          resourceInteractionDistance(state, geometryState, creature.tileIndex, node),
        )
        .filter((distance): distance is number => distance !== null);
      const groupDistances = activeGroups
        .map((partition) => {
          const group = state.groups.find(
            (candidate) => candidate.id === partition.groupId,
          );
          return group
            ? {
                groupId: partition.groupId,
                distance: resourceInteractionDistance(
                  state,
                  geometryState,
                  group.homeTileIndex,
                  node,
                ),
              }
            : null;
        })
        .filter(
          (candidate): candidate is { groupId: number; distance: number } =>
            candidate !== null && candidate.distance !== null,
        )
        .sort(
          (left, right) => left.distance - right.distance || left.groupId - right.groupId,
        );
      const nearestGroupDistance = groupDistances[0]?.distance ?? null;
      return {
        id: node.id,
        kind: node.kind,
        tileIndex: node.tileIndex,
        currentStock: node.currentStock,
        maximumStock: node.maximumStock,
        stockRatio:
          node.maximumStock === 0 ? 0 : round(node.currentStock / node.maximumStock),
        nearestLivingCreatureDistanceTiles:
          creatureDistances.length === 0 ? null : Math.min(...creatureDistances),
        nearestGroupHomeDistanceTiles: nearestGroupDistance,
        nearestGroupIds: groupDistances
          .filter((candidate) => candidate.distance === nearestGroupDistance)
          .map((candidate) => candidate.groupId),
      };
    });
  const byKind = RESOURCE_KINDS.map((kind): ResourceKindHorizonFact => {
    const matching = nodes.filter((node) => node.kind === kind);
    const currentStock = matching.reduce((total, node) => total + node.currentStock, 0);
    const maximumStock = matching.reduce((total, node) => total + node.maximumStock, 0);
    return {
      kind,
      nodeCount: matching.length,
      currentStock,
      maximumStock,
      stockRatio: maximumStock === 0 ? 0 : round(currentStock / maximumStock),
    };
  });
  const currentStock = nodes.reduce((total, node) => total + node.currentStock, 0);
  const maximumStock = nodes.reduce((total, node) => total + node.maximumStock, 0);

  const structures = state.structures
    .filter(
      (structure): structure is StorageStructureState =>
        structure.kind === "STORAGE" || structure.kind === "STORAGE_SITE",
    )
    .sort((left, right) => left.id - right.id)
    .map((structure): StorageHorizonFact => ({
      id: structure.id,
      kind: structure.kind,
      groupId: structure.groupId,
      tileIndex: structure.tileIndex,
      completedTick: structure.completedTick,
      food: structure.inventory.food,
      material: structure.inventory.material,
      water: structure.inventory.water,
      capacity: structure.inventory.capacity,
      fillRatio:
        structure.inventory.capacity === 0
          ? 0
          : round(
              (structure.inventory.food +
                structure.inventory.material +
                structure.inventory.water) /
                structure.inventory.capacity,
            ),
      constructionProgress: round(structure.progress / 10_000),
    }));
  const completedStructures = structures.filter(
    (structure) => structure.kind === "STORAGE",
  );
  const storageFood = completedStructures.reduce(
    (total, structure) => total + structure.food,
    0,
  );
  const storageMaterial = completedStructures.reduce(
    (total, structure) => total + structure.material,
    0,
  );
  const storageWater = completedStructures.reduce(
    (total, structure) => total + structure.water,
    0,
  );
  const storageCapacity = completedStructures.reduce(
    (total, structure) => total + structure.capacity,
    0,
  );
  const grouped = living.filter((creature) => creature.groupId !== null);
  const ungrouped = living.filter((creature) => creature.groupId === null);
  const sumInventory = (
    creatures: readonly CreatureState[],
    kind: "food" | "material" | "water",
  ): number => creatures.reduce((total, creature) => total + creature.inventory[kind], 0);
  return {
    tick: state.tick,
    resources: {
      nodeCount: nodes.length,
      currentStock,
      maximumStock,
      stockRatio: maximumStock === 0 ? 0 : round(currentStock / maximumStock),
      carriedFood: sumInventory(living, "food"),
      carriedMaterial: sumInventory(living, "material"),
      carriedWater: sumInventory(living, "water"),
      groupedCarriedFood: sumInventory(grouped, "food"),
      groupedCarriedMaterial: sumInventory(grouped, "material"),
      groupedCarriedWater: sumInventory(grouped, "water"),
      ungroupedCarriedFood: sumInventory(ungrouped, "food"),
      ungroupedCarriedMaterial: sumInventory(ungrouped, "material"),
      ungroupedCarriedWater: sumInventory(ungrouped, "water"),
      constructionCommittedMaterial: state.structures
        .filter(
          (structure) =>
            structure.kind === "STORAGE_SITE" || structure.kind === "SHELTER_SITE",
        )
        .reduce((total, structure) => total + structure.material, 0),
      byKind,
      nodes,
      accessDistanceTiles: accessDistances.report(),
      accessWeightedCost: accessWeightedCosts.report(),
      unreachableCreatureResourceKinds: accessByCreatureAndKind.filter(
        (access) => access.distanceTiles === null,
      ).length,
      accessByCreatureAndKind,
    },
    storage: {
      structureCount: structures.length,
      completedStorageCount: structures.filter((structure) => structure.kind === "STORAGE")
        .length,
      storageSiteCount: structures.filter((structure) => structure.kind === "STORAGE_SITE")
        .length,
      food: storageFood,
      material: storageMaterial,
      water: storageWater,
      capacity: storageCapacity,
      fillRatio:
        storageCapacity === 0
          ? 0
          : round((storageFood + storageMaterial + storageWater) / storageCapacity),
      structures,
    },
  };
}

function routeConcentration(
  routeTraversals: ReadonlyMap<string, number>,
): RouteConcentrationProfile {
  const parsed = [...routeTraversals.entries()]
    .map(([key, traversals]) => {
      const [from, to] = key.split(":").map(Number);
      if (from === undefined || to === undefined) {
        throw new Error(`Invalid route traversal key ${key}.`);
      }
      return { fromTileIndex: from, toTileIndex: to, traversals };
    })
    .sort(
      (left, right) =>
        left.fromTileIndex - right.fromTileIndex || left.toTileIndex - right.toTileIndex,
    );
  const traversals = parsed.reduce((total, edge) => total + edge.traversals, 0);
  const byEdge = parsed.map((edge): RouteEdgeProfile => ({
    ...edge,
    share: traversals === 0 ? 0 : round(edge.traversals / traversals),
  }));
  const ranked = [...byEdge].sort(
    (left, right) =>
      right.traversals - left.traversals ||
      left.fromTileIndex - right.fromTileIndex ||
      left.toTileIndex - right.toTileIndex,
  );
  const dominantEdge = ranked[0] ?? null;
  const topEdgeCount = Math.max(0, Math.ceil(ranked.length * 0.1));
  const topTraversals = ranked
    .slice(0, topEdgeCount)
    .reduce((total, edge) => total + edge.traversals, 0);
  return {
    traversals,
    uniqueDirectedEdges: byEdge.length,
    dominantEdge,
    dominantEdgeShare: dominantEdge?.share ?? 0,
    top10PercentEdgeShare: traversals === 0 ? 0 : round(topTraversals / traversals),
    herfindahlIndex:
      traversals === 0
        ? 0
        : round(
            parsed.reduce((total, edge) => total + edge.traversals * edge.traversals, 0) /
              (traversals * traversals),
          ),
    byEdge,
  };
}

function waterRouteConcentration(
  routeTraversals: ReadonlyMap<string, number>,
): WaterRouteConcentrationProfile {
  const parsed = [...routeTraversals.entries()]
    .map(([key, traversals]) => {
      const [from, to] = key.split(":").map(Number);
      if (from === undefined || to === undefined) {
        throw new Error(`Invalid water-route traversal key ${key}.`);
      }
      return { fromTileIndex: from, toTileIndex: to, traversals };
    })
    .sort(
      (left, right) =>
        left.fromTileIndex - right.fromTileIndex || left.toTileIndex - right.toTileIndex,
    );
  const traversals = parsed.reduce((total, edge) => total + edge.traversals, 0);
  const byEdge = parsed.map((edge): UndirectedRouteEdgeProfile => ({
    ...edge,
    share: traversals === 0 ? 0 : round(edge.traversals / traversals),
  }));
  const ranked = [...byEdge].sort(
    (left, right) =>
      right.traversals - left.traversals ||
      left.fromTileIndex - right.fromTileIndex ||
      left.toTileIndex - right.toTileIndex,
  );
  const dominantEdge = ranked[0] ?? null;
  return {
    traversals,
    uniqueUndirectedEdges: byEdge.length,
    dominantEdge,
    dominantEdgeShare: dominantEdge?.share ?? 0,
    herfindahlIndex:
      traversals === 0
        ? 0
        : round(
            parsed.reduce((total, edge) => total + edge.traversals * edge.traversals, 0) /
              (traversals * traversals),
          ),
    byEdge,
  };
}

function waterAccessProfile(state: SimulationState): HydrationActivityProfile["access"] {
  const living = livingCreatures(state);
  const sources = state.resourceNodes
    .filter((node) => node.kind === "WATER")
    .sort((left, right) => left.id - right.id);
  const geometryState: SimulationState = { ...state, creatures: [] };
  const weightedCosts = new DistributionAccumulator();
  const nearestCosts = new DistributionAccumulator();
  const byPair: WaterAccessPairProfile[] = [];

  for (const creature of living) {
    const creatureCosts: number[] = [];
    for (const source of sources) {
      const weightedCost = resourceInteractionWeightedCost(
        state,
        geometryState,
        creature.tileIndex,
        source,
      );
      byPair.push({ creatureId: creature.id, sourceId: source.id, weightedCost });
      if (weightedCost !== null) {
        weightedCosts.add(weightedCost);
        creatureCosts.push(weightedCost);
      }
    }
    if (creatureCosts.length > 0) nearestCosts.add(Math.min(...creatureCosts));
  }

  const reachablePairs = byPair.filter((pair) => pair.weightedCost !== null).length;
  return {
    pairCount: byPair.length,
    reachablePairs,
    unreachablePairs: byPair.length - reachablePairs,
    weightedCost: weightedCosts.report(),
    nearestSourceWeightedCostByCreature: nearestCosts.report(),
    byPair,
  };
}

export class StreamingActivityCollector {
  private readonly settlement: StreamingSettlementActivityCollector;
  private readonly scenario: SimulationState["scenario"];
  private readonly compiledMapHash: string;
  private readonly seed: number;
  private readonly startTick: number;
  private readonly ticksPerSecond: number;
  private latestState: SimulationState;
  private lastObservedTick: number;
  private lastSeenEventId: number;
  private lastObservedDecisionId: number;
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
  private readonly initialWaterGatherContentions: number;
  private lastInteractionContentions: number;
  private lastFailedInteractionClaims: number;
  private lastWaterGatherContentions: number;
  private lastSignificantEventTick: number | null = null;
  private readonly creatures = new Map<number, CreatureAccumulator>();
  private readonly totalActionCounts = emptyActionCounts();
  private readonly transitions = new Map<string, TransitionAccumulator>();
  private readonly occupiedTiles = new DistributionAccumulator();
  private readonly maximumTileCrowding = new DistributionAccumulator();
  private readonly maximumInteractionAnchorCrowding = new DistributionAccumulator();
  private readonly creaturePairDistanceTiles = new DistributionAccumulator();
  private readonly withinGroupPairDistanceTiles = new DistributionAccumulator();
  private readonly groupHomeDistanceTiles = new DistributionAccumulator();
  private readonly groupCentroidDistanceTiles = new DistributionAccumulator();
  private readonly groupCountSamples = new DistributionAccumulator();
  private readonly groupedCreatureCountSamples = new DistributionAccumulator();
  private readonly groupMembershipRateSamples = new DistributionAccumulator();
  private readonly groupSizeSamples = new DistributionAccumulator();
  private groupedCreatureTicks = 0;
  private groupLivingCreatureTicks = 0;
  private groupMembershipChanges = 0;
  private groupPartitionChanges = 0;
  private groupLeaderChanges = 0;
  private previousGroupByCreature: Map<number, number | null> | null = null;
  private previousLeaderByGroup: Map<number, number | null> | null = null;
  private previousSocialTopologySignature: string | null = null;
  private currentTickStructuralSocialChanges = 0;
  private currentTickMovementFixedUnits = 0;
  private currentTickActionTransitions = 0;
  private readonly currentTickTransitionKeys = new Set<string>();
  private readonly routeTraversals = new Map<string, number>();
  private readonly waterRouteTraversals = new Map<string, number>();
  private readonly scenarioRegions: CompiledRegionAccumulator[];
  private readonly scenarioChokepoints: CompiledChokepointAccumulator[];
  private scenarioSpatialLivingCreatureTicks = 0;
  private readonly selectionOverall = emptySelectionDimensionAccumulator();
  private readonly selectionsByCreature = new Map<number, SelectionDimensionAccumulator>();
  private readonly selectionsByAction = new Map<ActionKind, SelectionDimensionAccumulator>(
    ACTION_KINDS.map((kind) => [kind, emptySelectionDimensionAccumulator()]),
  );
  private decisionRecordsObserved = 0;
  private readonly actionCandidateEvaluations = new Map<ActionKind, number>(
    ACTION_KINDS.map((kind) => [kind, 0]),
  );
  private readonly desireCandidateEvaluations = new Map<DesireKind, number>(
    DESIRE_KINDS.map((kind) => [kind, 0]),
  );
  private desireLivingCreatureTicks = 0;
  private withoutActiveDesireCreatureTicks = 0;
  private desireKindChanges = 0;
  private desireFamilyChanges = 0;
  private changesToNoActiveDesire = 0;
  private readonly desireExposure = new Map<DesireKind, number>(
    DESIRE_KINDS.map((kind) => [kind, 0]),
  );
  private readonly desireChangesInto = new Map<DesireKind, number>(
    DESIRE_KINDS.map((kind) => [kind, 0]),
  );
  private readonly desireChangesOutOf = new Map<DesireKind, number>(
    DESIRE_KINDS.map((kind) => [kind, 0]),
  );
  private readonly familyChangesInto = new Map<DesireFamily, number>(
    DESIRE_FAMILIES.map((family) => [family, 0]),
  );
  private readonly familyChangesOutOf = new Map<DesireFamily, number>(
    DESIRE_FAMILIES.map((family) => [family, 0]),
  );
  private readonly stalemateSamples: StalemateTickSample[] = [];
  private stalemateSampleCursor = 0;
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
  private readonly hydrationCreatures = new Map<number, CreatureHydrationAccumulator>();
  private readonly hydrationRecoveryLatencies = new DistributionAccumulator();
  private hydrationLivingCreatureTicks = 0;
  private carriedWaterUnitTicks = 0;
  private carryingCreatureTicks = 0;
  private waterGatheredUnits = 0;
  private waterDrunkUnits = 0;
  private waterSharedUnits = 0;
  private readonly waterDonorIds = new Set<number>();
  private readonly waterRecipientIds = new Set<number>();
  private readonly initialWaterSourceStock: number;
  private waterSourceStockUnitTicks = 0;
  private waterSourceCapacityUnitTicks = 0;
  private depletedWaterSourceTicks = 0;
  private anyWaterSourceDepletedTicks = 0;
  private waterSourceDepletionEvents = 0;
  private waterReplenishedUnits = 0;
  private waterDrainedUnits = 0;
  private waterGatherAttempts = 0;
  private blockedWaterGatherAttempts = 0;
  private blockedByContentionWaterGatherAttempts = 0;
  private waterClaimedSlotTicks = 0;
  private waterCapacitySlotTicks = 0;
  private saturatedWaterSourceTicks = 0;
  private waterSlotCapacityNavigationRevision = -1;
  private readonly waterSlotCapacityBySource = new Map<number, number>();
  private readonly waterSourceSelections = new CategoricalAccumulator();
  private firstSevereThirstTick: number | null = null;
  private firstWaterDrinkTick: number | null = null;
  private firstSevereThirstRecoveryTick: number | null = null;
  private readonly waterInterventions = new Map<number, WaterInterventionAccumulator>();
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
    this.settlement = new StreamingSettlementActivityCollector(initialState);
    const compiled = compileScenario(initialState.scenario);
    if (compiled.compiledMapHash !== initialState.compiledMapHash) {
      throw new Error(
        `Activity collector compiled-map hash ${initialState.compiledMapHash} does not match scenario ${compiled.compiledMapHash}.`,
      );
    }
    if (initialState.scenario.seed !== initialState.seed) {
      throw new Error(
        `Activity collector scenario seed ${initialState.scenario.seed} does not match state seed ${initialState.seed}.`,
      );
    }
    this.scenario = cloneScenarioReference(initialState.scenario);
    this.compiledMapHash = initialState.compiledMapHash;
    const initiallyReachable = initialReachableTiles(
      compiled.world,
      compiled.creatures.map((creature) => creature.y * compiled.world.width + creature.x),
    );
    this.scenarioRegions = compiled.regions
      .map((region): CompiledRegionAccumulator => ({
        id: region.id,
        label: region.label,
        tileIndices: [...region.tileIndices].sort((left, right) => left - right),
        tileSet: new Set(region.tileIndices),
        initiallyReachable: region.tileIndices.some((tileIndex) =>
          initiallyReachable.has(tileIndex),
        ),
        occupiedTicks: 0,
        livingCreatureTicks: 0,
        byCreature: new Map<number, number>(),
      }))
      .sort((left, right) => compareText(left.id, right.id));
    this.scenarioChokepoints = compiled.chokepoints
      .map((chokepoint): CompiledChokepointAccumulator => ({
        id: chokepoint.id,
        label: chokepoint.label,
        tileIndices: [...chokepoint.tileIndices].sort((left, right) => left - right),
        tileSet: new Set(chokepoint.tileIndices),
        connects: [...chokepoint.connects],
        tileTransitions: 0,
        entries: 0,
        exits: 0,
        throughCrossings: 0,
        byCreature: new Map<number, ChokepointCrossingAccumulator>(),
        pendingEntryRegionByCreature: new Map<number, string>(),
      }))
      .sort((left, right) => compareText(left.id, right.id));
    this.seed = initialState.seed;
    this.startTick = initialState.tick;
    this.latestState = initialState;
    this.lastObservedTick = initialState.tick;
    this.ticksPerSecond = initialState.configuration.ticksPerSecond;
    this.lastSeenEventId = initialState.nextEventId - 1;
    this.lastObservedDecisionId = initialState.nextDecisionId - 1;
    this.initialInteractionContentions = initialState.metrics.interactionContentions;
    this.initialFailedInteractionClaims = initialState.metrics.failedInteractionClaims;
    this.initialWaterGatherContentions = initialState.metrics.waterGatherContentions;
    this.lastInteractionContentions = initialState.metrics.interactionContentions;
    this.lastFailedInteractionClaims = initialState.metrics.failedInteractionClaims;
    this.lastWaterGatherContentions = initialState.metrics.waterGatherContentions;
    this.initialWaterSourceStock = initialState.resourceNodes
      .filter((node) => node.kind === "WATER")
      .reduce((total, node) => total + node.currentStock, 0);
    for (const creature of initialState.creatures) {
      this.selectionsByCreature.set(creature.id, emptySelectionDimensionAccumulator());
      this.creatures.set(
        creature.id,
        initialCreatureAccumulator(creature, initialState.tick),
      );
      this.hydrationCreatures.set(
        creature.id,
        initialCreatureHydrationAccumulator(creature),
      );
      if (creature.alive && creature.needs.thirst >= SEVERE_THIRST_THRESHOLD) {
        this.firstSevereThirstTick = firstTick(
          this.firstSevereThirstTick,
          initialState.tick,
        );
      }
    }
    for (const event of initialState.domainEvents) {
      this.registerAppliedIntervention(event);
    }
    this.pruneAppliedInterventions(initialState.tick);
    this.observeSpatial(initialState, false);
  }

  observe(state: SimulationState): void {
    if (!sameScenarioReference(state.scenario, this.scenario)) {
      throw new Error(
        `Activity collector scenario identity changed from ${this.scenario.scenarioId}@${this.scenario.scenarioVersion}/${this.scenario.mapGenerationVersion} seed ${this.scenario.seed} to ${state.scenario.scenarioId}@${state.scenario.scenarioVersion}/${state.scenario.mapGenerationVersion} seed ${state.scenario.seed}.`,
      );
    }
    if (state.compiledMapHash !== this.compiledMapHash) {
      throw new Error(
        `Activity collector compiled-map hash changed from ${this.compiledMapHash} to ${state.compiledMapHash}.`,
      );
    }
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
      state.metrics.failedInteractionClaims < this.lastFailedInteractionClaims ||
      state.metrics.waterGatherContentions < this.lastWaterGatherContentions
    ) {
      throw new Error("Interaction claim metrics decreased inside one profile window.");
    }
    this.lastInteractionContentions = state.metrics.interactionContentions;
    this.lastFailedInteractionClaims = state.metrics.failedInteractionClaims;
    this.lastWaterGatherContentions = state.metrics.waterGatherContentions;
    this.currentTickMovementFixedUnits = 0;
    this.currentTickStructuralSocialChanges = 0;
    this.currentTickActionTransitions = 0;
    this.currentTickTransitionKeys.clear();

    const events = this.newEvents(state);
    this.settlement.observe(state, events);
    for (const event of events) this.registerAppliedIntervention(event);
    this.observeDecisionsAndSelections(state, events);
    this.observeInterventionChanges(state, events);
    this.observeInterventionReroutes(state, events);
    this.observeHydrationSelections(state, events);
    this.observeCreatures(state);
    for (const event of events) this.observeEvent(state, event);
    this.observeHydrationState(state);
    this.observeRecovery(state);
    this.observeSpatial(state);
    this.observeScenarioRegionExposure(state);
    this.observeStalemateTick(state, events);
    this.pruneAppliedInterventions(state.tick);
    this.latestState = state;
    this.lastObservedTick = state.tick;
  }

  private hydrationProfile(): HydrationActivityProfile {
    const byCreature = [...this.hydrationCreatures.values()]
      .sort((left, right) => left.id - right.id)
      .map((accumulator): CreatureHydrationProfile => ({
        creatureId: accumulator.id,
        name: accumulator.name,
        livingCreatureTicks: accumulator.livingCreatureTicks,
        thirstUnitTicks: accumulator.thirstUnitTicks,
        meanThirst:
          accumulator.livingCreatureTicks === 0
            ? 0
            : round(accumulator.thirstUnitTicks / accumulator.livingCreatureTicks),
        severeThirstTicks: accumulator.severeThirstTicks,
        criticalThirstTicks: accumulator.criticalThirstTicks,
        severeSpellCount: accumulator.severeSpellCount,
        resolvedSevereSpellCount: accumulator.resolvedSevereSpellCount,
        longestSevereSpellTicks: accumulator.longestSevereSpellTicks,
      }));
    const thirstUnitTicks = byCreature.reduce(
      (total, creature) => total + creature.thirstUnitTicks,
      0,
    );
    const severeThirstCreatureTicks = byCreature.reduce(
      (total, creature) => total + creature.severeThirstTicks,
      0,
    );
    const criticalThirstCreatureTicks = byCreature.reduce(
      (total, creature) => total + creature.criticalThirstTicks,
      0,
    );
    const severeSpellCount = byCreature.reduce(
      (total, creature) => total + creature.severeSpellCount,
      0,
    );
    const resolvedSevereSpellCount = byCreature.reduce(
      (total, creature) => total + creature.resolvedSevereSpellCount,
      0,
    );
    const waterSources = this.latestState.resourceNodes.filter(
      (node) => node.kind === "WATER",
    );
    const interventionLatencies = new DistributionAccumulator();
    for (const intervention of [...this.waterInterventions.values()].sort(
      (left, right) => left.eventId - right.eventId,
    )) {
      if (intervention.firstResponseTick !== null) {
        interventionLatencies.add(intervention.firstResponseTick - intervention.tick);
      }
    }
    const interventionsWithResponse = [...this.waterInterventions.values()].filter(
      (intervention) => intervention.firstResponseTick !== null,
    ).length;
    const contendedGatherAttempts =
      this.lastWaterGatherContentions - this.initialWaterGatherContentions;

    return {
      need: {
        severeThreshold: SEVERE_THIRST_THRESHOLD,
        criticalThreshold: CRITICAL_THIRST_THRESHOLD,
        livingCreatureTicks: this.hydrationLivingCreatureTicks,
        thirstUnitTicks,
        meanThirst:
          this.hydrationLivingCreatureTicks === 0
            ? 0
            : round(thirstUnitTicks / this.hydrationLivingCreatureTicks),
        severeThirstCreatureTicks,
        criticalThirstCreatureTicks,
        severeExposureRate:
          this.hydrationLivingCreatureTicks === 0
            ? 0
            : round(severeThirstCreatureTicks / this.hydrationLivingCreatureTicks),
        criticalExposureRate:
          this.hydrationLivingCreatureTicks === 0
            ? 0
            : round(criticalThirstCreatureTicks / this.hydrationLivingCreatureTicks),
        severeSpellCount,
        resolvedSevereSpellCount,
        longestSevereSpellTicks: Math.max(
          0,
          ...byCreature.map((creature) => creature.longestSevereSpellTicks),
        ),
        recoveryLatencyTicks: this.hydrationRecoveryLatencies.report(),
        firstSevereTick: this.firstSevereThirstTick,
        firstDrinkTick: this.firstWaterDrinkTick,
        firstRecoveryTick: this.firstSevereThirstRecoveryTick,
        byCreature,
      },
      flow: {
        gatheredUnits: this.waterGatheredUnits,
        drunkUnits: this.waterDrunkUnits,
        sharedUnits: this.waterSharedUnits,
        carriedWaterAtHorizon: livingCreatures(this.latestState).reduce(
          (total, creature) => total + creature.inventory.water,
          0,
        ),
        carriedWaterUnitTicks: this.carriedWaterUnitTicks,
        carryingCreatureTicks: this.carryingCreatureTicks,
        donorIds: [...this.waterDonorIds].sort((left, right) => left - right),
        recipientIds: [...this.waterRecipientIds].sort((left, right) => left - right),
        distinctDonors: this.waterDonorIds.size,
        distinctRecipients: this.waterRecipientIds.size,
      },
      sources: {
        nodeCount: waterSources.length,
        initialStock: this.initialWaterSourceStock,
        stockAtHorizon: waterSources.reduce(
          (total, source) => total + source.currentStock,
          0,
        ),
        maximumStockAtHorizon: waterSources.reduce(
          (total, source) => total + source.maximumStock,
          0,
        ),
        stockUnitTicks: this.waterSourceStockUnitTicks,
        capacityUnitTicks: this.waterSourceCapacityUnitTicks,
        utilization:
          this.waterSourceCapacityUnitTicks === 0
            ? 0
            : round(1 - this.waterSourceStockUnitTicks / this.waterSourceCapacityUnitTicks),
        depletedSourceTicks: this.depletedWaterSourceTicks,
        anySourceDepletedTicks: this.anyWaterSourceDepletedTicks,
        depletionEvents: this.waterSourceDepletionEvents,
        replenishedUnits: this.waterReplenishedUnits,
        drainedUnits: this.waterDrainedUnits,
        gatherAttempts: this.waterGatherAttempts,
        blockedGatherAttempts: this.blockedWaterGatherAttempts,
        contendedGatherAttempts,
        blockedByContentionGatherAttempts: this.blockedByContentionWaterGatherAttempts,
        contentionRate:
          this.waterGatherAttempts === 0
            ? 0
            : round(contendedGatherAttempts / this.waterGatherAttempts),
        claimedSlotTicks: this.waterClaimedSlotTicks,
        capacitySlotTicks: this.waterCapacitySlotTicks,
        saturatedSourceTicks: this.saturatedWaterSourceTicks,
        selection: this.waterSourceSelections.report(),
      },
      access: waterAccessProfile(this.latestState),
      routes: waterRouteConcentration(this.waterRouteTraversals),
      interventionResponses: {
        windowTicks: INTERVENTION_RESPONSE_WINDOW_TICKS,
        appliedWaterInterventions: this.waterInterventions.size,
        interventionsWithResponse,
        firstResponseLatencyTicks: interventionLatencies.report(),
      },
    };
  }

  private selectionConcentrationProfile(): SelectionConcentrationProfile {
    const names = new Map(
      [...this.creatures.values()].map((creature) => [creature.id, creature.name]),
    );
    return {
      overall: selectionDimensionProfile(this.selectionOverall),
      byCreature: [...this.selectionsByCreature.entries()]
        .sort(([left], [right]) => left - right)
        .map(([creatureId, accumulator]) => ({
          creatureId,
          name: names.get(creatureId) ?? `Creature ${creatureId}`,
          ...selectionDimensionProfile(accumulator),
        })),
      byAction: ACTION_KINDS.map((kind) => ({
        kind,
        ...selectionDimensionProfile(
          this.selectionsByAction.get(kind) ?? emptySelectionDimensionAccumulator(),
        ),
      })),
    };
  }

  private desireActivityProfile(): DesireActivityProfile {
    const byKind = DESIRE_KINDS.map((kind): DesireKindExposureProfile => ({
      kind,
      family: DESIRE_FAMILY_BY_KIND[kind],
      exposureCreatureTicks: this.desireExposure.get(kind) ?? 0,
      exposureRate:
        this.desireLivingCreatureTicks === 0
          ? 0
          : round((this.desireExposure.get(kind) ?? 0) / this.desireLivingCreatureTicks),
      changesInto: this.desireChangesInto.get(kind) ?? 0,
      changesOutOf: this.desireChangesOutOf.get(kind) ?? 0,
      candidateEvaluations: this.desireCandidateEvaluations.get(kind) ?? 0,
    }));
    const byFamily = DESIRE_FAMILIES.map((family): DesireFamilyExposureProfile => {
      const kinds = DESIRE_KINDS.filter((kind) => DESIRE_FAMILY_BY_KIND[kind] === family);
      const exposureCreatureTicks = kinds.reduce(
        (total, kind) => total + (this.desireExposure.get(kind) ?? 0),
        0,
      );
      return {
        family,
        exposureCreatureTicks,
        exposureRate:
          this.desireLivingCreatureTicks === 0
            ? 0
            : round(exposureCreatureTicks / this.desireLivingCreatureTicks),
        changesInto: this.familyChangesInto.get(family) ?? 0,
        changesOutOf: this.familyChangesOutOf.get(family) ?? 0,
        candidateEvaluations: kinds.reduce(
          (total, kind) => total + (this.desireCandidateEvaluations.get(kind) ?? 0),
          0,
        ),
      };
    });
    return {
      livingCreatureTicks: this.desireLivingCreatureTicks,
      withoutActiveDesireCreatureTicks: this.withoutActiveDesireCreatureTicks,
      kindChanges: this.desireKindChanges,
      familyChanges: this.desireFamilyChanges,
      changesToNoActiveDesire: this.changesToNoActiveDesire,
      byKind,
      byFamily,
    };
  }

  private scenarioSpatialProfile(): ScenarioSpatialActivityProfile {
    const observedTicks = this.lastObservedTick - this.startTick;
    const creatureIds = [...this.creatures.keys()].sort((left, right) => left - right);
    return {
      observedTicks,
      livingCreatureTicks: this.scenarioSpatialLivingCreatureTicks,
      regions: this.scenarioRegions.map((region) => ({
        id: region.id,
        label: region.label,
        tileIndices: [...region.tileIndices],
        initiallyReachable: region.initiallyReachable,
        occupiedTicks: region.occupiedTicks,
        livingCreatureTicks: region.livingCreatureTicks,
        occupancyExposureRate:
          this.scenarioSpatialLivingCreatureTicks === 0
            ? 0
            : round(region.livingCreatureTicks / this.scenarioSpatialLivingCreatureTicks),
        byCreature: creatureIds.map((creatureId) => ({
          creatureId,
          livingCreatureTicks: region.byCreature.get(creatureId) ?? 0,
          exposureRate:
            observedTicks === 0
              ? 0
              : round((region.byCreature.get(creatureId) ?? 0) / observedTicks),
        })),
      })),
      chokepoints: this.scenarioChokepoints.map((chokepoint) => ({
        id: chokepoint.id,
        label: chokepoint.label,
        tileIndices: [...chokepoint.tileIndices],
        connects: [...chokepoint.connects],
        tileTransitions: chokepoint.tileTransitions,
        entries: chokepoint.entries,
        exits: chokepoint.exits,
        throughCrossings: chokepoint.throughCrossings,
        byCreature: creatureIds.map((creatureId) => {
          const counts = chokepoint.byCreature.get(creatureId);
          return {
            creatureId,
            tileTransitions: counts?.tileTransitions ?? 0,
            entries: counts?.entries ?? 0,
            exits: counts?.exits ?? 0,
            throughCrossings: counts?.throughCrossings ?? 0,
          };
        }),
      })),
    };
  }

  private diagnosticProfile(
    selections: SelectionConcentrationProfile,
    desires: DesireActivityProfile,
    scenarioSpatial: ScenarioSpatialActivityProfile,
  ): ActivityDiagnosticProfile {
    const unobservedActions = selections.byAction
      .filter((profile) => profile.starts === 0)
      .map((profile) => profile.kind);
    const noCandidateActions =
      this.decisionRecordsObserved === 0
        ? []
        : ACTION_KINDS.filter(
            (kind) => (this.actionCandidateEvaluations.get(kind) ?? 0) === 0,
          );
    const unobservedDesires = desires.byKind
      .filter((profile) => profile.exposureCreatureTicks === 0)
      .map((profile) => profile.kind);
    const noCandidateDesires =
      this.decisionRecordsObserved === 0
        ? []
        : DESIRE_KINDS.filter(
            (kind) => (this.desireCandidateEvaluations.get(kind) ?? 0) === 0,
          );
    const unobservedRegions = scenarioSpatial.regions
      .filter((region) => region.livingCreatureTicks === 0)
      .map((region) => region.id);
    const initiallyUnreachableRegions = scenarioSpatial.regions
      .filter((region) => !region.initiallyReachable)
      .map((region) => region.id);
    const warnings: string[] = [];
    if (this.lastObservedTick > this.startTick) {
      for (const kind of unobservedActions) {
        warnings.push(`Action ${kind} was not started in the observed window.`);
      }
      for (const kind of unobservedDesires) {
        warnings.push(`Desire ${kind} had no living-creature exposure.`);
      }
      for (const regionId of unobservedRegions) {
        warnings.push(`Scenario region ${regionId} had no living-creature occupancy.`);
      }
    }
    for (const kind of noCandidateActions) {
      warnings.push(
        `Action ${kind} appeared in no observed decision candidate; dynamic structural unreachability is not proven.`,
      );
    }
    for (const kind of noCandidateDesires) {
      warnings.push(
        `Desire ${kind} appeared in no observed decision candidate; dynamic structural unreachability is not proven.`,
      );
    }
    for (const regionId of initiallyUnreachableRegions) {
      warnings.push(
        `Scenario region ${regionId} is unreachable from every compiled creature start.`,
      );
    }
    const warnConcentration = (
      label: string,
      concentration: CategoricalConcentrationProfile,
    ): void => {
      if (
        concentration.samples >= CONCENTRATION_WARNING_MIN_SAMPLES &&
        concentration.dominantShare > CONCENTRATION_WARNING_SHARE
      ) {
        warnings.push(
          `${label} category ${concentration.dominantCategory?.category ?? "NONE"} share ${concentration.dominantShare} exceeds ${CONCENTRATION_WARNING_SHARE}.`,
        );
      }
    };
    warnConcentration("Action-start", selections.overall.actions);
    warnConcentration("Target", selections.overall.targets);
    warnConcentration("Target-location", selections.overall.targetLocations);
    warnConcentration("Actor-group", selections.overall.actorGroups);
    for (const creature of selections.byCreature) {
      warnConcentration(`Creature ${creature.creatureId} target`, creature.targets);
      warnConcentration(
        `Creature ${creature.creatureId} target-location`,
        creature.targetLocations,
      );
      warnConcentration(
        `Creature ${creature.creatureId} actor-group`,
        creature.actorGroups,
      );
    }
    for (const action of selections.byAction) {
      warnConcentration(`Action ${action.kind} target`, action.targets);
      warnConcentration(`Action ${action.kind} target-location`, action.targetLocations);
      warnConcentration(`Action ${action.kind} actor-group`, action.actorGroups);
    }
    const dominantDesireFamily = [...desires.byFamily].sort(
      (left, right) =>
        right.exposureCreatureTicks - left.exposureCreatureTicks ||
        compareText(left.family, right.family),
    )[0];
    if (
      desires.livingCreatureTicks >= CONCENTRATION_WARNING_MIN_SAMPLES &&
      dominantDesireFamily &&
      dominantDesireFamily.exposureRate > CONCENTRATION_WARNING_SHARE
    ) {
      warnings.push(
        `Desire family ${dominantDesireFamily.family} exposure share ${dominantDesireFamily.exposureRate} exceeds ${CONCENTRATION_WARNING_SHARE}.`,
      );
    }
    for (const region of scenarioSpatial.regions) {
      if (
        scenarioSpatial.livingCreatureTicks >= CONCENTRATION_WARNING_MIN_SAMPLES &&
        region.occupancyExposureRate > CONCENTRATION_WARNING_SHARE
      ) {
        warnings.push(
          `Scenario region ${region.id} occupancy exposure share ${region.occupancyExposureRate} exceeds ${CONCENTRATION_WARNING_SHARE}.`,
        );
      }
    }
    return {
      decisionRecordsObserved: this.decisionRecordsObserved,
      unobservedActions,
      noCandidateActions,
      unobservedDesires,
      noCandidateDesires,
      unobservedRegions,
      initiallyUnreachableRegions,
      warnings: warnings.sort(compareText),
      limitations: [
        "Action and desire structural reachability cannot be inferred from absence: candidates depend on changing needs, inventories, relationships, memories, groups, structures, and resource state. noCandidate lists mean only that no retained decision evaluated that category during this window.",
        "Target concentration uses selected target entity IDs and selected candidate target tiles captured while decision records are retained; NONE is reported explicitly when an action has no target.",
        "Group concentration is the actor group carried by ACTION_STARTED events. The simulation does not retain a generic target-group field, so target ownership is not inferred.",
        "Location reachability is proved only for compiled named regions against the compiled initial map and creature starts. Dynamic obstacle histories can change later reachability and are not reclassified as static scenario facts.",
        "Water contention is the authoritative count of GATHER_WATER claim attempts that encountered at least one occupied legal source slot. blockedByContentionGatherAttempts separately counts attempts made when every legal slot was occupied.",
        "Water source stock, carried water, and thirst exposure are sampled from each post-tick state. Water-route concentration includes undirected movement edges traversed while GATHER_WATER or SHARE_WATER is the active action.",
      ],
    };
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
    const dominantAction =
      ACTION_KINDS.map((kind) => ({
        kind,
        count: this.totalActionCounts[kind],
        share:
          this.completedActions === 0
            ? 0
            : round(this.totalActionCounts[kind] / this.completedActions),
      }))
        .filter((action) => action.count > 0)
        .sort(
          (left, right) =>
            right.count - left.count ||
            (actionOrder.get(left.kind) ?? 0) - (actionOrder.get(right.kind) ?? 0),
        )[0] ?? null;
    const totalTransitions = transitions.reduce(
      (total, transition) => total + transition.count,
      0,
    );
    const dominantTransitionBase = [...transitions].sort(
      (left, right) =>
        right.count - left.count ||
        (left.from === null ? -1 : (actionOrder.get(left.from) ?? 0)) -
          (right.from === null ? -1 : (actionOrder.get(right.from) ?? 0)) ||
        (actionOrder.get(left.to) ?? 0) - (actionOrder.get(right.to) ?? 0),
    )[0];
    const repeatedTransitions = transitions
      .filter((transition) => transition.from === transition.to)
      .reduce((total, transition) => total + transition.count, 0);
    const actionAnalysis: ActionTransitionAnalysis = {
      dominantAction,
      totalTransitions,
      uniqueTransitions: transitions.length,
      dominantTransition:
        dominantTransitionBase === undefined
          ? null
          : {
              ...dominantTransitionBase,
              share:
                totalTransitions === 0
                  ? 0
                  : round(dominantTransitionBase.count / totalTransitions),
            },
      repeatedTransitions,
      repetitionRate:
        totalTransitions === 0 ? 0 : round(repeatedTransitions / totalTransitions),
    };
    const dispersionAtHorizon = horizonDispersion(this.latestState);
    const groupHorizon = groupHorizonProfile(this.latestState);
    const milestoneObservations = milestoneObservationProfiles(
      this.milestones,
      this.startTick,
      this.lastObservedTick,
    );
    const selectionConcentration = this.selectionConcentrationProfile();
    const desires = this.desireActivityProfile();
    const hydration = this.hydrationProfile();
    const scenarioSpatial = this.scenarioSpatialProfile();
    const diagnostics = this.diagnosticProfile(
      selectionConcentration,
      desires,
      scenarioSpatial,
    );

    return {
      schemaVersion: ACTIVITY_PROFILE_SCHEMA_VERSION,
      scenario: cloneScenarioReference(this.scenario),
      compiledMapHash: this.compiledMapHash,
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
        analysis: actionAnalysis,
        selectionConcentration,
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
        dispersion: {
          creaturePairDistanceTiles: this.creaturePairDistanceTiles.report(),
          withinGroupPairDistanceTiles: this.withinGroupPairDistanceTiles.report(),
          groupHomeDistanceTiles: this.groupHomeDistanceTiles.report(),
          groupCentroidDistanceTiles: this.groupCentroidDistanceTiles.report(),
          ...dispersionAtHorizon,
        },
        routes: routeConcentration(this.routeTraversals),
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
      milestoneObservations,
      groups: {
        horizon: groupHorizon,
        overWindow: {
          groupCount: this.groupCountSamples.report(),
          groupedCreatureCount: this.groupedCreatureCountSamples.report(),
          membershipRate: this.groupMembershipRateSamples.report(),
          groupSizes: this.groupSizeSamples.report(),
          groupedCreatureTicks: this.groupedCreatureTicks,
          livingCreatureTicks: this.groupLivingCreatureTicks,
          timeSpentGroupedRate:
            this.groupLivingCreatureTicks === 0
              ? 0
              : round(this.groupedCreatureTicks / this.groupLivingCreatureTicks),
          membershipChanges: this.groupMembershipChanges,
          partitionChanges: this.groupPartitionChanges,
          leaderChanges: this.groupLeaderChanges,
        },
      },
      relationships: relationshipGraphProfile(this.latestState),
      horizon: horizonFacts(this.latestState),
      stalemate: this.stalemateProfile(),
      desires,
      hydration,
      settlement: this.settlement.report(),
      scenarioSpatial,
      diagnostics,
    };
  }

  private observeCreatures(state: SimulationState): void {
    for (const creature of [...state.creatures].sort((left, right) => left.id - right.id)) {
      const existing = this.creatures.get(creature.id);
      const nextDesire = creature.activeDesire?.kind ?? null;
      if (!existing) {
        this.creatures.set(creature.id, initialCreatureAccumulator(creature, state.tick));
        this.selectionsByCreature.set(creature.id, emptySelectionDimensionAccumulator());
        if (creature.alive) this.recordDesireExposure(nextDesire);
        continue;
      }

      if (existing.alive && creature.alive) {
        const distance =
          Math.abs(creature.x - existing.x) + Math.abs(creature.y - existing.y);
        existing.movementDistance += distance;
        this.movementDistance += distance;
        this.currentTickMovementFixedUnits += distance;
        if (existing.tileIndex !== creature.tileIndex) {
          const routeKey = `${existing.tileIndex}:${creature.tileIndex}`;
          this.routeTraversals.set(routeKey, (this.routeTraversals.get(routeKey) ?? 0) + 1);
          if (
            existing.activeActionKind === "GATHER_WATER" ||
            existing.activeActionKind === "SHARE_WATER"
          ) {
            const from = Math.min(existing.tileIndex, creature.tileIndex);
            const to = Math.max(existing.tileIndex, creature.tileIndex);
            const waterRouteKey = `${from}:${to}`;
            this.waterRouteTraversals.set(
              waterRouteKey,
              (this.waterRouteTraversals.get(waterRouteKey) ?? 0) + 1,
            );
          }
          this.observeChokepointTransition(
            creature.id,
            existing.tileIndex,
            creature.tileIndex,
          );
        }
        this.recordDesireChange(existing.desire, nextDesire);
      } else if (existing.alive && !creature.alive) {
        for (const chokepoint of this.scenarioChokepoints) {
          chokepoint.pendingEntryRegionByCreature.delete(creature.id);
        }
      }
      existing.alive = creature.alive;
      existing.x = creature.x;
      existing.y = creature.y;
      existing.tileIndex = creature.tileIndex;
      existing.desire = nextDesire;
      existing.planSignature = activePlanSignature(creature);
      existing.activeActionLineage = activeActionLineage(creature);
      existing.activeActionRoute = creature.activeAction
        ? creature.activeAction.path.join(",")
        : null;
      existing.activeActionNavigationRevision =
        creature.activeAction?.navigationRevision ?? null;
      existing.activeActionKind = creature.activeAction?.kind ?? null;
      if (creature.alive) this.recordDesireExposure(nextDesire);

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
        this.currentTickActionTransitions += 1;
        this.currentTickTransitionKeys.add(key);
        existing.lastCompletedAction = completedKind;
        existing.lastCompletionTick = completedAtTick;
      }
    }
  }

  private recordDesireExposure(kind: DesireKind | null): void {
    this.desireLivingCreatureTicks += 1;
    if (kind === null) {
      this.withoutActiveDesireCreatureTicks += 1;
      return;
    }
    this.desireExposure.set(kind, (this.desireExposure.get(kind) ?? 0) + 1);
  }

  private recordDesireChange(previous: DesireKind | null, next: DesireKind | null): void {
    if (previous === next) return;
    this.desireKindChanges += 1;
    if (previous !== null) {
      this.desireChangesOutOf.set(
        previous,
        (this.desireChangesOutOf.get(previous) ?? 0) + 1,
      );
    }
    if (next === null) {
      this.changesToNoActiveDesire += 1;
    } else {
      this.desireChangesInto.set(next, (this.desireChangesInto.get(next) ?? 0) + 1);
    }
    const previousFamily = previous === null ? null : DESIRE_FAMILY_BY_KIND[previous];
    const nextFamily = next === null ? null : DESIRE_FAMILY_BY_KIND[next];
    if (previousFamily === nextFamily) return;
    this.desireFamilyChanges += 1;
    if (previousFamily !== null) {
      this.familyChangesOutOf.set(
        previousFamily,
        (this.familyChangesOutOf.get(previousFamily) ?? 0) + 1,
      );
    }
    if (nextFamily !== null) {
      this.familyChangesInto.set(
        nextFamily,
        (this.familyChangesInto.get(nextFamily) ?? 0) + 1,
      );
    }
  }

  private observeDecisionsAndSelections(
    state: SimulationState,
    events: readonly DomainEvent[],
  ): void {
    const records = new Map(
      state.decisionRecords.map((record) => [record.id, record] as const),
    );
    const decisionIds = [
      ...new Set(events.flatMap((event) => event.decisionRecordIds)),
    ].sort((left, right) => left - right);
    for (const decisionId of decisionIds) {
      if (decisionId <= this.lastObservedDecisionId) continue;
      const record = records.get(decisionId);
      if (!record) continue;
      this.decisionRecordsObserved += 1;
      for (const candidate of record.candidates) {
        this.actionCandidateEvaluations.set(
          candidate.action,
          (this.actionCandidateEvaluations.get(candidate.action) ?? 0) + 1,
        );
        this.desireCandidateEvaluations.set(
          candidate.desire,
          (this.desireCandidateEvaluations.get(candidate.desire) ?? 0) + 1,
        );
      }
      this.lastObservedDecisionId = decisionId;
    }

    const recordedStarts = new Set<number>();
    for (const event of events) {
      if (event.type !== "ACTION_STARTED") continue;
      const record = event.decisionRecordIds
        .map((id) => records.get(id))
        .find((candidate) => candidate !== undefined);
      if (!record || recordedStarts.has(record.id)) continue;
      recordedStarts.add(record.id);
      const candidate = selectedCandidate(record);
      const selection = {
        action: record.selectedAction,
        actorId: record.actorId,
        targetEntityId: record.selectedTargetId,
        targetTileIndex: candidate?.targetTileIndex ?? null,
        originTileIndex: event.locationTileIndex,
        actorGroupId: event.groupIds[0] ?? null,
      };
      recordSelection(this.selectionOverall, selection);
      let creatureAccumulator = this.selectionsByCreature.get(record.actorId);
      if (!creatureAccumulator) {
        creatureAccumulator = emptySelectionDimensionAccumulator();
        this.selectionsByCreature.set(record.actorId, creatureAccumulator);
      }
      recordSelection(creatureAccumulator, selection);
      const actionAccumulator = this.selectionsByAction.get(record.selectedAction);
      if (!actionAccumulator) {
        throw new Error(`Unknown action kind ${record.selectedAction}.`);
      }
      recordSelection(actionAccumulator, selection);
    }
  }

  private observeScenarioRegionExposure(state: SimulationState): void {
    const living = livingCreatures(state);
    this.scenarioSpatialLivingCreatureTicks += living.length;
    for (const region of this.scenarioRegions) {
      let occupied = false;
      for (const creature of living) {
        if (!region.tileSet.has(creature.tileIndex)) continue;
        occupied = true;
        region.livingCreatureTicks += 1;
        region.byCreature.set(creature.id, (region.byCreature.get(creature.id) ?? 0) + 1);
      }
      if (occupied) region.occupiedTicks += 1;
    }
  }

  private connectedRegionAtTile(
    chokepoint: CompiledChokepointAccumulator,
    tileIndex: number,
  ): string | null {
    for (const regionId of chokepoint.connects) {
      const region = this.scenarioRegions.find((candidate) => candidate.id === regionId);
      if (region?.tileSet.has(tileIndex)) return regionId;
    }
    return null;
  }

  private observeChokepointTransition(
    creatureId: number,
    fromTileIndex: number,
    toTileIndex: number,
  ): void {
    for (const chokepoint of this.scenarioChokepoints) {
      const fromInside = chokepoint.tileSet.has(fromTileIndex);
      const toInside = chokepoint.tileSet.has(toTileIndex);
      if (!fromInside && !toInside) continue;
      let byCreature = chokepoint.byCreature.get(creatureId);
      if (!byCreature) {
        byCreature = {
          tileTransitions: 0,
          entries: 0,
          exits: 0,
          throughCrossings: 0,
        };
        chokepoint.byCreature.set(creatureId, byCreature);
      }
      chokepoint.tileTransitions += 1;
      byCreature.tileTransitions += 1;
      if (!fromInside && toInside) {
        chokepoint.entries += 1;
        byCreature.entries += 1;
        const entryRegion = this.connectedRegionAtTile(chokepoint, fromTileIndex);
        if (entryRegion === null) {
          chokepoint.pendingEntryRegionByCreature.delete(creatureId);
        } else {
          chokepoint.pendingEntryRegionByCreature.set(creatureId, entryRegion);
        }
      } else if (fromInside && !toInside) {
        chokepoint.exits += 1;
        byCreature.exits += 1;
        const entryRegion = chokepoint.pendingEntryRegionByCreature.get(creatureId);
        const exitRegion = this.connectedRegionAtTile(chokepoint, toTileIndex);
        if (
          entryRegion !== undefined &&
          exitRegion !== null &&
          entryRegion !== exitRegion
        ) {
          chokepoint.throughCrossings += 1;
          byCreature.throughCrossings += 1;
        }
        chokepoint.pendingEntryRegionByCreature.delete(creatureId);
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
    if (
      event.type === "PLAYER_REPLENISHED_WATER" ||
      event.type === "PLAYER_DRAINED_WATER"
    ) {
      this.waterInterventions.set(event.id, {
        eventId: event.id,
        tick: event.tick,
        targetEntityIds: [...event.targetIds],
        firstResponseTick: null,
      });
    }
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

  private observeHydrationSelections(
    state: SimulationState,
    events: readonly DomainEvent[],
  ): void {
    const decisions = new Map(
      state.decisionRecords.map((record) => [record.id, record] as const),
    );
    for (const event of events) {
      const record = event.decisionRecordIds
        .map((id) => decisions.get(id))
        .find((candidate) => candidate !== undefined);
      if (!record) continue;
      const candidate = selectedCandidate(record);
      if (!candidate) continue;

      if (event.type === "ACTION_STARTED" || event.type === "PLAN_BLOCKED") {
        if (candidate.action === "GATHER_WATER") {
          this.waterGatherAttempts += 1;
          this.waterSourceSelections.add(
            candidate.targetEntityId === null
              ? "NONE"
              : `source:${candidate.targetEntityId.toString()}`,
          );
          if (event.type === "PLAN_BLOCKED") {
            this.blockedWaterGatherAttempts += 1;
            const source = state.resourceNodes.find(
              (node) => node.kind === "WATER" && node.id === candidate.targetEntityId,
            );
            if (source) {
              this.refreshWaterSlotCapacities(state);
              const capacity = this.waterSlotCapacityBySource.get(source.id) ?? 0;
              const claimed = state.creatures.filter(
                (creature) =>
                  creature.alive &&
                  creature.activeAction?.kind === "GATHER_WATER" &&
                  creature.activeAction.targetEntityId === source.id &&
                  creature.activeAction.interactionClaim !== null,
              ).length;
              if (capacity > 0 && claimed >= capacity) {
                this.blockedByContentionWaterGatherAttempts += 1;
              }
            }
          }
        }
      }

      if (
        candidate.desire === "RELIEVE_THIRST" ||
        candidate.action === "GATHER_WATER" ||
        candidate.action === "DRINK" ||
        candidate.action === "SHARE_WATER"
      ) {
        this.recordWaterInterventionResponse(event, record, candidate);
      }
    }
  }

  private recordWaterInterventionResponse(
    event: DomainEvent,
    record: DecisionRecord,
    candidate: DecisionCandidate,
  ): void {
    const evidenceIds = new Set([
      ...event.causedByEventIds,
      ...candidate.factors.flatMap((factor) => [
        ...factor.evidenceEventIds,
        ...(factor.fact?.sourceEventIds ?? []),
      ]),
    ]);
    for (const intervention of this.waterInterventions.values()) {
      if (intervention.firstResponseTick !== null) continue;
      const elapsed = event.tick - intervention.tick;
      if (elapsed < 0 || elapsed > INTERVENTION_RESPONSE_WINDOW_TICKS) continue;
      const targetLinked =
        record.selectedTargetId !== null &&
        intervention.targetEntityIds.includes(record.selectedTargetId);
      if (evidenceIds.has(intervention.eventId) || targetLinked) {
        intervention.firstResponseTick = event.tick;
      }
    }
  }

  private refreshWaterSlotCapacities(state: SimulationState): void {
    if (this.waterSlotCapacityNavigationRevision === state.world.navigationRevision) {
      return;
    }
    this.waterSlotCapacityBySource.clear();
    const geometryState: SimulationState = { ...state, creatures: [] };
    for (const source of state.resourceNodes
      .filter((node) => node.kind === "WATER")
      .sort((left, right) => left.id - right.id)) {
      this.waterSlotCapacityBySource.set(
        source.id,
        availableInteractionSlots(
          geometryState,
          "GATHER_WATER",
          source.id,
          source.tileIndex,
        ).length,
      );
    }
    this.waterSlotCapacityNavigationRevision = state.world.navigationRevision;
  }

  private observeHydrationState(state: SimulationState): void {
    const living = livingCreatures(state);
    for (const creature of living) {
      let accumulator = this.hydrationCreatures.get(creature.id);
      if (!accumulator) {
        accumulator = initialCreatureHydrationAccumulator(creature);
        this.hydrationCreatures.set(creature.id, accumulator);
      }
      accumulator.livingCreatureTicks += 1;
      accumulator.thirstUnitTicks += creature.needs.thirst;
      this.hydrationLivingCreatureTicks += 1;
      this.carriedWaterUnitTicks += creature.inventory.water;
      if (creature.inventory.water > 0) this.carryingCreatureTicks += 1;

      const severe = creature.needs.thirst >= SEVERE_THIRST_THRESHOLD;
      if (severe) {
        if (!accumulator.severeAtLastObservation) {
          accumulator.severeSpellCount += 1;
          accumulator.currentSevereSpellTicks = 0;
          this.firstSevereThirstTick = firstTick(this.firstSevereThirstTick, state.tick);
        }
        accumulator.currentSevereSpellTicks += 1;
        accumulator.severeThirstTicks += 1;
        accumulator.longestSevereSpellTicks = Math.max(
          accumulator.longestSevereSpellTicks,
          accumulator.currentSevereSpellTicks,
        );
      } else if (accumulator.severeAtLastObservation) {
        accumulator.resolvedSevereSpellCount += 1;
        this.hydrationRecoveryLatencies.add(accumulator.currentSevereSpellTicks);
        this.firstSevereThirstRecoveryTick = firstTick(
          this.firstSevereThirstRecoveryTick,
          state.tick,
        );
        accumulator.currentSevereSpellTicks = 0;
      }
      if (creature.needs.thirst >= CRITICAL_THIRST_THRESHOLD) {
        accumulator.criticalThirstTicks += 1;
      }
      accumulator.severeAtLastObservation = severe;
    }

    const sources = state.resourceNodes
      .filter((node) => node.kind === "WATER")
      .sort((left, right) => left.id - right.id);
    const stock = sources.reduce((total, source) => total + source.currentStock, 0);
    const capacity = sources.reduce((total, source) => total + source.maximumStock, 0);
    const depleted = sources.filter((source) => source.currentStock === 0).length;
    this.waterSourceStockUnitTicks += stock;
    this.waterSourceCapacityUnitTicks += capacity;
    this.depletedWaterSourceTicks += depleted;
    if (depleted > 0) this.anyWaterSourceDepletedTicks += 1;

    this.refreshWaterSlotCapacities(state);
    for (const source of sources) {
      const sourceCapacity = this.waterSlotCapacityBySource.get(source.id) ?? 0;
      const claimed = living.filter(
        (creature) =>
          creature.activeAction?.kind === "GATHER_WATER" &&
          creature.activeAction.targetEntityId === source.id &&
          creature.activeAction.interactionClaim !== null,
      ).length;
      this.waterClaimedSlotTicks += claimed;
      this.waterCapacitySlotTicks += sourceCapacity;
      if (sourceCapacity > 0 && claimed >= sourceCapacity) {
        this.saturatedWaterSourceTicks += 1;
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
      case "PLAYER_ADDED_MATERIAL":
      case "PLAYER_REMOVED_MATERIAL":
      case "PLAYER_REPLENISHED_WATER":
      case "PLAYER_DRAINED_WATER":
      case "PLAYER_TOGGLED_OBSTACLE":
        if (event.commandOutcome === "APPLIED") {
          if (event.type === "PLAYER_REPLENISHED_WATER") {
            this.waterReplenishedUnits += event.quantity;
          } else if (event.type === "PLAYER_DRAINED_WATER") {
            this.waterDrainedUnits += event.quantity;
          }
          this.milestones.firstInterventionTick = firstTick(
            this.milestones.firstInterventionTick,
            event.tick,
          );
        }
        break;
      case "WATER_GATHERED":
        this.waterGatheredUnits += event.quantity;
        break;
      case "WATER_DRUNK":
        this.waterDrunkUnits += event.quantity;
        this.firstWaterDrinkTick = firstTick(this.firstWaterDrinkTick, event.tick);
        break;
      case "WATER_SHARED":
        this.waterSharedUnits += event.quantity;
        for (const actorId of event.actorIds) this.waterDonorIds.add(actorId);
        for (const targetId of event.targetIds) this.waterRecipientIds.add(targetId);
        break;
      case "WATER_SOURCE_DEPLETED":
        this.waterSourceDepletionEvents += 1;
        break;
      case "SEVERE_THIRST_STARTED":
        this.firstSevereThirstTick = firstTick(this.firstSevereThirstTick, event.tick);
        break;
      case "SEVERE_THIRST_RESOLVED":
        this.firstSevereThirstRecoveryTick = firstTick(
          this.firstSevereThirstRecoveryTick,
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

  private observeSpatial(state: SimulationState, includeGroupExposure = true): void {
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
    this.observeGroupAndDispersion(state, living, includeGroupExposure);
    this.sampledStates += 1;
  }

  private observeGroupAndDispersion(
    state: SimulationState,
    living: readonly CreatureState[],
    includeExposure: boolean,
  ): void {
    const horizon = groupHorizonProfile(state);
    this.groupCountSamples.add(horizon.groupCount);
    this.groupedCreatureCountSamples.add(horizon.groupedCreatureCount);
    this.groupMembershipRateSamples.add(horizon.membershipRate);
    for (const partition of horizon.partitions) {
      this.groupSizeSamples.add(partition.memberIds.length);
    }
    if (includeExposure) {
      this.groupedCreatureTicks += horizon.groupedCreatureCount;
      this.groupLivingCreatureTicks += living.length;
    }

    const creatureById = new Map(
      living.map((creature) => [creature.id, creature] as const),
    );
    const groupById = new Map(state.groups.map((group) => [group.id, group] as const));
    const groupCentres: Array<{ groupId: number; x: number; y: number }> = [];
    for (const partition of horizon.partitions) {
      if (partition.groupId === null) continue;
      const members = partition.memberIds
        .map((id) => creatureById.get(id))
        .filter((creature): creature is CreatureState => creature !== undefined);
      const centre = centroid(members);
      if (centre) groupCentres.push({ groupId: partition.groupId, ...centre });
      const homeTileIndex = groupById.get(partition.groupId)?.homeTileIndex;
      if (homeTileIndex !== undefined) {
        for (const member of members) {
          this.groupHomeDistanceTiles.add(
            manhattanDistance(state.world, member.tileIndex, homeTileIndex),
          );
        }
      }
    }
    groupCentres.sort((left, right) => left.groupId - right.groupId);
    for (let leftIndex = 0; leftIndex < living.length; leftIndex += 1) {
      const left = living[leftIndex];
      if (!left) continue;
      for (let rightIndex = leftIndex + 1; rightIndex < living.length; rightIndex += 1) {
        const right = living[rightIndex];
        if (!right) continue;
        const distance = manhattanDistance(state.world, left.tileIndex, right.tileIndex);
        this.creaturePairDistanceTiles.add(distance);
        if (left.groupId !== null && left.groupId === right.groupId) {
          this.withinGroupPairDistanceTiles.add(distance);
        }
      }
    }
    for (let leftIndex = 0; leftIndex < groupCentres.length; leftIndex += 1) {
      const left = groupCentres[leftIndex];
      if (!left) continue;
      for (
        let rightIndex = leftIndex + 1;
        rightIndex < groupCentres.length;
        rightIndex += 1
      ) {
        const right = groupCentres[rightIndex];
        if (!right) continue;
        this.groupCentroidDistanceTiles.add(
          round(
            (Math.abs(left.x - right.x) + Math.abs(left.y - right.y)) / TILE_FIXED_UNITS,
          ),
        );
      }
    }

    const currentGroupByCreature = new Map(
      living.map((creature) => [creature.id, creature.groupId] as const),
    );
    if (this.previousGroupByCreature !== null) {
      const ids = new Set([
        ...this.previousGroupByCreature.keys(),
        ...currentGroupByCreature.keys(),
      ]);
      let changed = false;
      for (const id of [...ids].sort((left, right) => left - right)) {
        if (this.previousGroupByCreature.get(id) !== currentGroupByCreature.get(id)) {
          this.groupMembershipChanges += 1;
          changed = true;
        }
      }
      if (changed) this.groupPartitionChanges += 1;
    }
    this.previousGroupByCreature = currentGroupByCreature;

    const currentLeaderByGroup = new Map(
      state.groups.map((group) => [group.id, group.leaderId] as const),
    );
    if (this.previousLeaderByGroup !== null) {
      for (const [groupId, leaderId] of currentLeaderByGroup) {
        if (
          this.previousLeaderByGroup.has(groupId) &&
          this.previousLeaderByGroup.get(groupId) !== leaderId
        ) {
          this.groupLeaderChanges += 1;
        }
      }
    }
    this.previousLeaderByGroup = currentLeaderByGroup;

    const topology = socialTopologySignature(state);
    if (
      this.previousSocialTopologySignature !== null &&
      this.previousSocialTopologySignature !== topology
    ) {
      this.currentTickStructuralSocialChanges = 1;
    }
    this.previousSocialTopologySignature = topology;
  }

  private observeStalemateTick(
    state: SimulationState,
    events: readonly DomainEvent[],
  ): void {
    const sample: StalemateTickSample = {
      tick: state.tick,
      movementFixedUnits: this.currentTickMovementFixedUnits,
      livingCreatureTicks: state.creatures.filter((creature) => creature.alive).length,
      actionTransitions: this.currentTickActionTransitions,
      transitionKeys: [...this.currentTickTransitionKeys].sort(compareText),
      structuralSocialChanges: this.currentTickStructuralSocialChanges,
      significantEvents: events.filter((event) =>
        significantEventTiers.has(event.attentionTier),
      ).length,
    };
    if (this.stalemateSamples.length < STALEMATE_WINDOW_TICKS) {
      this.stalemateSamples.push(sample);
    } else {
      this.stalemateSamples[this.stalemateSampleCursor] = sample;
      this.stalemateSampleCursor =
        (this.stalemateSampleCursor + 1) % STALEMATE_WINDOW_TICKS;
    }
  }

  private stalemateProfile(): StalemateProfile {
    const movementFixedUnits = this.stalemateSamples.reduce(
      (total, sample) => total + sample.movementFixedUnits,
      0,
    );
    const livingCreatureTicks = this.stalemateSamples.reduce(
      (total, sample) => total + sample.livingCreatureTicks,
      0,
    );
    const movementFixedUnitsPerLivingCreatureTick =
      livingCreatureTicks === 0 ? 0 : round(movementFixedUnits / livingCreatureTicks);
    const transitionKeys = new Set(
      this.stalemateSamples.flatMap((sample) => sample.transitionKeys),
    );
    const actionTransitions = this.stalemateSamples.reduce(
      (total, sample) => total + sample.actionTransitions,
      0,
    );
    const structuralSocialChanges = this.stalemateSamples.reduce(
      (total, sample) => total + sample.structuralSocialChanges,
      0,
    );
    const significantEvents = this.stalemateSamples.reduce(
      (total, sample) => total + sample.significantEvents,
      0,
    );
    const eligible =
      this.stalemateSamples.length === STALEMATE_WINDOW_TICKS && livingCreatureTicks > 0;
    const signals = {
      lowMovement:
        movementFixedUnitsPerLivingCreatureTick <=
        STALEMATE_MAX_MOVEMENT_FIXED_UNITS_PER_LIVING_CREATURE_TICK,
      lowActionTransitions: actionTransitions <= STALEMATE_MAX_ACTION_TRANSITIONS,
      noStructuralSocialChange: structuralSocialChanges === 0,
      noSignificantEvents: significantEvents === 0,
    };
    return {
      windowTicks: STALEMATE_WINDOW_TICKS,
      observedWindowTicks: this.stalemateSamples.length,
      eligible,
      thresholds: {
        maximumMovementFixedUnitsPerLivingCreatureTick:
          STALEMATE_MAX_MOVEMENT_FIXED_UNITS_PER_LIVING_CREATURE_TICK,
        maximumActionTransitions: STALEMATE_MAX_ACTION_TRANSITIONS,
      },
      movementFixedUnits,
      livingCreatureTicks,
      movementFixedUnitsPerLivingCreatureTick,
      actionTransitions,
      uniqueActionTransitions: transitionKeys.size,
      structuralSocialChanges,
      significantEvents,
      signals,
      declared:
        eligible &&
        signals.lowMovement &&
        signals.lowActionTransitions &&
        signals.noStructuralSocialChange &&
        signals.noSignificantEvents,
    };
  }
}

class CategoricalAccumulator {
  private readonly counts = new Map<string, number>();
  private sampleCount = 0;

  add(category: string): void {
    this.sampleCount += 1;
    this.counts.set(category, (this.counts.get(category) ?? 0) + 1);
  }

  count(category: string): number {
    return this.counts.get(category) ?? 0;
  }

  report(): CategoricalConcentrationProfile {
    const byCategory = [...this.counts.entries()]
      .sort(([left], [right]) => compareText(left, right))
      .map(([category, count]): CategoryCountProfile => ({
        category,
        count,
        share: this.sampleCount === 0 ? 0 : round(count / this.sampleCount),
      }));
    const dominantCategory =
      [...byCategory].sort(
        (left, right) =>
          right.count - left.count || compareText(left.category, right.category),
      )[0] ?? null;
    return {
      samples: this.sampleCount,
      distinctCategories: byCategory.length,
      dominantCategory,
      dominantShare: dominantCategory?.share ?? 0,
      herfindahlIndex:
        this.sampleCount === 0
          ? 0
          : round(
              byCategory.reduce(
                (total, category) => total + category.count * category.count,
                0,
              ) /
                (this.sampleCount * this.sampleCount),
            ),
      byCategory,
    };
  }
}

export function summarizeActivityProfiles(
  profiles: readonly ActivityProfile[],
): ActivityProfileAggregate {
  const firstProfile = profiles[0];
  for (const profile of profiles) {
    if (profile.seed !== profile.scenario.seed) {
      throw new Error(
        `Activity profile seed ${profile.seed} does not match scenario seed ${profile.scenario.seed}.`,
      );
    }
    if (firstProfile && !sameScenarioDefinition(profile.scenario, firstProfile.scenario)) {
      throw new Error(
        `Activity profiles cannot mix scenario definitions (${firstProfile.scenario.scenarioId}@${firstProfile.scenario.scenarioVersion}/${firstProfile.scenario.mapGenerationVersion} versus ${profile.scenario.scenarioId}@${profile.scenario.scenarioVersion}/${profile.scenario.mapGenerationVersion}).`,
      );
    }
    if (
      firstProfile &&
      (profile.scenarioSpatial.regions.length !==
        firstProfile.scenarioSpatial.regions.length ||
        profile.scenarioSpatial.chokepoints.length !==
          firstProfile.scenarioSpatial.chokepoints.length)
    ) {
      throw new Error(
        `Activity profile for seed ${profile.seed} has incompatible compiled scenario geometry.`,
      );
    }
  }
  const aggregateRegions: ScenarioRegionActivityAggregate[] =
    firstProfile?.scenarioSpatial.regions.map((referenceRegion) => {
      const regions = profiles.map((profile) => {
        const region = profile.scenarioSpatial.regions.find(
          (candidate) => candidate.id === referenceRegion.id,
        );
        if (!region || region.label !== referenceRegion.label) {
          throw new Error(
            `Activity profile for seed ${profile.seed} has incompatible region ${referenceRegion.id}.`,
          );
        }
        return region;
      });
      return {
        id: referenceRegion.id,
        label: referenceRegion.label,
        initiallyReachable: wilsonOutcome(
          regions.filter((region) => region.initiallyReachable).length,
          regions.length,
        ),
        occupancyExposureRate: summarize(
          regions.map((region) => region.occupancyExposureRate),
        ),
        occupiedTicks: summarize(regions.map((region) => region.occupiedTicks)),
      };
    }) ?? [];
  const aggregateChokepoints: ScenarioChokepointActivityAggregate[] =
    firstProfile?.scenarioSpatial.chokepoints.map((referenceChokepoint) => {
      const chokepoints = profiles.map((profile) => {
        const chokepoint = profile.scenarioSpatial.chokepoints.find(
          (candidate) => candidate.id === referenceChokepoint.id,
        );
        if (!chokepoint || chokepoint.label !== referenceChokepoint.label) {
          throw new Error(
            `Activity profile for seed ${profile.seed} has incompatible chokepoint ${referenceChokepoint.id}.`,
          );
        }
        return chokepoint;
      });
      return {
        id: referenceChokepoint.id,
        label: referenceChokepoint.label,
        throughCrossings: summarize(
          chokepoints.map((chokepoint) => chokepoint.throughCrossings),
        ),
        entries: summarize(chokepoints.map((chokepoint) => chokepoint.entries)),
        exits: summarize(chokepoints.map((chokepoint) => chokepoint.exits)),
        tileTransitions: summarize(
          chokepoints.map((chokepoint) => chokepoint.tileTransitions),
        ),
      };
    }) ?? [];
  const aggregateDesires: DesireFamilyActivityAggregate[] = DESIRE_FAMILIES.map(
    (family) => ({
      family,
      exposureRate: summarize(
        profiles.map(
          (profile) =>
            profile.desires.byFamily.find((candidate) => candidate.family === family)
              ?.exposureRate ?? 0,
        ),
      ),
      changesInto: summarize(
        profiles.map(
          (profile) =>
            profile.desires.byFamily.find((candidate) => candidate.family === family)
              ?.changesInto ?? 0,
        ),
      ),
      changesOutOf: summarize(
        profiles.map(
          (profile) =>
            profile.desires.byFamily.find((candidate) => candidate.family === family)
              ?.changesOutOf ?? 0,
        ),
      ),
    }),
  );
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
  const milestoneAggregates = ACTIVITY_MILESTONE_KINDS.map(
    (milestone): MilestoneAggregate => {
      const observations = profiles.map((profile) => {
        const observation = profile.milestoneObservations.find(
          (candidate) => candidate.milestone === milestone,
        );
        if (!observation) {
          throw new Error(
            `Activity profile for seed ${profile.seed} is missing milestone ${milestone}.`,
          );
        }
        return observation;
      });
      const occurrences = observations.filter((observation) => observation.occurred);
      const censored = observations.filter((observation) => observation.rightCensored);
      return {
        milestone,
        occurrence: wilsonOutcome(occurrences.length, observations.length),
        timeToEventTicks: summarizePresent(
          occurrences.map((observation) => observation.elapsedTicks),
        ),
        rightCensoredRuns: censored.length,
        censoringDurationTicks: summarize(
          censored.map((observation) => observation.observedDurationTicks),
        ),
      };
    },
  );
  const stalemateEligibleProfiles = profiles.filter(
    (profile) => profile.stalemate.eligible,
  );
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
    const dominantAction = profile.actions.analysis.dominantAction;
    if (dominantAction !== null && dominantAction.share > ACTION_DOMINANCE_WARNING_SHARE) {
      warnings.push(
        `Seed ${profile.seed} action ${dominantAction.kind} share ${dominantAction.share} exceeds ${ACTION_DOMINANCE_WARNING_SHARE}.`,
      );
    }
    const dominantTransition = profile.actions.analysis.dominantTransition;
    if (
      dominantTransition !== null &&
      dominantTransition.share > TRANSITION_DOMINANCE_WARNING_SHARE
    ) {
      warnings.push(
        `Seed ${profile.seed} transition ${dominantTransition.from ?? "NONE"}->${dominantTransition.to} share ${dominantTransition.share} exceeds ${TRANSITION_DOMINANCE_WARNING_SHARE}.`,
      );
    }
    if (profile.actions.analysis.repetitionRate > TRANSITION_REPETITION_WARNING_RATE) {
      warnings.push(
        `Seed ${profile.seed} repeated-transition rate ${profile.actions.analysis.repetitionRate} exceeds ${TRANSITION_REPETITION_WARNING_RATE}.`,
      );
    }
    if (profile.stalemate.declared) {
      warnings.push(
        `Seed ${profile.seed} meets the declared ${STALEMATE_WINDOW_TICKS}-tick stalemate definition.`,
      );
    }
    if (profile.horizon.resources.unreachableCreatureResourceKinds > 0) {
      warnings.push(
        `Seed ${profile.seed} has ${profile.horizon.resources.unreachableCreatureResourceKinds} unreachable creature/resource-kind pairs at the horizon.`,
      );
    }
    for (const warning of profile.diagnostics.warnings) {
      warnings.push(
        `Scenario ${profile.scenario.scenarioId} seed ${profile.seed}: ${warning}`,
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
      groupCount: summarize(profiles.map((profile) => profile.groups.horizon.groupCount)),
      groupedMembershipRate: summarize(
        profiles.map((profile) => profile.groups.horizon.membershipRate),
      ),
      largestGroupSize: summarize(
        profiles.map((profile) => profile.groups.horizon.largestGroupSize),
      ),
      relationshipComponentCount: summarize(
        profiles.map((profile) => profile.relationships.componentCount),
      ),
      relationshipDensity: summarize(
        profiles.map((profile) => profile.relationships.density),
      ),
      relationshipReciprocity: summarize(
        profiles.map((profile) => profile.relationships.reciprocity),
      ),
      relationshipTrustMedian: summarizePresent(
        profiles.map((profile) => profile.relationships.trust.median),
      ),
      relationshipRivalryMedian: summarizePresent(
        profiles.map((profile) => profile.relationships.rivalry.median),
      ),
      relationshipFearMedian: summarizePresent(
        profiles.map((profile) => profile.relationships.fear.median),
      ),
      creaturePairDistanceMedian: summarizePresent(
        profiles.map(
          (profile) => profile.spatial.dispersion.creaturePairDistanceTiles.median,
        ),
      ),
      withinGroupPairDistanceMedian: summarizePresent(
        profiles.map(
          (profile) => profile.spatial.dispersion.withinGroupPairDistanceTiles.median,
        ),
      ),
      groupHomeDistanceMedian: summarizePresent(
        profiles.map((profile) => profile.spatial.dispersion.groupHomeDistanceTiles.median),
      ),
      routeDominantEdgeShare: summarize(
        profiles.map((profile) => profile.spatial.routes.dominantEdgeShare),
      ),
      routeHerfindahlIndex: summarize(
        profiles.map((profile) => profile.spatial.routes.herfindahlIndex),
      ),
      resourceStockRatio: summarize(
        profiles.map((profile) => profile.horizon.resources.stockRatio),
      ),
      completedStorageCount: summarize(
        profiles.map((profile) => profile.horizon.storage.completedStorageCount),
      ),
      storedFood: summarize(profiles.map((profile) => profile.horizon.storage.food)),
      storedMaterial: summarize(
        profiles.map((profile) => profile.horizon.storage.material),
      ),
      actionDominanceShare: summarize(
        profiles.map((profile) => profile.actions.analysis.dominantAction?.share ?? 0),
      ),
      transitionDominanceShare: summarize(
        profiles.map((profile) => profile.actions.analysis.dominantTransition?.share ?? 0),
      ),
      transitionRepetitionRate: summarize(
        profiles.map((profile) => profile.actions.analysis.repetitionRate),
      ),
      uniqueActionTransitions: summarize(
        profiles.map((profile) => profile.actions.analysis.uniqueTransitions),
      ),
      stalemateMovementRate: summarize(
        profiles.map(
          (profile) => profile.stalemate.movementFixedUnitsPerLivingCreatureTick,
        ),
      ),
      stalemateActionTransitions: summarize(
        profiles.map((profile) => profile.stalemate.actionTransitions),
      ),
      stalemateUniqueTransitions: summarize(
        profiles.map((profile) => profile.stalemate.uniqueActionTransitions),
      ),
      stalemateStructuralSocialChanges: summarize(
        profiles.map((profile) => profile.stalemate.structuralSocialChanges),
      ),
      stalemateSignificantEvents: summarize(
        profiles.map((profile) => profile.stalemate.significantEvents),
      ),
      actionStartDominanceShare: summarize(
        profiles.map(
          (profile) => profile.actions.selectionConcentration.overall.actions.dominantShare,
        ),
      ),
      targetDominanceShare: summarize(
        profiles.map(
          (profile) => profile.actions.selectionConcentration.overall.targets.dominantShare,
        ),
      ),
      targetLocationDominanceShare: summarize(
        profiles.map(
          (profile) =>
            profile.actions.selectionConcentration.overall.targetLocations.dominantShare,
        ),
      ),
      actorGroupDominanceShare: summarize(
        profiles.map(
          (profile) =>
            profile.actions.selectionConcentration.overall.actorGroups.dominantShare,
        ),
      ),
      desireFamilyDominanceShare: summarize(
        profiles.map((profile) =>
          Math.max(0, ...profile.desires.byFamily.map((family) => family.exposureRate)),
        ),
      ),
      totalChokepointThroughCrossings: summarize(
        profiles.map((profile) =>
          profile.scenarioSpatial.chokepoints.reduce(
            (total, chokepoint) => total + chokepoint.throughCrossings,
            0,
          ),
        ),
      ),
      unobservedRegionCount: summarize(
        profiles.map((profile) => profile.diagnostics.unobservedRegions.length),
      ),
    },
    milestones: milestoneAggregates,
    stalemate: wilsonOutcome(
      stalemateEligibleProfiles.filter((profile) => profile.stalemate.declared).length,
      stalemateEligibleProfiles.length,
    ),
    desires: aggregateDesires,
    scenarioSpatial: {
      regions: aggregateRegions,
      chokepoints: aggregateChokepoints,
    },
    hydration: {
      gatheredUnits: profiles.reduce(
        (total, profile) => total + profile.hydration.flow.gatheredUnits,
        0,
      ),
      drunkUnits: profiles.reduce(
        (total, profile) => total + profile.hydration.flow.drunkUnits,
        0,
      ),
      sharedUnits: profiles.reduce(
        (total, profile) => total + profile.hydration.flow.sharedUnits,
        0,
      ),
      donorIds: [
        ...new Set(profiles.flatMap((profile) => profile.hydration.flow.donorIds)),
      ].sort((left, right) => left - right),
      recipientIds: [
        ...new Set(profiles.flatMap((profile) => profile.hydration.flow.recipientIds)),
      ].sort((left, right) => left - right),
      seedDistributions: {
        meanThirst: summarize(profiles.map((profile) => profile.hydration.need.meanThirst)),
        severeExposureRate: summarize(
          profiles.map((profile) => profile.hydration.need.severeExposureRate),
        ),
        criticalExposureRate: summarize(
          profiles.map((profile) => profile.hydration.need.criticalExposureRate),
        ),
        longestSevereSpellTicks: summarize(
          profiles.map((profile) => profile.hydration.need.longestSevereSpellTicks),
        ),
        recoveryLatencyMedianTicks: summarizePresent(
          profiles.map((profile) => profile.hydration.need.recoveryLatencyTicks.median),
        ),
        carriedWaterAtHorizon: summarize(
          profiles.map((profile) => profile.hydration.flow.carriedWaterAtHorizon),
        ),
        depletedSourceTicks: summarize(
          profiles.map((profile) => profile.hydration.sources.depletedSourceTicks),
        ),
        sourceUtilization: summarize(
          profiles.map((profile) => profile.hydration.sources.utilization),
        ),
        sourceSelectionHerfindahlIndex: summarize(
          profiles.map((profile) => profile.hydration.sources.selection.herfindahlIndex),
        ),
        gatherContentionRate: summarize(
          profiles.map((profile) => profile.hydration.sources.contentionRate),
        ),
        unreachableWaterAccessPairs: summarize(
          profiles.map((profile) => profile.hydration.access.unreachablePairs),
        ),
        waterAccessWeightedCostMedian: summarizePresent(
          profiles.map((profile) => profile.hydration.access.weightedCost.median),
        ),
        waterRouteDominantEdgeShare: summarize(
          profiles.map((profile) => profile.hydration.routes.dominantEdgeShare),
        ),
        waterRouteHerfindahlIndex: summarize(
          profiles.map((profile) => profile.hydration.routes.herfindahlIndex),
        ),
        waterInterventionResponseLatencyMedianTicks: summarizePresent(
          profiles.map(
            (profile) =>
              profile.hydration.interventionResponses.firstResponseLatencyTicks.median,
          ),
        ),
      },
    },
    settlement: summarizeSettlementProfiles(profiles.map((profile) => profile.settlement)),
    warnings: warnings.sort(compareText),
  };
}
