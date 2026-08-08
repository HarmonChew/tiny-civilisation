import {
  createSimulation,
  type DomainEvent,
  type DomainEventType,
  type SimulationState,
} from "@tiny-civ/sim-core";
import { describe, expect, it } from "vitest";

import {
  LIFECYCLE_POPULATION_CAP,
  StreamingLifecycleActivityCollector,
  summarizeLifecycleProfiles,
} from "./lifecycle-activity.js";

function lifecycleEvent(
  state: SimulationState,
  type: DomainEventType,
  overrides: Partial<DomainEvent> = {},
): DomainEvent {
  return {
    id: state.nextEventId++,
    tick: state.tick,
    type,
    actorIds: [],
    targetIds: [],
    groupIds: [],
    locationTileIndex: null,
    resourceKind: null,
    quantity: 0,
    causedByEventIds: [],
    decisionRecordIds: [],
    importance: 0,
    attentionTier: "NOTABLE",
    clusterKey: `test:${type.toLowerCase()}`,
    commandId: null,
    commandOutcome: null,
    commandRejectionReason: null,
    summary: type,
    ...overrides,
  };
}

function stateWithObservedBirth(): {
  initial: SimulationState;
  next: SimulationState;
  events: DomainEvent[];
  childId: number;
} {
  const initial = createSimulation(17);
  const next = structuredClone(initial);
  const mother = next.creatures[0];
  const father = next.creatures[1];
  if (!mother || !father) throw new Error("Expected two initial creatures.");
  mother.sex = "FEMALE";
  father.sex = "MALE";
  next.tick += 1;
  const childId = next.nextEntityId++;
  const child = structuredClone(mother);
  child.id = childId;
  child.name = "Lifecycle test child";
  child.sex = "FEMALE";
  child.ageTicks = 0;
  child.lifeStage = "JUVENILE";
  child.birthTick = next.tick;
  child.motherId = mother.id;
  child.fatherId = father.id;
  child.caregiverId = mother.id;
  child.dependentUntilTick = next.tick + 5_000;
  child.pregnancy = null;
  child.death = null;
  child.majorLifeEventIds = [];
  child.mournedLifeRecordIds = [];
  next.creatures.push(child);
  next.metrics.births += 1;
  next.metrics.careActions += 1;
  const events = [
    lifecycleEvent(next, "CREATURE_BORN", {
      actorIds: [mother.id, father.id],
      targetIds: [childId],
    }),
    lifecycleEvent(next, "CARE_GIVEN", {
      actorIds: [mother.id],
      targetIds: [childId],
      quantity: 1,
    }),
  ];
  return { initial, next, events, childId };
}

describe("StreamingLifecycleActivityCollector", () => {
  it("reports factual birth, lineage, dependent-youth, and care evidence", () => {
    const { initial, next, events, childId } = stateWithObservedBirth();
    const collector = new StreamingLifecycleActivityCollector(initial);

    collector.observe(next, events);
    const profile = collector.report();

    expect(profile.population.cap).toBe(LIFECYCLE_POPULATION_CAP);
    expect(profile.population.births).toBe(1);
    expect(profile.population.netChange).toBe(1);
    expect(profile.reproduction.twoKnownParentBirths).toBe(1);
    expect(profile.generations.newGenerationIds).toEqual([childId]);
    expect(profile.generations.parentChildPairs).toBe(2);
    expect(profile.generations.dependentYouthAtHorizon).toBe(1);
    expect(profile.care.actions).toBe(1);
    expect(profile.care.recipientIds).toEqual([childId]);
    expect(profile.invariants).toMatchObject({
      populationCapBreaches: 0,
      birthsWithoutTwoKnownParents: 0,
      parentSexMismatches: 0,
      metricEventMismatches: [],
      passed: true,
    });
  });

  it("summarizes lifecycle outcomes without converting observations into claims", () => {
    const { initial, next, events } = stateWithObservedBirth();
    const collector = new StreamingLifecycleActivityCollector(initial);
    collector.observe(next, events);

    const aggregate = summarizeLifecycleProfiles([collector.report()]);

    expect(aggregate).toMatchObject({
      births: 1,
      deaths: 0,
      careActions: 1,
      mourningCompletions: 0,
      estatesClaimed: 0,
      groupExtinctions: 0,
      invariantFailureRuns: 0,
    });
    expect(aggregate.seedDistributions.populationNetChange.median).toBe(1);
  });
});
