import {
  addExperimentBookmark,
  appendExperimentIntervention,
  createBranchReplay,
  createExperiment,
  createPendingIntervention,
  createScenarioReference,
  deserializeExperiment,
  forkExperimentBranch,
  serializeExperiment,
  setExperimentBranchResult,
  setExperimentInterventionResponseTrace,
  type CausalEvidenceNodeV1,
  type CausalEvidenceProjectionV1,
  type CausalEvidenceRef,
  type ExperimentOutcomeMetrics,
  type ExperimentV1,
  type InterventionLogEntryV1,
  type InterventionResponseBeatKind,
  type InterventionResponseTrace,
  type ScheduledPlayerCommand,
} from "@tiny-civ/sim-core";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  BookmarkPanelProps,
  CausalEventDetail,
  CausalExplorerProps,
  CausalLink,
  ComparisonMetric,
  ComparisonState,
  ExperimentActionProps,
  ExperimentBookmark,
  ExperimentSection,
  ExperimentSetupDialogProps,
  ExperimentWorkspaceProps,
  InterventionComposerProps,
  InterventionNavigationAction,
  InterventionRecord,
  InterventionToolOption,
  NewExperimentDialogProps,
  OperationStatus,
  PickerOption,
  ReplayState,
  SeedPreset,
} from "../components/ExperimentWorkspace";
import type { InterventionTool, TileView, TimelineEventView, WorldView } from "../model";
import {
  createSimulationEngine,
  type LongRunningOperationOptions,
  type ReplayResult,
  type RuntimeCanonicalHash,
  type RuntimeCheckpoint,
  type RuntimeReplay,
  type SimulationEngine,
  type SimulationFrame,
} from "../runtime";
import { makeWorldViewFromSnapshot } from "../sim-adapter";
import { reconcileProjectedInterventions } from "../experiment/intervention-reconciliation";
import {
  DEFAULT_SCENARIO_PRESET,
  SCENARIO_PRESETS,
  normalizeSeed,
  scenarioPresetById,
} from "../experiment/scenario-presets";
import {
  createExperimentStorage,
  downloadExperimentFile,
  readExperimentFile,
} from "../storage/experiment-storage";
import type { SimulationController } from "./useSimulationController";
import { useInterventionResponseTraces } from "./useInterventionResponseTraces";

const ONBOARDING_KEY = "tiny-civilisation/orientation-complete/v1";
const WORKSPACE_KIND = "tiny-civilisation/workspace";
const WORKSPACE_SCHEMA_VERSION = 2;
const INTERVENTION_BRANCH_BASE_ID = "intervention";
const MAX_INTERACTIVE_REPLAY_TICK = 100_000;
const MAX_IMPORTED_REPLAY_COMMANDS = 10_000;
const EMPTY_COMMAND_LOG: readonly InterventionLogEntryV1[] = [];

const RESPONSE_BEAT_LABELS: Readonly<Record<InterventionResponseBeatKind, string>> = {
  NOTICED: "noticed",
  RECONSIDERED_DESIRE: "reconsidered desire",
  RECONSIDERED_PLAN: "reconsidered plan",
  REROUTED: "rerouted",
  ACTED: "acted",
  NO_RECORDED_RESPONSE: "no recorded response",
};

export const TIMELINE_REPLAY_WINDOW_TICKS = {
  prelude: 20,
  action: 1,
  aftermath: 20,
} as const;

export interface TimelineReplayWindow {
  readonly preludeStartTick: number;
  readonly momentTick: number;
  readonly actionEndTick: number;
  readonly aftermathEndTick: number;
}

export type MomentReplayBeatKind = "APPROACH" | "DECISION" | "ACTION" | "AFTERMATH";

export interface MomentReplayBeat {
  readonly id: MomentReplayBeatKind;
  readonly label: string;
  readonly tick: number;
  readonly summary: string;
  readonly view: WorldView;
}

export interface MomentReplayPresentation {
  readonly eventId: number;
  readonly title: string;
  readonly activeBeatIndex: number;
  readonly beats: readonly MomentReplayBeat[];
}

const INTERVENTION_TOOLS: readonly InterventionToolOption[] = [
  {
    id: "inspect-creature",
    label: "Inspect a creature",
    description: "Keyboard-accessible subject selection; this does not alter the world.",
    targetKind: "creature",
  },
  {
    id: "inspect-object",
    label: "Inspect a world object",
    description: "Open retained evidence for a resource or structure.",
    targetKind: "object",
  },
  {
    id: "add-food",
    label: "Add food",
    description: "Introduce food at a tile and let creatures decide how to respond.",
    targetKind: "tile",
    supportsQuantity: true,
  },
  {
    id: "remove-food",
    label: "Remove food",
    description: "Reduce food at a tile without issuing orders to creatures.",
    targetKind: "tile",
    supportsQuantity: true,
  },
  {
    id: "obstacle",
    label: "Toggle obstacle",
    description: "Open or close a passage when the target tile is safe to change.",
    targetKind: "tile",
  },
] as const;

const EMPTY_REPLAY: ReplayState = {
  phase: "idle",
  currentTick: 0,
  targetTick: 0,
  progressPercent: 0,
  hash: { status: "unverified" },
};

const EMPTY_COMPARISON: ComparisonState = {
  status: "empty",
  baselineLabel: "Baseline",
  branchLabel: "Intervention",
  baselineTick: 0,
  branchTick: 0,
  metrics: [],
  message: "Bookmark a baseline, introduce one condition, then compare both runs.",
};

interface PersistedWorkspaceV2 {
  kind: typeof WORKSPACE_KIND;
  schemaVersion: typeof WORKSPACE_SCHEMA_VERSION;
  activeBranchId: string;
  experiment: ExperimentV1;
  simulationSave: string;
}

interface UseExperimentWorkspaceOptions {
  simulation: SimulationController;
  onSelectCreature: (id: number) => void;
  onFocusEvidence?: (ref: CausalEvidenceRef) => void;
  createReplayEngine?: () => SimulationEngine;
}

type PendingReplacement =
  | { readonly kind: "new" }
  | { readonly kind: "load" }
  | { readonly kind: "import"; readonly file: File };

type WorkspaceOperationKind =
  | "start"
  | "intervention"
  | "bookmark"
  | "save"
  | "load"
  | "import"
  | "export"
  | "replay"
  | "comparison";

interface WorkspaceOperationToken {
  readonly id: number;
  readonly kind: WorkspaceOperationKind;
}

export interface ExperimentWorkspaceController {
  props: ExperimentWorkspaceProps;
  busy: boolean;
  momentReplay: MomentReplayPresentation | null;
  openDrawer: (section?: ExperimentSection) => void;
  applyWorldIntervention: (
    tool: Exclude<InterventionTool, "inspect">,
    tile: TileView,
  ) => Promise<void>;
  inspectTimelineEvent: (event: TimelineEventView) => void;
  replayTimelineEvent: (
    event: TimelineEventView,
    liveBoundary?: Pick<WorldView, "tick" | "hash">,
  ) => Promise<boolean>;
  selectMomentReplayBeat: (index: number) => void;
  exitMomentReplay: () => void;
  recover: () => Promise<boolean>;
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function participantCountLabel(count: number): string {
  return `${count.toLocaleString()} participant${count === 1 ? "" : "s"}`;
}

export function interventionResponseRecord(
  trace: InterventionResponseTrace,
  creatureNames: ReadonlyMap<number, string>,
): NonNullable<InterventionRecord["response"]> {
  const recordedResponses = trace.responses.filter(
    (response) =>
      response.failure !== null ||
      response.beats.some((beat) => beat.kind !== "NO_RECORDED_RESPONSE"),
  );
  const noRecordedResponseCount = trace.responses.length - recordedResponses.length;
  const phase =
    trace.phase === "WAITING_FOR_OUTCOME"
      ? "waiting"
      : trace.phase === "OBSERVING"
        ? "observing"
        : "closed";
  const window =
    trace.windowStartTick === null || trace.windowEndTick === null
      ? "Waiting for a typed command outcome."
      : `Ticks ${trace.windowStartTick.toLocaleString()}–${trace.windowEndTick.toLocaleString()}; observed through ${(
          trace.observedThroughTick ?? trace.windowStartTick
        ).toLocaleString()}.`;
  const summary = trace.closureReason
    ? trace.closureReason.fact
    : trace.phase === "OBSERVING"
      ? `${recordedResponses.length.toLocaleString()} of ${participantCountLabel(trace.participantIds.length)} ${recordedResponses.length === 1 ? "has" : "have"} recorded response evidence so far; the window remains open.`
      : "Waiting for the simulation to publish an exact command outcome.";
  const closedSummary =
    trace.phase === "CLOSED" && trace.outcome?.status === "APPLIED"
      ? `${participantCountLabel(recordedResponses.length)} ${recordedResponses.length === 1 ? "has" : "have"} recorded response evidence; ${participantCountLabel(noRecordedResponseCount)} ${noRecordedResponseCount === 1 ? "has" : "have"} no recorded response in this window.`
      : summary;
  return {
    phase,
    window,
    summary: closedSummary,
    participantLines: trace.responses.map((response) => {
      const name =
        creatureNames.get(response.participantId) ?? `Creature ${response.participantId}`;
      const beats = response.beats.map((beat) => RESPONSE_BEAT_LABELS[beat.kind]);
      if (response.failure) beats.push("failed to reach");
      return `${name}: ${beats.join(", ")} — ${response.reason.fact}`;
    }),
  };
}

export function interventionNavigationActions({
  entry,
  trace,
  branchId,
  parentBranchId,
  creatureNames,
  events,
}: {
  entry: InterventionLogEntryV1;
  trace: InterventionResponseTrace | undefined;
  branchId: string;
  parentBranchId: string | null;
  creatureNames: ReadonlyMap<number, string>;
  events: readonly TimelineEventView[];
}): InterventionNavigationAction[] {
  const actions: InterventionNavigationAction[] = [
    {
      id: `location-${entry.command.tileIndex.toString()}`,
      label: `Tile ${entry.command.tileIndex.toString()}`,
      target: { kind: "location", tileIndex: entry.command.tileIndex },
    },
  ];
  const rawEventIds = entry.outcome.status === "PENDING" ? [] : [...entry.outcome.eventIds];
  const rawEventId = rawEventIds[0];
  if (rawEventId !== undefined) {
    actions.push({
      id: `raw-event-${rawEventId.toString()}`,
      label: "Command outcome",
      target: { kind: "raw-evidence", ref: { kind: "event", id: rawEventId } },
    });
  }

  if (trace) {
    for (const response of trace.responses) {
      const recorded =
        response.failure !== null ||
        response.beats.some((beat) => beat.kind !== "NO_RECORDED_RESPONSE");
      if (!recorded) continue;
      actions.push({
        id: `responder-${response.participantId.toString()}`,
        label:
          creatureNames.get(response.participantId) ??
          `Creature ${response.participantId.toString()}`,
        target: {
          kind: "responding-creature",
          creatureId: response.participantId,
        },
      });
    }

    const linkedEventIds = new Set<number>();
    for (const response of trace.responses) {
      for (const beat of response.beats) {
        for (const eventId of beat.reason.sourceEventIds) linkedEventIds.add(eventId);
      }
      if (response.failure) {
        for (const eventId of response.failure.reason.sourceEventIds) {
          linkedEventIds.add(eventId);
        }
      }
    }
    for (const eventId of [...linkedEventIds]
      .filter((id) => !rawEventIds.includes(id))
      .sort((left, right) => left - right)) {
      const event = events.find((candidate) => candidate.id === eventId);
      const isMoment =
        event?.attentionTier === "SIGNIFICANT" || event?.attentionTier === "CRITICAL";
      const eventLabel = event
        ? `Event ${eventId.toString()} · ${event.title} · tick ${event.tick.toString()}`
        : `Event ${eventId.toString()}`;
      actions.push(
        isMoment
          ? {
              id: `moment-${eventId.toString()}`,
              label: eventLabel,
              target: { kind: "linked-moment", eventId },
            }
          : {
              id: `evidence-${eventId.toString()}`,
              label: eventLabel,
              target: {
                kind: "linked-evidence",
                ref: { kind: "event", id: eventId },
              },
            },
      );
    }
  }

  if (parentBranchId !== null) {
    actions.push(
      {
        id: `comparison-${branchId}`,
        label: "Baseline vs branch",
        target: { kind: "comparison", branchId },
      },
      {
        id: `replay-${branchId}`,
        label: "Replay this branch",
        target: { kind: "branch-replay", branchId },
      },
    );
  }
  return actions;
}

function refKey(ref: CausalEvidenceRef): string {
  return `${ref.kind}:${ref.id}`;
}

function parseRef(value: string): CausalEvidenceRef {
  const [kind, rawId] = value.split(":");
  const id = Number(rawId);
  if (!Number.isInteger(id) || id < 0) throw new Error("Invalid evidence reference.");
  if (
    kind !== "event" &&
    kind !== "decision" &&
    kind !== "memory" &&
    kind !== "relationship" &&
    kind !== "history" &&
    kind !== "creature" &&
    kind !== "group" &&
    kind !== "structure" &&
    kind !== "resource" &&
    kind !== "desire" &&
    kind !== "plan" &&
    kind !== "tile"
  ) {
    throw new Error("Invalid evidence reference.");
  }
  return { kind, id } as CausalEvidenceRef;
}

function linkFromNode(node: CausalEvidenceNodeV1): CausalLink {
  return {
    id: refKey(node.ref),
    label: node.label,
    kind: node.ref.kind,
    ...(node.tick === null ? {} : { tick: node.tick }),
    ...(node.summary ? { summary: node.summary } : {}),
  };
}

function linkForRef(
  projection: CausalEvidenceProjectionV1,
  ref: CausalEvidenceRef,
): CausalLink {
  const node = projection.nodes.find((candidate) => refKey(candidate.ref) === refKey(ref));
  return node
    ? linkFromNode(node)
    : { id: refKey(ref), label: `${ref.kind} ${ref.id}`, kind: ref.kind };
}

export function causalDetailFromProjection(
  projection: CausalEvidenceProjectionV1,
): CausalEventDetail | undefined {
  const focusNode = projection.nodes.find(
    (node) => refKey(node.ref) === refKey(projection.focus),
  );
  if (!focusNode) return undefined;
  const summarizedEventRefs =
    focusNode.detail.kind === "history"
      ? projection.edges
          .filter(
            (edge) =>
              refKey(edge.from) === refKey(focusNode.ref) &&
              edge.relation === "SUMMARIZES" &&
              edge.to.kind === "event",
          )
          .map((edge) => edge.to)
          .sort((left, right) => {
            const leftTick = projection.nodes.find(
              (node) => refKey(node.ref) === refKey(left),
            )?.tick;
            const rightTick = projection.nodes.find(
              (node) => refKey(node.ref) === refKey(right),
            )?.tick;
            const focusTick = focusNode.tick ?? projection.stateTick;
            const leftDistance = Math.abs(focusTick - (leftTick ?? 0));
            const rightDistance = Math.abs(focusTick - (rightTick ?? 0));
            return leftDistance - rightDistance || right.id - left.id;
          })
      : [focusNode.ref];
  let explainedDecisionRef: CausalEvidenceRef | undefined;
  for (const eventRef of summarizedEventRefs) {
    explainedDecisionRef = projection.edges.find(
      (edge) =>
        refKey(eventRef) === refKey(edge.from) &&
        edge.relation === "EXPLAINED_BY" &&
        edge.to.kind === "decision",
    )?.to;
    if (explainedDecisionRef) break;
  }
  const decisionNode =
    focusNode.detail.kind === "decision"
      ? focusNode
      : explainedDecisionRef
        ? projection.nodes.find((node) => refKey(node.ref) === refKey(explainedDecisionRef))
        : undefined;
  const decisionDetail =
    decisionNode?.detail.kind === "decision" ? decisionNode.detail : undefined;
  const supportingEventKeys = new Set(
    decisionDetail?.candidates.flatMap((candidate) =>
      candidate.factors.flatMap((factor) => factor.evidence.map(refKey)),
    ) ?? [],
  );
  const socialEvidenceKeys = new Set(
    projection.edges
      .filter(
        (edge) =>
          (edge.from.kind === "memory" || edge.from.kind === "relationship") &&
          (edge.relation === "REMEMBERS" || edge.relation === "SHAPED_BY") &&
          supportingEventKeys.has(refKey(edge.to)),
      )
      .map((edge) => refKey(edge.from)),
  );
  const nodeForRef = (ref: CausalEvidenceRef) =>
    projection.nodes.find((node) => refKey(node.ref) === refKey(ref));
  return {
    id: refKey(focusNode.ref),
    tick: focusNode.tick ?? projection.stateTick,
    title: focusNode.label,
    summary: focusNode.summary,
    immediateCauses: projection.immediateCauses.map((ref) => linkForRef(projection, ref)),
    ...(decisionDetail
      ? {
          decision: {
            actorLabel:
              nodeForRef({ kind: "creature", id: decisionDetail.actorId })?.label ??
              `Creature ${decisionDetail.actorId}`,
            chosenAction: decisionDetail.selectedAction,
            alternatives: decisionDetail.candidates.map((candidate, candidateIndex) => ({
              id: `${decisionNode ? refKey(decisionNode.ref) : "decision"}:candidate:${candidateIndex}`,
              label: candidate.action,
              score: candidate.utility,
              chosen:
                candidate.action === decisionDetail.selectedAction &&
                (decisionDetail.selectedTarget === null ||
                  (candidate.target !== null &&
                    refKey(candidate.target) === refKey(decisionDetail.selectedTarget))),
              factors: candidate.factors.map((factor, factorIndex) => ({
                id: `${factor.key}:${factorIndex}`,
                label: factor.key.replace(/_/g, " "),
                contribution: factor.contribution,
                direction:
                  factor.contribution > 0
                    ? ("for" as const)
                    : factor.contribution < 0
                      ? ("against" as const)
                      : ("neutral" as const),
                evidence: factor.evidence.map((ref) => linkForRef(projection, ref)),
              })),
            })),
          },
        }
      : {}),
    socialEvidence: projection.nodes
      .filter((node) => socialEvidenceKeys.has(refKey(node.ref)))
      .map(linkFromNode),
    consequences: projection.laterConsequences.map((ref) => linkForRef(projection, ref)),
  };
}

function replayAtTick(replay: RuntimeReplay, finalTick: number): RuntimeReplay {
  return {
    kind: replay.kind,
    schemaVersion: replay.schemaVersion,
    behaviorVersion: replay.behaviorVersion,
    stateSchemaVersion: replay.stateSchemaVersion,
    scenario: { ...replay.scenario },
    seed: replay.seed,
    commands: replay.commands.filter((command) => command.applyAtTick < finalTick),
    finalTick,
    ...(replay.finalTick === finalTick && replay.finalHash
      ? { finalHash: replay.finalHash }
      : {}),
  };
}

export function timelineReplayWindow(
  eventTick: number,
  branchHorizon: number,
): TimelineReplayWindow {
  const horizon = Math.max(
    0,
    Math.floor(Number.isFinite(branchHorizon) ? branchHorizon : 0),
  );
  const momentTick = Math.max(
    0,
    Math.min(horizon, Math.floor(Number.isFinite(eventTick) ? eventTick : 0)),
  );
  const actionEndTick = Math.min(horizon, momentTick + TIMELINE_REPLAY_WINDOW_TICKS.action);
  return {
    preludeStartTick: Math.max(0, momentTick - TIMELINE_REPLAY_WINDOW_TICKS.prelude),
    momentTick,
    actionEndTick,
    aftermathEndTick: Math.min(
      horizon,
      actionEndTick + TIMELINE_REPLAY_WINDOW_TICKS.aftermath,
    ),
  };
}

function replayParticipantSummary(view: WorldView, event: TimelineEventView): string {
  const plainTerm = (value: string): string => value.replaceAll("_", " ").toLowerCase();
  const participantIds = [...new Set([...event.actorIds, ...event.targetIds])];
  const participants = participantIds
    .map((id) => view.creatures.find((creature) => creature.id === id))
    .filter(
      (creature): creature is WorldView["creatures"][number] => creature !== undefined,
    )
    .slice(0, 4);
  if (participants.length === 0) {
    return `${view.population.toLocaleString()} creatures and ${view.foodStock.toLocaleString()} food are visible in the reconstructed world.`;
  }
  return participants
    .map(
      (creature) =>
        `${creature.name} is at ${creature.x.toFixed(1)}, ${creature.y.toFixed(1)}, wants ${plainTerm(creature.desire)}, and is ${plainTerm(creature.action)}.`,
    )
    .join(" ");
}

export function createMomentReplayPresentation(
  event: TimelineEventView,
  window: TimelineReplayWindow,
  capturedFrames: readonly SimulationFrame[],
): MomentReplayPresentation | null {
  if (capturedFrames.length === 0) return null;
  let retainedTiles: readonly TileView[] = [];
  let retainedScenario: WorldView["scenario"] | undefined;
  const viewsByTick = new Map<number, WorldView>();
  for (const frame of [...capturedFrames].sort((left, right) => left.tick - right.tick)) {
    const view = makeWorldViewFromSnapshot(
      frame.snapshot,
      frame.hash,
      retainedTiles,
      undefined,
      retainedScenario,
    );
    if (frame.snapshot.tiles.length > 0) retainedTiles = view.tiles;
    retainedScenario = view.scenario;
    viewsByTick.set(frame.tick, view);
  }

  const specifications: ReadonlyArray<{
    readonly id: MomentReplayBeatKind;
    readonly label: string;
    readonly tick: number;
    readonly summary: (view: WorldView) => string;
  }> = [
    {
      id: "APPROACH",
      label: "Approach",
      tick: window.preludeStartTick,
      summary: (view) => replayParticipantSummary(view, event),
    },
    {
      id: "DECISION",
      label: "Decision",
      tick: window.momentTick,
      summary: (view) =>
        event.reason ??
        `No retained decision reason is linked to this event. ${replayParticipantSummary(view, event)}`,
    },
    {
      id: "ACTION",
      label: "Action",
      tick: window.actionEndTick,
      summary: () => event.detail,
    },
    {
      id: "AFTERMATH",
      label: "Aftermath",
      tick: window.aftermathEndTick,
      summary: (view) => replayParticipantSummary(view, event),
    },
  ];
  const beats: MomentReplayBeat[] = [];
  for (const specification of specifications) {
    const view = viewsByTick.get(specification.tick);
    if (!view) return null;
    beats.push({
      id: specification.id,
      label: specification.label,
      tick: specification.tick,
      summary: specification.summary(view),
      view,
    });
  }
  return {
    eventId: event.id,
    title: event.title,
    activeBeatIndex: 0,
    beats,
  };
}

function metricDisplay(
  key: keyof ExperimentOutcomeMetrics,
  value: number,
): string | number {
  return key === "averageTrust" ? (value / 1_000).toFixed(2) : value;
}

const METRIC_DEFINITIONS: ReadonlyArray<{
  key: keyof ExperimentOutcomeMetrics;
  label: string;
  lowerIsBetter?: boolean;
}> = [
  { key: "population", label: "Living population" },
  { key: "wildFood", label: "Wild food" },
  { key: "wildMaterial", label: "Wild material" },
  { key: "storedFood", label: "Stored food" },
  { key: "storedMaterial", label: "Stored material" },
  { key: "groups", label: "Groups" },
  { key: "averageTrust", label: "Average directed trust" },
  { key: "foodShared", label: "Food shared" },
  { key: "thefts", label: "Thefts", lowerIsBetter: true },
  { key: "attacks", label: "Confrontations", lowerIsBetter: true },
  { key: "storagesCompleted", label: "Storage completed" },
];

function comparisonMetrics(
  baseline: ExperimentOutcomeMetrics,
  intervention: ExperimentOutcomeMetrics,
  delta: ExperimentOutcomeMetrics,
): ComparisonMetric[] {
  return METRIC_DEFINITIONS.map(({ key, label, lowerIsBetter }) => {
    const difference = delta[key];
    const tone =
      difference === 0
        ? "neutral"
        : lowerIsBetter
          ? difference < 0
            ? "positive"
            : "negative"
          : difference > 0
            ? "positive"
            : "negative";
    const formattedDelta = metricDisplay(key, difference);
    return {
      id: key,
      label,
      baseline: metricDisplay(key, baseline[key]),
      branch: metricDisplay(key, intervention[key]),
      delta:
        typeof formattedDelta === "number" && formattedDelta > 0
          ? `+${formattedDelta}`
          : typeof formattedDelta === "string" && difference > 0
            ? `+${formattedDelta}`
            : formattedDelta,
      deltaTone: tone,
    };
  });
}

function serializeWorkspace(workspace: PersistedWorkspaceV2): string {
  return JSON.stringify(workspace);
}

function parseWorkspace(serialized: string): PersistedWorkspaceV2 {
  let value: unknown;
  try {
    value = JSON.parse(serialized) as unknown;
  } catch (error) {
    throw new Error("Saved workspace data is not valid JSON.", { cause: error });
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Saved workspace data must be an object.");
  }
  const record = value as Record<string, unknown>;
  if (
    record.kind !== WORKSPACE_KIND ||
    (record.schemaVersion !== 1 && record.schemaVersion !== WORKSPACE_SCHEMA_VERSION)
  ) {
    throw new Error("That browser save uses an incompatible workspace version.");
  }
  if (
    typeof record.activeBranchId !== "string" ||
    typeof record.simulationSave !== "string"
  ) {
    throw new Error("Saved workspace metadata is incomplete.");
  }
  if (record.schemaVersion === 1 && typeof record.scenarioPresetId !== "string") {
    throw new Error("Saved workspace metadata is incomplete.");
  }
  const experiment = deserializeExperiment(JSON.stringify(record.experiment));
  const branch = experiment.branches.find(
    (candidate) => candidate.id === record.activeBranchId,
  );
  if (!branch) throw new Error("The saved active branch does not exist.");
  return {
    kind: WORKSPACE_KIND,
    schemaVersion: WORKSPACE_SCHEMA_VERSION,
    activeBranchId: record.activeBranchId,
    experiment,
    simulationSave: record.simulationSave,
  };
}

function assertWorkspaceCheckpoint(
  workspace: PersistedWorkspaceV2,
  checkpoint: RuntimeCheckpoint,
): void {
  const branch = workspace.experiment.branches.find(
    (candidate) => candidate.id === workspace.activeBranchId,
  );
  if (!branch) throw new Error("The saved active branch does not exist.");
  const expected = workspace.experiment.scenario;
  const actual = checkpoint.state.scenario;
  if (
    expected.scenarioId !== actual.scenarioId ||
    expected.scenarioVersion !== actual.scenarioVersion ||
    expected.mapGenerationVersion !== actual.mapGenerationVersion ||
    expected.seed !== actual.seed
  ) {
    throw new Error("The saved experiment scenario does not match its simulation state.");
  }
  if (
    branch.targetTick !== checkpoint.tick ||
    branch.expectedHash === null ||
    branch.expectedHash !== checkpoint.hash
  ) {
    throw new Error("The saved experiment metadata does not match its simulation state.");
  }
}

function uniqueBranchId(experiment: ExperimentV1): string {
  let suffix = 1;
  let candidate = INTERVENTION_BRANCH_BASE_ID;
  while (experiment.branches.some((branch) => branch.id === candidate)) {
    suffix += 1;
    candidate = `${INTERVENTION_BRANCH_BASE_ID}-${suffix}`;
  }
  return candidate;
}

function uniqueBookmarkId(experiment: ExperimentV1): string {
  let suffix = 1;
  let candidate = `bookmark-${suffix}`;
  while (experiment.bookmarks.some((bookmark) => bookmark.id === candidate)) {
    suffix += 1;
    candidate = `bookmark-${suffix}`;
  }
  return candidate;
}

function selectedImportedBranch(experiment: ExperimentV1): string {
  return (
    [...experiment.branches].sort(
      (left, right) =>
        (right.targetTick ?? right.forkTick) - (left.targetTick ?? left.forkTick),
    )[0]?.id ?? experiment.rootBranchId
  );
}

function preservedFrameSignature(branchId: string, tick: number): string {
  return `${branchId}:${tick.toString()}`;
}

export function useExperimentWorkspace({
  simulation,
  onSelectCreature,
  onFocusEvidence,
  createReplayEngine: createReplayEngineOverride,
}: UseExperimentWorkspaceOptions): ExperimentWorkspaceController {
  const createIsolatedReplayEngine = createReplayEngineOverride ?? createSimulationEngine;
  const getInterventionOutcomes = simulation.getInterventionOutcomes;
  const simulationTick = simulation.view.tick;
  const simulationRevision = `${simulation.scenario.scenarioId}@${simulation.scenario.scenarioVersion.toString()}/${simulation.scenario.mapGenerationVersion.toString()}:${simulation.seed.toString()}:${simulationTick.toString()}`;
  const storageRef = useRef(createExperimentStorage());
  const experimentRef = useRef<ExperimentV1>(createExperiment(simulation.scenario));
  const activeBranchRef = useRef(experimentRef.current.rootBranchId);
  const replayAbortRef = useRef<AbortController | null>(null);
  const causalAbortRef = useRef<AbortController | null>(null);
  const causalRequestSequenceRef = useRef(0);
  const preservedSignatureRef = useRef<string | null>(null);
  const operationLockRef = useRef<WorkspaceOperationToken | null>(null);
  const operationSequenceRef = useRef(0);
  const [experiment, setExperimentState] = useState(experimentRef.current);
  const [activeBranchId, setActiveBranchState] = useState(activeBranchRef.current);
  const [scenarioPresetId, setScenarioPresetId] = useState<string>(
    simulation.scenario.scenarioId,
  );
  const [setupOpen, setSetupOpen] = useState(() => {
    try {
      return localStorage.getItem(ONBOARDING_KEY) !== "complete";
    } catch {
      return true;
    }
  });
  const [setupScenarioId, setSetupScenarioId] = useState<string>(
    simulation.scenario.scenarioId,
  );
  const [setupSeed, setSetupSeed] = useState(simulation.seed.toString());
  const [setupError, setSetupError] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [section, setSection] = useState<ExperimentSection>("record");
  const [pendingReplacement, setPendingReplacement] = useState<PendingReplacement | null>(
    null,
  );
  const [dirty, setDirty] = useState(false);
  const [workspaceBusy, setWorkspaceBusy] = useState(false);
  const [canLoad, setCanLoad] = useState(false);
  const [actionStatus, setActionStatus] = useState<OperationStatus>({
    phase: "idle",
  });
  const [bookmarkDraft, setBookmarkDraft] = useState("");
  const [composerTool, setComposerTool] = useState("add-food");
  const [composerCreature, setComposerCreature] = useState("");
  const [composerObject, setComposerObject] = useState("");
  const [targetX, setTargetX] = useState("10");
  const [targetY, setTargetY] = useState("7");
  const [quantity, setQuantity] = useState("12");
  const [composerStatus, setComposerStatus] = useState<OperationStatus>({
    phase: "idle",
  });
  const [composerValidation, setComposerValidation] = useState<string | null>(null);
  const [replayState, setReplayState] = useState<ReplayState>(EMPTY_REPLAY);
  const [momentReplay, setMomentReplay] = useState<MomentReplayPresentation | null>(null);
  const [comparison, setComparison] = useState<ComparisonState>(EMPTY_COMPARISON);
  const [causalStatus, setCausalStatus] = useState<CausalExplorerProps["status"]>("empty");
  const [causalDetail, setCausalDetail] = useState<CausalEventDetail | undefined>();
  const [causalMessage, setCausalMessage] = useState<string | undefined>(
    "Select a chronicle event to trace its causes and consequences.",
  );
  const [causalBreadcrumbs, setCausalBreadcrumbs] = useState<CausalLink[]>([]);

  const commitExperiment = useCallback((next: ExperimentV1) => {
    experimentRef.current = next;
    setExperimentState(next);
  }, []);

  const commitActiveBranch = useCallback((branchId: string) => {
    activeBranchRef.current = branchId;
    setActiveBranchState(branchId);
  }, []);

  const acquireOperation = useCallback(
    (kind: WorkspaceOperationKind): WorkspaceOperationToken | null => {
      if (operationLockRef.current !== null) return null;
      const token = { id: ++operationSequenceRef.current, kind };
      operationLockRef.current = token;
      setMomentReplay(null);
      setWorkspaceBusy(true);
      return token;
    },
    [],
  );

  const releaseOperation = useCallback((token: WorkspaceOperationToken): void => {
    if (operationLockRef.current?.id !== token.id) return;
    operationLockRef.current = null;
    setWorkspaceBusy(false);
  }, []);

  const replayInIsolation = useCallback(
    async (
      replay: RuntimeReplay,
      options?: LongRunningOperationOptions,
    ): Promise<ReplayResult> => {
      const engine = createIsolatedReplayEngine();
      try {
        return await engine.replay(replay, options);
      } finally {
        engine.dispose();
      }
    },
    [createIsolatedReplayEngine],
  );

  useEffect(() => {
    void storageRef.current
      .load()
      .then((serialized) => setCanLoad(serialized !== null))
      .catch(() => setCanLoad(false));
  }, []);

  useEffect(
    () => () => {
      replayAbortRef.current?.abort();
      replayAbortRef.current = null;
      causalAbortRef.current?.abort();
      causalAbortRef.current = null;
    },
    [],
  );

  useEffect(() => {
    const signature = preservedFrameSignature(activeBranchRef.current, simulationTick);
    if (preservedSignatureRef.current === null) {
      preservedSignatureRef.current = signature;
    } else if (signature !== preservedSignatureRef.current) {
      setDirty(true);
    }
    const branch = experimentRef.current.branches.find(
      (candidate) => candidate.id === activeBranchRef.current,
    );
    const hasResolvablePending = branch?.commandLog.some(
      (entry) =>
        entry.outcome.status === "PENDING" && simulationTick > entry.command.applyAtTick,
    );
    if (!hasResolvablePending) return;
    const pendingCommands =
      branch?.commandLog
        .filter(
          (entry) =>
            entry.outcome.status === "PENDING" &&
            simulationTick > entry.command.applyAtTick,
        )
        .map((entry) => entry.command) ?? [];
    const abort = new AbortController();
    void getInterventionOutcomes(pendingCommands, { signal: abort.signal })
      .then((projections) => {
        if (abort.signal.aborted || !projections) return;
        const reconciled = reconcileProjectedInterventions(
          experimentRef.current,
          activeBranchRef.current,
          projections,
        );
        if (reconciled !== experimentRef.current) {
          commitExperiment(reconciled);
          setDirty(true);
        }
      })
      .catch((error: unknown) => {
        if (!abort.signal.aborted) return Promise.reject(error);
        return undefined;
      })
      .catch(() => undefined);
    return () => abort.abort();
  }, [commitExperiment, getInterventionOutcomes, simulationRevision, simulationTick]);

  const markOrientationComplete = useCallback(() => {
    try {
      localStorage.setItem(ONBOARDING_KEY, "complete");
    } catch {
      // Orientation remains skippable when storage is unavailable.
    }
  }, []);

  const startExperiment = useCallback(async () => {
    const operation = acquireOperation("start");
    if (!operation) return;
    try {
      const nextSeed = normalizeSeed(Number(setupSeed));
      const preset = scenarioPresetById(setupScenarioId);
      if (!preset) throw new Error("Choose a supported scenario.");
      const reference = createScenarioReference(preset.id, nextSeed);
      setSetupError(null);
      const nextView = await simulation.restart(reference);
      if (!nextView) throw new Error("The new experiment could not start.");
      const next = createExperiment(reference);
      commitExperiment(next);
      commitActiveBranch(next.rootBranchId);
      setScenarioPresetId(setupScenarioId);
      setDirty(false);
      setComparison(EMPTY_COMPARISON);
      setReplayState(EMPTY_REPLAY);
      setCausalStatus("empty");
      setCausalDetail(undefined);
      setCausalBreadcrumbs([]);
      preservedSignatureRef.current = preservedFrameSignature(
        next.rootBranchId,
        nextView.tick,
      );
      setSetupOpen(false);
      markOrientationComplete();
    } catch (error) {
      setSetupError(errorMessage(error, "The experiment could not start."));
    } finally {
      releaseOperation(operation);
    }
  }, [
    acquireOperation,
    commitActiveBranch,
    commitExperiment,
    markOrientationComplete,
    releaseOperation,
    setupScenarioId,
    setupSeed,
    simulation,
  ]);

  const dismissSetup = useCallback(() => {
    setSetupOpen(false);
    markOrientationComplete();
  }, [markOrientationComplete]);

  const recoverExperiment = useCallback(async (): Promise<boolean> => {
    const nextView = await simulation.restart(simulation.scenario);
    if (!nextView) return false;
    const next = createExperiment(simulation.scenario);
    commitExperiment(next);
    commitActiveBranch(next.rootBranchId);
    preservedSignatureRef.current = preservedFrameSignature(
      next.rootBranchId,
      nextView.tick,
    );
    setDirty(false);
    setDrawerOpen(false);
    setPendingReplacement(null);
    setComparison(EMPTY_COMPARISON);
    setReplayState(EMPTY_REPLAY);
    setCausalStatus("empty");
    setCausalDetail(undefined);
    setCausalBreadcrumbs([]);
    setActionStatus({ phase: "idle" });
    setComposerStatus({ phase: "idle" });
    return true;
  }, [commitActiveBranch, commitExperiment, simulation]);

  const requestNewExperiment = useCallback(() => {
    if (operationLockRef.current !== null) return;
    if (dirty) setPendingReplacement({ kind: "new" });
    else setSetupOpen(true);
  }, [dirty]);

  const branchWithCheckpointResult = useCallback(
    (checkpoint: Pick<RuntimeCheckpoint, "tick" | "hash">): ExperimentV1 => {
      return setExperimentBranchResult(
        experimentRef.current,
        activeBranchRef.current,
        checkpoint.tick,
        checkpoint.hash,
      );
    },
    [],
  );

  const ensureInterventionBranch = useCallback(
    (
      canonical: RuntimeCanonicalHash,
    ): {
      nextExperiment: ExperimentV1;
      branchId: string;
    } => {
      const current = experimentRef.current;
      const active = current.branches.find(
        (branch) => branch.id === activeBranchRef.current,
      );
      if (!active) throw new Error("The active experiment branch does not exist.");
      const rewoundPastResult =
        active.targetTick !== null && canonical.tick < active.targetTick;
      if (active.parentBranchId !== null && !rewoundPastResult) {
        return { nextExperiment: current, branchId: activeBranchRef.current };
      }
      const nextWithResult =
        active.parentBranchId === null
          ? setExperimentBranchResult(current, active.id, canonical.tick, canonical.hash)
          : current;
      const branchId = uniqueBranchId(nextWithResult);
      const next = forkExperimentBranch(
        nextWithResult,
        active.id,
        branchId,
        "Intervention",
        canonical.tick,
      );
      return { nextExperiment: next, branchId };
    },
    [],
  );

  const logIntervention = useCallback(
    async (command: ScheduledPlayerCommand, base: ExperimentV1, branchId: string) => {
      let next = appendExperimentIntervention(
        base,
        branchId,
        createPendingIntervention(command),
      );
      const projections = await simulation.getInterventionOutcomes([command]);
      if (projections) {
        next = reconcileProjectedInterventions(next, branchId, projections);
      }
      commitExperiment(next);
      setDirty(true);
    },
    [commitExperiment, simulation],
  );

  const applyWorldIntervention = useCallback(
    async (tool: Exclude<InterventionTool, "inspect">, tile: TileView, amount = 12) => {
      const operation = acquireOperation("intervention");
      if (!operation) return;
      try {
        const canonical = await simulation.getCanonicalHash();
        if (!canonical) throw new Error("The simulation is not ready for inspection.");
        const { nextExperiment, branchId } = ensureInterventionBranch(canonical);
        setComposerStatus({ phase: "working", message: "Scheduling intervention…" });
        const acknowledgement = await simulation.applyIntervention(tool, tile, amount);
        if (!acknowledgement) {
          setComposerStatus({
            phase: "error",
            message: "The intervention could not be scheduled.",
          });
          return;
        }
        if (!acknowledgement.accepted) {
          setComposerStatus({ phase: "error", message: acknowledgement.reason });
          return;
        }
        commitActiveBranch(branchId);
        await logIntervention(
          acknowledgement.command as ScheduledPlayerCommand,
          nextExperiment,
          branchId,
        );
        setComposerStatus({
          phase: "success",
          message: `Command ${acknowledgement.command.commandId} entered the experiment log.`,
        });
      } catch (error) {
        setComposerStatus({
          phase: "error",
          message: errorMessage(error, "The intervention could not be recorded."),
        });
      } finally {
        releaseOperation(operation);
      }
    },
    [
      acquireOperation,
      commitActiveBranch,
      ensureInterventionBranch,
      logIntervention,
      releaseOperation,
      simulation,
    ],
  );

  const addBookmark = useCallback(async () => {
    const operation = acquireOperation("bookmark");
    if (!operation) return;
    try {
      const canonical = await simulation.getCanonicalHash();
      if (!canonical) throw new Error("The simulation is not ready to bookmark.");
      const label = bookmarkDraft.trim() || `Moment at tick ${canonical.tick}`;
      let next = experimentRef.current;
      let branchId = activeBranchRef.current;
      let openedInterventionBranch = false;
      const active = next.branches.find((branch) => branch.id === branchId);
      if (active?.parentBranchId === null && next.branches.length === 1) {
        next = setExperimentBranchResult(next, branchId, canonical.tick, canonical.hash);
      }
      next = addExperimentBookmark(next, {
        id: uniqueBookmarkId(next),
        branchId,
        tick: canonical.tick,
        label,
      });
      if (active?.parentBranchId === null && next.branches.length === 1) {
        const interventionBranchId = uniqueBranchId(next);
        next = forkExperimentBranch(
          next,
          branchId,
          interventionBranchId,
          "Intervention",
          canonical.tick,
        );
        branchId = interventionBranchId;
        openedInterventionBranch = true;
        commitActiveBranch(branchId);
      }
      commitExperiment(next);
      setBookmarkDraft("");
      setDirty(true);
      setActionStatus({
        phase: "success",
        message: openedInterventionBranch
          ? "Baseline bookmarked and an intervention branch opened."
          : "Moment bookmarked.",
      });
    } catch (error) {
      setActionStatus({
        phase: "error",
        message: errorMessage(error, "The bookmark could not be added."),
      });
    } finally {
      releaseOperation(operation);
    }
  }, [
    acquireOperation,
    bookmarkDraft,
    commitActiveBranch,
    commitExperiment,
    releaseOperation,
    simulation,
  ]);

  const visitBookmark = useCallback(
    async (bookmarkId: string) => {
      const bookmark = experimentRef.current.bookmarks.find(
        (candidate) => candidate.id === bookmarkId,
      );
      if (!bookmark) return;
      if (bookmark.tick > MAX_INTERACTIVE_REPLAY_TICK) {
        setReplayState({
          phase: "error",
          currentTick: simulation.view.tick,
          targetTick: bookmark.tick,
          progressPercent: 0,
          message: `This bookmark exceeds the interactive replay limit of ${MAX_INTERACTIVE_REPLAY_TICK.toLocaleString()} ticks.`,
          hash: { status: "unverified" },
        });
        setSection("replay");
        return;
      }
      const operation = acquireOperation("bookmark");
      if (!operation) return;
      const replay = replayAtTick(
        createBranchReplay(experimentRef.current, bookmark.branchId),
        bookmark.tick,
      );
      const abort = new AbortController();
      replayAbortRef.current = abort;
      setReplayState({
        phase: "running",
        currentTick: 0,
        targetTick: bookmark.tick,
        progressPercent: 0,
        message: `Returning to ${bookmark.label}…`,
        hash: { status: "verifying" },
      });
      let previousSave: string | null = null;
      try {
        previousSave = await simulation.save();
        const result = await simulation.replay(replay, {
          signal: abort.signal,
          onProgress: (progress) =>
            setReplayState((current) => ({
              ...current,
              currentTick: progress.currentTick,
              progressPercent: Math.round(progress.fraction * 100),
            })),
        });
        if (result.cancelled) throw new Error("Returning to the bookmark was cancelled.");
        const sourceExperiment = experimentRef.current;
        const sourceBranch = sourceExperiment.branches.find(
          (branch) => branch.id === bookmark.branchId,
        );
        if (!sourceBranch) throw new Error("The bookmarked branch no longer exists.");
        const rewound =
          sourceBranch.commandLog.some(
            (entry) => entry.command.applyAtTick >= bookmark.tick,
          ) ||
          (sourceBranch.targetTick !== null && sourceBranch.targetTick > bookmark.tick);
        let visitedBranchId = bookmark.branchId;
        if (rewound) {
          visitedBranchId = uniqueBranchId(sourceExperiment);
          commitExperiment(
            forkExperimentBranch(
              sourceExperiment,
              sourceBranch.id,
              visitedBranchId,
              `From ${bookmark.label}`,
              bookmark.tick,
            ),
          );
        }
        commitActiveBranch(visitedBranchId);
        setDirty(true);
        setReplayState({
          phase: "complete",
          currentTick: result.frame.tick,
          targetTick: bookmark.tick,
          progressPercent: 100,
          message: `Returned to ${bookmark.label}.`,
          hash: { status: "unverified", actual: result.actualHash },
        });
      } catch (error) {
        let preserved = true;
        if (previousSave !== null) {
          try {
            await simulation.load(previousSave);
          } catch {
            preserved = false;
          }
        }
        setReplayState({
          phase: "error",
          currentTick: simulation.view.tick,
          targetTick: bookmark.tick,
          progressPercent: 0,
          message: `${errorMessage(error, "The bookmark could not be restored.")} ${preserved ? "The active run was preserved." : "The active run could not be restored; start a new experiment to recover."}`,
          hash: { status: "unverified" },
        });
      } finally {
        if (replayAbortRef.current === abort) replayAbortRef.current = null;
        releaseOperation(operation);
      }
    },
    [acquireOperation, commitActiveBranch, commitExperiment, releaseOperation, simulation],
  );

  const saveWorkspace = useCallback(async () => {
    const operation = acquireOperation("save");
    if (!operation) return;
    setActionStatus({ phase: "working", message: "Saving this field station…" });
    try {
      const simulationSave = await simulation.save();
      const checkpoint = await simulation.getCheckpoint();
      if (!checkpoint) throw new Error("The simulation is not ready to checkpoint.");
      const next = branchWithCheckpointResult(checkpoint);
      const workspace: PersistedWorkspaceV2 = {
        kind: WORKSPACE_KIND,
        schemaVersion: WORKSPACE_SCHEMA_VERSION,
        activeBranchId: activeBranchRef.current,
        experiment: next,
        simulationSave,
      };
      await storageRef.current.save(serializeWorkspace(workspace));
      commitExperiment(next);
      preservedSignatureRef.current = preservedFrameSignature(
        activeBranchRef.current,
        checkpoint.tick,
      );
      setDirty(false);
      setCanLoad(true);
      setActionStatus({
        phase: "success",
        message: "Saved locally in this browser at the current tick.",
      });
    } catch (error) {
      setActionStatus({ phase: "error", message: errorMessage(error, "Save failed.") });
    } finally {
      releaseOperation(operation);
    }
  }, [
    acquireOperation,
    branchWithCheckpointResult,
    commitExperiment,
    releaseOperation,
    simulation,
  ]);

  const loadWorkspace = useCallback(async () => {
    const operation = acquireOperation("load");
    if (!operation) return;
    let previousSave: string | null = null;
    let installed = false;
    setActionStatus({ phase: "working", message: "Restoring the saved experiment…" });
    try {
      const serialized = await storageRef.current.load();
      if (!serialized) throw new Error("No browser save is available.");
      const workspace = parseWorkspace(serialized);
      previousSave = await simulation.save();
      const restoredView = await simulation.load(workspace.simulationSave);
      installed = true;
      const checkpoint = await simulation.getCheckpoint();
      if (!checkpoint) throw new Error("The restored simulation could not be verified.");
      assertWorkspaceCheckpoint(workspace, checkpoint);
      commitExperiment(workspace.experiment);
      commitActiveBranch(workspace.activeBranchId);
      preservedSignatureRef.current = preservedFrameSignature(
        workspace.activeBranchId,
        checkpoint.tick,
      );
      setScenarioPresetId(workspace.experiment.scenario.scenarioId);
      setDirty(false);
      setSetupOpen(false);
      setActionStatus({
        phase: "success",
        message: `Restored tick ${restoredView.tick} without changing its hash.`,
      });
    } catch (error) {
      let preserved = true;
      if (installed && previousSave !== null) {
        try {
          await simulation.load(previousSave);
        } catch {
          preserved = false;
        }
      }
      setActionStatus({
        phase: "error",
        message: `${errorMessage(error, "Load failed.")} ${preserved ? "The active run was preserved." : "The active run could not be restored; start a new experiment to recover."}`,
      });
    } finally {
      releaseOperation(operation);
    }
  }, [
    acquireOperation,
    commitActiveBranch,
    commitExperiment,
    releaseOperation,
    simulation,
  ]);

  const exportExperiment = useCallback(async () => {
    const operation = acquireOperation("export");
    if (!operation) return;
    try {
      const checkpoint = await simulation.getCheckpoint();
      if (!checkpoint) throw new Error("The simulation is not ready to export.");
      const next = branchWithCheckpointResult(checkpoint);
      commitExperiment(next);
      const preset = scenarioPresetById(scenarioPresetId);
      const safeName = (preset?.name ?? "tiny-civilisation")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
      downloadExperimentFile(
        serializeExperiment(next),
        `${safeName || "experiment"}-v${next.scenario.scenarioVersion.toString()}-map${next.scenario.mapGenerationVersion.toString()}-seed-${next.scenario.seed}.tinyciv.json`,
      );
      preservedSignatureRef.current = preservedFrameSignature(
        activeBranchRef.current,
        checkpoint.tick,
      );
      setDirty(false);
      setActionStatus({
        phase: "success",
        message: "Compact experiment file exported with command logs and expected hashes.",
      });
    } catch (error) {
      setActionStatus({ phase: "error", message: errorMessage(error, "Export failed.") });
    } finally {
      releaseOperation(operation);
    }
  }, [
    acquireOperation,
    branchWithCheckpointResult,
    commitExperiment,
    releaseOperation,
    scenarioPresetId,
    simulation,
  ]);

  const importExperiment = useCallback(
    async (file: File) => {
      const operation = acquireOperation("import");
      if (!operation) return;
      setActionStatus({ phase: "working", message: "Validating experiment file…" });
      let oldSave: string | null = null;
      let replayStarted = false;
      try {
        const imported = deserializeExperiment(await readExperimentFile(file));
        const branchId = selectedImportedBranch(imported);
        const replay = createBranchReplay(imported, branchId);
        if (replay.finalTick === undefined) {
          throw new Error("The imported branch has no preserved result to reconstruct.");
        }
        if (replay.finalTick > MAX_INTERACTIVE_REPLAY_TICK) {
          throw new Error(
            `The imported run exceeds the interactive replay limit of ${MAX_INTERACTIVE_REPLAY_TICK.toLocaleString()} ticks.`,
          );
        }
        if (replay.commands.length > MAX_IMPORTED_REPLAY_COMMANDS) {
          throw new Error(
            `The imported run exceeds the interactive limit of ${MAX_IMPORTED_REPLAY_COMMANDS.toLocaleString()} commands.`,
          );
        }
        oldSave = await simulation.save();
        replayStarted = true;
        const result = await simulation.replay(replay, {
          onProgress: (progress) =>
            setActionStatus({
              phase: "working",
              message: `Reconstructing tick ${progress.currentTick.toLocaleString()} of ${progress.targetTick.toLocaleString()}…`,
            }),
        });
        if (result.cancelled) {
          throw new Error("The imported run reconstruction was cancelled.");
        }
        if (result.hashMatches === false) {
          throw new Error("The imported run did not reproduce its expected hash.");
        }
        commitExperiment(imported);
        commitActiveBranch(branchId);
        preservedSignatureRef.current = preservedFrameSignature(
          branchId,
          result.frame.tick,
        );
        setScenarioPresetId(imported.scenario.scenarioId);
        setDirty(false);
        setSetupOpen(false);
        setActionStatus({
          phase: "success",
          message: `Imported ${result.frame.snapshot.scenario.name} / seed ${imported.scenario.seed} at tick ${result.frame.tick}.`,
        });
      } catch (error) {
        let preserved = true;
        if (replayStarted && oldSave !== null) {
          try {
            await simulation.load(oldSave);
          } catch {
            preserved = false;
          }
        }
        setActionStatus({
          phase: "error",
          message: `${errorMessage(error, "Import failed.")} ${preserved ? "The active run was preserved." : "The active run could not be restored; start a new experiment to recover."}`,
        });
      } finally {
        releaseOperation(operation);
      }
    },
    [acquireOperation, commitActiveBranch, commitExperiment, releaseOperation, simulation],
  );

  const requestLoadWorkspace = useCallback(() => {
    if (operationLockRef.current !== null) return;
    if (dirty) setPendingReplacement({ kind: "load" });
    else void loadWorkspace();
  }, [dirty, loadWorkspace]);

  const requestImportExperiment = useCallback(
    (file: File) => {
      if (operationLockRef.current !== null) return;
      if (dirty) setPendingReplacement({ kind: "import", file });
      else void importExperiment(file);
    },
    [dirty, importExperiment],
  );

  const confirmReplacement = useCallback(() => {
    const replacement = pendingReplacement;
    setPendingReplacement(null);
    if (!replacement) return;
    if (replacement.kind === "new") {
      setSetupOpen(true);
    } else if (replacement.kind === "load") {
      void loadWorkspace();
    } else {
      void importExperiment(replacement.file);
    }
  }, [importExperiment, loadWorkspace, pendingReplacement]);

  const runReplay = useCallback(async () => {
    const operation = acquireOperation("replay");
    if (!operation) return;
    const abort = new AbortController();
    replayAbortRef.current = abort;
    let replay: RuntimeReplay | null = null;
    let liveTick = simulation.view.tick;
    let liveHash = "";
    setMomentReplay(null);
    setReplayState({
      phase: "running",
      currentTick: 0,
      targetTick: liveTick,
      progressPercent: 0,
      message: "Replaying the command log in an isolated simulation engine…",
      hash: { status: "verifying", expected: liveHash },
    });
    try {
      const canonical = await simulation.getCanonicalHash({ signal: abort.signal });
      if (!canonical) throw new Error("The simulation is not ready to verify.");
      liveTick = canonical.tick;
      liveHash = canonical.hash;
      setReplayState((current) => ({
        ...current,
        targetTick: liveTick,
        hash: { status: "verifying", expected: liveHash },
      }));
      const recordedExperiment = setExperimentBranchResult(
        experimentRef.current,
        activeBranchRef.current,
        liveTick,
        liveHash,
      );
      commitExperiment(recordedExperiment);
      replay = createBranchReplay(recordedExperiment, activeBranchRef.current);
      const result = await replayInIsolation(replay, {
        signal: abort.signal,
        onProgress: (progress) =>
          setReplayState((current) => ({
            ...current,
            currentTick: progress.currentTick,
            targetTick: progress.targetTick,
            progressPercent: Math.round(progress.fraction * 100),
          })),
      });
      setReplayState({
        phase: result.cancelled ? "cancelled" : "complete",
        currentTick: result.frame.tick,
        targetTick: replay.finalTick ?? liveTick,
        progressPercent: result.cancelled
          ? Math.round((result.frame.tick / Math.max(1, liveTick)) * 100)
          : 100,
        message: result.cancelled
          ? "Replay cancelled. The active view was never changed."
          : result.hashMatches === false
            ? "Replay completed with a different hash. The active view was never changed."
            : "Replay reproduced the recorded authoritative result without changing the active view.",
        hash: {
          status:
            result.hashMatches === null
              ? "unverified"
              : result.hashMatches
                ? "match"
                : "mismatch",
          ...(result.expectedHash ? { expected: result.expectedHash } : {}),
          actual: result.actualHash,
        },
      });
    } catch (error) {
      setReplayState((current) => ({
        ...current,
        phase: abort.signal.aborted ? "cancelled" : "error",
        targetTick: replay?.finalTick ?? liveTick,
        message: abort.signal.aborted
          ? "Replay cancelled. The active view was never changed."
          : `${errorMessage(error, "Replay failed.")} The active view was never changed.`,
        hash: { status: "unverified", expected: liveHash },
      }));
    } finally {
      if (replayAbortRef.current === abort) replayAbortRef.current = null;
      releaseOperation(operation);
    }
  }, [acquireOperation, commitExperiment, releaseOperation, replayInIsolation, simulation]);

  const replayTimelineEvent = useCallback(
    async (
      event: TimelineEventView,
      liveBoundary?: Pick<WorldView, "tick" | "hash">,
    ): Promise<boolean> => {
      const liveTick = liveBoundary?.tick ?? simulation.view.tick;
      const currentExperiment = experimentRef.current;
      const activeBranch = currentExperiment.branches.find(
        (branch) => branch.id === activeBranchRef.current,
      );
      const branchHorizon = Math.max(liveTick, activeBranch?.targetTick ?? 0);
      const window = timelineReplayWindow(event.tick, branchHorizon);
      const windowDescription = `moment tick ${window.momentTick}; window ${window.preludeStartTick}-${window.aftermathEndTick} (prelude ${window.preludeStartTick}-${window.momentTick}, action ${window.momentTick}-${window.actionEndTick}, aftermath ${window.actionEndTick}-${window.aftermathEndTick})`;

      setSection("replay");
      setDrawerOpen(true);
      if (window.aftermathEndTick > MAX_INTERACTIVE_REPLAY_TICK) {
        setReplayState({
          phase: "error",
          currentTick: liveTick,
          targetTick: window.aftermathEndTick,
          progressPercent: 0,
          message: `The replay for ${windowDescription} exceeds the interactive replay limit of ${MAX_INTERACTIVE_REPLAY_TICK.toLocaleString()} ticks. The active view was never changed.`,
          hash: { status: "unverified" },
        });
        return false;
      }
      const operation = acquireOperation("replay");
      if (!operation) return false;
      const abort = new AbortController();
      replayAbortRef.current = abort;
      setMomentReplay(null);
      setReplayState({
        phase: "running",
        currentTick: 0,
        targetTick: window.aftermathEndTick,
        progressPercent: 0,
        message: `Reconstructing "${event.title}" in an isolated simulation engine: ${windowDescription}…`,
        hash: { status: "verifying" },
      });
      try {
        const canonical = await simulation.getCanonicalHash({ signal: abort.signal });
        if (!canonical) throw new Error("The simulation is not ready to verify.");
        if (canonical.tick !== liveTick) {
          throw new Error("The paused replay boundary changed before it was verified.");
        }
        const liveHash = canonical.hash;
        const branchReplay = createBranchReplay(currentExperiment, activeBranchRef.current);
        const boundedReplay = replayAtTick(branchReplay, window.aftermathEndTick);
        const expectedHash =
          window.aftermathEndTick === liveTick
            ? liveHash
            : window.aftermathEndTick === activeBranch?.targetTick
              ? activeBranch.expectedHash
              : null;
        const replay = expectedHash
          ? { ...boundedReplay, finalHash: expectedHash }
          : boundedReplay;
        setReplayState((current) => ({
          ...current,
          hash: {
            status: expectedHash ? "verifying" : "unverified",
            ...(expectedHash ? { expected: expectedHash } : {}),
          },
        }));
        const result = await replayInIsolation(replay, {
          signal: abort.signal,
          captureTicks: [
            window.preludeStartTick,
            window.momentTick,
            window.actionEndTick,
            window.aftermathEndTick,
          ],
          onProgress: (progress) =>
            setReplayState((current) => ({
              ...current,
              currentTick: progress.currentTick,
              targetTick: progress.targetTick,
              progressPercent: Math.round(progress.fraction * 100),
            })),
        });
        const presentation =
          result.cancelled || result.hashMatches === false
            ? null
            : createMomentReplayPresentation(event, window, result.capturedFrames ?? []);
        if (!result.cancelled && result.hashMatches !== false && !presentation) {
          throw new Error(
            "The isolated replay did not return its requested observation frames.",
          );
        }
        setMomentReplay(presentation);
        setReplayState({
          phase: result.cancelled ? "cancelled" : "complete",
          currentTick: result.frame.tick,
          targetTick: window.aftermathEndTick,
          progressPercent: result.cancelled
            ? Math.round((result.frame.tick / Math.max(1, window.aftermathEndTick)) * 100)
            : 100,
          message: result.cancelled
            ? `Moment replay cancelled for "${event.title}" (${windowDescription}). The active view was never changed.`
            : result.hashMatches === false
              ? `Moment replay completed with a different hash for "${event.title}" (${windowDescription}). The active view was never changed.`
              : `Moment replay completed for "${event.title}" (${windowDescription}) without changing the active view.`,
          hash: {
            status:
              result.hashMatches === null
                ? "unverified"
                : result.hashMatches
                  ? "match"
                  : "mismatch",
            ...(result.expectedHash ? { expected: result.expectedHash } : {}),
            actual: result.actualHash,
          },
        });
        return presentation !== null;
      } catch (error) {
        setMomentReplay(null);
        setReplayState((current) => ({
          ...current,
          phase: abort.signal.aborted ? "cancelled" : "error",
          targetTick: window.aftermathEndTick,
          message: abort.signal.aborted
            ? `Moment replay cancelled for "${event.title}" (${windowDescription}). The active view was never changed.`
            : `${errorMessage(error, "Moment replay failed.")} ${windowDescription}. The active view was never changed.`,
          hash: {
            status: "unverified",
            ...(current.hash.expected ? { expected: current.hash.expected } : {}),
          },
        }));
        return false;
      } finally {
        if (replayAbortRef.current === abort) replayAbortRef.current = null;
        releaseOperation(operation);
      }
    },
    [acquireOperation, releaseOperation, replayInIsolation, simulation],
  );

  const selectMomentReplayBeat = useCallback((index: number) => {
    setMomentReplay((current) => {
      if (!current || current.beats.length === 0) return current;
      const activeBeatIndex = Math.max(
        0,
        Math.min(current.beats.length - 1, Math.floor(index)),
      );
      return activeBeatIndex === current.activeBeatIndex
        ? current
        : { ...current, activeBeatIndex };
    });
  }, []);

  const exitMomentReplay = useCallback(() => setMomentReplay(null), []);

  const calculateComparison = useCallback(async () => {
    const operation = acquireOperation("comparison");
    if (!operation) return;
    const engine = createSimulationEngine();
    try {
      const current = experimentRef.current;
      const active = current.branches.find(
        (branch) => branch.id === activeBranchRef.current,
      );
      const intervention = await simulation.getOutcome();
      if (!active || active.parentBranchId === null || !intervention) {
        setComparison(EMPTY_COMPARISON);
        return;
      }
      setComparison({
        ...EMPTY_COMPARISON,
        status: "loading",
        baselineTick: simulation.view.tick,
        branchTick: simulation.view.tick,
        message: "Replaying the baseline to the same tick…",
      });
      const baselineReplay = replayAtTick(
        createBranchReplay(current, current.rootBranchId),
        intervention.tick,
      );
      await engine.replay(baselineReplay);
      const baseline = await engine.getOutcome();
      const compared = await simulation.compareOutcome(baseline);
      if (!compared) throw new Error("The intervention outcome is unavailable.");
      setComparison({
        status: "ready",
        baselineLabel:
          current.branches.find((branch) => branch.id === current.rootBranchId)?.label ??
          "Baseline",
        branchLabel: active.label,
        baselineTick: compared.tick,
        branchTick: compared.tick,
        metrics: comparisonMetrics(
          compared.baseline,
          compared.intervention,
          compared.delta,
        ),
        message: "Both runs use the same scenario, seed, behavior version, and tick.",
      });
    } catch (error) {
      setComparison({
        ...EMPTY_COMPARISON,
        status: "error",
        baselineTick: simulation.view.tick,
        branchTick: simulation.view.tick,
        message: errorMessage(error, "Comparison failed."),
      });
    } finally {
      engine.dispose();
      releaseOperation(operation);
    }
  }, [acquireOperation, releaseOperation, simulation]);

  const focusCausalRef = useCallback(
    async (ref: CausalEvidenceRef, appendBreadcrumb = true) => {
      try {
        onFocusEvidence?.(ref);
      } catch {
        // Shared focus observers cannot block factual evidence projection.
      }
      const requestId = ++causalRequestSequenceRef.current;
      causalAbortRef.current?.abort();
      const abort = new AbortController();
      causalAbortRef.current = abort;
      setCausalStatus("loading");
      try {
        const projection = await simulation.getCausalEvidence(
          ref,
          { maxDepth: 3, maxNodes: 120 },
          { signal: abort.signal },
        );
        if (
          !projection ||
          abort.signal.aborted ||
          requestId !== causalRequestSequenceRef.current
        ) {
          return;
        }
        const detail = causalDetailFromProjection(projection);
        if (!detail) throw new Error("That evidence is no longer retained.");
        const focusNode = projection.nodes.find((node) => refKey(node.ref) === refKey(ref));
        setCausalDetail(detail);
        setCausalStatus("ready");
        setCausalMessage(
          projection.truncated
            ? "Showing the closest retained evidence; the graph reached its display limit."
            : projection.missingRefs.length > 0
              ? `${projection.missingRefs.length} older reference${projection.missingRefs.length === 1 ? " is" : "s are"} no longer retained.`
              : undefined,
        );
        if (focusNode) {
          const link = linkFromNode(focusNode);
          setCausalBreadcrumbs((current) =>
            appendBreadcrumb ? [...current, link].slice(-8) : [link],
          );
        }
        setSection("explain");
        setDrawerOpen(true);
      } catch (error) {
        if (abort.signal.aborted || requestId !== causalRequestSequenceRef.current) {
          return;
        }
        setCausalStatus("error");
        setCausalMessage(errorMessage(error, "Evidence could not be projected."));
      } finally {
        if (causalAbortRef.current === abort) causalAbortRef.current = null;
      }
    },
    [onFocusEvidence, simulation],
  );

  const inspectTimelineEvent = useCallback(
    (event: TimelineEventView) => {
      const ref: CausalEvidenceRef =
        event.id >= 1_000_000
          ? { kind: "history", id: event.id - 1_000_000 }
          : { kind: "event", id: event.id };
      void focusCausalRef(ref, false);
    },
    [focusCausalRef],
  );

  const selectIntervention = useCallback(
    (interventionId: string) => {
      const commandId = Number(interventionId.split("-").at(-1));
      const branch = experimentRef.current.branches.find(
        (candidate) => candidate.id === activeBranchRef.current,
      );
      const entry = branch?.commandLog.find(
        (candidate) => candidate.command.commandId === commandId,
      );
      const eventId =
        entry?.outcome.status === "PENDING" ? undefined : entry?.outcome.eventIds[0];
      if (eventId !== undefined) {
        void focusCausalRef({ kind: "event", id: eventId }, false);
      }
    },
    [focusCausalRef],
  );

  const submitComposer = useCallback(async () => {
    setComposerValidation(null);
    if (composerTool === "inspect-creature") {
      const id = Number(composerCreature);
      if (!Number.isInteger(id)) {
        setComposerValidation("Choose a creature to inspect.");
        return;
      }
      onSelectCreature(id);
      setComposerStatus({ phase: "success", message: "Subject opened in the inspector." });
      return;
    }
    if (composerTool === "inspect-object") {
      if (!composerObject) {
        setComposerValidation("Choose a resource or structure to inspect.");
        return;
      }
      void focusCausalRef(parseRef(composerObject), false);
      return;
    }
    const x = Number(targetX);
    const y = Number(targetY);
    if (!Number.isInteger(x) || !Number.isInteger(y)) {
      setComposerValidation("Tile coordinates must be whole numbers.");
      return;
    }
    const tile = simulation.view.tiles.find(
      (candidate) => candidate.x === x && candidate.y === y,
    );
    if (!tile) {
      setComposerValidation(
        `Choose a tile from 0–${simulation.view.width - 1} by 0–${simulation.view.height - 1}.`,
      );
      return;
    }
    const amount = Number(quantity);
    if (
      (composerTool === "add-food" || composerTool === "remove-food") &&
      (!Number.isInteger(amount) || amount < 1 || amount > 999)
    ) {
      setComposerValidation("Quantity must be a whole number from 1 to 999.");
      return;
    }
    await applyWorldIntervention(
      composerTool as Exclude<InterventionTool, "inspect">,
      tile,
      amount,
    );
  }, [
    applyWorldIntervention,
    composerCreature,
    composerObject,
    composerTool,
    focusCausalRef,
    onSelectCreature,
    quantity,
    simulation.view.height,
    simulation.view.tiles,
    simulation.view.width,
    targetX,
    targetY,
  ]);

  const handleSectionChange = useCallback(
    (next: ExperimentSection) => {
      setSection(next);
      if (next === "compare") void calculateComparison();
    },
    [calculateComparison],
  );

  const navigateIntervention = useCallback(
    (interventionId: string, action: InterventionNavigationAction) => {
      const activeBranch = experimentRef.current.branches.find(
        (branch) => branch.id === activeBranchRef.current,
      );
      const belongsToActiveRecord = activeBranch?.commandLog.some(
        (entry) =>
          `${activeBranch.id}-command-${entry.command.commandId.toString()}` ===
          interventionId,
      );
      if (!belongsToActiveRecord) return;

      switch (action.target.kind) {
        case "raw-evidence":
        case "linked-evidence":
          void focusCausalRef(action.target.ref, false);
          break;
        case "location":
          void focusCausalRef({ kind: "tile", id: action.target.tileIndex }, false);
          break;
        case "responding-creature":
          onSelectCreature(action.target.creatureId);
          setDrawerOpen(false);
          break;
        case "linked-moment":
          void focusCausalRef({ kind: "event", id: action.target.eventId }, false);
          break;
        case "comparison":
          if (action.target.branchId === activeBranchRef.current) {
            handleSectionChange("compare");
          }
          break;
        case "branch-replay":
          if (action.target.branchId === activeBranchRef.current) {
            handleSectionChange("replay");
          }
          break;
      }
    },
    [focusCausalRef, handleSectionChange, onSelectCreature],
  );

  const openDrawer = useCallback(
    (next: ExperimentSection = "record") => {
      setSection(next);
      setDrawerOpen(true);
      if (next === "compare") void calculateComparison();
    },
    [calculateComparison],
  );

  const scenarioOptions = useMemo(
    () =>
      SCENARIO_PRESETS.map((preset) => ({
        id: preset.id,
        label: preset.name,
        description: preset.prompt,
        role: preset.role,
        startingFacts: preset.startingFacts,
        observableTensions: preset.observableTensions,
      })),
    [],
  );
  const seedPresets = useMemo<SeedPreset[]>(() => {
    const selected = scenarioPresetById(setupScenarioId);
    const seeds: SeedPreset[] = [
      ...(selected
        ? [
            {
              seed: selected.seed,
              label: "Canonical story",
              description: `The fixed browser-review seed for ${selected.name}.`,
            },
          ]
        : []),
      { seed: 1, label: "Calibration 1", description: "First locked calibration seed." },
      { seed: 1_001, label: "Holdout 1", description: "First locked holdout seed." },
    ];
    return seeds.filter(
      (preset, index) =>
        seeds.findIndex((candidate) => candidate.seed === preset.seed) === index,
    );
  }, [setupScenarioId]);
  const creatures = useMemo<PickerOption[]>(
    () =>
      simulation.view.creatures.map((creature) => ({
        id: creature.id.toString(),
        label: creature.name,
        description: `${creature.role} · ${creature.goal.toLowerCase()}`,
      })),
    [simulation.view.creatures],
  );
  const objects = useMemo<PickerOption[]>(
    () => [
      ...simulation.view.resources.map((resource) => ({
        id: `resource:${resource.id}`,
        label: `${resource.kind.toLowerCase()} at ${Math.floor(resource.x)}, ${Math.floor(resource.y)}`,
        description: `${resource.stock} of ${resource.capacity} units`,
      })),
      ...simulation.view.structures.map((structure) => ({
        id: `structure:${structure.id}`,
        label: `${structure.kind.toLowerCase()} at ${Math.floor(structure.x)}, ${Math.floor(structure.y)}`,
        description: `${Math.round(structure.progress)}% complete`,
      })),
    ],
    [simulation.view.resources, simulation.view.structures],
  );
  const activeCommandLog = useMemo(
    () =>
      experiment.branches.find((candidate) => candidate.id === activeBranchId)
        ?.commandLog ?? EMPTY_COMMAND_LOG,
    [activeBranchId, experiment.branches],
  );
  const persistInterventionResponseTrace = useCallback(
    (commandId: number, trace: InterventionResponseTrace) => {
      const current = experimentRef.current;
      const branchId = activeBranchRef.current;
      const branch = current.branches.find((candidate) => candidate.id === branchId);
      const entry = branch?.commandLog.find(
        (candidate) => candidate.command.commandId === commandId,
      );
      if (!entry || entry.responseTrace === trace) return;
      const next = setExperimentInterventionResponseTrace(
        current,
        branchId,
        commandId,
        trace,
      );
      commitExperiment(next);
      setDirty(true);
    },
    [commitExperiment],
  );
  const interventionResponseTraces = useInterventionResponseTraces({
    streamKey: `${simulation.scenario.scenarioId}@${simulation.scenario.scenarioVersion.toString()}/${simulation.scenario.mapGenerationVersion.toString()}:${simulation.seed.toString()}:${activeBranchId}`,
    commandLog: activeCommandLog,
    view: simulation.view,
    onMaterialChange: persistInterventionResponseTrace,
  });
  const interventionRecords = useMemo<InterventionRecord[]>(() => {
    const branch = experiment.branches.find((candidate) => candidate.id === activeBranchId);
    if (!branch) return [];
    const creatureNames = new Map(
      simulation.view.creatures.map((creature) => [creature.id, creature.name]),
    );
    return branch.commandLog.map((entry) => {
      const x = entry.command.tileIndex % simulation.view.width;
      const y = Math.floor(entry.command.tileIndex / simulation.view.width);
      const status =
        entry.outcome.status === "PENDING"
          ? "pending"
          : entry.outcome.status === "APPLIED"
            ? "applied"
            : "rejected";
      const responseTrace = interventionResponseTraces.get(entry.command.commandId);
      const selectable =
        entry.outcome.status !== "PENDING" && entry.outcome.eventIds.length > 0;
      const navigationActions = interventionNavigationActions({
        entry,
        trace: responseTrace,
        branchId: branch.id,
        parentBranchId: branch.parentBranchId,
        creatureNames,
        events: simulation.view.events,
      });
      return {
        id: `${branch.id}-command-${entry.command.commandId}`,
        tick: entry.command.applyAtTick,
        label:
          entry.command.type === "ADD_FOOD"
            ? "Food added"
            : entry.command.type === "REMOVE_FOOD"
              ? "Food removed"
              : entry.command.blocked
                ? "Passage closed"
                : "Passage opened",
        target: `tile ${x}, ${y}`,
        status,
        selectable,
        ...(entry.command.type === "TOGGLE_OBSTACLE"
          ? {}
          : { quantity: entry.command.amount }),
        ...(entry.outcome.status === "PENDING"
          ? { detail: "Waiting for its authoritative tick." }
          : entry.outcome.status === "APPLIED"
            ? { detail: `Applied at tick ${entry.outcome.appliedAtTick}.` }
            : { reason: entry.outcome.reason ?? "The simulation rejected this change." }),
        ...(responseTrace
          ? { response: interventionResponseRecord(responseTrace, creatureNames) }
          : {}),
        navigationActions,
      };
    });
  }, [
    activeBranchId,
    experiment.branches,
    interventionResponseTraces,
    simulation.view.creatures,
    simulation.view.events,
    simulation.view.width,
  ]);
  const bookmarks = useMemo<ExperimentBookmark[]>(
    () =>
      experiment.bookmarks.map((bookmark) => ({
        id: bookmark.id,
        tick: bookmark.tick,
        label: bookmark.label,
      })),
    [experiment.bookmarks],
  );

  const selectedPreset = scenarioPresetById(scenarioPresetId) ?? {
    ...DEFAULT_SCENARIO_PRESET,
    name: "Custom seed",
  };

  const setupProps: ExperimentSetupDialogProps = {
    open: setupOpen,
    scenarios: scenarioOptions,
    scenarioId: setupScenarioId,
    seed: setupSeed,
    seedPresets,
    busy: simulation.busy || workspaceBusy,
    ...(setupError ? { error: setupError } : {}),
    onScenarioChange: (id) => {
      setSetupScenarioId(id);
    },
    onSeedChange: setSetupSeed,
    onStart: () => void startExperiment(),
    onDismiss: dismissSetup,
  };
  const newExperimentDialog: NewExperimentDialogProps = {
    open: pendingReplacement !== null,
    hasUnsavedChanges: dirty,
    busy: simulation.busy || workspaceBusy,
    ...(pendingReplacement?.kind === "load"
      ? {
          title: "Load the saved experiment?",
          description:
            "Loading will replace this unsaved field study with the last browser save.",
          confirmLabel: "Load saved experiment",
        }
      : pendingReplacement?.kind === "import"
        ? {
            title: "Import this experiment?",
            description:
              "Importing will replace this unsaved field study after the file is validated and reconstructed.",
            confirmLabel: "Import experiment",
          }
        : {}),
    onCancel: () => setPendingReplacement(null),
    onConfirm: confirmReplacement,
  };
  const actions: ExperimentActionProps = {
    canLoad,
    disabled: workspaceBusy,
    status: actionStatus,
    onSave: () => void saveWorkspace(),
    onLoad: requestLoadWorkspace,
    onImport: requestImportExperiment,
    onExport: exportExperiment,
    onRequestNew: requestNewExperiment,
  };
  const bookmarkProps: BookmarkPanelProps = {
    bookmarks,
    draftLabel: bookmarkDraft,
    currentTick: simulation.view.tick,
    disabled: workspaceBusy,
    onDraftLabelChange: setBookmarkDraft,
    onAdd: addBookmark,
    onVisit: (id) => void visitBookmark(id),
  };
  const interventionPreview = useMemo<InterventionComposerProps["preview"]>(() => {
    if (
      composerTool !== "add-food" &&
      composerTool !== "remove-food" &&
      composerTool !== "obstacle"
    ) {
      return undefined;
    }
    const x = Number(targetX);
    const y = Number(targetY);
    if (!Number.isInteger(x) || !Number.isInteger(y)) return undefined;
    const tile = simulation.view.tiles.find(
      (candidate) => candidate.x === x && candidate.y === y,
    );
    if (!tile) return undefined;
    const amount = Number(quantity);
    if (
      composerTool !== "obstacle" &&
      (!Number.isInteger(amount) || amount < 1 || amount > 999)
    ) {
      return undefined;
    }
    return {
      target: `tile ${x}, ${y}`,
      applyTick: simulation.view.tick,
      category: composerTool === "obstacle" ? "Navigation" : "Resource availability",
      mechanicalChange:
        composerTool === "add-food"
          ? `Add ${amount.toLocaleString()} food units at the target tile.`
          : composerTool === "remove-food"
            ? `Remove up to ${amount.toLocaleString()} food units from the target tile.`
            : tile.blocked
              ? "Open the target passage."
              : "Close the target passage if the authoritative occupancy check permits it.",
    };
  }, [
    composerTool,
    quantity,
    simulation.view.tick,
    simulation.view.tiles,
    targetX,
    targetY,
  ]);
  const composer: InterventionComposerProps = {
    tools: INTERVENTION_TOOLS,
    toolId: composerTool,
    creatures,
    creatureId: composerCreature,
    objects,
    objectId: composerObject,
    targetX,
    targetY,
    quantity,
    status: composerStatus,
    ...(interventionPreview ? { preview: interventionPreview } : {}),
    ...(composerValidation ? { validationMessage: composerValidation } : {}),
    disabled: workspaceBusy || simulation.busy || !simulation.initialized,
    onToolChange: setComposerTool,
    onCreatureChange: setComposerCreature,
    onObjectChange: setComposerObject,
    onTargetXChange: setTargetX,
    onTargetYChange: setTargetY,
    onQuantityChange: setQuantity,
    onSubmit: () => void submitComposer(),
  };
  const causal: CausalExplorerProps = {
    status: causalStatus,
    breadcrumbs: causalBreadcrumbs,
    ...(causalDetail ? { detail: causalDetail } : {}),
    ...(causalMessage ? { message: causalMessage } : {}),
    onNavigate: (id) => void focusCausalRef(parseRef(id)),
    onRetry: () => {
      const last = causalBreadcrumbs.at(-1);
      if (last) void focusCausalRef(parseRef(last.id), false);
    },
  };
  const visibleGroupCount = simulation.view.groups.length;
  const completedStoreCount = simulation.view.structures.filter(
    (structure) => structure.progress >= 99,
  ).length;
  const foodSiteCount = simulation.view.resources.filter(
    (resource) => resource.kind === "FOOD",
  ).length;

  return {
    props: {
      open: drawerOpen,
      section,
      experimentName: `${selectedPreset.name} experiment`,
      scenarioLabel: selectedPreset.name,
      scenarioQuestion: selectedPreset.prompt,
      startingFacts: selectedPreset.startingFacts,
      developedSummary: `${simulation.view.population} creatures are alive; ${visibleGroupCount} ${visibleGroupCount === 1 ? "group" : "groups"} and ${completedStoreCount} completed ${completedStoreCount === 1 ? "store is" : "stores are"} visible; wild food totals ${simulation.view.foodStock} units at ${foodSiteCount} ${foodSiteCount === 1 ? "site" : "sites"}.`,
      seed: simulation.seed,
      currentTick: simulation.view.tick,
      dirty,
      actions,
      interventions: interventionRecords,
      bookmarks: bookmarkProps,
      composer,
      replay: {
        replay: replayState,
        disabled: workspaceBusy,
        onReplay: () => void runReplay(),
        onCancel: () => replayAbortRef.current?.abort(),
      },
      comparison,
      causal,
      onSectionChange: handleSectionChange,
      onClose: () => setDrawerOpen(false),
      onSelectIntervention: selectIntervention,
      onNavigateIntervention: navigateIntervention,
      setup: setupProps,
      newExperimentDialog,
    },
    busy: workspaceBusy,
    momentReplay,
    openDrawer,
    applyWorldIntervention: (tool, tile) => applyWorldIntervention(tool, tile),
    inspectTimelineEvent,
    replayTimelineEvent,
    selectMomentReplayBeat,
    exitMomentReplay,
    recover: recoverExperiment,
  };
}
