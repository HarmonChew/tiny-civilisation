import {
  effectiveShelterCapacity,
  shelterOccupancy as readShelterOccupancy,
  type DomainEvent,
  type ShelterSiteAssessment,
  type ShelterStructureState,
  type SimulationState,
} from "@tiny-civ/sim-core";

import type { NumericDistribution } from "./activity-collector.js";

export const ELEVATED_FATIGUE_THRESHOLD = 8_000 as const;

export interface CreatureFatigueProfile {
  creatureId: number;
  name: string;
  livingCreatureTicks: number;
  fatigueUnitTicks: number;
  meanFatigue: number;
  elevatedFatigueTicks: number;
  elevatedSpellCount: number;
  resolvedElevatedSpellCount: number;
  longestElevatedSpellTicks: number;
  recoveredFatigueUnits: number;
}

export interface SettlementSiteAccessProfile {
  structureId: number;
  groupId: number;
  selectedAtTick: number;
  memberTravelCost: number;
  storageTravelCost: number;
  foodAccessCost: number;
  materialAccessCost: number;
  waterAccessCost: number;
  crowdingCost: number;
  constructionInvestmentCost: number;
  relocationChangeCost: number;
  totalScore: number;
}

export interface ShelterConstructionProfile {
  structureId: number;
  groupId: number;
  selectedAtTick: number;
  completedTick: number | null;
  elapsedTicks: number | null;
  rightCensored: boolean;
  contributorIds: number[];
  workAdvanceEvents: number;
}

export interface ShelterHorizonFact {
  structureId: number;
  groupId: number;
  kind: ShelterStructureState["kind"];
  tileIndex: number;
  selectedAtTick: number;
  completedTick: number | null;
  material: number;
  materialRequired: number;
  progress: number;
  workRequired: number;
  condition: number;
  conditionBand: ShelterStructureState["conditionBand"];
  baseCapacity: number;
  effectiveCapacity: number;
  reservedSpaces: number;
  restingCreatures: number;
  memberReservedSpaces: number;
  guestReservedSpaces: number;
  memberRestingCreatures: number;
  guestRestingCreatures: number;
  maintenanceMaterialSpent: number;
  builtFromShelterId: number | null;
}

export interface SettlementActivityProfile {
  fatigue: {
    elevatedThreshold: typeof ELEVATED_FATIGUE_THRESHOLD;
    livingCreatureTicks: number;
    fatigueUnitTicks: number;
    meanFatigue: number;
    elevatedFatigueCreatureTicks: number;
    elevatedExposureRate: number;
    elevatedSpellCount: number;
    resolvedElevatedSpellCount: number;
    longestElevatedSpellTicks: number;
    recoveredFatigueUnits: number;
    recoveryLatencyTicks: NumericDistribution;
    firstElevatedTick: number | null;
    firstRecoveryTick: number | null;
    byCreature: CreatureFatigueProfile[];
  };
  rest: {
    shelteredRestEvents: number;
    outdoorRestEvents: number;
    totalRestEvents: number;
    shelteredRestShare: number;
    shelteredRestCreatureTicks: number;
    outdoorRestCreatureTicks: number;
    memberUseEvents: number;
    guestUseEvents: number;
  };
  construction: {
    sitesSelected: number;
    starts: number;
    completions: number;
    workAdvanceEvents: number;
    contributorIds: number[];
    distinctContributors: number;
    completionLatencyTicks: NumericDistribution;
    shelters: ShelterConstructionProfile[];
  };
  condition: {
    activeShelterTicks: number;
    conditionUnitTicks: number;
    meanCondition: number;
    lowConditionShelterTicks: number;
    lowConditionExposureRate: number;
    lowTransitions: number;
    recoveredTransitions: number;
    maintenanceEvents: number;
    maintenanceMaterial: number;
    conditionAtHorizon: NumericDistribution;
  };
  occupancy: {
    effectiveCapacityTicks: number;
    reservedSpaceTicks: number;
    restingCreatureTicks: number;
    memberReservationTicks: number;
    guestReservationTicks: number;
    memberRestingCreatureTicks: number;
    guestRestingCreatureTicks: number;
    reservationUtilization: number;
    physicalUseRate: number;
    deniedClaims: number;
    crowdingEvents: number;
    maximumReservedSpaces: number;
    maximumRestingCreatures: number;
  };
  access: {
    assessedSiteCount: number;
    memberTravelCost: NumericDistribution;
    storageTravelCost: NumericDistribution;
    foodAccessCost: NumericDistribution;
    materialAccessCost: NumericDistribution;
    waterAccessCost: NumericDistribution;
    crowdingCost: NumericDistribution;
    constructionInvestmentCost: NumericDistribution;
    relocationChangeCost: NumericDistribution;
    totalScore: NumericDistribution;
    bySite: SettlementSiteAccessProfile[];
  };
  relocation: {
    abandonments: number;
    relocations: number;
    scoreImprovement: NumericDistribution;
  };
  horizon: {
    shelterSiteCount: number;
    activeShelterCount: number;
    abandonedShelterCount: number;
    groupsWithActiveShelter: number;
    groupsWithPendingShelter: number;
    structures: ShelterHorizonFact[];
  };
}

export interface SettlementActivityAggregate {
  shelteredRestEvents: number;
  outdoorRestEvents: number;
  guestUseEvents: number;
  deniedClaims: number;
  maintenanceMaterial: number;
  relocations: number;
  seedDistributions: {
    fatigueExposureRate: NumericDistribution;
    fatigueRecoveryLatencyMedianTicks: NumericDistribution;
    shelteredRestShare: NumericDistribution;
    constructionLatencyMedianTicks: NumericDistribution;
    distinctConstructionContributors: NumericDistribution;
    meanShelterCondition: NumericDistribution;
    lowConditionExposureRate: NumericDistribution;
    reservationUtilization: NumericDistribution;
    activeShelterCount: NumericDistribution;
    guestUseEvents: NumericDistribution;
    deniedClaims: NumericDistribution;
    siteTotalScoreMedian: NumericDistribution;
    relocationScoreImprovementMedian: NumericDistribution;
  };
}

interface CreatureFatigueAccumulator {
  id: number;
  name: string;
  livingCreatureTicks: number;
  fatigueUnitTicks: number;
  elevatedFatigueTicks: number;
  elevatedSpellCount: number;
  resolvedElevatedSpellCount: number;
  longestElevatedSpellTicks: number;
  activeElevatedSinceTick: number | null;
  lastFatigue: number;
  recoveredFatigueUnits: number;
}

interface ConstructionAccumulator {
  structureId: number;
  groupId: number;
  selectedAtTick: number;
  completedTick: number | null;
  contributorIds: Set<number>;
  workAdvanceEvents: number;
}

type SettlementMetricSnapshot = Pick<
  SimulationState["metrics"],
  | "sheltersCompleted"
  | "shelteredRests"
  | "outdoorRests"
  | "shelterMaintenanceMaterial"
  | "shelterDeniedClaims"
  | "shelterGuestUses"
  | "shelterRelocations"
>;

function settlementMetricSnapshot(state: SimulationState): SettlementMetricSnapshot {
  return {
    sheltersCompleted: state.metrics.sheltersCompleted,
    shelteredRests: state.metrics.shelteredRests,
    outdoorRests: state.metrics.outdoorRests,
    shelterMaintenanceMaterial: state.metrics.shelterMaintenanceMaterial,
    shelterDeniedClaims: state.metrics.shelterDeniedClaims,
    shelterGuestUses: state.metrics.shelterGuestUses,
    shelterRelocations: state.metrics.shelterRelocations,
  };
}

function round(value: number, decimalPlaces = 6): number {
  const scale = 10 ** decimalPlaces;
  return Math.round(value * scale) / scale;
}

function percentile(sorted: readonly number[], quantile: number): number | null {
  if (sorted.length === 0) return null;
  const position = (sorted.length - 1) * quantile;
  const lowerIndex = Math.floor(position);
  const upperIndex = Math.ceil(position);
  const lower = sorted[lowerIndex];
  const upper = sorted[upperIndex];
  if (lower === undefined || upper === undefined) return null;
  if (lowerIndex === upperIndex) return lower;
  return round(lower + (upper - lower) * (position - lowerIndex));
}

export function settlementDistribution(values: readonly number[]): NumericDistribution {
  if (values.length === 0) {
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
  const sorted = [...values].sort((left, right) => left - right);
  const p25 = percentile(sorted, 0.25);
  const p75 = percentile(sorted, 0.75);
  return {
    samples: sorted.length,
    min: sorted[0] ?? null,
    p10: percentile(sorted, 0.1),
    median: percentile(sorted, 0.5),
    p90: percentile(sorted, 0.9),
    iqr: p25 === null || p75 === null ? null : round(p75 - p25),
    max: sorted.at(-1) ?? null,
    mean: round(sorted.reduce((total, value) => total + value, 0) / sorted.length),
  };
}

function isShelter(
  structure: SimulationState["structures"][number],
): structure is ShelterStructureState {
  return (
    structure.kind === "SHELTER_SITE" ||
    structure.kind === "SHELTER" ||
    structure.kind === "ABANDONED_SHELTER"
  );
}

function copyAssessment(assessment: ShelterSiteAssessment): ShelterSiteAssessment {
  return { ...assessment };
}

function shelterOccupancyProfile(
  state: SimulationState,
  shelter: ShelterStructureState,
): Omit<
  ShelterHorizonFact,
  | "structureId"
  | "groupId"
  | "kind"
  | "tileIndex"
  | "selectedAtTick"
  | "completedTick"
  | "material"
  | "materialRequired"
  | "progress"
  | "workRequired"
  | "condition"
  | "conditionBand"
  | "baseCapacity"
  | "maintenanceMaterialSpent"
  | "builtFromShelterId"
> {
  const occupancy = readShelterOccupancy(state, shelter.id);
  let memberReservedSpaces = 0;
  let guestReservedSpaces = 0;
  for (const creature of state.creatures) {
    const action = creature.activeAction;
    const claim = action?.interactionClaim;
    if (
      !creature.alive ||
      action?.kind !== "REST_SHELTERED" ||
      claim?.anchorKind !== "STRUCTURE" ||
      claim.anchorId !== shelter.id
    ) {
      continue;
    }
    if (creature.groupId === shelter.groupId) memberReservedSpaces++;
    else guestReservedSpaces++;
  }
  return {
    effectiveCapacity: shelter.kind === "SHELTER" ? effectiveShelterCapacity(shelter) : 0,
    reservedSpaces: occupancy.reserved,
    restingCreatures: occupancy.resting,
    memberReservedSpaces,
    guestReservedSpaces,
    memberRestingCreatures: occupancy.members,
    guestRestingCreatures: occupancy.guests,
  };
}

function shelterHorizonFacts(state: SimulationState): ShelterHorizonFact[] {
  return state.structures
    .filter(isShelter)
    .sort((left, right) => left.id - right.id)
    .map((shelter) => ({
      structureId: shelter.id,
      groupId: shelter.groupId,
      kind: shelter.kind,
      tileIndex: shelter.tileIndex,
      selectedAtTick: shelter.siteAssessment.selectedAtTick,
      completedTick: shelter.completedTick,
      material: shelter.material,
      materialRequired: shelter.materialRequired,
      progress: shelter.progress,
      workRequired: shelter.workRequired,
      condition: shelter.condition,
      conditionBand: shelter.conditionBand,
      baseCapacity: shelter.baseCapacity,
      ...shelterOccupancyProfile(state, shelter),
      maintenanceMaterialSpent: shelter.maintenanceMaterialSpent,
      builtFromShelterId: shelter.builtFromShelterId,
    }));
}

function eventCount(events: readonly DomainEvent[], type: DomainEvent["type"]): number {
  return events.filter((event) => event.type === type).length;
}

export class StreamingSettlementActivityCollector {
  private latestState: SimulationState;
  private readonly initialMetrics: SettlementMetricSnapshot;
  private lastMetrics: SettlementMetricSnapshot;
  private readonly fatigueByCreature = new Map<number, CreatureFatigueAccumulator>();
  private readonly fatigueRecoveryLatencies: number[] = [];
  private firstElevatedTick: number | null = null;
  private firstRecoveryTick: number | null = null;
  private shelteredRestCreatureTicks = 0;
  private outdoorRestCreatureTicks = 0;
  private activeShelterTicks = 0;
  private conditionUnitTicks = 0;
  private lowConditionShelterTicks = 0;
  private effectiveCapacityTicks = 0;
  private reservedSpaceTicks = 0;
  private restingCreatureTicks = 0;
  private memberReservationTicks = 0;
  private guestReservationTicks = 0;
  private memberRestingCreatureTicks = 0;
  private guestRestingCreatureTicks = 0;
  private maximumReservedSpaces = 0;
  private maximumRestingCreatures = 0;
  private sitesSelected = 0;
  private constructionStarts = 0;
  private constructionCompletions = 0;
  private maintenanceEvents = 0;
  private lowTransitions = 0;
  private recoveredTransitions = 0;
  private crowdingEvents = 0;
  private guestUseEvents = 0;
  private abandonments = 0;
  private relocationEvents = 0;
  private readonly relocationScoreImprovements: number[] = [];
  private readonly assessments = new Map<
    number,
    { groupId: number; assessment: ShelterSiteAssessment }
  >();
  private readonly construction = new Map<number, ConstructionAccumulator>();

  constructor(initialState: SimulationState) {
    this.latestState = initialState;
    this.initialMetrics = settlementMetricSnapshot(initialState);
    this.lastMetrics = { ...this.initialMetrics };
    for (const creature of initialState.creatures) {
      const elevated =
        creature.alive && creature.needs.fatigue >= ELEVATED_FATIGUE_THRESHOLD;
      this.fatigueByCreature.set(creature.id, {
        id: creature.id,
        name: creature.name,
        livingCreatureTicks: 0,
        fatigueUnitTicks: 0,
        elevatedFatigueTicks: 0,
        elevatedSpellCount: elevated ? 1 : 0,
        resolvedElevatedSpellCount: 0,
        longestElevatedSpellTicks: 0,
        activeElevatedSinceTick: elevated ? initialState.tick : null,
        lastFatigue: creature.needs.fatigue,
        recoveredFatigueUnits: 0,
      });
      if (elevated) this.firstElevatedTick = initialState.tick;
    }
    this.recordStructures(initialState);
  }

  observe(state: SimulationState, events: readonly DomainEvent[]): void {
    this.assertCountersDidNotDecrease(state);
    this.observeFatigue(state);
    this.observeRest(state);
    this.observeShelters(state);
    this.observeEvents(state, events);
    this.recordStructures(state);
    this.latestState = state;
    this.lastMetrics = settlementMetricSnapshot(state);
  }

  report(): SettlementActivityProfile {
    const byCreature = [...this.fatigueByCreature.values()]
      .sort((left, right) => left.id - right.id)
      .map((creature): CreatureFatigueProfile => {
        const activeSpellTicks =
          creature.activeElevatedSinceTick === null
            ? 0
            : Math.max(0, this.latestState.tick - creature.activeElevatedSinceTick + 1);
        return {
          creatureId: creature.id,
          name: creature.name,
          livingCreatureTicks: creature.livingCreatureTicks,
          fatigueUnitTicks: creature.fatigueUnitTicks,
          meanFatigue:
            creature.livingCreatureTicks === 0
              ? 0
              : round(creature.fatigueUnitTicks / creature.livingCreatureTicks),
          elevatedFatigueTicks: creature.elevatedFatigueTicks,
          elevatedSpellCount: creature.elevatedSpellCount,
          resolvedElevatedSpellCount: creature.resolvedElevatedSpellCount,
          longestElevatedSpellTicks: Math.max(
            creature.longestElevatedSpellTicks,
            activeSpellTicks,
          ),
          recoveredFatigueUnits: creature.recoveredFatigueUnits,
        };
      });
    const livingCreatureTicks = byCreature.reduce(
      (total, creature) => total + creature.livingCreatureTicks,
      0,
    );
    const fatigueUnitTicks = byCreature.reduce(
      (total, creature) => total + creature.fatigueUnitTicks,
      0,
    );
    const elevatedFatigueCreatureTicks = byCreature.reduce(
      (total, creature) => total + creature.elevatedFatigueTicks,
      0,
    );
    const recoveredFatigueUnits = byCreature.reduce(
      (total, creature) => total + creature.recoveredFatigueUnits,
      0,
    );
    const shelteredRestEvents = this.metricDelta("shelteredRests");
    const outdoorRestEvents = this.metricDelta("outdoorRests");
    const guestUseEvents = Math.max(
      this.guestUseEvents,
      this.metricDelta("shelterGuestUses"),
    );
    const totalRestEvents = shelteredRestEvents + outdoorRestEvents;
    const siteProfiles = [...this.assessments.entries()]
      .sort(([left], [right]) => left - right)
      .map(([structureId, value]): SettlementSiteAccessProfile => ({
        structureId,
        groupId: value.groupId,
        ...value.assessment,
      }));
    const constructions = [...this.construction.values()]
      .sort((left, right) => left.structureId - right.structureId)
      .map((shelter): ShelterConstructionProfile => ({
        structureId: shelter.structureId,
        groupId: shelter.groupId,
        selectedAtTick: shelter.selectedAtTick,
        completedTick: shelter.completedTick,
        elapsedTicks:
          shelter.completedTick === null
            ? null
            : Math.max(0, shelter.completedTick - shelter.selectedAtTick),
        rightCensored: shelter.completedTick === null,
        contributorIds: [...shelter.contributorIds].sort((left, right) => left - right),
        workAdvanceEvents: shelter.workAdvanceEvents,
      }));
    const contributorIds = [
      ...new Set(constructions.flatMap((shelter) => shelter.contributorIds)),
    ].sort((left, right) => left - right);
    const horizonStructures = shelterHorizonFacts(this.latestState);
    const activeAtHorizon = horizonStructures.filter(
      (structure) => structure.kind === "SHELTER",
    );

    return {
      fatigue: {
        elevatedThreshold: ELEVATED_FATIGUE_THRESHOLD,
        livingCreatureTicks,
        fatigueUnitTicks,
        meanFatigue:
          livingCreatureTicks === 0 ? 0 : round(fatigueUnitTicks / livingCreatureTicks),
        elevatedFatigueCreatureTicks,
        elevatedExposureRate:
          livingCreatureTicks === 0
            ? 0
            : round(elevatedFatigueCreatureTicks / livingCreatureTicks),
        elevatedSpellCount: byCreature.reduce(
          (total, creature) => total + creature.elevatedSpellCount,
          0,
        ),
        resolvedElevatedSpellCount: byCreature.reduce(
          (total, creature) => total + creature.resolvedElevatedSpellCount,
          0,
        ),
        longestElevatedSpellTicks: Math.max(
          0,
          ...byCreature.map((creature) => creature.longestElevatedSpellTicks),
        ),
        recoveredFatigueUnits,
        recoveryLatencyTicks: settlementDistribution(this.fatigueRecoveryLatencies),
        firstElevatedTick: this.firstElevatedTick,
        firstRecoveryTick: this.firstRecoveryTick,
        byCreature,
      },
      rest: {
        shelteredRestEvents,
        outdoorRestEvents,
        totalRestEvents,
        shelteredRestShare:
          totalRestEvents === 0 ? 0 : round(shelteredRestEvents / totalRestEvents),
        shelteredRestCreatureTicks: this.shelteredRestCreatureTicks,
        outdoorRestCreatureTicks: this.outdoorRestCreatureTicks,
        memberUseEvents: Math.max(0, shelteredRestEvents - guestUseEvents),
        guestUseEvents,
      },
      construction: {
        sitesSelected: this.sitesSelected,
        starts: this.constructionStarts,
        completions: Math.max(
          this.constructionCompletions,
          this.metricDelta("sheltersCompleted"),
        ),
        workAdvanceEvents: constructions.reduce(
          (total, shelter) => total + shelter.workAdvanceEvents,
          0,
        ),
        contributorIds,
        distinctContributors: contributorIds.length,
        completionLatencyTicks: settlementDistribution(
          constructions.flatMap((shelter) =>
            shelter.elapsedTicks === null ? [] : [shelter.elapsedTicks],
          ),
        ),
        shelters: constructions,
      },
      condition: {
        activeShelterTicks: this.activeShelterTicks,
        conditionUnitTicks: this.conditionUnitTicks,
        meanCondition:
          this.activeShelterTicks === 0
            ? 0
            : round(this.conditionUnitTicks / this.activeShelterTicks),
        lowConditionShelterTicks: this.lowConditionShelterTicks,
        lowConditionExposureRate:
          this.activeShelterTicks === 0
            ? 0
            : round(this.lowConditionShelterTicks / this.activeShelterTicks),
        lowTransitions: this.lowTransitions,
        recoveredTransitions: this.recoveredTransitions,
        maintenanceEvents: this.maintenanceEvents,
        maintenanceMaterial: this.metricDelta("shelterMaintenanceMaterial"),
        conditionAtHorizon: settlementDistribution(
          activeAtHorizon.map((structure) => structure.condition),
        ),
      },
      occupancy: {
        effectiveCapacityTicks: this.effectiveCapacityTicks,
        reservedSpaceTicks: this.reservedSpaceTicks,
        restingCreatureTicks: this.restingCreatureTicks,
        memberReservationTicks: this.memberReservationTicks,
        guestReservationTicks: this.guestReservationTicks,
        memberRestingCreatureTicks: this.memberRestingCreatureTicks,
        guestRestingCreatureTicks: this.guestRestingCreatureTicks,
        reservationUtilization:
          this.effectiveCapacityTicks === 0
            ? 0
            : round(this.reservedSpaceTicks / this.effectiveCapacityTicks),
        physicalUseRate:
          this.effectiveCapacityTicks === 0
            ? 0
            : round(this.restingCreatureTicks / this.effectiveCapacityTicks),
        deniedClaims: this.metricDelta("shelterDeniedClaims"),
        crowdingEvents: this.crowdingEvents,
        maximumReservedSpaces: this.maximumReservedSpaces,
        maximumRestingCreatures: this.maximumRestingCreatures,
      },
      access: {
        assessedSiteCount: siteProfiles.length,
        memberTravelCost: settlementDistribution(
          siteProfiles.map((site) => site.memberTravelCost),
        ),
        storageTravelCost: settlementDistribution(
          siteProfiles.map((site) => site.storageTravelCost),
        ),
        foodAccessCost: settlementDistribution(
          siteProfiles.map((site) => site.foodAccessCost),
        ),
        materialAccessCost: settlementDistribution(
          siteProfiles.map((site) => site.materialAccessCost),
        ),
        waterAccessCost: settlementDistribution(
          siteProfiles.map((site) => site.waterAccessCost),
        ),
        crowdingCost: settlementDistribution(siteProfiles.map((site) => site.crowdingCost)),
        constructionInvestmentCost: settlementDistribution(
          siteProfiles.map((site) => site.constructionInvestmentCost),
        ),
        relocationChangeCost: settlementDistribution(
          siteProfiles.map((site) => site.relocationChangeCost),
        ),
        totalScore: settlementDistribution(siteProfiles.map((site) => site.totalScore)),
        bySite: siteProfiles,
      },
      relocation: {
        abandonments: this.abandonments,
        relocations: Math.max(
          this.relocationEvents,
          this.metricDelta("shelterRelocations"),
        ),
        scoreImprovement: settlementDistribution(this.relocationScoreImprovements),
      },
      horizon: {
        shelterSiteCount: horizonStructures.filter(
          (structure) => structure.kind === "SHELTER_SITE",
        ).length,
        activeShelterCount: activeAtHorizon.length,
        abandonedShelterCount: horizonStructures.filter(
          (structure) => structure.kind === "ABANDONED_SHELTER",
        ).length,
        groupsWithActiveShelter: this.latestState.groups.filter(
          (group) => group.activeShelterId !== null,
        ).length,
        groupsWithPendingShelter: this.latestState.groups.filter(
          (group) => group.pendingShelterId !== null,
        ).length,
        structures: horizonStructures,
      },
    };
  }

  private assertCountersDidNotDecrease(state: SimulationState): void {
    const current = state.metrics;
    for (const key of Object.keys(this.initialMetrics) as Array<
      keyof typeof this.initialMetrics
    >) {
      if (current[key] < this.lastMetrics[key]) {
        throw new Error(`Settlement metric ${key} decreased inside one profile window.`);
      }
    }
  }

  private metricDelta(key: keyof typeof this.initialMetrics): number {
    return this.latestState.metrics[key] - this.initialMetrics[key];
  }

  private observeFatigue(state: SimulationState): void {
    for (const creature of state.creatures) {
      let accumulator = this.fatigueByCreature.get(creature.id);
      if (!accumulator) {
        accumulator = {
          id: creature.id,
          name: creature.name,
          livingCreatureTicks: 0,
          fatigueUnitTicks: 0,
          elevatedFatigueTicks: 0,
          elevatedSpellCount: 0,
          resolvedElevatedSpellCount: 0,
          longestElevatedSpellTicks: 0,
          activeElevatedSinceTick: null,
          lastFatigue: creature.needs.fatigue,
          recoveredFatigueUnits: 0,
        };
        this.fatigueByCreature.set(creature.id, accumulator);
      }
      if (!creature.alive) continue;
      accumulator.livingCreatureTicks++;
      accumulator.fatigueUnitTicks += creature.needs.fatigue;
      if (creature.needs.fatigue < accumulator.lastFatigue) {
        accumulator.recoveredFatigueUnits +=
          accumulator.lastFatigue - creature.needs.fatigue;
      }
      const elevated = creature.needs.fatigue >= ELEVATED_FATIGUE_THRESHOLD;
      if (elevated) {
        accumulator.elevatedFatigueTicks++;
        if (accumulator.activeElevatedSinceTick === null) {
          accumulator.activeElevatedSinceTick = state.tick;
          accumulator.elevatedSpellCount++;
          this.firstElevatedTick ??= state.tick;
        }
      } else if (accumulator.activeElevatedSinceTick !== null) {
        const elapsed = Math.max(0, state.tick - accumulator.activeElevatedSinceTick);
        accumulator.longestElevatedSpellTicks = Math.max(
          accumulator.longestElevatedSpellTicks,
          elapsed,
        );
        accumulator.resolvedElevatedSpellCount++;
        accumulator.activeElevatedSinceTick = null;
        this.fatigueRecoveryLatencies.push(elapsed);
        this.firstRecoveryTick ??= state.tick;
      }
      accumulator.lastFatigue = creature.needs.fatigue;
    }
  }

  private observeRest(state: SimulationState): void {
    for (const creature of state.creatures) {
      if (!creature.alive) continue;
      if (
        creature.activeAction?.kind === "REST_SHELTERED" &&
        creature.activeAction.phase === "WORKING"
      ) {
        this.shelteredRestCreatureTicks++;
      } else if (
        creature.activeAction?.kind === "REST" &&
        creature.activeAction.phase === "WORKING"
      ) {
        this.outdoorRestCreatureTicks++;
      }
    }
  }

  private observeShelters(state: SimulationState): void {
    for (const shelter of state.structures.filter(isShelter)) {
      if (shelter.kind !== "SHELTER") continue;
      const occupancy = shelterOccupancyProfile(state, shelter);
      this.activeShelterTicks++;
      this.conditionUnitTicks += shelter.condition;
      if (shelter.conditionBand === "LOW") this.lowConditionShelterTicks++;
      this.effectiveCapacityTicks += occupancy.effectiveCapacity;
      this.reservedSpaceTicks += occupancy.reservedSpaces;
      this.restingCreatureTicks += occupancy.restingCreatures;
      this.memberReservationTicks += occupancy.memberReservedSpaces;
      this.guestReservationTicks += occupancy.guestReservedSpaces;
      this.memberRestingCreatureTicks += occupancy.memberRestingCreatures;
      this.guestRestingCreatureTicks += occupancy.guestRestingCreatures;
      this.maximumReservedSpaces = Math.max(
        this.maximumReservedSpaces,
        occupancy.reservedSpaces,
      );
      this.maximumRestingCreatures = Math.max(
        this.maximumRestingCreatures,
        occupancy.restingCreatures,
      );
    }
  }

  private observeEvents(state: SimulationState, events: readonly DomainEvent[]): void {
    this.sitesSelected += eventCount(events, "SHELTER_SITE_SELECTED");
    this.constructionStarts += eventCount(events, "SHELTER_CONSTRUCTION_STARTED");
    this.constructionCompletions += eventCount(events, "SHELTER_COMPLETED");
    this.maintenanceEvents += eventCount(events, "SHELTER_MAINTAINED");
    this.lowTransitions += eventCount(events, "SHELTER_CONDITION_LOW");
    this.recoveredTransitions += eventCount(events, "SHELTER_CONDITION_RECOVERED");
    this.crowdingEvents += eventCount(events, "SHELTER_CROWDED");
    this.guestUseEvents += eventCount(events, "SHELTER_GUEST_USED");
    this.abandonments += eventCount(events, "SHELTER_ABANDONED");
    this.relocationEvents += eventCount(events, "SHELTER_RELOCATED");

    for (const event of events) {
      if (event.type === "SHELTER_RELOCATED") {
        this.relocationScoreImprovements.push(Math.max(0, event.quantity));
      }
      if (event.type !== "SHELTER_WORK_ADVANCED") continue;
      const shelter = event.targetIds
        .map((targetId) => state.structures.find((structure) => structure.id === targetId))
        .find((structure) => structure !== undefined && isShelter(structure));
      if (!shelter || !isShelter(shelter)) continue;
      const construction = this.ensureConstruction(shelter);
      construction.workAdvanceEvents++;
      for (const actorId of event.actorIds) construction.contributorIds.add(actorId);
    }
  }

  private recordStructures(state: SimulationState): void {
    for (const shelter of state.structures.filter(isShelter)) {
      this.assessments.set(shelter.id, {
        groupId: shelter.groupId,
        assessment: copyAssessment(shelter.siteAssessment),
      });
      const construction = this.ensureConstruction(shelter);
      construction.completedTick = shelter.completedTick;
    }
  }

  private ensureConstruction(shelter: ShelterStructureState): ConstructionAccumulator {
    let construction = this.construction.get(shelter.id);
    if (!construction) {
      construction = {
        structureId: shelter.id,
        groupId: shelter.groupId,
        selectedAtTick: shelter.siteAssessment.selectedAtTick,
        completedTick: shelter.completedTick,
        contributorIds: new Set<number>(),
        workAdvanceEvents: 0,
      };
      this.construction.set(shelter.id, construction);
    }
    return construction;
  }
}

function present(values: readonly (number | null)[]): number[] {
  return values.filter((value): value is number => value !== null);
}

export function summarizeSettlementProfiles(
  profiles: readonly SettlementActivityProfile[],
): SettlementActivityAggregate {
  return {
    shelteredRestEvents: profiles.reduce(
      (total, profile) => total + profile.rest.shelteredRestEvents,
      0,
    ),
    outdoorRestEvents: profiles.reduce(
      (total, profile) => total + profile.rest.outdoorRestEvents,
      0,
    ),
    guestUseEvents: profiles.reduce(
      (total, profile) => total + profile.rest.guestUseEvents,
      0,
    ),
    deniedClaims: profiles.reduce(
      (total, profile) => total + profile.occupancy.deniedClaims,
      0,
    ),
    maintenanceMaterial: profiles.reduce(
      (total, profile) => total + profile.condition.maintenanceMaterial,
      0,
    ),
    relocations: profiles.reduce(
      (total, profile) => total + profile.relocation.relocations,
      0,
    ),
    seedDistributions: {
      fatigueExposureRate: settlementDistribution(
        profiles.map((profile) => profile.fatigue.elevatedExposureRate),
      ),
      fatigueRecoveryLatencyMedianTicks: settlementDistribution(
        present(profiles.map((profile) => profile.fatigue.recoveryLatencyTicks.median)),
      ),
      shelteredRestShare: settlementDistribution(
        profiles.map((profile) => profile.rest.shelteredRestShare),
      ),
      constructionLatencyMedianTicks: settlementDistribution(
        present(
          profiles.map((profile) => profile.construction.completionLatencyTicks.median),
        ),
      ),
      distinctConstructionContributors: settlementDistribution(
        profiles.map((profile) => profile.construction.distinctContributors),
      ),
      meanShelterCondition: settlementDistribution(
        profiles.flatMap((profile) =>
          profile.condition.activeShelterTicks === 0
            ? []
            : [profile.condition.meanCondition],
        ),
      ),
      lowConditionExposureRate: settlementDistribution(
        profiles.flatMap((profile) =>
          profile.condition.activeShelterTicks === 0
            ? []
            : [profile.condition.lowConditionExposureRate],
        ),
      ),
      reservationUtilization: settlementDistribution(
        profiles.flatMap((profile) =>
          profile.occupancy.effectiveCapacityTicks === 0
            ? []
            : [profile.occupancy.reservationUtilization],
        ),
      ),
      activeShelterCount: settlementDistribution(
        profiles.map((profile) => profile.horizon.activeShelterCount),
      ),
      guestUseEvents: settlementDistribution(
        profiles.map((profile) => profile.rest.guestUseEvents),
      ),
      deniedClaims: settlementDistribution(
        profiles.map((profile) => profile.occupancy.deniedClaims),
      ),
      siteTotalScoreMedian: settlementDistribution(
        present(profiles.map((profile) => profile.access.totalScore.median)),
      ),
      relocationScoreImprovementMedian: settlementDistribution(
        present(profiles.map((profile) => profile.relocation.scoreImprovement.median)),
      ),
    },
  };
}
