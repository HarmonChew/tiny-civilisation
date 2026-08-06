import { createHash } from "node:crypto";

import { SCENARIO_IDS, type ScenarioId } from "@tiny-civ/sim-core";

const CALIBRATION_SEEDS = Object.freeze(
  Array.from({ length: 64 }, (_, index) => index + 1),
);
const CALIBRATION_TICKS = 10_000;
const EXPECTED_RUN_COUNT = SCENARIO_IDS.length * CALIBRATION_SEEDS.length;

const OUTCOME_LABEL_IDS = [
  "COOPERATIVE_SHARED_STORAGE",
  "FRAGMENTED_SOCIAL_STRUCTURE",
  "PERSISTENT_PRIVATE_RESERVES",
  "RECURRING_CONFLICT",
  "SHARED_HYDRATION",
  "SOURCE_BOTTLENECK",
  "PERSISTENT_DEHYDRATION",
  "CONCENTRATED_WATER_ROUTES",
  "ESTABLISHED_SETTLEMENT",
  "CHRONIC_SHELTER_NEGLECT",
  "SHELTER_CROWDING",
  "GUEST_SHELTERING",
  "SETTLEMENT_RELOCATION",
  "QUIET_STALEMATE",
] as const;

const HARD_INVARIANT_IDS = [
  "PROFILE_SCENARIO_IDENTITY_MATCH",
  "PROFILE_COMPILED_MAP_HASH_MATCH",
  "CRITICAL_RESOURCE_REACHABILITY",
  "OCCUPIED_TILE_P10",
  "OCCUPIED_TILE_MEDIAN",
  "EXACT_OVERLAP_RATE",
  "PER_SEED_KEEP_SHARE",
] as const;

const CORPUS_INVARIANT_IDS = [
  "MINIMUM_RUN_OCCUPIED_TILE_P10",
  "MINIMUM_RUN_OCCUPIED_TILE_MEDIAN",
  "MAXIMUM_RUN_EXACT_OVERLAP_RATE",
  "CORPUS_KEEP_SHARE",
  "MAXIMUM_RUN_KEEP_SHARE",
  "OBSERVED_ACTION_FAMILY_COUNT",
  "OBSERVED_DESIRE_FAMILY_COUNT",
] as const;

const MACRO_METRICS = [
  ["GROUP_COUNT", "SOCIAL", "ZERO_IS_OBSERVED"],
  ["RELATIONSHIP_COMPONENT_COUNT", "SOCIAL", "ZERO_IS_OBSERVED"],
  ["COMPLETED_STORAGE_COUNT", "STORAGE", "ZERO_IS_OBSERVED"],
  ["STORED_RESOURCE_UNITS", "STORAGE", "ZERO_IS_OBSERVED"],
  ["ATTACK_EVENT_COUNT", "CONFLICT", "ZERO_IS_OBSERVED"],
  ["CREATURE_PAIR_DISTANCE_MEDIAN", "SPATIAL", "ZERO_IS_OBSERVED"],
  ["ROUTE_HERFINDAHL_INDEX", "SPATIAL", "ZERO_IS_OBSERVED"],
  ["SEVERE_THIRST_EXPOSURE_RATE", "HYDRATION", "ZERO_IS_OBSERVED"],
  ["DEPLETED_WATER_SOURCE_TICKS", "HYDRATION", "ZERO_IS_OBSERVED"],
  ["WATER_SHARED_UNITS", "HYDRATION", "ZERO_IS_OBSERVED"],
  ["WATER_ROUTE_HERFINDAHL_INDEX", "HYDRATION", "ZERO_IS_OBSERVED"],
  ["ACTIVE_SHELTER_COUNT", "SETTLEMENT", "ZERO_IS_OBSERVED"],
  ["SHELTERED_REST_SHARE", "SETTLEMENT", "ZERO_IS_OBSERVED"],
  ["MEAN_SHELTER_CONDITION", "SETTLEMENT", "EXCLUDE_PAIR_IF_EITHER_VALUE_MISSING"],
  ["SHELTER_GUEST_USE_EVENTS", "SETTLEMENT", "ZERO_IS_OBSERVED"],
  ["SETTLEMENT_RELOCATION_COUNT", "SETTLEMENT", "ZERO_IS_OBSERVED"],
] as const;

type ShapeProjection = Readonly<Record<string, readonly string[]>>;

const PROFILE_SHAPE = {
  $: [
    "schemaVersion",
    "scenario",
    "compiledMapHash",
    "seed",
    "window",
    "actions",
    "movement",
    "spatial",
    "interactions",
    "significantEvents",
    "interventionResponses",
    "milestones",
    "milestoneObservations",
    "groups",
    "relationships",
    "horizon",
    "stalemate",
    "desires",
    "hydration",
    "settlement",
    "scenarioSpatial",
    "diagnostics",
  ],
  window: [
    "startTick",
    "endTick",
    "observedTicks",
    "sampledStates",
    "sampleEveryTicks",
    "ticksPerSecond",
  ],
  actions: [
    "completedActions",
    "byKind",
    "byCreature",
    "transitions",
    "analysis",
    "selectionConcentration",
  ],
  "actions.analysis": [
    "dominantAction",
    "totalTransitions",
    "uniqueTransitions",
    "dominantTransition",
    "repeatedTransitions",
    "repetitionRate",
  ],
  "actions.selectionConcentration": ["overall", "byCreature", "byAction"],
  movement: [
    "distanceFixedUnits",
    "distanceTiles",
    "fixedUnitsPerSimulatedMinute",
    "byCreature",
  ],
  spatial: ["occupiedTiles", "crowding", "exactOverlap", "slots", "dispersion", "routes"],
  "spatial.crowding": [
    "creaturesPerMostCrowdedTile",
    "maximumCreaturesPerTile",
    "creaturesPerMostCrowdedInteractionAnchor",
    "maximumCreaturesPerInteractionAnchor",
  ],
  "spatial.exactOverlap": [
    "overlappingCreatureTicks",
    "livingCreatureTicks",
    "rate",
    "overlapGroups",
    "maximumConsecutiveTicks",
  ],
  "spatial.slots": [
    "sampledAnchorPurposeTicks",
    "claimedSlotTicks",
    "availableSlotTicks",
    "capacitySlotTicks",
    "saturatedAnchorPurposeTicks",
    "utilisation",
    "byPurpose",
    "byAnchor",
    "contentionCount",
    "failedClaimCount",
  ],
  "spatial.dispersion": [
    "creaturePairDistanceTiles",
    "withinGroupPairDistanceTiles",
    "groupHomeDistanceTiles",
    "groupCentroidDistanceTiles",
    "byCreatureAtHorizon",
    "byGroupAtHorizon",
  ],
  "spatial.routes": [
    "traversals",
    "uniqueDirectedEdges",
    "dominantEdge",
    "dominantEdgeShare",
    "top10PercentEdgeShare",
    "herfindahlIndex",
    "byEdge",
  ],
  interactions: ["count", "per1_000Ticks", "byType"],
  significantEvents: [
    "tiers",
    "count",
    "per1_000Ticks",
    "intervals",
    "trailingSilenceTicks",
    "byType",
  ],
  interventionResponses: [
    "windowTicks",
    "changes",
    "respondingCreatures",
    "firstResponseTick",
    "byKind",
  ],
  milestones: [
    "firstGroupTick",
    "firstStorageSiteTick",
    "firstStorageTick",
    "firstTheftTick",
    "firstConflictTick",
    "firstRecoveryTick",
    "firstInterventionTick",
    "firstInterventionResponseTick",
  ],
  groups: ["horizon", "overWindow"],
  "groups.horizon": [
    "groupCount",
    "groupedCreatureCount",
    "ungroupedCreatureCount",
    "membershipRate",
    "partitions",
    "ungroupedCreatureIds",
    "groupSizes",
    "largestGroupSize",
    "groupsWithLeader",
  ],
  "groups.overWindow": [
    "groupCount",
    "groupedCreatureCount",
    "membershipRate",
    "groupSizes",
    "groupedCreatureTicks",
    "livingCreatureTicks",
    "timeSpentGroupedRate",
    "membershipChanges",
    "partitionChanges",
    "leaderChanges",
  ],
  relationships: [
    "vertexCount",
    "directedEdgeCount",
    "possibleDirectedEdges",
    "density",
    "components",
    "componentCount",
    "componentSizes",
    "connectedDyads",
    "reciprocalDyads",
    "reciprocatedDirectedEdges",
    "reciprocity",
    "mutualDyadRate",
    "outDegree",
    "inDegree",
    "totalDegree",
    "trust",
    "rivalry",
    "fear",
  ],
  horizon: ["tick", "resources", "storage"],
  "horizon.resources": [
    "nodeCount",
    "currentStock",
    "maximumStock",
    "stockRatio",
    "carriedFood",
    "carriedMaterial",
    "carriedWater",
    "groupedCarriedFood",
    "groupedCarriedMaterial",
    "groupedCarriedWater",
    "ungroupedCarriedFood",
    "ungroupedCarriedMaterial",
    "ungroupedCarriedWater",
    "constructionCommittedMaterial",
    "byKind",
    "nodes",
    "accessDistanceTiles",
    "accessWeightedCost",
    "unreachableCreatureResourceKinds",
    "accessByCreatureAndKind",
  ],
  "horizon.storage": [
    "structureCount",
    "completedStorageCount",
    "storageSiteCount",
    "food",
    "material",
    "water",
    "capacity",
    "fillRatio",
    "structures",
  ],
  stalemate: [
    "windowTicks",
    "observedWindowTicks",
    "eligible",
    "thresholds",
    "movementFixedUnits",
    "livingCreatureTicks",
    "movementFixedUnitsPerLivingCreatureTick",
    "actionTransitions",
    "uniqueActionTransitions",
    "structuralSocialChanges",
    "significantEvents",
    "signals",
    "declared",
  ],
  "stalemate.thresholds": [
    "maximumMovementFixedUnitsPerLivingCreatureTick",
    "maximumActionTransitions",
  ],
  "stalemate.signals": [
    "lowMovement",
    "lowActionTransitions",
    "noStructuralSocialChange",
    "noSignificantEvents",
  ],
  desires: [
    "livingCreatureTicks",
    "withoutActiveDesireCreatureTicks",
    "kindChanges",
    "familyChanges",
    "changesToNoActiveDesire",
    "byKind",
    "byFamily",
  ],
  hydration: ["need", "flow", "sources", "access", "routes", "interventionResponses"],
  "hydration.need": [
    "severeThreshold",
    "criticalThreshold",
    "livingCreatureTicks",
    "thirstUnitTicks",
    "meanThirst",
    "severeThirstCreatureTicks",
    "criticalThirstCreatureTicks",
    "severeExposureRate",
    "criticalExposureRate",
    "severeSpellCount",
    "resolvedSevereSpellCount",
    "longestSevereSpellTicks",
    "recoveryLatencyTicks",
    "firstSevereTick",
    "firstDrinkTick",
    "firstRecoveryTick",
    "byCreature",
  ],
  "hydration.flow": [
    "gatheredUnits",
    "drunkUnits",
    "sharedUnits",
    "carriedWaterAtHorizon",
    "carriedWaterUnitTicks",
    "carryingCreatureTicks",
    "donorIds",
    "recipientIds",
    "distinctDonors",
    "distinctRecipients",
  ],
  "hydration.sources": [
    "nodeCount",
    "initialStock",
    "stockAtHorizon",
    "maximumStockAtHorizon",
    "stockUnitTicks",
    "capacityUnitTicks",
    "utilization",
    "depletedSourceTicks",
    "anySourceDepletedTicks",
    "depletionEvents",
    "replenishedUnits",
    "drainedUnits",
    "gatherAttempts",
    "blockedGatherAttempts",
    "contendedGatherAttempts",
    "blockedByContentionGatherAttempts",
    "contentionRate",
    "claimedSlotTicks",
    "capacitySlotTicks",
    "saturatedSourceTicks",
    "selection",
  ],
  "hydration.access": [
    "pairCount",
    "reachablePairs",
    "unreachablePairs",
    "weightedCost",
    "nearestSourceWeightedCostByCreature",
    "byPair",
  ],
  "hydration.routes": [
    "traversals",
    "uniqueUndirectedEdges",
    "dominantEdge",
    "dominantEdgeShare",
    "herfindahlIndex",
    "byEdge",
  ],
  "hydration.interventionResponses": [
    "windowTicks",
    "appliedWaterInterventions",
    "interventionsWithResponse",
    "firstResponseLatencyTicks",
  ],
  settlement: [
    "fatigue",
    "rest",
    "construction",
    "condition",
    "occupancy",
    "access",
    "relocation",
    "horizon",
  ],
  "settlement.fatigue": [
    "elevatedThreshold",
    "livingCreatureTicks",
    "fatigueUnitTicks",
    "meanFatigue",
    "elevatedFatigueCreatureTicks",
    "elevatedExposureRate",
    "elevatedSpellCount",
    "resolvedElevatedSpellCount",
    "longestElevatedSpellTicks",
    "recoveredFatigueUnits",
    "recoveryLatencyTicks",
    "firstElevatedTick",
    "firstRecoveryTick",
    "byCreature",
  ],
  "settlement.rest": [
    "shelteredRestEvents",
    "outdoorRestEvents",
    "totalRestEvents",
    "shelteredRestShare",
    "shelteredRestCreatureTicks",
    "outdoorRestCreatureTicks",
    "memberUseEvents",
    "guestUseEvents",
  ],
  "settlement.construction": [
    "sitesSelected",
    "starts",
    "completions",
    "workAdvanceEvents",
    "contributorIds",
    "distinctContributors",
    "completionLatencyTicks",
    "shelters",
  ],
  "settlement.condition": [
    "activeShelterTicks",
    "conditionUnitTicks",
    "meanCondition",
    "lowConditionShelterTicks",
    "lowConditionExposureRate",
    "lowTransitions",
    "recoveredTransitions",
    "maintenanceEvents",
    "maintenanceMaterial",
    "conditionAtHorizon",
  ],
  "settlement.occupancy": [
    "effectiveCapacityTicks",
    "reservedSpaceTicks",
    "restingCreatureTicks",
    "memberReservationTicks",
    "guestReservationTicks",
    "memberRestingCreatureTicks",
    "guestRestingCreatureTicks",
    "reservationUtilization",
    "physicalUseRate",
    "deniedClaims",
    "crowdingEvents",
    "maximumReservedSpaces",
    "maximumRestingCreatures",
  ],
  "settlement.access": [
    "assessedSiteCount",
    "memberTravelCost",
    "storageTravelCost",
    "foodAccessCost",
    "materialAccessCost",
    "waterAccessCost",
    "crowdingCost",
    "constructionInvestmentCost",
    "relocationChangeCost",
    "totalScore",
    "bySite",
  ],
  "settlement.relocation": ["abandonments", "relocations", "scoreImprovement"],
  "settlement.horizon": [
    "shelterSiteCount",
    "activeShelterCount",
    "abandonedShelterCount",
    "groupsWithActiveShelter",
    "groupsWithPendingShelter",
    "structures",
  ],
  scenarioSpatial: ["observedTicks", "livingCreatureTicks", "regions", "chokepoints"],
  diagnostics: [
    "decisionRecordsObserved",
    "unobservedActions",
    "noCandidateActions",
    "unobservedDesires",
    "noCandidateDesires",
    "unobservedRegions",
    "initiallyUnreachableRegions",
    "warnings",
    "limitations",
  ],
} satisfies ShapeProjection;

const ACTIVITY_AGGREGATE_SHAPE = {
  $: [
    "runCount",
    "totalObservedTicks",
    "completedActions",
    "actionShares",
    "movementDistanceFixedUnits",
    "interactionCount",
    "significantEventCount",
    "claimedSlotTicks",
    "capacitySlotTicks",
    "slotUtilisation",
    "contentionCount",
    "failedClaimCount",
    "interventionResponseChanges",
    "seedDistributions",
    "milestones",
    "stalemate",
    "desires",
    "scenarioSpatial",
    "hydration",
    "settlement",
    "warnings",
  ],
  seedDistributions: [
    "keepShare",
    "occupiedTileMedian",
    "exactOverlapRate",
    "maximumTileCrowding",
    "maximumInteractionAnchorCrowding",
    "movementPerSimulatedMinute",
    "interactionsPer1_000Ticks",
    "significantEventsPer1_000Ticks",
    "trailingSilenceTicks",
    "slotUtilisation",
    "saturatedAnchorPurposeTicks",
    "interventionResponseChanges",
    "groupCount",
    "groupedMembershipRate",
    "largestGroupSize",
    "relationshipComponentCount",
    "relationshipDensity",
    "relationshipReciprocity",
    "relationshipTrustMedian",
    "relationshipRivalryMedian",
    "relationshipFearMedian",
    "creaturePairDistanceMedian",
    "withinGroupPairDistanceMedian",
    "groupHomeDistanceMedian",
    "routeDominantEdgeShare",
    "routeHerfindahlIndex",
    "resourceStockRatio",
    "completedStorageCount",
    "storedFood",
    "storedMaterial",
    "actionDominanceShare",
    "transitionDominanceShare",
    "transitionRepetitionRate",
    "uniqueActionTransitions",
    "stalemateMovementRate",
    "stalemateActionTransitions",
    "stalemateUniqueTransitions",
    "stalemateStructuralSocialChanges",
    "stalemateSignificantEvents",
    "actionStartDominanceShare",
    "targetDominanceShare",
    "targetLocationDominanceShare",
    "actorGroupDominanceShare",
    "desireFamilyDominanceShare",
    "totalChokepointThroughCrossings",
    "unobservedRegionCount",
  ],
  stalemate: ["runs", "occurrences", "incidence", "wilson95"],
  "stalemate.wilson95": ["confidence", "lower", "upper"],
  scenarioSpatial: ["regions", "chokepoints"],
  hydration: [
    "gatheredUnits",
    "drunkUnits",
    "sharedUnits",
    "donorIds",
    "recipientIds",
    "seedDistributions",
  ],
  "hydration.seedDistributions": [
    "meanThirst",
    "severeExposureRate",
    "criticalExposureRate",
    "longestSevereSpellTicks",
    "recoveryLatencyMedianTicks",
    "carriedWaterAtHorizon",
    "depletedSourceTicks",
    "sourceUtilization",
    "sourceSelectionHerfindahlIndex",
    "gatherContentionRate",
    "unreachableWaterAccessPairs",
    "waterAccessWeightedCostMedian",
    "waterRouteDominantEdgeShare",
    "waterRouteHerfindahlIndex",
    "waterInterventionResponseLatencyMedianTicks",
  ],
  settlement: [
    "shelteredRestEvents",
    "outdoorRestEvents",
    "guestUseEvents",
    "deniedClaims",
    "maintenanceMaterial",
    "relocations",
    "seedDistributions",
  ],
  "settlement.seedDistributions": [
    "fatigueExposureRate",
    "fatigueRecoveryLatencyMedianTicks",
    "shelteredRestShare",
    "constructionLatencyMedianTicks",
    "distinctConstructionContributors",
    "meanShelterCondition",
    "lowConditionExposureRate",
    "reservationUtilization",
    "activeShelterCount",
    "guestUseEvents",
    "deniedClaims",
    "siteTotalScoreMedian",
    "relocationScoreImprovementMedian",
  ],
} satisfies ShapeProjection;

const NUMERIC_DISTRIBUTION_KEYS = [
  "samples",
  "min",
  "p10",
  "median",
  "p90",
  "iqr",
  "max",
  "mean",
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function recordAt(value: unknown, label: string): Record<string, unknown> {
  if (!isRecord(value)) throw new Error(`Phase 4.2 ${label} must be an object.`);
  return value;
}

function arrayAt(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`Phase 4.2 ${label} must be an array.`);
  return value;
}

function numberAt(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`Phase 4.2 ${label} must be a finite number.`);
  }
  return value;
}

function nonEmptyStringAt(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Phase 4.2 ${label} must be a non-empty string.`);
  }
  return value;
}

function sortedKeys(value: Record<string, unknown>): string[] {
  return Object.keys(value).sort();
}

function sameSequence<T>(left: readonly T[], right: readonly T[]): boolean {
  return (
    left.length === right.length && left.every((value, index) => value === right[index])
  );
}

function valueAtPath(
  root: Record<string, unknown>,
  path: string,
  label: string,
): Record<string, unknown> {
  if (path === "$") return root;
  let value: unknown = root;
  for (const segment of path.split(".")) {
    value = recordAt(value, `${label} ${path}`)[segment];
  }
  return recordAt(value, `${label} ${path}`);
}

function canonicalProjection(
  root: Record<string, unknown>,
  shape: ShapeProjection,
  label: string,
): Readonly<Record<string, readonly string[]>> {
  return Object.fromEntries(
    Object.keys(shape)
      .sort()
      .map((path) => [path, sortedKeys(valueAtPath(root, path, label))]),
  );
}

function canonicalShapeFingerprint(projection: ShapeProjection): string {
  const canonical = Object.fromEntries(
    Object.entries(projection)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([path, keys]) => [path, [...keys].sort()]),
  );
  return createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}

function assertCanonicalShape(
  root: Record<string, unknown>,
  shape: ShapeProjection,
  label: string,
): void {
  const expectedFingerprint = canonicalShapeFingerprint(shape);
  const observedFingerprint = canonicalShapeFingerprint(
    canonicalProjection(root, shape, label),
  );
  if (observedFingerprint !== expectedFingerprint) {
    throw new Error(
      `Phase 4.2 ${label} does not match canonical structural projection ${expectedFingerprint}; observed ${observedFingerprint}.`,
    );
  }
}

function assertRequiredKeys(
  value: Record<string, unknown>,
  keys: readonly string[],
  label: string,
): void {
  const missing = keys.filter((key) => !Object.hasOwn(value, key));
  if (missing.length > 0) {
    throw new Error(
      `Phase 4.2 ${label} is missing required fields: ${missing.join(", ")}.`,
    );
  }
}

function assertExactKeys(
  value: Record<string, unknown>,
  keys: readonly string[],
  label: string,
): void {
  if (!sameSequence(sortedKeys(value), [...keys].sort())) {
    throw new Error(`Phase 4.2 ${label} has an incomplete or incompatible shape.`);
  }
}

function assertNumericDistribution(value: unknown, label: string): void {
  const distribution = recordAt(value, label);
  assertExactKeys(distribution, NUMERIC_DISTRIBUTION_KEYS, label);
  const samples = numberAt(distribution.samples, `${label} samples`);
  if (!Number.isInteger(samples) || samples < 0) {
    throw new Error(`Phase 4.2 ${label} samples must be a non-negative integer.`);
  }
  for (const key of NUMERIC_DISTRIBUTION_KEYS.slice(1)) {
    const item = distribution[key];
    if (item !== null) numberAt(item, `${label} ${key}`);
  }
}

function assertScenarioDefinition(
  value: unknown,
  expectedScenarioId: ScenarioId,
  label: string,
): void {
  const scenario = recordAt(value, label);
  assertRequiredKeys(
    scenario,
    [
      "kind",
      "schemaVersion",
      "behaviorVersion",
      "scenarioId",
      "scenarioVersion",
      "mapGenerationVersion",
    ],
    label,
  );
  if (
    scenario.kind !== "tiny-civilisation/scenario" ||
    scenario.schemaVersion !== 2 ||
    scenario.behaviorVersion !== 5 ||
    scenario.scenarioId !== expectedScenarioId ||
    scenario.scenarioVersion !== 2 ||
    scenario.mapGenerationVersion !== 1 ||
    Object.hasOwn(scenario, "seed")
  ) {
    throw new Error(`Phase 4.2 ${label} has an incompatible scenario definition.`);
  }
}

function assertEvaluation(
  value: unknown,
  label: string,
  expectedKeys: readonly string[],
): Record<string, unknown> {
  const evaluation = recordAt(value, label);
  assertExactKeys(evaluation, expectedKeys, label);
  nonEmptyStringAt(evaluation.metricPath, `${label} metricPath`);
  return evaluation;
}

function assertRunOutcomeSummary(value: unknown, seed: number, label: string): void {
  const summary = recordAt(value, label);
  assertExactKeys(
    summary,
    [
      "classifierVersion",
      "multiLabel",
      "interpretation",
      "seed",
      "labels",
      "evaluatedLabelIds",
      "notEvaluatedLabelIds",
    ],
    label,
  );
  if (
    summary.classifierVersion !== 3 ||
    summary.multiLabel !== true ||
    summary.interpretation !== "FACTUAL_NON_EXCLUSIVE_NO_WINNER" ||
    summary.seed !== seed
  ) {
    throw new Error(`Phase 4.2 ${label} has incompatible classifier metadata.`);
  }
  const evaluated = arrayAt(summary.evaluatedLabelIds, `${label} evaluated labels`);
  const notEvaluated = arrayAt(summary.notEvaluatedLabelIds, `${label} unevaluated labels`);
  if (!sameSequence(evaluated, OUTCOME_LABEL_IDS) || notEvaluated.length !== 0) {
    throw new Error(
      `Phase 4.2 ${label} must evaluate all classifier-3 labels at 10,000 ticks.`,
    );
  }
  const observedLabels = new Set<string>();
  for (const [index, item] of arrayAt(summary.labels, `${label} labels`).entries()) {
    const outcome = recordAt(item, `${label} label ${index.toString()}`);
    assertExactKeys(
      outcome,
      ["id", "title", "factualSummary", "evidence"],
      `${label} label`,
    );
    if (
      typeof outcome.id !== "string" ||
      !OUTCOME_LABEL_IDS.includes(outcome.id as (typeof OUTCOME_LABEL_IDS)[number]) ||
      observedLabels.has(outcome.id)
    ) {
      throw new Error(`Phase 4.2 ${label} contains an invalid or duplicate outcome label.`);
    }
    observedLabels.add(outcome.id);
    nonEmptyStringAt(outcome.title, `${label} label title`);
    nonEmptyStringAt(outcome.factualSummary, `${label} factual summary`);
    const evidence = arrayAt(outcome.evidence, `${label} label evidence`);
    if (evidence.length === 0) {
      throw new Error(`Phase 4.2 ${label} outcome labels require factual evidence.`);
    }
    for (const evidenceItem of evidence) {
      const fact = recordAt(evidenceItem, `${label} outcome evidence`);
      assertExactKeys(
        fact,
        ["metricPath", "value", "comparison", "threshold"],
        `${label} outcome evidence`,
      );
      nonEmptyStringAt(fact.metricPath, `${label} outcome evidence metricPath`);
    }
  }
}

function assertHardInvariantReport(
  value: unknown,
  seed: number,
  requirePass: boolean,
  label: string,
): void {
  const report = recordAt(value, label);
  assertExactKeys(report, ["seed", "status", "evaluations"], label);
  if (report.seed !== seed) throw new Error(`Phase 4.2 ${label} lost its seed identity.`);
  const evaluations = arrayAt(report.evaluations, `${label} evaluations`);
  if (evaluations.length !== HARD_INVARIANT_IDS.length) {
    throw new Error(`Phase 4.2 ${label} must retain all hard-invariant evaluations.`);
  }
  for (const [index, id] of HARD_INVARIANT_IDS.entries()) {
    const evaluation = assertEvaluation(evaluations[index], `${label} evaluation ${id}`, [
      "id",
      "classification",
      "status",
      "metricPath",
      "observed",
      "comparison",
      "threshold",
      "reason",
    ]);
    if (
      evaluation.id !== id ||
      evaluation.classification !== "LOCKED_CONTRACT_SAFETY_INVARIANT"
    ) {
      throw new Error(
        `Phase 4.2 ${label} hard-invariant definitions are incomplete or reordered.`,
      );
    }
    if (requirePass && evaluation.status !== "PASS") {
      throw new Error(
        `Phase 4.2 ${label} contains a non-passing hard-invariant evaluation.`,
      );
    }
  }
  if (requirePass && report.status !== "PASS") {
    throw new Error(`Phase 4.2 ${label} is not passing.`);
  }
}

function assertProfile(value: unknown, seed: number, label: string): void {
  const profile = recordAt(value, label);
  assertCanonicalShape(profile, PROFILE_SHAPE, label);
  const window = recordAt(profile.window, `${label} window`);
  if (
    profile.schemaVersion !== 5 ||
    profile.seed !== seed ||
    window.startTick !== 0 ||
    window.endTick !== CALIBRATION_TICKS ||
    window.observedTicks !== CALIBRATION_TICKS ||
    window.sampleEveryTicks !== 1 ||
    numberAt(window.sampledStates, `${label} sampledStates`) <= 0 ||
    numberAt(window.ticksPerSecond, `${label} ticksPerSecond`) <= 0
  ) {
    throw new Error(`Phase 4.2 ${label} has incomplete observation-window evidence.`);
  }
  if (
    arrayAt(
      recordAt(profile.actions, `${label} actions`).byKind,
      `${label} actions by kind`,
    ).length < 20 ||
    arrayAt(
      recordAt(profile.actions, `${label} actions`).byCreature,
      `${label} actions by creature`,
    ).length !== 8 ||
    arrayAt(
      recordAt(profile.movement, `${label} movement`).byCreature,
      `${label} movement by creature`,
    ).length !== 8 ||
    arrayAt(profile.milestoneObservations, `${label} milestone observations`).length !==
      8 ||
    arrayAt(
      recordAt(profile.interactions, `${label} interactions`).byType,
      `${label} interaction types`,
    ).length < 20 ||
    arrayAt(recordAt(profile.desires, `${label} desires`).byKind, `${label} desire kinds`)
      .length !== 10 ||
    arrayAt(
      recordAt(profile.desires, `${label} desires`).byFamily,
      `${label} desire families`,
    ).length !== 5 ||
    arrayAt(
      recordAt(
        recordAt(profile.hydration, `${label} hydration`).need,
        `${label} hydration need`,
      ).byCreature,
      `${label} hydration creatures`,
    ).length !== 8 ||
    arrayAt(
      recordAt(
        recordAt(profile.settlement, `${label} settlement`).fatigue,
        `${label} settlement fatigue`,
      ).byCreature,
      `${label} settlement creatures`,
    ).length !== 8
  ) {
    throw new Error(`Phase 4.2 ${label} has stripped per-kind or per-creature evidence.`);
  }
  if (
    recordAt(profile.horizon, `${label} horizon`).tick !== CALIBRATION_TICKS ||
    recordAt(profile.scenarioSpatial, `${label} scenario spatial`).observedTicks !==
      CALIBRATION_TICKS
  ) {
    throw new Error(`Phase 4.2 ${label} horizon does not match the calibration window.`);
  }

  for (const path of [
    "settlement.fatigue.recoveryLatencyTicks",
    "settlement.construction.completionLatencyTicks",
    "settlement.condition.conditionAtHorizon",
    "settlement.access.memberTravelCost",
    "settlement.access.storageTravelCost",
    "settlement.access.foodAccessCost",
    "settlement.access.materialAccessCost",
    "settlement.access.waterAccessCost",
    "settlement.access.crowdingCost",
    "settlement.access.constructionInvestmentCost",
    "settlement.access.relocationChangeCost",
    "settlement.access.totalScore",
    "settlement.relocation.scoreImprovement",
  ]) {
    const segments = path.split(".");
    let item: unknown = profile;
    for (const segment of segments) item = recordAt(item, `${label} ${path}`)[segment];
    assertNumericDistribution(item, `${label} ${path}`);
  }
}

function assertOutcomeIncidence(
  value: unknown,
  expectedLabelId: string,
  label: string,
): void {
  const incidence = recordAt(value, label);
  assertExactKeys(
    incidence,
    [
      "labelId",
      "title",
      "totalRuns",
      "eligibleRuns",
      "runs",
      "occurrences",
      "incidence",
      "wilson95",
    ],
    label,
  );
  if (
    incidence.labelId !== expectedLabelId ||
    incidence.totalRuns !== CALIBRATION_SEEDS.length
  ) {
    throw new Error(`Phase 4.2 ${label} has incompatible outcome-incidence identity.`);
  }
  nonEmptyStringAt(incidence.title, `${label} title`);
  const wilson = recordAt(incidence.wilson95, `${label} Wilson interval`);
  assertExactKeys(wilson, ["confidence", "lower", "upper"], `${label} Wilson interval`);
}

function assertScenarioAnalysis(
  value: unknown,
  scenarioId: ScenarioId,
  requireFrozenPass: boolean,
  label: string,
): void {
  const analysis = recordAt(value, label);
  assertCanonicalShape(
    analysis,
    {
      $: [
        "schemaVersion",
        "scenario",
        "compiledMapHashes",
        "outcomes",
        "hardInvariants",
        "expectedBands",
      ],
      outcomes: ["perRun", "incidence"],
      hardInvariants: ["status", "perRun", "corpus"],
      expectedBands: [
        "tableVersion",
        "status",
        "corpusValidation",
        "provenance",
        "evaluations",
        "scenarioOutcomeBands",
      ],
      "expectedBands.corpusValidation": [
        "status",
        "expectedSeeds",
        "observedSeeds",
        "expectedTicks",
        "observedTicks",
      ],
      "expectedBands.provenance": [
        "releaseOutcomeClaim",
        "calibrationEvidence",
        "holdoutEvidence",
      ],
      "expectedBands.scenarioOutcomeBands": [
        "tableVersion",
        "status",
        "eligibility",
        "releaseClaim",
        "provenance",
        "evaluations",
        "dominance",
      ],
      "expectedBands.scenarioOutcomeBands.eligibility": ["status", "reason"],
      "expectedBands.scenarioOutcomeBands.dominance": [
        "status",
        "threshold",
        "evaluations",
        "rationaleFailures",
      ],
    },
    label,
  );
  if (analysis.schemaVersion !== 4)
    throw new Error(`Phase 4.2 ${label} must use schema 4.`);
  assertScenarioDefinition(analysis.scenario, scenarioId, `${label} scenario`);

  const outcomes = recordAt(analysis.outcomes, `${label} outcomes`);
  const perRunOutcomes = arrayAt(outcomes.perRun, `${label} per-run outcomes`);
  if (perRunOutcomes.length !== CALIBRATION_SEEDS.length) {
    throw new Error(`Phase 4.2 ${label} must retain 64 per-run outcomes.`);
  }
  for (const [index, seed] of CALIBRATION_SEEDS.entries()) {
    assertRunOutcomeSummary(
      perRunOutcomes[index],
      seed,
      `${label} outcome seed ${seed.toString()}`,
    );
  }
  const incidence = arrayAt(outcomes.incidence, `${label} outcome incidence`);
  if (incidence.length !== OUTCOME_LABEL_IDS.length) {
    throw new Error(`Phase 4.2 ${label} must retain all classifier-3 outcome aggregates.`);
  }
  for (const [index, outcomeId] of OUTCOME_LABEL_IDS.entries()) {
    assertOutcomeIncidence(
      incidence[index],
      outcomeId,
      `${label} outcome incidence ${outcomeId}`,
    );
  }

  const hardInvariants = recordAt(analysis.hardInvariants, `${label} hard invariants`);
  const perRunInvariants = arrayAt(hardInvariants.perRun, `${label} per-run invariants`);
  if (perRunInvariants.length !== CALIBRATION_SEEDS.length) {
    throw new Error(`Phase 4.2 ${label} must retain 64 per-run invariant reports.`);
  }
  for (const [index, seed] of CALIBRATION_SEEDS.entries()) {
    assertHardInvariantReport(
      perRunInvariants[index],
      seed,
      requireFrozenPass,
      `${label} invariant seed ${seed.toString()}`,
    );
  }
  const corpusInvariants = arrayAt(hardInvariants.corpus, `${label} corpus invariants`);
  if (corpusInvariants.length !== CORPUS_INVARIANT_IDS.length) {
    throw new Error(`Phase 4.2 ${label} must retain all corpus invariant definitions.`);
  }
  for (const [index, id] of CORPUS_INVARIANT_IDS.entries()) {
    const evaluation = assertEvaluation(
      corpusInvariants[index],
      `${label} corpus invariant ${id}`,
      [
        "id",
        "classification",
        "status",
        "metricPath",
        "observed",
        "comparison",
        "threshold",
        "reason",
      ],
    );
    if (evaluation.id !== id || (requireFrozenPass && evaluation.status !== "PASS")) {
      throw new Error(
        `Phase 4.2 ${label} corpus invariants are incomplete or non-passing.`,
      );
    }
  }

  const expectedBands = recordAt(analysis.expectedBands, `${label} expected bands`);
  const corpusValidation = recordAt(
    expectedBands.corpusValidation,
    `${label} corpus validation`,
  );
  if (
    corpusValidation.status !== "MATCHED_LOCKED_CORPUS" ||
    !sameSequence(
      arrayAt(corpusValidation.expectedSeeds, `${label} expected seeds`),
      CALIBRATION_SEEDS,
    ) ||
    !sameSequence(
      arrayAt(corpusValidation.observedSeeds, `${label} observed seeds`),
      CALIBRATION_SEEDS,
    ) ||
    corpusValidation.expectedTicks !== CALIBRATION_TICKS ||
    corpusValidation.observedTicks !== CALIBRATION_TICKS
  ) {
    throw new Error(`Phase 4.2 ${label} has invalid locked-corpus validation evidence.`);
  }
  const expectedEvaluations = arrayAt(
    expectedBands.evaluations,
    `${label} expected-band evaluations`,
  );
  if (expectedEvaluations.length !== HARD_INVARIANT_IDS.length) {
    throw new Error(`Phase 4.2 ${label} must retain all expected-band definitions.`);
  }
  for (const [index, item] of expectedEvaluations.entries()) {
    const evaluation = assertEvaluation(
      item,
      `${label} expected-band evaluation ${index.toString()}`,
      [
        "metricId",
        "metricPath",
        "status",
        "observed",
        "comparison",
        "threshold",
        "reason",
        "bandType",
        "provenance",
      ],
    );
    nonEmptyStringAt(evaluation.metricId, `${label} expected-band metricId`);
    recordAt(evaluation.provenance, `${label} expected-band provenance`);
    if (requireFrozenPass && evaluation.status !== "PASS") {
      throw new Error(`Phase 4.2 ${label} has a non-passing expected-band evaluation.`);
    }
  }

  const outcomeBands = recordAt(
    expectedBands.scenarioOutcomeBands,
    `${label} outcome bands`,
  );
  const outcomeBandEvaluations = arrayAt(
    outcomeBands.evaluations,
    `${label} outcome-band evaluations`,
  );
  if (requireFrozenPass && outcomeBandEvaluations.length === 0) {
    throw new Error(
      `Phase 4.2 ${label} verification is missing frozen outcome-band definitions.`,
    );
  }
  for (const [index, item] of outcomeBandEvaluations.entries()) {
    const evaluation = assertEvaluation(
      item,
      `${label} outcome-band evaluation ${index.toString()}`,
      [
        "tableVersion",
        "labelId",
        "metricPath",
        "status",
        "observed",
        "eligibleRuns",
        "comparison",
        "threshold",
        "requiredEligibleRuns",
        "reason",
        "provenance",
      ],
    );
    if (
      typeof evaluation.labelId !== "string" ||
      !OUTCOME_LABEL_IDS.includes(
        evaluation.labelId as (typeof OUTCOME_LABEL_IDS)[number],
      ) ||
      (requireFrozenPass && evaluation.status !== "PASS")
    ) {
      throw new Error(
        `Phase 4.2 ${label} has an invalid or non-passing outcome-band evaluation.`,
      );
    }
    recordAt(evaluation.provenance, `${label} outcome-band provenance`);
  }
  const dominance = recordAt(outcomeBands.dominance, `${label} dominance`);
  const dominanceEvaluations = arrayAt(
    dominance.evaluations,
    `${label} dominance evaluations`,
  );
  if (dominanceEvaluations.length !== OUTCOME_LABEL_IDS.length) {
    throw new Error(
      `Phase 4.2 ${label} must retain all classifier-3 dominance evaluations.`,
    );
  }
  for (const [index, outcomeId] of OUTCOME_LABEL_IDS.entries()) {
    const evaluation = assertEvaluation(
      dominanceEvaluations[index],
      `${label} dominance evaluation ${outcomeId}`,
      [
        "labelId",
        "metricPath",
        "status",
        "incidence",
        "occurrences",
        "eligibleRuns",
        "comparison",
        "threshold",
        "rationaleRequired",
        "rationale",
        "reason",
      ],
    );
    if (
      evaluation.labelId !== outcomeId ||
      (requireFrozenPass && evaluation.status !== "PASS")
    ) {
      throw new Error(
        `Phase 4.2 ${label} dominance evaluations are incomplete or non-passing.`,
      );
    }
  }
}

function expectedScenarioPairs(): readonly (readonly [ScenarioId, ScenarioId])[] {
  const pairs: Array<readonly [ScenarioId, ScenarioId]> = [];
  for (let leftIndex = 0; leftIndex < SCENARIO_IDS.length; leftIndex += 1) {
    for (
      let rightIndex = leftIndex + 1;
      rightIndex < SCENARIO_IDS.length;
      rightIndex += 1
    ) {
      const left = SCENARIO_IDS[leftIndex];
      const right = SCENARIO_IDS[rightIndex];
      if (left !== undefined && right !== undefined) pairs.push([left, right]);
    }
  }
  return pairs;
}

function assertPairedComparisons(value: unknown): void {
  const comparisons = arrayAt(value, "calibration paired comparisons");
  const expectedPairs = expectedScenarioPairs();
  if (comparisons.length !== expectedPairs.length) {
    throw new Error("Phase 4.2 calibration must retain all six scenario comparisons.");
  }
  for (const [comparisonIndex, expectedPair] of expectedPairs.entries()) {
    const comparison = recordAt(
      comparisons[comparisonIndex],
      "calibration paired comparison",
    );
    assertExactKeys(
      comparison,
      ["leftScenarioId", "rightScenarioId", "comparisonKind", "pairedSeeds", "metrics"],
      "calibration paired comparison",
    );
    if (
      comparison.leftScenarioId !== expectedPair[0] ||
      comparison.rightScenarioId !== expectedPair[1] ||
      comparison.comparisonKind !== "DESCRIPTIVE_CROSS_SCENARIO_NON_CAUSAL" ||
      !sameSequence(
        arrayAt(comparison.pairedSeeds, "calibration paired seeds"),
        CALIBRATION_SEEDS,
      )
    ) {
      throw new Error(
        "Phase 4.2 calibration paired comparisons are incomplete or reordered.",
      );
    }
    const metrics = arrayAt(comparison.metrics, "calibration paired metrics");
    if (metrics.length !== MACRO_METRICS.length) {
      throw new Error(
        "Phase 4.2 calibration paired comparisons must retain all macro metrics.",
      );
    }
    for (const [metricIndex, expectedMetric] of MACRO_METRICS.entries()) {
      const metric = recordAt(metrics[metricIndex], "calibration paired metric");
      assertExactKeys(
        metric,
        [
          "metricId",
          "dimension",
          "metricPath",
          "missingValuePolicy",
          "deltaDirection",
          "pairs",
          "summary",
          "effect",
        ],
        "calibration paired metric",
      );
      if (
        metric.metricId !== expectedMetric[0] ||
        metric.dimension !== expectedMetric[1] ||
        metric.missingValuePolicy !== expectedMetric[2] ||
        metric.deltaDirection !== "RIGHT_MINUS_LEFT"
      ) {
        throw new Error(
          "Phase 4.2 calibration paired metric definitions are incomplete or reordered.",
        );
      }
      nonEmptyStringAt(metric.metricPath, "calibration paired metric path");
      const pairs = arrayAt(metric.pairs, "calibration paired metric values");
      if (
        expectedMetric[2] === "ZERO_IS_OBSERVED" &&
        pairs.length !== CALIBRATION_SEEDS.length
      ) {
        throw new Error(
          "Phase 4.2 zero-observed paired metrics require all 64 paired values.",
        );
      }
      const pairSeeds: number[] = [];
      for (const item of pairs) {
        const pair = recordAt(item, "calibration paired value");
        assertExactKeys(
          pair,
          ["seed", "leftValue", "rightValue", "delta"],
          "calibration paired value",
        );
        const seed = numberAt(pair.seed, "calibration paired value seed");
        numberAt(pair.leftValue, "calibration paired left value");
        numberAt(pair.rightValue, "calibration paired right value");
        numberAt(pair.delta, "calibration paired delta");
        pairSeeds.push(seed);
      }
      if (
        !sameSequence(
          pairSeeds,
          CALIBRATION_SEEDS.filter((seed) => pairSeeds.includes(seed)),
        ) ||
        new Set(pairSeeds).size !== pairSeeds.length
      ) {
        throw new Error(
          "Phase 4.2 paired metric values have invalid seed identity or order.",
        );
      }
      const summary = recordAt(metric.summary, "calibration paired metric summary");
      assertExactKeys(
        summary,
        [
          "pairedSeedCount",
          "meanDelta",
          "medianDelta",
          "meanAbsoluteDelta",
          "sampleStandardDeviationDelta",
          "positiveDeltas",
          "zeroDeltas",
          "negativeDeltas",
        ],
        "calibration paired metric summary",
      );
      if (summary.pairedSeedCount !== pairs.length) {
        throw new Error("Phase 4.2 paired metric summary does not match retained pairs.");
      }
      const effect = recordAt(metric.effect, "calibration paired metric effect");
      assertExactKeys(
        effect,
        ["method", "value", "interpretation"],
        "calibration paired metric effect",
      );
    }
  }
}

function assertFrozenPairedMacroBands(value: unknown, requireFrozenPass: boolean): void {
  const report = recordAt(value, "calibration frozen paired macro bands");
  assertRequiredKeys(
    report,
    [
      "tableVersion",
      "status",
      "bandEvaluationStatus",
      "releaseClaim",
      "provenance",
      "corpusValidation",
      "evaluations",
      "dimensionRequirement",
      "settlementRequirement",
    ],
    "calibration frozen paired macro bands",
  );
  const evaluations = arrayAt(report.evaluations, "calibration frozen paired evaluations");
  if (evaluations.length < 4) {
    throw new Error("Phase 4.2 calibration must retain legacy paired macro definitions.");
  }
  let settlementEvaluations = 0;
  const passingLegacyDimensions = new Set<string>();
  for (const [index, item] of evaluations.entries()) {
    const evaluation = assertEvaluation(
      item,
      `calibration frozen paired evaluation ${index.toString()}`,
      [
        "tableVersion",
        "dimension",
        "leftScenarioId",
        "rightScenarioId",
        "metricId",
        "metricPath",
        "status",
        "pairedSeedCount",
        "requiredPairedSeeds",
        "missingValuePolicy",
        "eligiblePairPolicy",
        "meanDelta",
        "absoluteMeanDelta",
        "minimumAbsoluteMeanDelta",
        "cohenDz",
        "absoluteCohenDz",
        "minimumAbsoluteCohenDz",
        "reason",
        "provenance",
      ],
    );
    recordAt(evaluation.provenance, "calibration frozen paired evaluation provenance");
    if (evaluation.dimension === "SETTLEMENT") settlementEvaluations += 1;
    else if (evaluation.status === "PASS" && typeof evaluation.dimension === "string") {
      passingLegacyDimensions.add(evaluation.dimension);
    }
    if (requireFrozenPass) {
      const pairedSeedCount = numberAt(
        evaluation.pairedSeedCount,
        "calibration frozen paired seed count",
      );
      const requiredPairedSeeds = numberAt(
        evaluation.requiredPairedSeeds,
        "calibration frozen required paired seeds",
      );
      const usesAllLockedSeeds =
        evaluation.eligiblePairPolicy === "ALL_LOCKED_SEEDS" &&
        evaluation.missingValuePolicy === "ZERO_IS_OBSERVED" &&
        pairedSeedCount === CALIBRATION_SEEDS.length &&
        requiredPairedSeeds === CALIBRATION_SEEDS.length;
      const usesThresholdAfterMissingExclusion =
        evaluation.eligiblePairPolicy === "AT_LEAST_THRESHOLD_AFTER_MISSING_EXCLUSION" &&
        evaluation.missingValuePolicy === "EXCLUDE_PAIR_IF_EITHER_VALUE_MISSING" &&
        Number.isInteger(requiredPairedSeeds) &&
        requiredPairedSeeds >= 1 &&
        requiredPairedSeeds <= CALIBRATION_SEEDS.length &&
        pairedSeedCount >= requiredPairedSeeds &&
        pairedSeedCount <= CALIBRATION_SEEDS.length;
      if (
        evaluation.status !== "PASS" ||
        (!usesAllLockedSeeds && !usesThresholdAfterMissingExclusion)
      ) {
        throw new Error(
          "Phase 4.2 verification has incomplete or non-passing paired macro evaluations.",
        );
      }
    }
  }

  const corpus = recordAt(report.corpusValidation, "calibration paired corpus validation");
  assertRequiredKeys(
    corpus,
    [
      "expectedSeeds",
      "observedSeedsByScenario",
      "expectedTicks",
      "observedTicks",
      "status",
      "reason",
    ],
    "calibration paired corpus validation",
  );
  if (
    !sameSequence(
      arrayAt(corpus.expectedSeeds, "calibration paired expected seeds"),
      CALIBRATION_SEEDS,
    ) ||
    corpus.expectedTicks !== CALIBRATION_TICKS ||
    corpus.observedTicks !== CALIBRATION_TICKS
  ) {
    throw new Error("Phase 4.2 paired macro corpus evidence is incomplete.");
  }
  const observedSeeds = recordAt(
    corpus.observedSeedsByScenario,
    "calibration paired observed seeds",
  );
  for (const scenarioId of SCENARIO_IDS) {
    if (
      !sameSequence(
        arrayAt(observedSeeds[scenarioId], `calibration paired ${scenarioId} seeds`),
        CALIBRATION_SEEDS,
      )
    ) {
      throw new Error("Phase 4.2 paired macro observed seed evidence is incomplete.");
    }
  }

  const dimensionRequirement = recordAt(
    report.dimensionRequirement,
    "calibration dimension requirement",
  );
  assertRequiredKeys(
    dimensionRequirement,
    [
      "status",
      "metricPath",
      "observed",
      "comparison",
      "threshold",
      "passingDimensions",
      "reason",
    ],
    "calibration dimension requirement",
  );
  const settlementRequirement = recordAt(
    report.settlementRequirement,
    "calibration settlement requirement",
  );
  assertRequiredKeys(
    settlementRequirement,
    ["status", "metricPath", "observed", "comparison", "threshold", "reason"],
    "calibration settlement requirement",
  );
  if (requireFrozenPass) {
    const requiredDimensions = numberAt(
      dimensionRequirement.threshold,
      "calibration required passing dimensions",
    );
    const requiredSettlementBands = numberAt(
      settlementRequirement.threshold,
      "calibration required passing settlement bands",
    );
    if (
      dimensionRequirement.status !== "PASS" ||
      requiredDimensions < 3 ||
      passingLegacyDimensions.size < requiredDimensions ||
      numberAt(dimensionRequirement.observed, "calibration passing dimensions") <
        requiredDimensions ||
      settlementRequirement.status !== "PASS" ||
      requiredSettlementBands < 1 ||
      settlementEvaluations < requiredSettlementBands ||
      numberAt(settlementRequirement.observed, "calibration passing settlement bands") <
        requiredSettlementBands
    ) {
      throw new Error(
        "Phase 4.2 verification macro dimension requirements are not proven.",
      );
    }
  }
}

function assertConvergence(value: unknown): void {
  const diagnostics = arrayAt(value, "calibration convergence diagnostics");
  if (diagnostics.length !== expectedScenarioPairs().length * 6) {
    throw new Error(
      "Phase 4.2 calibration must retain six dimensions for all scenario pairs.",
    );
  }
  const observed = new Set<string>();
  for (const item of diagnostics) {
    const diagnostic = recordAt(item, "calibration convergence diagnostic");
    assertExactKeys(
      diagnostic,
      [
        "leftScenarioId",
        "rightScenarioId",
        "dimension",
        "status",
        "method",
        "comparedMetricCount",
        "pairedValueCount",
        "exactPairRate",
        "exactlyEqualMetricIds",
        "interpretation",
      ],
      "calibration convergence diagnostic",
    );
    const key = `${String(diagnostic.leftScenarioId)}:${String(diagnostic.rightScenarioId)}:${String(diagnostic.dimension)}`;
    if (observed.has(key))
      throw new Error("Phase 4.2 calibration has duplicate convergence diagnostics.");
    observed.add(key);
  }
}

/**
 * Validates the complete retained-evidence shape before a reviewed artifact can
 * authorize the unopened holdout. The projection is deliberately independent
 * from pass/fail marker text: stripped profiles or analysis records cannot be
 * made valid by changing a review document.
 */
export function assertCompletePhase42CalibrationMatrixEvidence(
  report: Record<string, unknown>,
  requireFrozenPass: boolean,
): void {
  assertRequiredKeys(
    report,
    ["schemaVersion", "command", "configuration", "runs", "aggregate", "analysis"],
    "calibration matrix",
  );
  const configuration = recordAt(report.configuration, "calibration configuration");
  assertRequiredKeys(
    configuration,
    [
      "corpus",
      "scenarios",
      "scenarioDefinitions",
      "compiledMapHashes",
      "seeds",
      "ticksPerRun",
      "sampleEveryTicks",
      "significantEventTiers",
      "ordering",
      "repeatCount",
      "executionsPerCase",
      "maximumRetainedPrimaryRuns",
      "scenarioAnalysisSchemaVersion",
      "outcomeClassifierVersion",
      "phase42DefinitionContractSchemaVersion",
      "phase42DefinitionFingerprintAlgorithm",
      "phase42DefinitionStatus",
      "phase42DefinitionFingerprint",
      "phase42DefinitionContract",
    ],
    "calibration configuration",
  );
  if (
    configuration.sampleEveryTicks !== 1 ||
    configuration.ordering !== "catalog-then-seed" ||
    configuration.repeatCount !== 0 ||
    configuration.executionsPerCase !== 1 ||
    configuration.maximumRetainedPrimaryRuns !== EXPECTED_RUN_COUNT
  ) {
    throw new Error(
      "Phase 4.2 calibration configuration has incompatible retention or ordering metadata.",
    );
  }
  const definitions = arrayAt(
    configuration.scenarioDefinitions,
    "calibration scenario definitions",
  );
  if (definitions.length !== SCENARIO_IDS.length) {
    throw new Error("Phase 4.2 calibration must retain four scenario definitions.");
  }
  for (const [index, scenarioId] of SCENARIO_IDS.entries()) {
    assertScenarioDefinition(
      definitions[index],
      scenarioId,
      `calibration scenario definition ${scenarioId}`,
    );
  }

  const runs = arrayAt(report.runs, "calibration runs");
  if (runs.length !== EXPECTED_RUN_COUNT) {
    throw new Error("Phase 4.2 calibration must retain exactly 256 complete runs.");
  }
  let runIndex = 0;
  for (const scenarioId of SCENARIO_IDS) {
    for (const seed of CALIBRATION_SEEDS) {
      const run = recordAt(runs[runIndex], `calibration run ${runIndex.toString()}`);
      assertRequiredKeys(
        run,
        [
          "seed",
          "scenario",
          "compiledMapHash",
          "requestedTicks",
          "finalHash",
          "profile",
          "outcomeSummary",
          "hardInvariants",
        ],
        `calibration run ${runIndex.toString()}`,
      );
      if (
        run.seed !== seed ||
        recordAt(run.scenario, "calibration run scenario").scenarioId !== scenarioId
      ) {
        throw new Error(
          "Phase 4.2 calibration runs must remain in catalog-then-seed order.",
        );
      }
      const compiledMapHash = nonEmptyStringAt(
        run.compiledMapHash,
        "calibration run compiled map hash",
      );
      nonEmptyStringAt(run.finalHash, "calibration run final hash");
      assertProfile(run.profile, seed, `calibration run ${runIndex.toString()} profile`);
      const profile = recordAt(run.profile, "calibration run profile");
      if (profile.compiledMapHash !== compiledMapHash) {
        throw new Error("Phase 4.2 calibration profile map hash does not match its run.");
      }
      assertRunOutcomeSummary(
        run.outcomeSummary,
        seed,
        `calibration run ${runIndex.toString()} outcome summary`,
      );
      assertHardInvariantReport(
        run.hardInvariants,
        seed,
        requireFrozenPass,
        `calibration run ${runIndex.toString()} hard invariants`,
      );
      runIndex += 1;
    }
  }

  const aggregate = recordAt(report.aggregate, "calibration aggregate");
  assertRequiredKeys(
    aggregate,
    ["scenarioDefinitions", "compiledMapHashes", "byScenario"],
    "calibration aggregate",
  );
  const aggregateDefinitions = arrayAt(
    aggregate.scenarioDefinitions,
    "calibration aggregate scenario definitions",
  );
  if (aggregateDefinitions.length !== SCENARIO_IDS.length) {
    throw new Error("Phase 4.2 calibration aggregate scenario definitions are incomplete.");
  }
  const byScenario = arrayAt(aggregate.byScenario, "calibration scenario aggregates");
  if (byScenario.length !== SCENARIO_IDS.length) {
    throw new Error("Phase 4.2 calibration must retain four scenario aggregates.");
  }
  for (const [index, scenarioId] of SCENARIO_IDS.entries()) {
    assertScenarioDefinition(
      aggregateDefinitions[index],
      scenarioId,
      `calibration aggregate definition ${scenarioId}`,
    );
    const scenarioAggregate = recordAt(
      byScenario[index],
      `calibration aggregate ${scenarioId}`,
    );
    assertRequiredKeys(
      scenarioAggregate,
      ["scenario", "compiledMapHashes", "activity", "analysis"],
      `calibration aggregate ${scenarioId}`,
    );
    assertScenarioDefinition(
      scenarioAggregate.scenario,
      scenarioId,
      `calibration aggregate ${scenarioId} scenario`,
    );
    const activity = recordAt(
      scenarioAggregate.activity,
      `calibration aggregate ${scenarioId} activity`,
    );
    assertCanonicalShape(
      activity,
      ACTIVITY_AGGREGATE_SHAPE,
      `calibration aggregate ${scenarioId} activity`,
    );
    if (
      activity.runCount !== CALIBRATION_SEEDS.length ||
      activity.totalObservedTicks !== CALIBRATION_SEEDS.length * CALIBRATION_TICKS
    ) {
      throw new Error(
        `Phase 4.2 calibration aggregate ${scenarioId} has incomplete activity totals.`,
      );
    }
    const settlementDistributions = recordAt(
      recordAt(activity.settlement, `calibration aggregate ${scenarioId} settlement`)
        .seedDistributions,
      `calibration aggregate ${scenarioId} settlement distributions`,
    );
    const completeSettlementDistributions = new Set([
      "fatigueExposureRate",
      "shelteredRestShare",
      "distinctConstructionContributors",
      "activeShelterCount",
      "guestUseEvents",
      "deniedClaims",
    ]);
    for (const [name, distribution] of Object.entries(settlementDistributions)) {
      assertNumericDistribution(
        distribution,
        `calibration aggregate ${scenarioId} settlement ${name}`,
      );
      const samples = numberAt(
        recordAt(distribution, "settlement aggregate distribution").samples,
        `calibration aggregate ${scenarioId} settlement ${name} samples`,
      );
      const complete = completeSettlementDistributions.has(name);
      if (
        !Number.isInteger(samples) ||
        samples < 0 ||
        samples > CALIBRATION_SEEDS.length ||
        (complete && samples !== CALIBRATION_SEEDS.length)
      ) {
        throw new Error(
          `Phase 4.2 calibration aggregate ${scenarioId} settlement distributions have invalid retained-sample cardinality.`,
        );
      }
    }
    assertScenarioAnalysis(
      scenarioAggregate.analysis,
      scenarioId,
      requireFrozenPass,
      `calibration aggregate ${scenarioId} analysis`,
    );
  }

  const analysis = recordAt(report.analysis, "calibration cross-scenario analysis");
  assertRequiredKeys(
    analysis,
    [
      "interpretation",
      "determinism",
      "pairedComparisons",
      "frozenPairedMacroBands",
      "convergence",
      "rawProfileRetention",
    ],
    "calibration cross-scenario analysis",
  );
  if (analysis.interpretation !== "DESCRIPTIVE_CROSS_SCENARIO_NON_CAUSAL") {
    throw new Error("Phase 4.2 calibration analysis has an incompatible interpretation.");
  }
  const determinism = recordAt(analysis.determinism, "calibration determinism evidence");
  assertRequiredKeys(
    determinism,
    [
      "repeatCount",
      "executionsPerCase",
      "comparisonCount",
      "allExactMatches",
      "hardInvariant",
      "comparisons",
    ],
    "calibration determinism evidence",
  );
  if (
    determinism.repeatCount !== 0 ||
    determinism.executionsPerCase !== 1 ||
    determinism.comparisonCount !== 0 ||
    determinism.allExactMatches !== null ||
    arrayAt(determinism.comparisons, "calibration repeat comparisons").length !== 0
  ) {
    throw new Error(
      "Phase 4.2 calibration determinism metadata is incompatible with the locked corpus.",
    );
  }
  const determinismInvariant = recordAt(
    determinism.hardInvariant,
    "calibration determinism invariant",
  );
  assertRequiredKeys(
    determinismInvariant,
    ["id", "classification", "status", "reason"],
    "calibration determinism invariant",
  );
  if (determinismInvariant.status !== "NOT_EVALUATED") {
    throw new Error("Phase 4.2 calibration must not claim unperformed repeat determinism.");
  }
  assertPairedComparisons(analysis.pairedComparisons);
  assertFrozenPairedMacroBands(analysis.frozenPairedMacroBands, requireFrozenPass);
  assertConvergence(analysis.convergence);
  const retention = recordAt(
    analysis.rawProfileRetention,
    "calibration raw-profile retention",
  );
  assertRequiredKeys(
    retention,
    [
      "policy",
      "retainedRunCount",
      "maximumRetainedRunCount",
      "repeatProfilesRetained",
      "repeatProfilesComparedExactlyThenDiscarded",
      "bound",
    ],
    "calibration raw-profile retention",
  );
  if (
    retention.policy !== "RETAIN_ALL_PRIMARY_PROFILES" ||
    retention.retainedRunCount !== EXPECTED_RUN_COUNT ||
    retention.maximumRetainedRunCount !== EXPECTED_RUN_COUNT ||
    retention.repeatProfilesRetained !== false ||
    retention.repeatProfilesComparedExactlyThenDiscarded !== false
  ) {
    throw new Error("Phase 4.2 calibration raw-profile retention evidence is incomplete.");
  }
}
