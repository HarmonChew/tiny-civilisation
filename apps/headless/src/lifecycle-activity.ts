import {
  MAX_LIVING_POPULATION,
  type DeathCause,
  type DomainEvent,
  type LifeStage,
  type ReproductiveSex,
  type SimulationState,
} from "@tiny-civ/sim-core";

/*
 * A report-local name keeps the artifact self-describing while using the
 * authoritative core cap rather than duplicating its value.
 */
export const LIFECYCLE_POPULATION_CAP = MAX_LIVING_POPULATION;

export const LIFECYCLE_EVENT_TYPES = [
  "LIFE_STAGE_CHANGED",
  "FAMILY_FORMED",
  "PREGNANCY_STARTED",
  "PREGNANCY_LOST",
  "CREATURE_BORN",
  "CARE_GIVEN",
  "CREATURE_DIED",
  "MEMORIAL_CREATED",
  "MOURNING_COMPLETED",
  "ESTATE_CLAIMED",
  "ESTATE_CLOSED",
  "GROUP_EXTINCT",
] as const satisfies readonly DomainEvent["type"][];

export interface LifecycleNumericDistribution {
  samples: number;
  min: number | null;
  p10: number | null;
  median: number | null;
  p90: number | null;
  iqr: number | null;
  max: number | null;
  mean: number | null;
}

export interface LifecycleCountByCategory<TCategory extends string> {
  category: TCategory;
  count: number;
}

export interface LifecycleInvariantDiagnostics {
  populationCapBreaches: number;
  birthsWithoutTwoKnownParents: number;
  parentSexMismatches: number;
  duplicateEntityIds: number;
  livingCreaturesWithDeathState: number;
  deadCreaturesWithoutDeathState: number;
  missingLifeRecordsForObservedDeaths: number;
  lineageCycles: number;
  metricEventMismatches: Array<{
    metric: string;
    metricDelta: number;
    observedEvents: number;
  }>;
  passed: boolean;
}

export interface LifecycleActivityProfile {
  window: {
    startTick: number;
    endTick: number;
    observedTicks: number;
  };
  population: {
    cap: typeof LIFECYCLE_POPULATION_CAP;
    initialLiving: number;
    livingAtHorizon: number;
    minimumLiving: number;
    maximumLiving: number;
    livingCreatureTicks: number;
    ticksAtCap: number;
    births: number;
    deaths: number;
    netChange: number;
    extinctionTick: number | null;
    extinctAtHorizon: boolean;
  };
  reproduction: {
    familiesFormed: number;
    pregnanciesStarted: number;
    pregnanciesLost: number;
    pregnanciesAtHorizon: number;
    births: number;
    birthsBySex: Array<LifecycleCountByCategory<ReproductiveSex>>;
    twoKnownParentBirths: number;
    distinctMotherIds: number[];
    distinctFatherIds: number[];
    gestationLatencyTicks: LifecycleNumericDistribution;
  };
  generations: {
    newGenerationIds: number[];
    parentChildPairs: number;
    maximumLineageDepth: number;
    dependentYouthAtHorizon: number;
    dependentYouthCreatureTicks: number;
  };
  lifeStages: {
    transitions: number;
    livingCreatureTicksByStage: Array<LifecycleCountByCategory<LifeStage>>;
    livingAtHorizonByStage: Array<LifecycleCountByCategory<LifeStage>>;
  };
  care: {
    actions: number;
    caregiverIds: number[];
    recipientIds: number[];
    recipientsWithCare: number;
  };
  mortality: {
    deaths: number;
    deathsByCause: Array<LifecycleCountByCategory<DeathCause>>;
    ageAtDeathTicks: LifecycleNumericDistribution;
    hardshipDeaths: number;
  };
  legacy: {
    lifeRecordsAtHorizon: number;
    memorialsCreated: number;
    memorialsAtHorizon: number;
    mourningCompletions: number;
    estatesClaimed: number;
    estatesClosed: number;
    mournerIds: number[];
    heirIds: number[];
    estateGoodsAtHorizon: {
      food: number;
      material: number;
      water: number;
    };
  };
  groups: {
    extinctions: number;
    activeAtHorizon: number;
    extinctAtHorizon: number;
  };
  eventCounts: Array<LifecycleCountByCategory<(typeof LIFECYCLE_EVENT_TYPES)[number]>>;
  invariants: LifecycleInvariantDiagnostics;
}

export interface LifecycleActivityAggregate {
  births: number;
  deaths: number;
  careActions: number;
  mourningCompletions: number;
  estatesClaimed: number;
  groupExtinctions: number;
  invariantFailureRuns: number;
  seedDistributions: {
    livingAtHorizon: LifecycleNumericDistribution;
    populationNetChange: LifecycleNumericDistribution;
    births: LifecycleNumericDistribution;
    deaths: LifecycleNumericDistribution;
    pregnanciesLost: LifecycleNumericDistribution;
    dependentYouthAtHorizon: LifecycleNumericDistribution;
    maximumLineageDepth: LifecycleNumericDistribution;
    careActions: LifecycleNumericDistribution;
    lifeRecordsAtHorizon: LifecycleNumericDistribution;
    memorialsAtHorizon: LifecycleNumericDistribution;
  };
}

type LifecycleMetricName =
  | "births"
  | "deaths"
  | "pregnanciesStarted"
  | "pregnanciesLost"
  | "careActions"
  | "mournings"
  | "estatesClaimed"
  | "groupsExtinct";

type LifecycleMetricSnapshot = Record<LifecycleMetricName, number>;

const LIFE_STAGES = ["JUVENILE", "ADULT", "ELDER"] as const satisfies readonly LifeStage[];
const REPRODUCTIVE_SEXES = ["FEMALE", "MALE"] as const satisfies readonly ReproductiveSex[];
const DEATH_CAUSES = [
  "STARVATION",
  "DEHYDRATION",
  "EXHAUSTION",
  "INJURY",
  "OLD_AGE",
  "LEGACY_UNKNOWN",
] as const satisfies readonly DeathCause[];

const METRIC_EVENT: Record<LifecycleMetricName, DomainEvent["type"]> = {
  births: "CREATURE_BORN",
  deaths: "CREATURE_DIED",
  pregnanciesStarted: "PREGNANCY_STARTED",
  pregnanciesLost: "PREGNANCY_LOST",
  careActions: "CARE_GIVEN",
  mournings: "MOURNING_COMPLETED",
  estatesClaimed: "ESTATE_CLAIMED",
  groupsExtinct: "GROUP_EXTINCT",
};

function round(value: number): number {
  return Number(value.toFixed(6));
}

function percentile(sorted: readonly number[], fraction: number): number | null {
  if (sorted.length === 0) return null;
  const index = (sorted.length - 1) * fraction;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower] ?? null;
  const left = sorted[lower] ?? 0;
  const right = sorted[upper] ?? left;
  return round(left + (right - left) * (index - lower));
}

function distribution(values: readonly number[]): LifecycleNumericDistribution {
  const sorted = [...values].sort((left, right) => left - right);
  const p10 = percentile(sorted, 0.1);
  const median = percentile(sorted, 0.5);
  const p90 = percentile(sorted, 0.9);
  const q1 = percentile(sorted, 0.25);
  const q3 = percentile(sorted, 0.75);
  return {
    samples: sorted.length,
    min: sorted[0] ?? null,
    p10,
    median,
    p90,
    iqr: q1 === null || q3 === null ? null : round(q3 - q1),
    max: sorted.at(-1) ?? null,
    mean:
      sorted.length === 0
        ? null
        : round(sorted.reduce((total, value) => total + value, 0) / sorted.length),
  };
}

function metricSnapshot(state: SimulationState): LifecycleMetricSnapshot {
  return {
    births: state.metrics.births,
    deaths: state.metrics.deaths,
    pregnanciesStarted: state.metrics.pregnanciesStarted,
    pregnanciesLost: state.metrics.pregnanciesLost,
    careActions: state.metrics.careActions,
    mournings: state.metrics.mournings,
    estatesClaimed: state.metrics.estatesClaimed,
    groupsExtinct: state.metrics.groupsExtinct,
  };
}

function eventCount(
  counts: ReadonlyMap<DomainEvent["type"], number>,
  type: DomainEvent["type"],
): number {
  return counts.get(type) ?? 0;
}

function sortedIds(ids: ReadonlySet<number>): number[] {
  return [...ids].sort((left, right) => left - right);
}

export class StreamingLifecycleActivityCollector {
  private readonly startTick: number;
  private readonly initialLiving: number;
  private readonly initialMetrics: LifecycleMetricSnapshot;
  private latestState: SimulationState;
  private minimumLiving: number;
  private maximumLiving: number;
  private livingCreatureTicks = 0;
  private ticksAtCap = 0;
  private populationCapBreaches = 0;
  private extinctionTick: number | null = null;
  private dependentYouthCreatureTicks = 0;
  private readonly stageCreatureTicks = new Map<LifeStage, number>(
    LIFE_STAGES.map((stage) => [stage, 0]),
  );
  private readonly eventCounts = new Map<DomainEvent["type"], number>();
  private readonly caregiverIds = new Set<number>();
  private readonly careRecipientIds = new Set<number>();
  private readonly mournerIds = new Set<number>();
  private readonly observedBirthIds = new Set<number>();
  private readonly observedDeathIds = new Set<number>();
  private readonly observedGestationLatencies: number[] = [];

  constructor(initialState: SimulationState) {
    this.startTick = initialState.tick;
    this.latestState = initialState;
    this.initialLiving = initialState.creatures.filter((creature) => creature.alive).length;
    this.minimumLiving = this.initialLiving;
    this.maximumLiving = this.initialLiving;
    this.initialMetrics = metricSnapshot(initialState);
  }

  observe(state: SimulationState, events: readonly DomainEvent[]): void {
    if (state.tick < this.latestState.tick) {
      throw new Error(
        `Lifecycle collector tick decreased from ${this.latestState.tick} to ${state.tick}.`,
      );
    }
    const living = state.creatures.filter((creature) => creature.alive);
    this.minimumLiving = Math.min(this.minimumLiving, living.length);
    this.maximumLiving = Math.max(this.maximumLiving, living.length);
    this.livingCreatureTicks += living.length;
    if (living.length === LIFECYCLE_POPULATION_CAP) this.ticksAtCap += 1;
    if (living.length > LIFECYCLE_POPULATION_CAP) this.populationCapBreaches += 1;
    if (living.length === 0 && this.extinctionTick === null)
      this.extinctionTick = state.tick;

    for (const creature of living) {
      this.stageCreatureTicks.set(
        creature.lifeStage,
        (this.stageCreatureTicks.get(creature.lifeStage) ?? 0) + 1,
      );
      if (
        creature.lifeStage === "JUVENILE" &&
        creature.dependentUntilTick !== null &&
        state.tick < creature.dependentUntilTick
      ) {
        this.dependentYouthCreatureTicks += 1;
      }
    }

    for (const event of events) {
      if (
        !LIFECYCLE_EVENT_TYPES.includes(
          event.type as (typeof LIFECYCLE_EVENT_TYPES)[number],
        )
      ) {
        continue;
      }
      this.eventCounts.set(event.type, eventCount(this.eventCounts, event.type) + 1);
      if (event.type === "CREATURE_BORN") {
        for (const id of event.targetIds) this.observedBirthIds.add(id);
      } else if (event.type === "CREATURE_DIED") {
        for (const id of [...event.actorIds, ...event.targetIds]) {
          this.observedDeathIds.add(id);
        }
      } else if (event.type === "CARE_GIVEN") {
        for (const id of event.actorIds) this.caregiverIds.add(id);
        for (const id of event.targetIds) this.careRecipientIds.add(id);
      } else if (event.type === "MOURNING_COMPLETED") {
        for (const id of event.actorIds) this.mournerIds.add(id);
      }
    }

    const previousPregnancies = new Map(
      this.latestState.creatures
        .filter((creature) => creature.pregnancy !== null)
        .map((creature) => [creature.id, creature.pregnancy] as const),
    );
    for (const creature of state.creatures) {
      if (creature.birthTick > this.startTick) this.observedBirthIds.add(creature.id);
      const previous = previousPregnancies.get(creature.id);
      if (previous && creature.pregnancy === null) {
        const gaveBirth = events.some(
          (event) =>
            event.type === "CREATURE_BORN" &&
            (event.actorIds.includes(creature.id) || event.targetIds.includes(creature.id)),
        );
        if (gaveBirth) {
          this.observedGestationLatencies.push(
            Math.max(0, state.tick - previous.conceivedTick),
          );
        }
      }
    }
    this.latestState = state;
  }

  report(): LifecycleActivityProfile {
    const state = this.latestState;
    const living = state.creatures.filter((creature) => creature.alive);
    const allPeople = [...state.creatures, ...state.lifeRecords];
    const personById = new Map(allPeople.map((person) => [person.id, person] as const));
    const newGeneration = allPeople.filter((person) => person.birthTick > this.startTick);
    const births = state.metrics.births - this.initialMetrics.births;
    const deaths = state.metrics.deaths - this.initialMetrics.deaths;
    const bySex = REPRODUCTIVE_SEXES.map((sex) => ({
      category: sex,
      count: newGeneration.filter((person) => person.sex === sex).length,
    }));
    const twoKnownParentBirths = newGeneration.filter(
      (person) => person.motherId !== null && person.fatherId !== null,
    ).length;
    const motherIds = new Set(
      newGeneration.flatMap((person) =>
        person.motherId === null ? [] : [person.motherId],
      ),
    );
    const fatherIds = new Set(
      newGeneration.flatMap((person) =>
        person.fatherId === null ? [] : [person.fatherId],
      ),
    );
    const deathRecords = state.lifeRecords.filter(
      (record) => record.deathTick > this.startTick,
    );
    const metricEventMismatches = (
      Object.keys(METRIC_EVENT) as LifecycleMetricName[]
    ).flatMap((metric) => {
      const metricDelta = state.metrics[metric] - this.initialMetrics[metric];
      const observedEvents = eventCount(this.eventCounts, METRIC_EVENT[metric]);
      return metricDelta === observedEvents
        ? []
        : [{ metric, metricDelta, observedEvents }];
    });
    const duplicateEntityIds =
      allPeople.length - new Set(allPeople.map(({ id }) => id)).size;
    const parentSexMismatches = newGeneration.filter((person) => {
      const mother = person.motherId === null ? undefined : personById.get(person.motherId);
      const father = person.fatherId === null ? undefined : personById.get(person.fatherId);
      return (
        (mother !== undefined && mother.sex !== "FEMALE") ||
        (father !== undefined && father.sex !== "MALE")
      );
    }).length;
    const lineageCycles = allPeople.filter((person) =>
      hasLineageCycle(person.id, personById),
    ).length;
    const observedDeathIds = new Set([
      ...this.observedDeathIds,
      ...deathRecords.map((record) => record.id),
    ]);
    const lifeRecordIds = new Set(state.lifeRecords.map((record) => record.id));
    const invariants: LifecycleInvariantDiagnostics = {
      populationCapBreaches: this.populationCapBreaches,
      birthsWithoutTwoKnownParents: newGeneration.length - twoKnownParentBirths,
      parentSexMismatches,
      duplicateEntityIds,
      livingCreaturesWithDeathState: living.filter((creature) => creature.death !== null)
        .length,
      deadCreaturesWithoutDeathState: state.creatures.filter(
        (creature) => !creature.alive && creature.death === null,
      ).length,
      missingLifeRecordsForObservedDeaths: [...observedDeathIds].filter(
        (id) => !lifeRecordIds.has(id),
      ).length,
      lineageCycles,
      metricEventMismatches,
      passed: false,
    };
    invariants.passed =
      invariants.populationCapBreaches === 0 &&
      invariants.birthsWithoutTwoKnownParents === 0 &&
      invariants.parentSexMismatches === 0 &&
      invariants.duplicateEntityIds === 0 &&
      invariants.livingCreaturesWithDeathState === 0 &&
      invariants.deadCreaturesWithoutDeathState === 0 &&
      invariants.missingLifeRecordsForObservedDeaths === 0 &&
      invariants.lineageCycles === 0 &&
      invariants.metricEventMismatches.length === 0;

    const estateGoods = state.memorials.reduce(
      (total, memorial) => ({
        food: total.food + memorial.estate.food,
        material: total.material + memorial.estate.material,
        water: total.water + memorial.estate.water,
      }),
      { food: 0, material: 0, water: 0 },
    );
    return {
      window: {
        startTick: this.startTick,
        endTick: state.tick,
        observedTicks: state.tick - this.startTick,
      },
      population: {
        cap: LIFECYCLE_POPULATION_CAP,
        initialLiving: this.initialLiving,
        livingAtHorizon: living.length,
        minimumLiving: this.minimumLiving,
        maximumLiving: this.maximumLiving,
        livingCreatureTicks: this.livingCreatureTicks,
        ticksAtCap: this.ticksAtCap,
        births,
        deaths,
        netChange: living.length - this.initialLiving,
        extinctionTick: this.extinctionTick,
        extinctAtHorizon: living.length === 0,
      },
      reproduction: {
        familiesFormed: eventCount(this.eventCounts, "FAMILY_FORMED"),
        pregnanciesStarted:
          state.metrics.pregnanciesStarted - this.initialMetrics.pregnanciesStarted,
        pregnanciesLost:
          state.metrics.pregnanciesLost - this.initialMetrics.pregnanciesLost,
        pregnanciesAtHorizon: living.filter((creature) => creature.pregnancy !== null)
          .length,
        births,
        birthsBySex: bySex,
        twoKnownParentBirths,
        distinctMotherIds: sortedIds(motherIds),
        distinctFatherIds: sortedIds(fatherIds),
        gestationLatencyTicks: distribution(this.observedGestationLatencies),
      },
      generations: {
        newGenerationIds: newGeneration
          .map(({ id }) => id)
          .sort((left, right) => left - right),
        parentChildPairs: newGeneration.reduce(
          (total, person) =>
            total + Number(person.motherId !== null) + Number(person.fatherId !== null),
          0,
        ),
        maximumLineageDepth: Math.max(
          0,
          ...allPeople.map((person) => lineageDepth(person.id, personById, new Set())),
        ),
        dependentYouthAtHorizon: living.filter(
          (creature) =>
            creature.lifeStage === "JUVENILE" &&
            creature.dependentUntilTick !== null &&
            state.tick < creature.dependentUntilTick,
        ).length,
        dependentYouthCreatureTicks: this.dependentYouthCreatureTicks,
      },
      lifeStages: {
        transitions: eventCount(this.eventCounts, "LIFE_STAGE_CHANGED"),
        livingCreatureTicksByStage: LIFE_STAGES.map((stage) => ({
          category: stage,
          count: this.stageCreatureTicks.get(stage) ?? 0,
        })),
        livingAtHorizonByStage: LIFE_STAGES.map((stage) => ({
          category: stage,
          count: living.filter((creature) => creature.lifeStage === stage).length,
        })),
      },
      care: {
        actions: state.metrics.careActions - this.initialMetrics.careActions,
        caregiverIds: sortedIds(this.caregiverIds),
        recipientIds: sortedIds(this.careRecipientIds),
        recipientsWithCare: this.careRecipientIds.size,
      },
      mortality: {
        deaths,
        deathsByCause: DEATH_CAUSES.map((cause) => ({
          category: cause,
          count: deathRecords.filter((record) => record.deathCause === cause).length,
        })),
        ageAtDeathTicks: distribution(deathRecords.map((record) => record.ageTicks)),
        hardshipDeaths: deathRecords.filter((record) => record.deathCause !== "OLD_AGE")
          .length,
      },
      legacy: {
        lifeRecordsAtHorizon: state.lifeRecords.length,
        memorialsCreated: eventCount(this.eventCounts, "MEMORIAL_CREATED"),
        memorialsAtHorizon: state.memorials.length,
        mourningCompletions: state.metrics.mournings - this.initialMetrics.mournings,
        estatesClaimed: state.metrics.estatesClaimed - this.initialMetrics.estatesClaimed,
        estatesClosed: eventCount(this.eventCounts, "ESTATE_CLOSED"),
        mournerIds: sortedIds(this.mournerIds),
        heirIds: [
          ...new Set(
            state.lifeRecords.flatMap((record) =>
              record.heirId === null ? [] : [record.heirId],
            ),
          ),
        ].sort((left, right) => left - right),
        estateGoodsAtHorizon: estateGoods,
      },
      groups: {
        extinctions: state.metrics.groupsExtinct - this.initialMetrics.groupsExtinct,
        activeAtHorizon: state.groups.filter((group) => group.status === "ACTIVE").length,
        extinctAtHorizon: state.groups.filter((group) => group.status === "EXTINCT").length,
      },
      eventCounts: LIFECYCLE_EVENT_TYPES.map((type) => ({
        category: type,
        count: eventCount(this.eventCounts, type),
      })),
      invariants,
    };
  }
}

function hasLineageCycle(
  id: number,
  people: ReadonlyMap<
    number,
    { id: number; motherId: number | null; fatherId: number | null }
  >,
): boolean {
  const visit = (candidateId: number, path: Set<number>): boolean => {
    if (path.has(candidateId)) return true;
    const person = people.get(candidateId);
    if (!person) return false;
    const nextPath = new Set(path).add(candidateId);
    return [person.motherId, person.fatherId].some(
      (parentId) => parentId !== null && visit(parentId, nextPath),
    );
  };
  return visit(id, new Set());
}

function lineageDepth(
  id: number,
  people: ReadonlyMap<
    number,
    { id: number; motherId: number | null; fatherId: number | null }
  >,
  path: Set<number>,
): number {
  if (path.has(id)) return 0;
  const person = people.get(id);
  if (!person) return 0;
  const nextPath = new Set(path).add(id);
  return Math.max(
    0,
    ...[person.motherId, person.fatherId].map((parentId) =>
      parentId === null || !people.has(parentId)
        ? 0
        : 1 + lineageDepth(parentId, people, nextPath),
    ),
  );
}

export function summarizeLifecycleProfiles(
  profiles: readonly LifecycleActivityProfile[],
): LifecycleActivityAggregate {
  return {
    births: profiles.reduce((total, profile) => total + profile.population.births, 0),
    deaths: profiles.reduce((total, profile) => total + profile.population.deaths, 0),
    careActions: profiles.reduce((total, profile) => total + profile.care.actions, 0),
    mourningCompletions: profiles.reduce(
      (total, profile) => total + profile.legacy.mourningCompletions,
      0,
    ),
    estatesClaimed: profiles.reduce(
      (total, profile) => total + profile.legacy.estatesClaimed,
      0,
    ),
    groupExtinctions: profiles.reduce(
      (total, profile) => total + profile.groups.extinctions,
      0,
    ),
    invariantFailureRuns: profiles.filter((profile) => !profile.invariants.passed).length,
    seedDistributions: {
      livingAtHorizon: distribution(
        profiles.map((profile) => profile.population.livingAtHorizon),
      ),
      populationNetChange: distribution(
        profiles.map((profile) => profile.population.netChange),
      ),
      births: distribution(profiles.map((profile) => profile.population.births)),
      deaths: distribution(profiles.map((profile) => profile.population.deaths)),
      pregnanciesLost: distribution(
        profiles.map((profile) => profile.reproduction.pregnanciesLost),
      ),
      dependentYouthAtHorizon: distribution(
        profiles.map((profile) => profile.generations.dependentYouthAtHorizon),
      ),
      maximumLineageDepth: distribution(
        profiles.map((profile) => profile.generations.maximumLineageDepth),
      ),
      careActions: distribution(profiles.map((profile) => profile.care.actions)),
      lifeRecordsAtHorizon: distribution(
        profiles.map((profile) => profile.legacy.lifeRecordsAtHorizon),
      ),
      memorialsAtHorizon: distribution(
        profiles.map((profile) => profile.legacy.memorialsAtHorizon),
      ),
    },
  };
}
