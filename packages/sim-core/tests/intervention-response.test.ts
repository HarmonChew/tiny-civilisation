import { describe, expect, it } from "vitest";
import {
  INTERVENTION_RESPONSE_BEATS,
  assertInterventionResponseTrace,
  classifyInterventionResponses,
  createInterventionResponseTrace,
  observeInterventionResponse,
  type InterventionResponseCommand,
  type InterventionResponseObservation,
  type ResponseCreatureObservation,
  type ResponseEventObservation,
  type ResponseIntentObservation,
} from "../src/intervention-response.js";

const COMMAND_TILE = 15;
const COMMAND_EVENT_ID = 100;
const AFFECTED_RESOURCE_ID = 90;

function command(
  overrides: Partial<InterventionResponseCommand> = {},
): InterventionResponseCommand {
  return {
    commandId: 1,
    applyAtTick: 10,
    type: "ADD_FOOD",
    tileIndex: COMMAND_TILE,
    ...overrides,
  };
}

function event(
  overrides: Partial<ResponseEventObservation> = {},
): ResponseEventObservation {
  return {
    id: COMMAND_EVENT_ID,
    tick: 10,
    type: "PLAYER_ADDED_FOOD",
    actorIds: [],
    targetIds: [AFFECTED_RESOURCE_ID],
    causedByEventIds: [],
    locationTileIndex: COMMAND_TILE,
    commandId: 1,
    commandOutcome: "APPLIED",
    ...overrides,
  };
}

function selectedIntent(
  overrides: Partial<ResponseIntentObservation> = {},
): ResponseIntentObservation {
  return {
    selected: true,
    targetId: AFFECTED_RESOURCE_ID,
    factors: [],
    ...overrides,
  };
}

function creature(
  id: number,
  overrides: Partial<ResponseCreatureObservation> = {},
): ResponseCreatureObservation {
  return {
    id,
    alive: true,
    x: 0.5,
    y: 1.5,
    route: [],
    candidates: [],
    ...overrides,
  };
}

function observation(
  tick: number,
  overrides: Partial<InterventionResponseObservation> = {},
): InterventionResponseObservation {
  return {
    tick,
    width: 10,
    creatures: [],
    events: [],
    ...overrides,
  };
}

function statusFor(
  trace: ReturnType<typeof createInterventionResponseTrace>,
  participantId: number,
) {
  return trace.responses.find((response) => response.participantId === participantId);
}

describe("intervention response evidence", () => {
  it("exposes the exact Phase 2.5 authoritative response vocabulary", () => {
    expect(INTERVENTION_RESPONSE_BEATS).toEqual([
      "NOTICED",
      "RECONSIDERED_DESIRE",
      "RECONSIDERED_PLAN",
      "REROUTED",
      "ACTED",
      "NO_RECORDED_RESPONSE",
    ]);
  });

  it("versions, freezes, and strictly validates persisted traces", () => {
    const trace = createInterventionResponseTrace(command(), [2, 1, 2]);

    expect(trace.schemaVersion).toBe(4);
    expect(Object.isFrozen(trace)).toBe(true);
    expect(Object.isFrozen(trace.command)).toBe(true);
    expect(Object.isFrozen(trace.participantIds)).toBe(true);
    expect(() => assertInterventionResponseTrace({ ...trace, unsupported: true })).toThrow(
      "unsupported field unsupported",
    );
    expect(() =>
      assertInterventionResponseTrace({
        ...trace,
        participantIds: [2, 1],
        unclassifiedParticipantIds: [2, 1],
      }),
    ).toThrow("ascending order");
    expect(() => assertInterventionResponseTrace({ ...trace, schemaVersion: 999 })).toThrow(
      "schemaVersion 999 is incompatible",
    );
  });

  it("upgrades explicit evidence from noticed to approached to used", () => {
    let trace = createInterventionResponseTrace(command(), [1], {
      windowTicks: 20,
    });
    trace = observeInterventionResponse(
      trace,
      observation(10, {
        events: [event()],
        creatures: [
          creature(1, {
            candidates: [
              selectedIntent({
                factors: [{ evidenceEventIds: [COMMAND_EVENT_ID] }],
              }),
            ],
          }),
        ],
      }),
    );
    expect(statusFor(trace, 1)).toMatchObject({
      status: "NOTICED",
      firstObservedTick: 10,
      reason: { code: "COMMAND_EVENT_CITED_BY_SELECTED_INTENT" },
      beats: [{ kind: "NOTICED" }],
      failure: null,
    });

    trace = observeInterventionResponse(
      trace,
      observation(15, {
        creatures: [
          creature(1, {
            x: 3.5,
            goalTarget: { x: 5.5, y: 1.5 },
            route: [
              { tick: 10, x: 0.5, y: 1.5 },
              { tick: 15, x: 3.5, y: 1.5 },
            ],
            candidates: [
              selectedIntent({
                factors: [{ evidenceEventIds: [COMMAND_EVENT_ID] }],
              }),
            ],
          }),
        ],
      }),
    );
    expect(statusFor(trace, 1)).toMatchObject({
      status: "APPROACHED",
      firstObservedTick: 10,
      reason: { code: "ROUTE_MOVED_TOWARD_COMMAND_LOCATION" },
      beats: [{ kind: "NOTICED" }, { kind: "REROUTED" }],
    });

    trace = observeInterventionResponse(
      trace,
      observation(20, {
        events: [
          event({
            id: 101,
            tick: 20,
            type: "FOOD_GATHERED",
            actorIds: [1],
            commandId: undefined,
            commandOutcome: undefined,
          }),
        ],
      }),
    );
    expect(statusFor(trace, 1)).toMatchObject({
      status: "USED",
      firstObservedTick: 10,
      reason: {
        code: "ACTION_EVENT_LINKED_TO_COMMAND",
        sourceEventIds: [COMMAND_EVENT_ID, 101],
      },
      beats: [{ kind: "NOTICED" }, { kind: "REROUTED" }, { kind: "ACTED" }],
    });
  });

  it("keeps downstream linkage when a command event is presented through history", () => {
    const trace = classifyInterventionResponses(
      command(),
      [1],
      [
        observation(20, {
          events: [
            event({ id: 1_000_001, commandSourceEventId: COMMAND_EVENT_ID }),
            event({
              id: 108,
              tick: 20,
              type: "FOOD_GATHERED",
              actorIds: [1],
              causedByEventIds: [COMMAND_EVENT_ID],
              commandId: undefined,
              commandOutcome: undefined,
            }),
          ],
        }),
      ],
      { windowTicks: 20 },
    );

    expect(trace.outcome?.eventId).toBe(COMMAND_EVENT_ID);
    expect(statusFor(trace, 1)).toMatchObject({
      status: "USED",
      beats: [expect.objectContaining({ kind: "ACTED" })],
    });
  });

  it("records typed desire and plan reconsideration beats", () => {
    const trace = classifyInterventionResponses(
      command(),
      [3],
      [
        observation(10, { events: [event()] }),
        observation(12, {
          events: [
            event({
              id: 108,
              tick: 12,
              type: "DESIRE_CHANGED",
              actorIds: [3],
              commandId: undefined,
              commandOutcome: undefined,
              causedByEventIds: [COMMAND_EVENT_ID],
            }),
          ],
        }),
        observation(14, {
          events: [
            event({
              id: 109,
              tick: 14,
              type: "PLAN_CHANGED",
              actorIds: [3],
              commandId: undefined,
              commandOutcome: undefined,
              causedByEventIds: [COMMAND_EVENT_ID],
            }),
          ],
        }),
      ],
      { windowTicks: 20 },
    );

    expect(statusFor(trace, 3)).toMatchObject({
      status: "NOTICED",
      beats: [
        {
          kind: "RECONSIDERED_DESIRE",
          reason: { code: "DESIRE_EVENT_LINKED_TO_COMMAND" },
        },
        {
          kind: "RECONSIDERED_PLAN",
          reason: { code: "PLAN_EVENT_LINKED_TO_COMMAND" },
        },
      ],
    });
  });

  it("records a typed linked plan failure without parsing its prose", () => {
    const trace = classifyInterventionResponses(
      command(),
      [2],
      [
        observation(10, { events: [event()] }),
        observation(18, {
          events: [
            event({
              id: 102,
              tick: 18,
              type: "PLAN_BLOCKED",
              actorIds: [2],
              targetIds: [AFFECTED_RESOURCE_ID],
              commandId: undefined,
              commandOutcome: undefined,
              decisionActorId: 2,
              decisionCandidates: [selectedIntent()],
            }),
          ],
        }),
      ],
      { windowTicks: 20 },
    );

    expect(statusFor(trace, 2)).toMatchObject({
      status: "FAILED_TO_REACH",
      beats: [],
      failure: {
        code: "FAILED_TO_REACH",
        reason: {
          code: "LINKED_PLAN_WAS_BLOCKED",
          sourceEventIds: [COMMAND_EVENT_ID, 102],
        },
      },
    });
  });

  it("does not classify no response as ignored until the window closes", () => {
    let trace = createInterventionResponseTrace(command(), [2, 1, 2], {
      windowTicks: 20,
    });
    trace = observeInterventionResponse(trace, observation(10, { events: [event()] }));
    expect(trace.phase).toBe("OBSERVING");
    expect(trace.responses).toEqual([]);
    expect(trace.unclassifiedParticipantIds).toEqual([1, 2]);

    trace = observeInterventionResponse(trace, observation(29));
    expect(trace.responses).toEqual([]);

    trace = observeInterventionResponse(trace, observation(30));
    expect(trace.phase).toBe("CLOSED");
    expect(trace.closedAtTick).toBe(30);
    expect(trace.responses.map((response) => response.status)).toEqual([
      "IGNORED",
      "IGNORED",
    ]);
    expect(trace.responses[0]?.reason).toMatchObject({
      code: "WINDOW_CLOSED_WITHOUT_RECORDED_RESPONSE",
      observationTick: 30,
    });
    expect(
      trace.responses.map((response) => response.beats.map((beat) => beat.kind)),
    ).toEqual([["NO_RECORDED_RESPONSE"], ["NO_RECORDED_RESPONSE"]]);
    expect(trace.responses[0]?.reason.fact).toContain(
      "does not prove the participant was unaffected",
    );
  });

  it("closes once and ignores a response delivered after closure", () => {
    let trace = createInterventionResponseTrace(command(), [1], {
      windowTicks: 20,
    });
    trace = observeInterventionResponse(trace, observation(30, { events: [event()] }));
    expect(statusFor(trace, 1)?.status).toBe("IGNORED");

    const late = observeInterventionResponse(
      trace,
      observation(31, {
        events: [
          event({
            id: 103,
            tick: 29,
            type: "FOOD_GATHERED",
            actorIds: [1],
            commandId: undefined,
            commandOutcome: undefined,
          }),
        ],
      }),
    );
    expect(late).toBe(trace);
    expect(statusFor(late, 1)?.status).toBe("IGNORED");
  });

  it("uses retained in-window facts when the command outcome is delivered late", () => {
    const trace = classifyInterventionResponses(
      command(),
      [1],
      [
        observation(40, {
          events: [
            event(),
            event({
              id: 104,
              tick: 20,
              type: "FOOD_GATHERED",
              actorIds: [1],
              commandId: undefined,
              commandOutcome: undefined,
            }),
          ],
        }),
      ],
      { windowTicks: 20 },
    );

    expect(trace.phase).toBe("CLOSED");
    expect(trace.closedAtTick).toBe(30);
    expect(statusFor(trace, 1)?.status).toBe("USED");
  });

  it("never opens a response window for a different command ID", () => {
    const trace = classifyInterventionResponses(
      command(),
      [1],
      [
        observation(100, {
          events: [
            event({ commandId: 2 }),
            event({
              id: 105,
              tick: 20,
              type: "FOOD_GATHERED",
              actorIds: [1],
              commandId: undefined,
              commandOutcome: undefined,
              causedByEventIds: [COMMAND_EVENT_ID],
            }),
          ],
        }),
      ],
      { windowTicks: 20 },
    );

    expect(trace.phase).toBe("WAITING_FOR_OUTCOME");
    expect(trace.outcome).toBeNull();
    expect(trace.responses).toEqual([]);
  });

  it("closes a rejected command without inventing participant responses", () => {
    const trace = classifyInterventionResponses(
      command({ type: "TOGGLE_OBSTACLE" }),
      [1],
      [
        observation(12, {
          events: [
            event({
              type: "PLAYER_TOGGLED_OBSTACLE",
              commandOutcome: "REJECTED",
              commandRejectionReason: "OCCUPIED_TILE",
              targetIds: [],
            }),
          ],
        }),
      ],
    );

    expect(trace.phase).toBe("CLOSED");
    expect(trace.closedAtTick).toBe(10);
    expect(trace.responses).toEqual([]);
    expect(trace.closureReason).toMatchObject({
      code: "COMMAND_REJECTED_OCCUPIED_TILE",
      sourceEventIds: [COMMAND_EVENT_ID],
    });
  });

  it.each([
    ["REPLENISH_WATER", "NO_WATER_SOURCE", "PLAYER_REPLENISHED_WATER"],
    ["REPLENISH_WATER", "SOURCE_FULL", "PLAYER_REPLENISHED_WATER"],
    ["DRAIN_WATER", "SOURCE_EMPTY", "PLAYER_DRAINED_WATER"],
  ] as const)(
    "strictly validates %s traces rejected with %s",
    (commandType, rejectionReason, eventType) => {
      const trace = classifyInterventionResponses(
        command({ type: commandType }),
        [1],
        [
          observation(12, {
            events: [
              event({
                type: eventType,
                commandOutcome: "REJECTED",
                commandRejectionReason: rejectionReason,
                targetIds: [],
              }),
            ],
          }),
        ],
      );

      expect(() => assertInterventionResponseTrace(trace)).not.toThrow();
      expect(trace).toMatchObject({
        phase: "CLOSED",
        outcome: { status: "REJECTED", rejectionReason },
        closureReason: { code: "COMMAND_REJECTED" },
      });
    },
  );

  it("ignores failure evidence whose event tick is beyond the bounded window", () => {
    const trace = classifyInterventionResponses(
      command(),
      [1],
      [
        observation(10, { events: [event()] }),
        observation(31, {
          events: [
            event({
              id: 106,
              tick: 31,
              type: "PLAN_BLOCKED",
              actorIds: [1],
              targetIds: [AFFECTED_RESOURCE_ID],
              commandId: undefined,
              commandOutcome: undefined,
            }),
          ],
        }),
      ],
      { windowTicks: 20 },
    );

    expect(statusFor(trace, 1)?.status).toBe("IGNORED");
    expect(trace.seenEventIds).not.toContain(106);
  });

  it("sorts batch observations deterministically", () => {
    const outcomeFrame = observation(10, { events: [event()] });
    const usedFrame = observation(20, {
      events: [
        event({
          id: 107,
          tick: 20,
          type: "FOOD_GATHERED",
          actorIds: [1],
          commandId: undefined,
          commandOutcome: undefined,
        }),
      ],
    });

    const chronological = classifyInterventionResponses(
      command(),
      [1],
      [outcomeFrame, usedFrame],
      { windowTicks: 20 },
    );
    const reversed = classifyInterventionResponses(
      command(),
      [1],
      [usedFrame, outcomeFrame],
      { windowTicks: 20 },
    );

    expect(reversed).toEqual(chronological);
    expect(statusFor(reversed, 1)?.status).toBe("USED");
  });
});
