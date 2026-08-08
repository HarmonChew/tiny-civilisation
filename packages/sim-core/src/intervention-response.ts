import type { CommandRejectionReason, EntityId, ScheduledPlayerCommand } from "./types.js";
import {
  MAX_PERSISTED_COLLECTION_ITEMS,
  MAX_PERSISTED_STRING_CHARACTERS,
} from "./state-validation.js";

export interface InterventionResponsePoint {
  readonly x: number;
  readonly y: number;
}

export const DEFAULT_INTERVENTION_RESPONSE_WINDOW_TICKS = 120;
export const MAX_INTERVENTION_RESPONSE_WINDOW_TICKS = 5_000;
export const INTERVENTION_RESPONSE_SCHEMA_VERSION = 4 as const;

export const INTERVENTION_RESPONSE_STATUSES = [
  "NOTICED",
  "APPROACHED",
  "USED",
  "IGNORED",
  "FAILED_TO_REACH",
] as const;

export type InterventionResponseStatus = (typeof INTERVENTION_RESPONSE_STATUSES)[number];

export const INTERVENTION_RESPONSE_BEATS = [
  "NOTICED",
  "RECONSIDERED_DESIRE",
  "RECONSIDERED_PLAN",
  "REROUTED",
  "ACTED",
  "NO_RECORDED_RESPONSE",
] as const;

export type InterventionResponseBeatKind = (typeof INTERVENTION_RESPONSE_BEATS)[number];

export type InterventionResponseReasonCode =
  | "COMMAND_EVENT_CITED_BY_SELECTED_INTENT"
  | "DESIRE_EVENT_LINKED_TO_COMMAND"
  | "PLAN_EVENT_LINKED_TO_COMMAND"
  | "ROUTE_MOVED_TOWARD_COMMAND_LOCATION"
  | "ACTION_EVENT_LINKED_TO_COMMAND"
  | "WINDOW_CLOSED_WITHOUT_RECORDED_RESPONSE"
  | "LINKED_PLAN_WAS_BLOCKED";

export type InterventionResponseTracePhase = "WAITING_FOR_OUTCOME" | "OBSERVING" | "CLOSED";

export type InterventionResponseClosureCode =
  "WINDOW_ELAPSED" | "COMMAND_REJECTED" | "COMMAND_REJECTED_OCCUPIED_TILE";

export type InterventionResponseCommand = Readonly<
  Pick<ScheduledPlayerCommand, "commandId" | "applyAtTick" | "type" | "tileIndex">
>;

export interface ResponseIntentFactorObservation {
  readonly evidenceEventIds: readonly number[];
}

export interface ResponseIntentObservation {
  readonly selected: boolean;
  readonly targetId?: EntityId | undefined;
  readonly factors: readonly ResponseIntentFactorObservation[];
}

export interface ResponseCreatureObservation {
  readonly id: EntityId;
  readonly alive: boolean;
  readonly x: number;
  readonly y: number;
  readonly goalTarget?: InterventionResponsePoint | undefined;
  readonly route: ReadonlyArray<InterventionResponsePoint & { readonly tick: number }>;
  readonly candidates: readonly ResponseIntentObservation[];
}

export interface ResponseEventObservation {
  readonly id: number;
  readonly tick: number;
  readonly type: string;
  readonly actorIds: readonly EntityId[];
  readonly targetIds: readonly EntityId[];
  readonly causedByEventIds: readonly number[];
  readonly locationTileIndex?: number | undefined;
  readonly commandId?: number | undefined;
  readonly commandSourceEventId?: number | undefined;
  readonly commandOutcome?: "APPLIED" | "REJECTED" | undefined;
  readonly commandRejectionReason?: Exclude<CommandRejectionReason, null> | undefined;
  readonly decisionActorId?: EntityId | undefined;
  readonly decisionCandidates?: readonly ResponseIntentObservation[] | undefined;
}

export interface InterventionResponseObservation {
  readonly tick: number;
  readonly width: number;
  readonly creatures: readonly ResponseCreatureObservation[];
  readonly events: readonly ResponseEventObservation[];
}

export interface InterventionOutcomeEvidence {
  readonly eventId: number;
  readonly tick: number;
  readonly status: "APPLIED" | "REJECTED";
  readonly rejectionReason: CommandRejectionReason;
  readonly targetEntityIds: readonly EntityId[];
}

export interface InterventionResponseReason {
  readonly code: InterventionResponseReasonCode;
  readonly fact: string;
  readonly sourceEventIds: readonly number[];
  readonly observationTick: number;
  readonly locationTileIndex: number;
}

export interface InterventionResponseBeat {
  readonly kind: InterventionResponseBeatKind;
  readonly tick: number;
  readonly reason: InterventionResponseReason;
}

export interface InterventionResponseFailure {
  readonly code: "FAILED_TO_REACH";
  readonly tick: number;
  readonly reason: InterventionResponseReason;
}

export interface ParticipantInterventionResponse {
  readonly participantId: EntityId;
  /** Compact user-facing summary derived from `beats` and `failure`. */
  readonly status: InterventionResponseStatus;
  readonly firstObservedTick: number;
  readonly reason: InterventionResponseReason;
  /** Ordered authoritative evidence vocabulary from the Phase 2.5 plan. */
  readonly beats: readonly InterventionResponseBeat[];
  readonly failure: InterventionResponseFailure | null;
}

export interface InterventionResponseClosureReason {
  readonly code: InterventionResponseClosureCode;
  readonly fact: string;
  readonly sourceEventIds: readonly number[];
}

export interface InterventionResponseTrace {
  readonly schemaVersion: typeof INTERVENTION_RESPONSE_SCHEMA_VERSION;
  readonly command: InterventionResponseCommand;
  readonly participantIds: readonly EntityId[];
  readonly windowTicks: number;
  readonly phase: InterventionResponseTracePhase;
  readonly outcome: InterventionOutcomeEvidence | null;
  readonly windowStartTick: number | null;
  readonly windowEndTick: number | null;
  readonly observedThroughTick: number | null;
  readonly closedAtTick: number | null;
  readonly closureReason: InterventionResponseClosureReason | null;
  readonly responses: readonly ParticipantInterventionResponse[];
  readonly unclassifiedParticipantIds: readonly EntityId[];
  readonly seenEventIds: readonly number[];
}

type UnknownRecord = Record<string, unknown>;

const RESPONSE_REASON_CODES = new Set<InterventionResponseReasonCode>([
  "COMMAND_EVENT_CITED_BY_SELECTED_INTENT",
  "DESIRE_EVENT_LINKED_TO_COMMAND",
  "PLAN_EVENT_LINKED_TO_COMMAND",
  "ROUTE_MOVED_TOWARD_COMMAND_LOCATION",
  "ACTION_EVENT_LINKED_TO_COMMAND",
  "WINDOW_CLOSED_WITHOUT_RECORDED_RESPONSE",
  "LINKED_PLAN_WAS_BLOCKED",
]);

const RESPONSE_PHASES = new Set<InterventionResponseTracePhase>([
  "WAITING_FOR_OUTCOME",
  "OBSERVING",
  "CLOSED",
]);

const RESPONSE_CLOSURE_CODES = new Set<InterventionResponseClosureCode>([
  "WINDOW_ELAPSED",
  "COMMAND_REJECTED",
  "COMMAND_REJECTED_OCCUPIED_TILE",
]);

const RESPONSE_COMMAND_TYPES = new Set<ScheduledPlayerCommand["type"]>([
  "ADD_FOOD",
  "REMOVE_FOOD",
  "ADD_MATERIAL",
  "REMOVE_MATERIAL",
  "TOGGLE_OBSTACLE",
  "REPLENISH_WATER",
  "DRAIN_WATER",
]);

const RESPONSE_REJECTION_REASONS = new Set<Exclude<CommandRejectionReason, null>>([
  "OCCUPIED_TILE",
  "NO_WATER_SOURCE",
  "SOURCE_FULL",
  "SOURCE_EMPTY",
]);

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exactResponseObject(
  value: unknown,
  keys: readonly string[],
  label: string,
): UnknownRecord {
  if (!isRecord(value)) throw new Error(`${label} must be an object.`);
  const allowed = new Set(keys);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw new Error(`${label} contains unsupported field ${key}.`);
  }
  return value;
}

function responseArray(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array.`);
  if (value.length > MAX_PERSISTED_COLLECTION_ITEMS) {
    throw new Error(
      `${label} exceeds the ${MAX_PERSISTED_COLLECTION_ITEMS.toString()} item limit.`,
    );
  }
  return value;
}

function responseInteger(value: unknown, label: string, minimum = 0): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < minimum) {
    throw new Error(`${label} must be a safe integer of at least ${minimum.toString()}.`);
  }
  return value;
}

function responseString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${label} must be a non-empty string.`);
  }
  if (value.length > MAX_PERSISTED_STRING_CHARACTERS) {
    throw new Error(
      `${label} exceeds the ${MAX_PERSISTED_STRING_CHARACTERS.toString()} character limit.`,
    );
  }
  return value;
}

function canonicalIds(value: unknown, label: string): number[] {
  const ids = responseArray(value, label).map((id) => responseInteger(id, `${label}[]`, 1));
  for (let index = 1; index < ids.length; index += 1) {
    if ((ids[index - 1] ?? 0) >= (ids[index] ?? 0)) {
      throw new Error(`${label} must contain unique IDs in ascending order.`);
    }
  }
  return ids;
}

function nullableTick(value: unknown, label: string): number | null {
  return value === null ? null : responseInteger(value, label);
}

function assertResponseReason(
  value: unknown,
  label: string,
): asserts value is InterventionResponseReason {
  const reason = exactResponseObject(
    value,
    ["code", "fact", "sourceEventIds", "observationTick", "locationTileIndex"],
    label,
  );
  if (
    typeof reason.code !== "string" ||
    !RESPONSE_REASON_CODES.has(reason.code as InterventionResponseReasonCode)
  ) {
    throw new Error(`${label}.code is not supported.`);
  }
  responseString(reason.fact, `${label}.fact`);
  canonicalIds(reason.sourceEventIds, `${label}.sourceEventIds`);
  responseInteger(reason.observationTick, `${label}.observationTick`);
  responseInteger(reason.locationTileIndex, `${label}.locationTileIndex`);
}

function assertResponseBeat(
  value: unknown,
  label: string,
): asserts value is InterventionResponseBeat {
  const beat = exactResponseObject(value, ["kind", "tick", "reason"], label);
  if (
    typeof beat.kind !== "string" ||
    !INTERVENTION_RESPONSE_BEATS.includes(beat.kind as InterventionResponseBeatKind)
  ) {
    throw new Error(`${label}.kind is not supported.`);
  }
  const tick = responseInteger(beat.tick, `${label}.tick`);
  assertResponseReason(beat.reason, `${label}.reason`);
  if (beat.reason.observationTick !== tick) {
    throw new Error(`${label}.reason observation tick must match the beat tick.`);
  }
}

function assertParticipantResponse(
  value: unknown,
  label: string,
): asserts value is ParticipantInterventionResponse {
  const response = exactResponseObject(
    value,
    ["participantId", "status", "firstObservedTick", "reason", "beats", "failure"],
    label,
  );
  responseInteger(response.participantId, `${label}.participantId`, 1);
  if (
    typeof response.status !== "string" ||
    !INTERVENTION_RESPONSE_STATUSES.includes(response.status as InterventionResponseStatus)
  ) {
    throw new Error(`${label}.status is not supported.`);
  }
  const firstObservedTick = responseInteger(
    response.firstObservedTick,
    `${label}.firstObservedTick`,
  );
  assertResponseReason(response.reason, `${label}.reason`);
  const beats = responseArray(response.beats, `${label}.beats`);
  for (const [index, beat] of beats.entries()) {
    assertResponseBeat(beat, `${label}.beats[${index.toString()}]`);
  }
  const typedBeats = beats as unknown as InterventionResponseBeat[];
  if (new Set(typedBeats.map((beat) => beat.kind)).size !== typedBeats.length) {
    throw new Error(`${label}.beats must contain at most one beat of each kind.`);
  }
  const sortedBeats = orderedBeats(typedBeats);
  if (sortedBeats.some((beat, index) => beat !== typedBeats[index])) {
    throw new Error(`${label}.beats must be in canonical order.`);
  }
  let failure: InterventionResponseFailure | null = null;
  if (response.failure !== null) {
    const failureRecord = exactResponseObject(
      response.failure,
      ["code", "tick", "reason"],
      `${label}.failure`,
    );
    if (failureRecord.code !== "FAILED_TO_REACH") {
      throw new Error(`${label}.failure.code is not supported.`);
    }
    const tick = responseInteger(failureRecord.tick, `${label}.failure.tick`);
    assertResponseReason(failureRecord.reason, `${label}.failure.reason`);
    if (failureRecord.reason.observationTick !== tick) {
      throw new Error(`${label}.failure reason observation tick must match.`);
    }
    failure = response.failure as InterventionResponseFailure;
  }
  if (typedBeats.length === 0 && failure === null) {
    throw new Error(`${label} must contain a beat or failure.`);
  }
  const evidenceTicks = [
    ...typedBeats.map((beat) => beat.tick),
    ...(failure ? [failure.tick] : []),
  ];
  if (firstObservedTick !== Math.min(...evidenceTicks)) {
    throw new Error(`${label}.firstObservedTick does not match its evidence.`);
  }
  const derived = responseFromEvidence(
    response.participantId as number,
    typedBeats,
    failure,
  );
  if (response.status !== derived.status) {
    throw new Error(`${label}.status does not match its evidence.`);
  }
}

function assertClosureReason(
  value: unknown,
  label: string,
): asserts value is InterventionResponseClosureReason {
  const reason = exactResponseObject(value, ["code", "fact", "sourceEventIds"], label);
  if (
    typeof reason.code !== "string" ||
    !RESPONSE_CLOSURE_CODES.has(reason.code as InterventionResponseClosureCode)
  ) {
    throw new Error(`${label}.code is not supported.`);
  }
  responseString(reason.fact, `${label}.fact`);
  canonicalIds(reason.sourceEventIds, `${label}.sourceEventIds`);
}

export function assertInterventionResponseTrace(
  value: unknown,
  label = "Intervention response trace",
): asserts value is InterventionResponseTrace {
  const trace = exactResponseObject(
    value,
    [
      "schemaVersion",
      "command",
      "participantIds",
      "windowTicks",
      "phase",
      "outcome",
      "windowStartTick",
      "windowEndTick",
      "observedThroughTick",
      "closedAtTick",
      "closureReason",
      "responses",
      "unclassifiedParticipantIds",
      "seenEventIds",
    ],
    label,
  );
  if (trace.schemaVersion !== INTERVENTION_RESPONSE_SCHEMA_VERSION) {
    throw new Error(
      `${label}.schemaVersion ${String(trace.schemaVersion)} is incompatible with ${INTERVENTION_RESPONSE_SCHEMA_VERSION.toString()}.`,
    );
  }
  const command = exactResponseObject(
    trace.command,
    ["commandId", "applyAtTick", "type", "tileIndex"],
    `${label}.command`,
  );
  responseInteger(command.commandId, `${label}.command.commandId`, 1);
  responseInteger(command.applyAtTick, `${label}.command.applyAtTick`);
  responseInteger(command.tileIndex, `${label}.command.tileIndex`);
  if (
    typeof command.type !== "string" ||
    !RESPONSE_COMMAND_TYPES.has(command.type as ScheduledPlayerCommand["type"])
  ) {
    throw new Error(`${label}.command.type is not supported.`);
  }
  const participantIds = canonicalIds(trace.participantIds, `${label}.participantIds`);
  const windowTicks = responseInteger(trace.windowTicks, `${label}.windowTicks`, 1);
  if (windowTicks > MAX_INTERVENTION_RESPONSE_WINDOW_TICKS) {
    throw new Error(
      `${label}.windowTicks exceeds ${MAX_INTERVENTION_RESPONSE_WINDOW_TICKS.toString()}.`,
    );
  }
  if (
    typeof trace.phase !== "string" ||
    !RESPONSE_PHASES.has(trace.phase as InterventionResponseTracePhase)
  ) {
    throw new Error(`${label}.phase is not supported.`);
  }
  let outcome: InterventionOutcomeEvidence | null = null;
  if (trace.outcome !== null) {
    const outcomeRecord = exactResponseObject(
      trace.outcome,
      ["eventId", "tick", "status", "rejectionReason", "targetEntityIds"],
      `${label}.outcome`,
    );
    responseInteger(outcomeRecord.eventId, `${label}.outcome.eventId`, 1);
    responseInteger(outcomeRecord.tick, `${label}.outcome.tick`);
    if (outcomeRecord.status !== "APPLIED" && outcomeRecord.status !== "REJECTED") {
      throw new Error(`${label}.outcome.status is not supported.`);
    }
    if (
      outcomeRecord.rejectionReason !== null &&
      (typeof outcomeRecord.rejectionReason !== "string" ||
        !RESPONSE_REJECTION_REASONS.has(
          outcomeRecord.rejectionReason as Exclude<CommandRejectionReason, null>,
        ))
    ) {
      throw new Error(`${label}.outcome.rejectionReason is not supported.`);
    }
    if (outcomeRecord.status === "APPLIED" && outcomeRecord.rejectionReason !== null) {
      throw new Error(`${label}.outcome rejection reason does not match its status.`);
    }
    canonicalIds(outcomeRecord.targetEntityIds, `${label}.outcome.targetEntityIds`);
    outcome = trace.outcome as InterventionOutcomeEvidence;
  }
  const windowStartTick = nullableTick(trace.windowStartTick, `${label}.windowStartTick`);
  const windowEndTick = nullableTick(trace.windowEndTick, `${label}.windowEndTick`);
  const observedThroughTick = nullableTick(
    trace.observedThroughTick,
    `${label}.observedThroughTick`,
  );
  const closedAtTick = nullableTick(trace.closedAtTick, `${label}.closedAtTick`);
  if (trace.closureReason !== null) {
    assertClosureReason(trace.closureReason, `${label}.closureReason`);
  }
  const responses = responseArray(trace.responses, `${label}.responses`);
  for (const [index, response] of responses.entries()) {
    assertParticipantResponse(response, `${label}.responses[${index.toString()}]`);
  }
  const typedResponses = responses as unknown as ParticipantInterventionResponse[];
  const responseIds = typedResponses.map((response) => response.participantId);
  if (new Set(responseIds).size !== responseIds.length) {
    throw new Error(`${label}.responses must contain unique participants.`);
  }
  if (responseIds.some((id, index) => index > 0 && (responseIds[index - 1] ?? 0) >= id)) {
    throw new Error(`${label}.responses must be ordered by participant ID.`);
  }
  if (responseIds.some((id) => !participantIds.includes(id))) {
    throw new Error(`${label}.responses contain an unknown participant.`);
  }
  const unclassified = canonicalIds(
    trace.unclassifiedParticipantIds,
    `${label}.unclassifiedParticipantIds`,
  );
  const expectedUnclassified = participantIds.filter((id) => !responseIds.includes(id));
  if (
    unclassified.length !== expectedUnclassified.length ||
    unclassified.some((id, index) => id !== expectedUnclassified[index])
  ) {
    throw new Error(`${label}.unclassifiedParticipantIds do not match its responses.`);
  }
  canonicalIds(trace.seenEventIds, `${label}.seenEventIds`);

  if (trace.phase === "WAITING_FOR_OUTCOME") {
    if (
      outcome !== null ||
      windowStartTick !== null ||
      windowEndTick !== null ||
      closedAtTick !== null ||
      trace.closureReason !== null ||
      responses.length > 0
    ) {
      throw new Error(`${label} has evidence that is invalid while waiting for outcome.`);
    }
  } else if (outcome === null) {
    throw new Error(`${label}.outcome is required after observation begins.`);
  } else if (outcome.status === "APPLIED") {
    if (windowStartTick !== outcome.tick || windowEndTick !== outcome.tick + windowTicks) {
      throw new Error(`${label} response window does not match its applied outcome.`);
    }
    if (trace.phase === "OBSERVING") {
      if (closedAtTick !== null || trace.closureReason !== null) {
        throw new Error(`${label} cannot be closed while observing.`);
      }
    } else if (
      closedAtTick !== windowEndTick ||
      trace.closureReason?.code !== "WINDOW_ELAPSED"
    ) {
      throw new Error(`${label} elapsed closure does not match its response window.`);
    }
  } else if (
    trace.phase !== "CLOSED" ||
    windowStartTick !== null ||
    windowEndTick !== null ||
    closedAtTick !== outcome.tick ||
    (trace.closureReason?.code !== "COMMAND_REJECTED" &&
      trace.closureReason?.code !== "COMMAND_REJECTED_OCCUPIED_TILE")
  ) {
    throw new Error(`${label} rejected outcome must be closed without a response window.`);
  }
  void observedThroughTick;
}

function frozenReason(reason: InterventionResponseReason): InterventionResponseReason {
  return Object.freeze({
    ...reason,
    sourceEventIds: Object.freeze([...reason.sourceEventIds]),
  });
}

export function freezeInterventionResponseTrace(
  trace: InterventionResponseTrace,
): InterventionResponseTrace {
  assertInterventionResponseTrace(trace);
  return Object.freeze({
    ...trace,
    command: Object.freeze({ ...trace.command }),
    participantIds: Object.freeze([...trace.participantIds]),
    outcome:
      trace.outcome === null
        ? null
        : Object.freeze({
            ...trace.outcome,
            targetEntityIds: Object.freeze([...trace.outcome.targetEntityIds]),
          }),
    closureReason:
      trace.closureReason === null
        ? null
        : Object.freeze({
            ...trace.closureReason,
            sourceEventIds: Object.freeze([...trace.closureReason.sourceEventIds]),
          }),
    responses: Object.freeze(
      trace.responses.map((response) =>
        Object.freeze({
          ...response,
          reason: frozenReason(response.reason),
          beats: Object.freeze(
            response.beats.map((beat) =>
              Object.freeze({ ...beat, reason: frozenReason(beat.reason) }),
            ),
          ),
          failure:
            response.failure === null
              ? null
              : Object.freeze({
                  ...response.failure,
                  reason: frozenReason(response.failure.reason),
                }),
        }),
      ),
    ),
    unclassifiedParticipantIds: Object.freeze([...trace.unclassifiedParticipantIds]),
    seenEventIds: Object.freeze([...trace.seenEventIds]),
  });
}

const BEAT_ORDER: Readonly<Record<InterventionResponseBeatKind, number>> = {
  NOTICED: 0,
  RECONSIDERED_DESIRE: 1,
  RECONSIDERED_PLAN: 2,
  REROUTED: 3,
  ACTED: 4,
  NO_RECORDED_RESPONSE: 5,
};

const NON_ACTION_RESPONSE_EVENT_TYPES = new Set([
  "SIMULATION_STARTED",
  "DESIRE_CHANGED",
  "PLAN_CHANGED",
  "PLAN_BLOCKED",
  "ACTION_STARTED",
  "INTERVENTION",
]);

function wholeNumber(value: number, label: string, minimum: number): number {
  if (!Number.isSafeInteger(value) || value < minimum) {
    throw new RangeError(`${label} must be a whole number of at least ${minimum}.`);
  }
  return value;
}

function responseWindowTicks(value: number | undefined): number {
  const ticks = wholeNumber(
    value ?? DEFAULT_INTERVENTION_RESPONSE_WINDOW_TICKS,
    "Response window",
    1,
  );
  if (ticks > MAX_INTERVENTION_RESPONSE_WINDOW_TICKS) {
    throw new RangeError(
      `Response window cannot exceed ${MAX_INTERVENTION_RESPONSE_WINDOW_TICKS.toString()} ticks.`,
    );
  }
  return ticks;
}

function orderedIds(ids: readonly number[]): number[] {
  return [...new Set(ids)].sort((left, right) => left - right);
}

function unclassifiedParticipants(
  participantIds: readonly number[],
  responses: readonly ParticipantInterventionResponse[],
): number[] {
  const classified = new Set(responses.map((response) => response.participantId));
  return participantIds.filter((id) => !classified.has(id));
}

export function createInterventionResponseTrace(
  command: InterventionResponseCommand,
  participantIds: readonly EntityId[],
  options: { readonly windowTicks?: number } = {},
): InterventionResponseTrace {
  const stableCommand = {
    commandId: wholeNumber(command.commandId, "Command ID", 1),
    applyAtTick: wholeNumber(command.applyAtTick, "Command tick", 0),
    type: command.type,
    tileIndex: wholeNumber(command.tileIndex, "Command tile", 0),
  } satisfies InterventionResponseCommand;
  const stableParticipantIds = orderedIds(
    participantIds.map((id) => wholeNumber(id, "Participant ID", 1)),
  );
  return freezeInterventionResponseTrace({
    schemaVersion: INTERVENTION_RESPONSE_SCHEMA_VERSION,
    command: stableCommand,
    participantIds: stableParticipantIds,
    windowTicks: responseWindowTicks(options.windowTicks),
    phase: "WAITING_FOR_OUTCOME",
    outcome: null,
    windowStartTick: null,
    windowEndTick: null,
    observedThroughTick: null,
    closedAtTick: null,
    closureReason: null,
    responses: [],
    unclassifiedParticipantIds: stableParticipantIds,
    seenEventIds: [],
  });
}

function orderedEvents(
  events: readonly ResponseEventObservation[],
): ResponseEventObservation[] {
  return [...events].sort((left, right) => left.tick - right.tick || left.id - right.id);
}

function exactCommandOutcome(
  commandId: number,
  events: readonly ResponseEventObservation[],
): ResponseEventObservation | null {
  return (
    orderedEvents(events).find(
      (event) => event.commandId === commandId && event.commandOutcome !== undefined,
    ) ?? null
  );
}

function closureForRejectedOutcome(
  outcome: InterventionOutcomeEvidence,
): InterventionResponseClosureReason {
  if (outcome.rejectionReason === "OCCUPIED_TILE") {
    return {
      code: "COMMAND_REJECTED_OCCUPIED_TILE",
      fact: "The command was rejected because the target tile was occupied; no participant response window opened.",
      sourceEventIds: [outcome.eventId],
    };
  }
  return {
    code: "COMMAND_REJECTED",
    fact: "The command was rejected, so no participant response window opened.",
    sourceEventIds: [outcome.eventId],
  };
}

function sourceEventIdsForIntent(intent: ResponseIntentObservation): number[] {
  return orderedIds(intent.factors.flatMap((factor) => [...factor.evidenceEventIds]));
}

type IntentLink = "COMMAND_EVENT" | "COMMAND_TARGET";

function selectedIntentLink(
  intents: readonly ResponseIntentObservation[],
  outcome: InterventionOutcomeEvidence,
): { readonly intent: ResponseIntentObservation; readonly link: IntentLink } | null {
  for (const intent of intents) {
    if (!intent.selected) continue;
    if (sourceEventIdsForIntent(intent).includes(outcome.eventId)) {
      return { intent, link: "COMMAND_EVENT" };
    }
    if (
      intent.targetId !== undefined &&
      outcome.targetEntityIds.includes(intent.targetId)
    ) {
      return { intent, link: "COMMAND_TARGET" };
    }
  }
  return null;
}

function tileForPoint(point: InterventionResponsePoint, width: number): number | null {
  if (
    !Number.isFinite(point.x) ||
    !Number.isFinite(point.y) ||
    point.x < 0 ||
    point.y < 0
  ) {
    return null;
  }
  return Math.floor(point.y) * width + Math.floor(point.x);
}

function distanceSquared(
  point: InterventionResponsePoint,
  tileIndex: number,
  width: number,
): number {
  const targetX = (tileIndex % width) + 0.5;
  const targetY = Math.floor(tileIndex / width) + 0.5;
  const xDistance = point.x - targetX;
  const yDistance = point.y - targetY;
  return xDistance * xDistance + yDistance * yDistance;
}

function movedTowardCommandLocation(
  creature: ResponseCreatureObservation,
  observationTick: number,
  width: number,
  tileIndex: number,
  windowStartTick: number,
  windowEndTick: number,
): boolean {
  if (tileForPoint(creature, width) === tileIndex) return true;
  const samples = [
    ...creature.route
      .filter((sample) => sample.tick >= windowStartTick && sample.tick <= windowEndTick)
      .map((sample, index) => ({ ...sample, order: index })),
    { x: creature.x, y: creature.y, tick: observationTick, order: Number.MAX_SAFE_INTEGER },
  ].sort((left, right) => left.tick - right.tick || left.order - right.order);
  if (samples.length < 2) return false;
  const first = samples[0];
  if (!first) return false;
  const firstDistance = distanceSquared(first, tileIndex, width);
  return samples
    .slice(1)
    .some((sample) => distanceSquared(sample, tileIndex, width) < firstDistance);
}

function factualReason(
  code: InterventionResponseReasonCode,
  tick: number,
  tileIndex: number,
  sourceEventIds: readonly number[],
): InterventionResponseReason {
  const fact =
    code === "COMMAND_EVENT_CITED_BY_SELECTED_INTENT"
      ? "The participant's selected intent cited the command event."
      : code === "DESIRE_EVENT_LINKED_TO_COMMAND"
        ? "A typed desire-change event was linked to the command event or its affected entity."
        : code === "PLAN_EVENT_LINKED_TO_COMMAND"
          ? "A typed plan-change event was linked to the command event or its affected entity."
          : code === "ROUTE_MOVED_TOWARD_COMMAND_LOCATION"
            ? "The participant selected the affected target and its projected route moved closer to that tile."
            : code === "ACTION_EVENT_LINKED_TO_COMMAND"
              ? "A completed participant event was explicitly linked to the command event or its affected entity."
              : code === "LINKED_PLAN_WAS_BLOCKED"
                ? "A typed plan-blocked event was linked to the affected target."
                : "No projected response evidence was recorded before the bounded window closed; this does not prove the participant was unaffected.";
  return {
    code,
    fact,
    sourceEventIds: orderedIds(sourceEventIds),
    observationTick: tick,
    locationTileIndex: tileIndex,
  };
}

function orderedBeats(
  beats: readonly InterventionResponseBeat[],
): InterventionResponseBeat[] {
  return [...beats].sort(
    (left, right) =>
      left.tick - right.tick || BEAT_ORDER[left.kind] - BEAT_ORDER[right.kind],
  );
}

function responseFromEvidence(
  participantId: EntityId,
  beats: readonly InterventionResponseBeat[],
  failure: InterventionResponseFailure | null,
): ParticipantInterventionResponse {
  const stableBeats = orderedBeats(beats);
  const acted = stableBeats.find((beat) => beat.kind === "ACTED");
  const rerouted = stableBeats.find((beat) => beat.kind === "REROUTED");
  const noResponse = stableBeats.find((beat) => beat.kind === "NO_RECORDED_RESPONSE");
  const latestRecordedBeat = stableBeats
    .filter((beat) => beat.kind !== "NO_RECORDED_RESPONSE")
    .at(-1);
  const status: InterventionResponseStatus = acted
    ? "USED"
    : failure
      ? "FAILED_TO_REACH"
      : rerouted
        ? "APPROACHED"
        : noResponse
          ? "IGNORED"
          : "NOTICED";
  const reason =
    acted?.reason ??
    failure?.reason ??
    rerouted?.reason ??
    latestRecordedBeat?.reason ??
    noResponse?.reason;
  if (!reason) throw new Error("Participant response requires factual evidence.");
  const evidenceTicks = [
    ...stableBeats.map((beat) => beat.tick),
    ...(failure ? [failure.tick] : []),
  ];
  return {
    participantId,
    status,
    firstObservedTick: Math.min(...evidenceTicks),
    reason,
    beats: stableBeats,
    failure,
  };
}

function withBeat(
  responses: readonly ParticipantInterventionResponse[],
  participantId: EntityId,
  kind: InterventionResponseBeatKind,
  reason: InterventionResponseReason,
): readonly ParticipantInterventionResponse[] {
  const existing = responses.find((response) => response.participantId === participantId);
  if (existing?.beats.some((beat) => beat.kind === kind)) {
    return responses;
  }
  const response = responseFromEvidence(
    participantId,
    [...(existing?.beats ?? []), { kind, tick: reason.observationTick, reason }],
    existing?.failure ?? null,
  );
  return [
    ...responses.filter((candidate) => candidate.participantId !== participantId),
    response,
  ].sort((left, right) => left.participantId - right.participantId);
}

function withFailure(
  responses: readonly ParticipantInterventionResponse[],
  participantId: EntityId,
  reason: InterventionResponseReason,
): readonly ParticipantInterventionResponse[] {
  const existing = responses.find((response) => response.participantId === participantId);
  if (existing?.failure) return responses;
  const response = responseFromEvidence(participantId, existing?.beats ?? [], {
    code: "FAILED_TO_REACH",
    tick: reason.observationTick,
    reason,
  });
  return [
    ...responses.filter((candidate) => candidate.participantId !== participantId),
    response,
  ].sort((left, right) => left.participantId - right.participantId);
}

function eventParticipantIds(
  event: ResponseEventObservation,
  participantIds: readonly EntityId[],
): EntityId[] {
  const allowed = new Set(participantIds);
  return orderedIds([
    ...event.actorIds,
    ...(event.decisionActorId === undefined ? [] : [event.decisionActorId]),
  ]).filter((id) => allowed.has(id));
}

function eventIsLinkedToOutcome(
  event: ResponseEventObservation,
  outcome: InterventionOutcomeEvidence,
): boolean {
  if (event.causedByEventIds.includes(outcome.eventId)) return true;
  return event.targetIds.some((id) => outcome.targetEntityIds.includes(id));
}

function isUsedEvent(
  event: ResponseEventObservation,
  trace: InterventionResponseTrace,
  outcome: InterventionOutcomeEvidence,
): boolean {
  if (NON_ACTION_RESPONSE_EVENT_TYPES.has(event.type)) return false;
  if (event.causedByEventIds.includes(outcome.eventId)) return true;
  return (
    ((trace.command.type === "ADD_FOOD" && event.type === "FOOD_GATHERED") ||
      (trace.command.type === "ADD_MATERIAL" && event.type === "MATERIAL_GATHERED") ||
      ((trace.command.type === "REPLENISH_WATER" || trace.command.type === "DRAIN_WATER") &&
        event.type === "WATER_GATHERED")) &&
    event.locationTileIndex === trace.command.tileIndex &&
    event.targetIds.some((id) => outcome.targetEntityIds.includes(id))
  );
}

function processResponseEvent(
  responses: readonly ParticipantInterventionResponse[],
  event: ResponseEventObservation,
  trace: InterventionResponseTrace,
  outcome: InterventionOutcomeEvidence,
): readonly ParticipantInterventionResponse[] {
  let next = responses;
  const participantIds = eventParticipantIds(event, trace.participantIds);
  if (participantIds.length === 0) return next;
  const eventIntentLink = selectedIntentLink(event.decisionCandidates ?? [], outcome);
  const linked = eventIsLinkedToOutcome(event, outcome) || eventIntentLink !== null;
  if (event.type === "DESIRE_CHANGED" && linked) {
    for (const participantId of participantIds) {
      next = withBeat(
        next,
        participantId,
        "RECONSIDERED_DESIRE",
        factualReason(
          "DESIRE_EVENT_LINKED_TO_COMMAND",
          event.tick,
          trace.command.tileIndex,
          [outcome.eventId, event.id],
        ),
      );
    }
    return next;
  }
  if (event.type === "PLAN_CHANGED" && linked) {
    for (const participantId of participantIds) {
      next = withBeat(
        next,
        participantId,
        "RECONSIDERED_PLAN",
        factualReason("PLAN_EVENT_LINKED_TO_COMMAND", event.tick, trace.command.tileIndex, [
          outcome.eventId,
          event.id,
        ]),
      );
    }
    return next;
  }
  if (event.type === "PLAN_BLOCKED" && linked) {
    for (const participantId of participantIds) {
      next = withFailure(
        next,
        participantId,
        factualReason("LINKED_PLAN_WAS_BLOCKED", event.tick, trace.command.tileIndex, [
          outcome.eventId,
          event.id,
        ]),
      );
    }
    return next;
  }
  if (!isUsedEvent(event, trace, outcome)) return next;
  for (const participantId of participantIds) {
    next = withBeat(
      next,
      participantId,
      "ACTED",
      factualReason("ACTION_EVENT_LINKED_TO_COMMAND", event.tick, trace.command.tileIndex, [
        outcome.eventId,
        event.id,
      ]),
    );
  }
  return next;
}

function processCreatureObservation(
  responses: readonly ParticipantInterventionResponse[],
  creature: ResponseCreatureObservation,
  observation: InterventionResponseObservation,
  trace: InterventionResponseTrace,
  outcome: InterventionOutcomeEvidence,
): readonly ParticipantInterventionResponse[] {
  if (!creature.alive || !trace.participantIds.includes(creature.id)) {
    return responses;
  }
  const intentLink = selectedIntentLink(creature.candidates, outcome);
  if (!intentLink) return responses;
  let next = responses;
  if (intentLink.link === "COMMAND_EVENT") {
    next = withBeat(
      next,
      creature.id,
      "NOTICED",
      factualReason(
        "COMMAND_EVENT_CITED_BY_SELECTED_INTENT",
        observation.tick,
        trace.command.tileIndex,
        [outcome.eventId],
      ),
    );
  }
  const targetsCommandTile =
    creature.goalTarget !== undefined &&
    tileForPoint(creature.goalTarget, observation.width) === trace.command.tileIndex;
  if (
    targetsCommandTile &&
    movedTowardCommandLocation(
      creature,
      observation.tick,
      observation.width,
      trace.command.tileIndex,
      trace.windowStartTick ?? outcome.tick,
      trace.windowEndTick ?? outcome.tick + trace.windowTicks,
    )
  ) {
    next = withBeat(
      next,
      creature.id,
      "REROUTED",
      factualReason(
        "ROUTE_MOVED_TOWARD_COMMAND_LOCATION",
        observation.tick,
        trace.command.tileIndex,
        [outcome.eventId],
      ),
    );
  }
  return next;
}

function closeElapsedWindow(
  trace: InterventionResponseTrace,
  responses: readonly ParticipantInterventionResponse[],
): InterventionResponseTrace {
  const endTick = trace.windowEndTick;
  if (endTick === null) return trace;
  let nextResponses: readonly ParticipantInterventionResponse[] = responses;
  for (const participantId of trace.participantIds) {
    if (nextResponses.some((response) => response.participantId === participantId)) {
      continue;
    }
    nextResponses = withBeat(
      nextResponses,
      participantId,
      "NO_RECORDED_RESPONSE",
      factualReason(
        "WINDOW_CLOSED_WITHOUT_RECORDED_RESPONSE",
        endTick,
        trace.command.tileIndex,
        trace.outcome ? [trace.outcome.eventId] : [],
      ),
    );
  }
  return {
    ...trace,
    phase: "CLOSED",
    closedAtTick: endTick,
    closureReason: {
      code: "WINDOW_ELAPSED",
      fact: "The bounded post-command response window elapsed.",
      sourceEventIds: trace.outcome ? [trace.outcome.eventId] : [],
    },
    responses: nextResponses,
    unclassifiedParticipantIds: [],
  };
}

export function observeInterventionResponse(
  trace: InterventionResponseTrace,
  observation: InterventionResponseObservation,
): InterventionResponseTrace {
  if (trace.phase === "CLOSED") return trace;
  const observationTick = wholeNumber(observation.tick, "Observation tick", 0);
  const width = wholeNumber(observation.width, "Observation width", 1);
  if (trace.observedThroughTick !== null && observationTick < trace.observedThroughTick) {
    return trace;
  }

  let outcome = trace.outcome;
  let windowStartTick = trace.windowStartTick;
  let windowEndTick = trace.windowEndTick;
  const seenEventIds = new Set(trace.seenEventIds);
  if (!outcome) {
    const outcomeEvent = exactCommandOutcome(trace.command.commandId, observation.events);
    if (!outcomeEvent || outcomeEvent.commandOutcome === undefined) {
      return trace.observedThroughTick === observationTick
        ? trace
        : freezeInterventionResponseTrace({
            ...trace,
            observedThroughTick: observationTick,
          });
    }
    const outcomeTick = wholeNumber(outcomeEvent.tick, "Command outcome tick", 0);
    outcome = {
      eventId: outcomeEvent.commandSourceEventId ?? outcomeEvent.id,
      tick: outcomeTick,
      status: outcomeEvent.commandOutcome,
      rejectionReason: outcomeEvent.commandRejectionReason ?? null,
      targetEntityIds: orderedIds(outcomeEvent.targetIds),
    };
    seenEventIds.add(outcomeEvent.id);
    seenEventIds.add(outcome.eventId);
    if (outcome.status === "REJECTED") {
      return freezeInterventionResponseTrace({
        ...trace,
        phase: "CLOSED",
        outcome,
        observedThroughTick: observationTick,
        closedAtTick: outcome.tick,
        closureReason: closureForRejectedOutcome(outcome),
        seenEventIds: orderedIds([...seenEventIds]),
      });
    }
    windowStartTick = outcome.tick;
    windowEndTick = wholeNumber(
      outcome.tick + trace.windowTicks,
      "Response window end",
      outcome.tick + 1,
    );
  }

  let responses: readonly ParticipantInterventionResponse[] = trace.responses;
  if (windowStartTick !== null && windowEndTick !== null) {
    for (const event of orderedEvents(observation.events)) {
      if (
        seenEventIds.has(event.id) ||
        event.tick < windowStartTick ||
        event.tick > windowEndTick
      ) {
        continue;
      }
      seenEventIds.add(event.id);
      responses = processResponseEvent(responses, event, trace, outcome);
    }
    if (observationTick >= windowStartTick && observationTick <= windowEndTick) {
      for (const creature of [...observation.creatures].sort(
        (left, right) => left.id - right.id,
      )) {
        responses = processCreatureObservation(
          responses,
          creature,
          { ...observation, width },
          { ...trace, windowStartTick, windowEndTick },
          outcome,
        );
      }
    }
  }

  const nextSeenEventIds = orderedIds([...seenEventIds]);
  const unchanged =
    trace.phase === "OBSERVING" &&
    outcome === trace.outcome &&
    windowStartTick === trace.windowStartTick &&
    windowEndTick === trace.windowEndTick &&
    observationTick === trace.observedThroughTick &&
    responses === trace.responses &&
    nextSeenEventIds.length === trace.seenEventIds.length &&
    nextSeenEventIds.every((id, index) => id === trace.seenEventIds[index]);
  if (unchanged) return trace;

  const next: InterventionResponseTrace = {
    ...trace,
    phase: "OBSERVING",
    outcome,
    windowStartTick,
    windowEndTick,
    observedThroughTick: observationTick,
    responses,
    unclassifiedParticipantIds: unclassifiedParticipants(trace.participantIds, responses),
    seenEventIds: nextSeenEventIds,
  };
  return freezeInterventionResponseTrace(
    windowEndTick !== null && observationTick >= windowEndTick
      ? closeElapsedWindow(next, responses)
      : next,
  );
}

export function classifyInterventionResponses(
  command: InterventionResponseCommand,
  participantIds: readonly EntityId[],
  observations: readonly InterventionResponseObservation[],
  options: { readonly windowTicks?: number } = {},
): InterventionResponseTrace {
  let trace = createInterventionResponseTrace(command, participantIds, options);
  const ordered = observations
    .map((observation, index) => ({ observation, index }))
    .sort(
      (left, right) =>
        left.observation.tick - right.observation.tick || left.index - right.index,
    );
  for (const { observation } of ordered) {
    trace = observeInterventionResponse(trace, observation);
  }
  return trace;
}
