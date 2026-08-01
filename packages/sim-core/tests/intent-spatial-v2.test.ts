import { describe, expect, it } from "vitest";
import {
  advanceSimulation,
  attemptInteractionSlotClaim,
  availableInteractionSlots,
  claimInteractionSlot,
  createSimulation,
  findPath,
  projectCreatureObservationSummary,
  queuePlayerCommand,
  rankHierarchicalCandidates,
  TILE_FIXED_UNITS,
  tileIndexAt,
  validateInteractionClaims,
  type DecisionCandidate,
  type DomainEvent,
} from "../src/index.js";

function candidate(
  action: DecisionCandidate["action"],
  desire: DecisionCandidate["desire"],
  plan: DecisionCandidate["plan"],
  utility: number,
): DecisionCandidate {
  return {
    action,
    desire,
    plan,
    targetEntityId: null,
    targetTileIndex: 1,
    utility,
    factors: [],
  };
}

describe("hierarchical intent selection", () => {
  it("selects desire, plan, and action with stable ties and explicit commitment", () => {
    const options = [
      candidate("REST", "RECOVER_ENERGY", "REST_SAFELY", 5_000),
      candidate("GATHER_FOOD", "RELIEVE_HUNGER", "FORAGE_FOR_FOOD", 5_000),
      candidate("EAT", "RELIEVE_HUNGER", "EAT_CARRIED_FOOD", 5_000),
    ];
    const uncommitted = rankHierarchicalCandidates(
      [...options].reverse(),
      null,
      null,
      20,
      false,
    );
    expect(uncommitted[0]).toMatchObject({
      desire: "RECOVER_ENERGY",
      plan: "REST_SAFELY",
      action: "REST",
    });

    const committed = rankHierarchicalCandidates(
      options,
      {
        kind: "RELIEVE_HUNGER",
        subjectEntityId: null,
        startedAtTick: 1,
        minimumCommitUntilTick: 40,
        nextReconsiderationTick: 80,
        strength: 7_000,
        selectedByDecisionId: 1,
      },
      null,
      20,
      false,
    );
    expect(committed[0]?.desire).toBe("RELIEVE_HUNGER");
    expect(rankHierarchicalCandidates(options, null, null, 20, true)[0]?.action).toBe(
      "EAT",
    );
  });

  it("retains factual reasons at the decision tick and projects only retained facts", () => {
    const state = createSimulation(4_182);
    advanceSimulation(state, 600);
    expect(state.decisionRecords.length).toBeGreaterThan(0);
    for (const record of state.decisionRecords) {
      for (const option of record.candidates) {
        for (const factor of option.factors) {
          if (factor.fact) expect(factor.fact.capturedAtTick).toBe(record.tick);
        }
      }
    }
    const creature = state.creatures.find(
      (item) => item.activePlan?.strongestReason !== null,
    );
    expect(creature).toBeDefined();
    const summary = projectCreatureObservationSummary(creature!);
    expect(summary.reason.factRefs).toEqual(
      creature?.activePlan?.strongestReason ? [creature.activePlan.strongestReason] : [],
    );
    expect(summary.desire.factRefs[0]).toMatchObject({
      key: "active_desire",
      sourceEntityId: creature!.id,
    });
    expect(summary.plan.factRefs[0]).toMatchObject({
      key: "active_plan",
      sourceEntityId: creature!.id,
    });
    expect(summary.action.factRefs[0]).toMatchObject({
      key: "active_action",
      sourceEntityId: creature!.id,
    });
    expect(summary.reason.text).toMatch(/because/u);
  });

  it("states the retention gap instead of inventing a reason", () => {
    const creature = createSimulation(4_182).creatures[0];
    if (!creature) throw new Error("Missing creature fixture.");

    expect(projectCreatureObservationSummary(creature).reason).toEqual({
      text: `No factual reason is retained for ${creature.name}'s current step.`,
      factRefs: [],
    });
  });

  it("carries exact intervention provenance into resource intent facts", () => {
    const state = createSimulation(4_182);
    queuePlayerCommand(state, {
      type: "ADD_FOOD",
      x: 10,
      y: 7,
      amount: 12,
      applyAtTick: 0,
    });
    advanceSimulation(state, 1);
    const commandEvent = state.domainEvents.find(
      (event) => event.commandId === 1 && event.commandOutcome === "APPLIED",
    );
    expect(commandEvent?.targetIds).toHaveLength(1);
    expect(
      state.decisionRecords.some((decision) =>
        decision.candidates.some((option) =>
          option.factors.some(
            (item) =>
              item.key === "known stock" &&
              item.evidenceEventIds.includes(commandEvent!.id),
          ),
        ),
      ),
    ).toBe(true);

    queuePlayerCommand(state, {
      type: "REMOVE_FOOD",
      x: 10,
      y: 7,
      amount: 1,
      applyAtTick: state.tick,
    });
    advanceSimulation(state, 1);
    expect(
      state.domainEvents.find(
        (event) => event.commandId === 2 && event.commandOutcome === "APPLIED",
      )?.targetIds,
    ).toEqual(commandEvent?.targetIds);
  });

  it("shows varied physical action and persistent desire families in every reference run", () => {
    for (const seed of [4_182, 921, 23]) {
      const state = createSimulation(seed);
      const actions = new Set<string>();
      const desires = new Set<string>();
      for (let tick = 0; tick < 2_000; tick += 1) {
        advanceSimulation(state, 1);
        for (const creature of state.creatures) {
          if (creature.activeAction) actions.add(creature.activeAction.kind);
          if (creature.activeDesire) desires.add(creature.activeDesire.kind);
        }
      }
      expect(
        actions.size,
        `seed ${seed.toString()} action families`,
      ).toBeGreaterThanOrEqual(6);
      expect(
        desires.size,
        `seed ${seed.toString()} desire families`,
      ).toBeGreaterThanOrEqual(4);
      expect(
        state.domainEvents.filter((event) => event.type === "DESIRE_CHANGED").length,
      ).toBeLessThan(
        state.domainEvents.filter((event) => event.type === "ACTION_STARTED").length,
      );
    }
  });
});

describe("authoritative spatial interaction", () => {
  it("skips a nearer interaction slot when that endpoint is unreachable", () => {
    const state = createSimulation(23);
    const creature = state.creatures[0];
    if (!creature) throw new Error("Missing creature fixture.");

    for (const tile of state.world.tiles) tile.blocked = true;
    const start = tileIndexAt(state.world, 9, 8);
    const anchor = tileIndexAt(state.world, 10, 10);
    const unreachableNorthSlot = tileIndexAt(state.world, 10, 9);
    const reachableWestSlot = tileIndexAt(state.world, 9, 10);
    const reachableTiles = [
      start,
      tileIndexAt(state.world, 8, 8),
      tileIndexAt(state.world, 8, 9),
      tileIndexAt(state.world, 8, 10),
      reachableWestSlot,
    ];
    for (const tileIndex of [...reachableTiles, unreachableNorthSlot]) {
      state.world.tiles[tileIndex]!.blocked = false;
    }
    creature.tileIndex = start;

    expect(findPath(state.world, start, unreachableNorthSlot)).toEqual([]);
    expect(findPath(state.world, start, reachableWestSlot).length).toBeGreaterThan(0);

    const claim = claimInteractionSlot(state, creature, "GATHER_FOOD", 999, anchor);
    expect(claim).toMatchObject({ slotIndex: 3, tileIndex: reachableWestSlot });
  });

  it("does not assign a slot endpoint occupied by another living creature", () => {
    const state = createSimulation(23);
    const requester = state.creatures[0];
    const occupant = state.creatures[1];
    if (!requester || !occupant) throw new Error("Missing creature fixtures.");
    for (const creature of state.creatures) creature.alive = false;
    requester.alive = true;
    const anchor = tileIndexAt(state.world, 10, 10);
    const northSlot = tileIndexAt(state.world, 10, 9);
    const eastSlot = tileIndexAt(state.world, 11, 10);
    for (const tile of state.world.tiles) tile.blocked = false;
    requester.tileIndex = anchor;
    requester.x = 10 * TILE_FIXED_UNITS + TILE_FIXED_UNITS / 2;
    requester.y = 10 * TILE_FIXED_UNITS + TILE_FIXED_UNITS / 2;

    expect(
      claimInteractionSlot(state, requester, "GATHER_FOOD", 999, anchor),
    ).toMatchObject({ slotIndex: 0, tileIndex: northSlot });

    occupant.alive = true;
    occupant.tileIndex = northSlot;
    occupant.x = 10 * TILE_FIXED_UNITS + TILE_FIXED_UNITS / 2;
    occupant.y = 9 * TILE_FIXED_UNITS + TILE_FIXED_UNITS / 2;
    expect(
      availableInteractionSlots(state, "GATHER_FOOD", 999, anchor, requester.id).some(
        (slot) => slot.tileIndex === northSlot,
      ),
    ).toBe(false);
    expect(
      claimInteractionSlot(state, requester, "GATHER_FOOD", 999, anchor),
    ).toMatchObject({ slotIndex: 1, tileIndex: eastSlot });

    expect(
      attemptInteractionSlotClaim(state, requester, "GATHER_FOOD", 999, anchor),
    ).toMatchObject({
      claim: { slotIndex: 1, tileIndex: eastSlot },
      contended: true,
      failed: false,
    });
  });

  it("reports a typed failed claim when every footprint endpoint is occupied", () => {
    const state = createSimulation(23);
    const requester = state.creatures[0];
    if (!requester) throw new Error("Missing requester fixture.");
    for (const tile of state.world.tiles) tile.blocked = false;
    for (const creature of state.creatures) creature.alive = false;
    requester.alive = true;
    const anchor = tileIndexAt(state.world, 10, 10);
    requester.tileIndex = anchor;
    requester.x = 10 * TILE_FIXED_UNITS + TILE_FIXED_UNITS / 2;
    requester.y = 10 * TILE_FIXED_UNITS + TILE_FIXED_UNITS / 2;

    const slots = availableInteractionSlots(
      state,
      "GATHER_FOOD",
      999,
      anchor,
      requester.id,
    );
    expect(slots).toHaveLength(6);
    for (const [index, slot] of slots.entries()) {
      const occupant = state.creatures[index + 1];
      if (!occupant) throw new Error("Missing occupant fixture.");
      occupant.alive = true;
      occupant.tileIndex = slot.tileIndex;
      occupant.x = slot.targetX;
      occupant.y = slot.targetY;
    }

    expect(
      attemptInteractionSlotClaim(state, requester, "GATHER_FOOD", 999, anchor),
    ).toEqual({ claim: null, contended: true, failed: true });
  });

  it("retains monotonic authoritative claim metrics during a long run", () => {
    const state = createSimulation(4_182);
    advanceSimulation(state, 2_000);

    expect(state.metrics.interactionContentions).toBeGreaterThan(0);
    expect(state.metrics.failedInteractionClaims).toBeGreaterThan(0);
  });

  it("keeps claims unique and valid through the 20-seed long-run corpus", () => {
    for (let seed = 1; seed <= 20; seed += 1) {
      const state = createSimulation(seed);
      let overlapStreaks = new Map<string, number>();
      for (let tick = 0; tick < 10_000; tick += 1) {
        advanceSimulation(state, 1);
        const claimErrors = validateInteractionClaims(state);
        if (claimErrors.length > 0) {
          throw new Error(
            `seed ${seed.toString()}, tick ${state.tick.toString()}: ${claimErrors.join("; ")}`,
          );
        }
        for (const creature of state.creatures) {
          if (
            creature.intentHistory.length >
              state.configuration.maxIntentHistoryPerCreature ||
            creature.recentRoute.length > state.configuration.maxRouteSamplesPerCreature
          ) {
            throw new Error(
              `seed ${seed.toString()}, tick ${state.tick.toString()}: creature ${creature.id.toString()} exceeded an intent/route bound`,
            );
          }
          if (creature.activeAction?.interactionClaim && creature.activePlan) {
            if (
              creature.activePlan.interactionClaim !==
              creature.activeAction.interactionClaim
            ) {
              throw new Error(
                `seed ${seed.toString()}, tick ${state.tick.toString()}: creature ${creature.id.toString()} has detached action/plan claims`,
              );
            }
          }
        }
        const coordinates = new Map<string, number[]>();
        for (const creature of state.creatures.filter((item) => item.alive)) {
          const coordinate = `${creature.x}:${creature.y}`;
          const ids = coordinates.get(coordinate) ?? [];
          ids.push(creature.id);
          coordinates.set(coordinate, ids);
        }
        const nextOverlapStreaks = new Map<string, number>();
        for (const ids of coordinates.values()) {
          ids.sort((left, right) => left - right);
          for (let left = 0; left < ids.length; left += 1) {
            for (let right = left + 1; right < ids.length; right += 1) {
              const pair = `${ids[left]!.toString()}:${ids[right]!.toString()}`;
              const streak = (overlapStreaks.get(pair) ?? 0) + 1;
              if (streak > 10) {
                throw new Error(
                  `seed ${seed.toString()}, tick ${state.tick.toString()}: creatures ${pair} exceeded the exact-overlap streak target`,
                );
              }
              nextOverlapStreaks.set(pair, streak);
            }
          }
        }
        overlapStreaks = nextOverlapStreaks;
      }
    }
  }, 45_000);

  it("meets the reference occupancy and exact-overlap targets", () => {
    for (const seed of [4_182, 921, 23]) {
      const state = createSimulation(seed);
      const occupied: number[] = [];
      let overlappingCreatureTicks = 0;
      let livingCreatureTicks = 0;
      for (let tick = 0; tick < 2_000; tick += 1) {
        advanceSimulation(state, 1);
        if (state.tick < 500) continue;
        const living = state.creatures.filter((creature) => creature.alive);
        occupied.push(new Set(living.map((creature) => creature.tileIndex)).size);
        livingCreatureTicks += living.length;
        const coordinateCounts = new Map<string, number>();
        for (const creature of living) {
          const key = `${creature.x}:${creature.y}`;
          coordinateCounts.set(key, (coordinateCounts.get(key) ?? 0) + 1);
        }
        overlappingCreatureTicks += [...coordinateCounts.values()]
          .filter((count) => count > 1)
          .reduce((total, count) => total + count, 0);
      }
      occupied.sort((left, right) => left - right);
      const percentile = (fraction: number) =>
        occupied[Math.max(0, Math.ceil(occupied.length * fraction) - 1)]!;
      expect(
        percentile(0.5),
        `seed ${seed.toString()} occupied median`,
      ).toBeGreaterThanOrEqual(4);
      expect(
        percentile(0.1),
        `seed ${seed.toString()} occupied p10`,
      ).toBeGreaterThanOrEqual(3);
      expect(
        overlappingCreatureTicks / livingCreatureTicks,
        `seed ${seed.toString()} overlap rate`,
      ).toBeLessThan(0.01);
    }
  }, 15_000);
});

describe("readable event beats", () => {
  it("records construction progress and the approach, action, and aftermath of conflict", () => {
    const state = createSimulation(4_182);
    const events: DomainEvent[] = [];
    const seenIds = new Set<number>();
    for (let tick = 0; tick < 2_000; tick += 1) {
      advanceSimulation(state, 1);
      for (const event of state.domainEvents) {
        if (seenIds.has(event.id)) continue;
        seenIds.add(event.id);
        events.push(event);
      }
    }

    const siteStarted = events.find((event) => event.type === "STORAGE_SITE_STARTED");
    const workAdvanced = events.filter((event) => event.type === "STORAGE_WORK_ADVANCED");
    const storageCompleted = events.find((event) => event.type === "STORAGE_COMPLETED");
    expect(siteStarted).toBeDefined();
    expect(workAdvanced.map((event) => event.quantity)).toEqual([2_500, 5_000, 7_500]);
    expect(storageCompleted).toBeDefined();
    expect(siteStarted!.tick).toBeLessThanOrEqual(workAdvanced[0]!.tick);
    expect(workAdvanced.at(-1)!.tick).toBeLessThanOrEqual(storageCompleted!.tick);

    const attack = events.find((event) => event.type === "CREATURE_ATTACKED");
    expect(attack).toBeDefined();
    expect(
      events.some(
        (event) =>
          event.type === "CONFRONTATION_APPROACHED" &&
          event.actorIds[0] === attack!.actorIds[0] &&
          event.targetIds[0] === attack!.targetIds[0] &&
          event.tick <= attack!.tick,
      ),
    ).toBe(true);
    expect(
      events.some(
        (event) =>
          event.type === "CONFRONTATION_AFTERMATH" &&
          event.causedByEventIds.includes(attack!.id),
      ),
    ).toBe(true);

    const flight = events.find((event) => event.type === "CREATURE_FLED");
    expect(flight).toBeDefined();
    expect(
      events.some(
        (event) =>
          event.type === "THREAT_NOTICED" &&
          event.actorIds[0] === flight!.actorIds[0] &&
          event.tick <= flight!.tick,
      ),
    ).toBe(true);
  });
});
