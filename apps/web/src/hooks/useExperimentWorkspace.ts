import {
  addExperimentBookmark,
  appendExperimentIntervention,
  compareExperimentOutcomes,
  createBranchReplay,
  createCausalEvidenceProjection,
  createExperiment,
  createExperimentOutcome,
  createPendingIntervention,
  createScenarioReference,
  deserializeExperiment,
  deserializeSimulationSave,
  forkExperimentBranch,
  hashSimulationState,
  serializeExperiment,
  setExperimentBranchResult,
  settleExperimentIntervention,
  type CausalEvidenceNodeV1,
  type CausalEvidenceProjectionV1,
  type CausalEvidenceRef,
  type DomainEvent,
  type ExperimentOutcomeMetrics,
  type ExperimentV1,
  type ScheduledPlayerCommand,
  type SettledInterventionOutcomeV1,
  type SimulationReplayV1,
  type SimulationState,
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
  InterventionRecord,
  InterventionToolOption,
  NewExperimentDialogProps,
  OperationStatus,
  PickerOption,
  ReplayState,
  SeedPreset,
} from "../components/ExperimentWorkspace";
import type { InterventionTool, TileView, TimelineEventView } from "../model";
import { createSimulationEngine, type SimulationFrame } from "../runtime";
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

const ONBOARDING_KEY = "tiny-civilisation/orientation-complete/v1";
const WORKSPACE_KIND = "tiny-civilisation/workspace";
const WORKSPACE_SCHEMA_VERSION = 1;
const INTERVENTION_BRANCH_BASE_ID = "intervention";
const MAX_INTERACTIVE_REPLAY_TICK = 100_000;
const MAX_IMPORTED_REPLAY_COMMANDS = 10_000;

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

interface PersistedWorkspaceV1 {
  kind: typeof WORKSPACE_KIND;
  schemaVersion: typeof WORKSPACE_SCHEMA_VERSION;
  scenarioPresetId: string;
  activeBranchId: string;
  experiment: ExperimentV1;
  simulationSave: string;
}

interface UseExperimentWorkspaceOptions {
  simulation: SimulationController;
  onSelectCreature: (id: number) => void;
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
  openDrawer: (section?: ExperimentSection) => void;
  applyWorldIntervention: (
    tool: Exclude<InterventionTool, "inspect">,
    tile: TileView,
  ) => Promise<void>;
  inspectTimelineEvent: (event: TimelineEventView) => void;
  recover: () => Promise<boolean>;
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
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

function eventTypeForCommand(command: ScheduledPlayerCommand): DomainEvent["type"] {
  switch (command.type) {
    case "ADD_FOOD":
      return "PLAYER_ADDED_FOOD";
    case "REMOVE_FOOD":
      return "PLAYER_REMOVED_FOOD";
    case "TOGGLE_OBSTACLE":
      return "PLAYER_TOGGLED_OBSTACLE";
  }
}

function outcomeForCommand(
  state: SimulationState,
  command: ScheduledPlayerCommand,
  usedEventIds: ReadonlySet<number>,
): SettledInterventionOutcomeV1 | null {
  if (state.tick <= command.applyAtTick) return null;
  const event = state.domainEvents.find(
    (candidate) =>
      !usedEventIds.has(candidate.id) &&
      candidate.tick === command.applyAtTick &&
      candidate.type === eventTypeForCommand(command) &&
      candidate.locationTileIndex === command.tileIndex,
  );
  if (!event) return null;
  const rejected =
    command.type === "TOGGLE_OBSTACLE" && /could not|obstructed/i.test(event.summary);
  return {
    status: rejected ? "REJECTED" : "APPLIED",
    appliedAtTick: command.applyAtTick,
    resolvedTileIndex: command.tileIndex,
    quantity: event.quantity,
    blocked: command.blocked,
    eventIds: [event.id],
    reason: rejected ? event.summary : null,
  };
}

function reconcilePendingInterventions(
  experiment: ExperimentV1,
  branchId: string,
  state: SimulationState,
): ExperimentV1 {
  const branch = experiment.branches.find((candidate) => candidate.id === branchId);
  if (!branch) return experiment;
  let next = experiment;
  const usedEventIds = new Set(
    branch.commandLog.flatMap((entry) =>
      entry.outcome.status === "PENDING" ? [] : [...entry.outcome.eventIds],
    ),
  );
  for (const entry of branch.commandLog) {
    if (entry.outcome.status !== "PENDING") continue;
    const outcome = outcomeForCommand(state, entry.command, usedEventIds);
    if (!outcome) continue;
    next = settleExperimentIntervention(next, branchId, entry.command.commandId, outcome);
    for (const eventId of outcome.eventIds) usedEventIds.add(eventId);
  }
  return next;
}

function stateFromFrame(frame: SimulationFrame): SimulationState {
  return frame.state as unknown as SimulationState;
}

function replayAtTick(replay: SimulationReplayV1, finalTick: number): SimulationReplayV1 {
  return {
    kind: replay.kind,
    schemaVersion: replay.schemaVersion,
    behaviorVersion: replay.behaviorVersion,
    stateSchemaVersion: replay.stateSchemaVersion,
    seed: replay.seed,
    commands: replay.commands.filter((command) => command.applyAtTick < finalTick),
    finalTick,
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

function serializeWorkspace(workspace: PersistedWorkspaceV1): string {
  return JSON.stringify(workspace);
}

function parseWorkspace(serialized: string): PersistedWorkspaceV1 {
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
  if (record.kind !== WORKSPACE_KIND || record.schemaVersion !== WORKSPACE_SCHEMA_VERSION) {
    throw new Error("That browser save uses an incompatible workspace version.");
  }
  if (
    typeof record.scenarioPresetId !== "string" ||
    typeof record.activeBranchId !== "string" ||
    typeof record.simulationSave !== "string"
  ) {
    throw new Error("Saved workspace metadata is incomplete.");
  }
  const experiment = deserializeExperiment(JSON.stringify(record.experiment));
  const state = deserializeSimulationSave(record.simulationSave);
  const branch = experiment.branches.find(
    (candidate) => candidate.id === record.activeBranchId,
  );
  if (!branch) throw new Error("The saved active branch does not exist.");
  if (experiment.scenario.seed !== state.seed) {
    throw new Error("The saved experiment seed does not match its simulation state.");
  }
  if (
    branch.targetTick !== state.tick ||
    branch.expectedHash === null ||
    branch.expectedHash !== hashSimulationState(state)
  ) {
    throw new Error("The saved experiment metadata does not match its simulation state.");
  }
  return {
    kind: WORKSPACE_KIND,
    schemaVersion: WORKSPACE_SCHEMA_VERSION,
    scenarioPresetId: record.scenarioPresetId,
    activeBranchId: record.activeBranchId,
    experiment,
    simulationSave: record.simulationSave,
  };
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

function preservedSignature(branchId: string, state: SimulationState): string {
  return `${branchId}:${state.tick}:${hashSimulationState(state)}`;
}

export function useExperimentWorkspace({
  simulation,
  onSelectCreature,
}: UseExperimentWorkspaceOptions): ExperimentWorkspaceController {
  const storageRef = useRef(createExperimentStorage());
  const experimentRef = useRef<ExperimentV1>(
    createExperiment(createScenarioReference(DEFAULT_SCENARIO_PRESET.seed)),
  );
  const activeBranchRef = useRef(experimentRef.current.rootBranchId);
  const replayAbortRef = useRef<AbortController | null>(null);
  const preservedSignatureRef = useRef<string | null>(null);
  const operationLockRef = useRef<WorkspaceOperationToken | null>(null);
  const operationSequenceRef = useRef(0);
  const [experiment, setExperimentState] = useState(experimentRef.current);
  const [activeBranchId, setActiveBranchState] = useState(activeBranchRef.current);
  const [scenarioPresetId, setScenarioPresetId] = useState(DEFAULT_SCENARIO_PRESET.id);
  const [setupOpen, setSetupOpen] = useState(() => {
    try {
      return localStorage.getItem(ONBOARDING_KEY) !== "complete";
    } catch {
      return true;
    }
  });
  const [setupScenarioId, setSetupScenarioId] = useState(DEFAULT_SCENARIO_PRESET.id);
  const [setupSeed, setSetupSeed] = useState(DEFAULT_SCENARIO_PRESET.seed.toString());
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

  useEffect(() => {
    void storageRef.current
      .load()
      .then((serialized) => setCanLoad(serialized !== null))
      .catch(() => setCanLoad(false));
  }, []);

  useEffect(() => {
    const state = simulation.getState();
    if (!state) return;
    const signature = preservedSignature(activeBranchRef.current, state);
    if (preservedSignatureRef.current === null) {
      preservedSignatureRef.current = signature;
    } else if (signature !== preservedSignatureRef.current) {
      setDirty(true);
    }
    const reconciled = reconcilePendingInterventions(
      experimentRef.current,
      activeBranchRef.current,
      state,
    );
    if (reconciled !== experimentRef.current) {
      commitExperiment(reconciled);
      setDirty(true);
    }
  }, [commitExperiment, simulation, simulation.view.tick]);

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
      setSetupError(null);
      const nextView = await simulation.restart(nextSeed);
      if (!nextView) throw new Error("The new experiment could not start.");
      const next = createExperiment(createScenarioReference(nextSeed));
      commitExperiment(next);
      commitActiveBranch(next.rootBranchId);
      setScenarioPresetId(setupScenarioId);
      setDirty(false);
      setComparison(EMPTY_COMPARISON);
      setReplayState(EMPTY_REPLAY);
      setCausalStatus("empty");
      setCausalDetail(undefined);
      setCausalBreadcrumbs([]);
      const state = simulation.getState();
      if (state) {
        preservedSignatureRef.current = preservedSignature(next.rootBranchId, state);
      }
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
    const nextView = await simulation.restart(simulation.seed);
    if (!nextView) return false;
    const next = createExperiment(createScenarioReference(simulation.seed));
    commitExperiment(next);
    commitActiveBranch(next.rootBranchId);
    const state = simulation.getState();
    if (state) {
      preservedSignatureRef.current = preservedSignature(next.rootBranchId, state);
    }
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

  const branchWithStateResult = useCallback((state: SimulationState): ExperimentV1 => {
    return setExperimentBranchResult(
      experimentRef.current,
      activeBranchRef.current,
      state.tick,
      hashSimulationState(state),
    );
  }, []);

  const ensureInterventionBranch = useCallback((): {
    nextExperiment: ExperimentV1;
    branchId: string;
  } => {
    const current = experimentRef.current;
    const active = current.branches.find((branch) => branch.id === activeBranchRef.current);
    if (!active) throw new Error("The active experiment branch does not exist.");
    const rewoundPastResult =
      active.targetTick !== null && simulation.view.tick < active.targetTick;
    if (active.parentBranchId !== null && !rewoundPastResult) {
      return { nextExperiment: current, branchId: activeBranchRef.current };
    }
    const nextWithResult =
      active.parentBranchId === null
        ? setExperimentBranchResult(
            current,
            active.id,
            simulation.view.tick,
            simulation.view.hash,
          )
        : current;
    const branchId = uniqueBranchId(nextWithResult);
    const next = forkExperimentBranch(
      nextWithResult,
      active.id,
      branchId,
      "Intervention",
      simulation.view.tick,
    );
    return { nextExperiment: next, branchId };
  }, [simulation.view.hash, simulation.view.tick]);

  const logIntervention = useCallback(
    (command: ScheduledPlayerCommand, base: ExperimentV1, branchId: string) => {
      let next = appendExperimentIntervention(
        base,
        branchId,
        createPendingIntervention(command),
      );
      const state = simulation.getState();
      if (state) next = reconcilePendingInterventions(next, branchId, state);
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
        if (!simulation.view.hash) return;
        const { nextExperiment, branchId } = ensureInterventionBranch();
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
        logIntervention(
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

  const addBookmark = useCallback(() => {
    const operation = acquireOperation("bookmark");
    if (!operation) return;
    try {
      const label = bookmarkDraft.trim() || `Moment at tick ${simulation.view.tick}`;
      let next = experimentRef.current;
      let branchId = activeBranchRef.current;
      let openedInterventionBranch = false;
      const active = next.branches.find((branch) => branch.id === branchId);
      if (active?.parentBranchId === null && next.branches.length === 1) {
        next = setExperimentBranchResult(
          next,
          branchId,
          simulation.view.tick,
          simulation.view.hash,
        );
      }
      next = addExperimentBookmark(next, {
        id: uniqueBookmarkId(next),
        branchId,
        tick: simulation.view.tick,
        label,
      });
      if (active?.parentBranchId === null && next.branches.length === 1) {
        const interventionBranchId = uniqueBranchId(next);
        next = forkExperimentBranch(
          next,
          branchId,
          interventionBranchId,
          "Intervention",
          simulation.view.tick,
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
    simulation.view.hash,
    simulation.view.tick,
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
          hash: { status: "unverified", actual: result.frame.hash },
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
      const savedState = deserializeSimulationSave(simulationSave);
      const next = branchWithStateResult(savedState);
      const workspace: PersistedWorkspaceV1 = {
        kind: WORKSPACE_KIND,
        schemaVersion: WORKSPACE_SCHEMA_VERSION,
        scenarioPresetId,
        activeBranchId: activeBranchRef.current,
        experiment: next,
        simulationSave,
      };
      await storageRef.current.save(serializeWorkspace(workspace));
      commitExperiment(next);
      preservedSignatureRef.current = preservedSignature(
        activeBranchRef.current,
        savedState,
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
    branchWithStateResult,
    commitExperiment,
    releaseOperation,
    scenarioPresetId,
    simulation,
  ]);

  const loadWorkspace = useCallback(async () => {
    const operation = acquireOperation("load");
    if (!operation) return;
    setActionStatus({ phase: "working", message: "Restoring the saved experiment…" });
    try {
      const serialized = await storageRef.current.load();
      if (!serialized) throw new Error("No browser save is available.");
      const workspace = parseWorkspace(serialized);
      await simulation.load(workspace.simulationSave);
      const restoredState = deserializeSimulationSave(workspace.simulationSave);
      commitExperiment(workspace.experiment);
      commitActiveBranch(workspace.activeBranchId);
      preservedSignatureRef.current = preservedSignature(
        workspace.activeBranchId,
        restoredState,
      );
      setScenarioPresetId(workspace.scenarioPresetId);
      setDirty(false);
      setSetupOpen(false);
      setActionStatus({
        phase: "success",
        message: `Restored tick ${simulation.getState()?.tick ?? 0} without changing its hash.`,
      });
    } catch (error) {
      setActionStatus({
        phase: "error",
        message: `${errorMessage(error, "Load failed.")} The active run was preserved.`,
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

  const exportExperiment = useCallback(() => {
    const operation = acquireOperation("export");
    if (!operation) return;
    try {
      const state = simulation.getState();
      if (!state) throw new Error("The simulation is not ready to export.");
      const next = branchWithStateResult(state);
      commitExperiment(next);
      const preset = scenarioPresetById(scenarioPresetId);
      const safeName = (preset?.name ?? "tiny-civilisation")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
      downloadExperimentFile(
        serializeExperiment(next),
        `${safeName || "experiment"}-seed-${next.scenario.seed}.tinyciv.json`,
      );
      preservedSignatureRef.current = preservedSignature(activeBranchRef.current, state);
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
    branchWithStateResult,
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
        preservedSignatureRef.current = preservedSignature(
          branchId,
          stateFromFrame(result.frame),
        );
        setScenarioPresetId(
          SCENARIO_PRESETS.find((preset) => preset.seed === imported.scenario.seed)?.id ??
            DEFAULT_SCENARIO_PRESET.id,
        );
        setDirty(false);
        setSetupOpen(false);
        setActionStatus({
          phase: "success",
          message: `Imported seed ${imported.scenario.seed} at tick ${result.frame.tick}.`,
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
    if (!simulation.view.hash) return;
    const operation = acquireOperation("replay");
    if (!operation) return;
    let previousTick = simulation.view.tick;
    let previousSave: string | null = null;
    let replay: SimulationReplayV1 | null = null;
    const abort = new AbortController();
    replayAbortRef.current = abort;
    setReplayState({
      phase: "running",
      currentTick: 0,
      targetTick: simulation.view.tick,
      progressPercent: 0,
      message: "Replaying the command log in the simulation Worker…",
      hash: { status: "verifying" },
    });
    try {
      previousSave = await simulation.save();
      const previousState = deserializeSimulationSave(previousSave);
      previousTick = previousState.tick;
      const next = branchWithStateResult(previousState);
      commitExperiment(next);
      replay = createBranchReplay(next, activeBranchRef.current);
      setReplayState((current) => ({
        ...current,
        targetTick: replay?.finalTick ?? previousTick,
        hash: {
          status: "verifying",
          ...(replay?.finalHash ? { expected: replay.finalHash } : {}),
        },
      }));
      const result = await simulation.replay(replay, {
        signal: abort.signal,
        onProgress: (progress) =>
          setReplayState((current) => ({
            ...current,
            currentTick: progress.currentTick,
            targetTick: progress.targetTick,
            progressPercent: Math.round(progress.fraction * 100),
          })),
      });
      const shouldRestore = result.cancelled || result.hashMatches === false;
      if (shouldRestore) await simulation.load(previousSave);
      setReplayState({
        phase: result.cancelled ? "cancelled" : "complete",
        currentTick: shouldRestore ? previousTick : result.frame.tick,
        targetTick: replay.finalTick ?? result.frame.tick,
        progressPercent: result.cancelled ? 0 : 100,
        message: result.cancelled
          ? "Replay cancelled. The active run was restored."
          : result.hashMatches === false
            ? "Replay completed with a different hash. The active run was restored."
            : "Replay reproduced the recorded authoritative result.",
        hash: {
          status:
            result.hashMatches === null
              ? "unverified"
              : result.hashMatches
                ? "match"
                : "mismatch",
          ...(result.expectedHash ? { expected: result.expectedHash } : {}),
          actual: result.frame.hash,
        },
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
        currentTick: previousTick,
        targetTick: replay?.finalTick ?? previousTick,
        progressPercent: 0,
        message: `${errorMessage(error, "Replay failed.")} ${preserved ? "The active run was preserved." : "The active run could not be restored; start a new experiment to recover."}`,
        hash: { status: "unverified" },
      });
    } finally {
      if (replayAbortRef.current === abort) replayAbortRef.current = null;
      releaseOperation(operation);
    }
  }, [
    acquireOperation,
    branchWithStateResult,
    commitExperiment,
    releaseOperation,
    simulation,
  ]);

  const calculateComparison = useCallback(async () => {
    const current = experimentRef.current;
    const active = current.branches.find((branch) => branch.id === activeBranchRef.current);
    const branchState = simulation.getState();
    if (!active || active.parentBranchId === null || !branchState) {
      setComparison(EMPTY_COMPARISON);
      return;
    }
    const operation = acquireOperation("comparison");
    if (!operation) return;
    setComparison({
      ...EMPTY_COMPARISON,
      status: "loading",
      baselineTick: simulation.view.tick,
      branchTick: simulation.view.tick,
      message: "Replaying the baseline to the same tick…",
    });
    const engine = createSimulationEngine();
    try {
      const baselineReplay = replayAtTick(
        createBranchReplay(current, current.rootBranchId),
        branchState.tick,
      );
      const baselineResult = await engine.replay(baselineReplay);
      const baseline = createExperimentOutcome(stateFromFrame(baselineResult.frame));
      const intervention = createExperimentOutcome(branchState);
      const compared = compareExperimentOutcomes(baseline, intervention);
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
    (ref: CausalEvidenceRef, appendBreadcrumb = true) => {
      const state = simulation.getState();
      if (!state) return;
      setCausalStatus("loading");
      try {
        const projection = createCausalEvidenceProjection(state, ref, {
          maxDepth: 3,
          maxNodes: 120,
        });
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
        setCausalStatus("error");
        setCausalMessage(errorMessage(error, "Evidence could not be projected."));
      }
    },
    [simulation],
  );

  const inspectTimelineEvent = useCallback(
    (event: TimelineEventView) => {
      const ref: CausalEvidenceRef =
        event.id >= 1_000_000
          ? { kind: "history", id: event.id - 1_000_000 }
          : { kind: "event", id: event.id };
      focusCausalRef(ref, false);
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
      if (eventId !== undefined) focusCausalRef({ kind: "event", id: eventId }, false);
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
      focusCausalRef(parseRef(composerObject), false);
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
      })),
    [],
  );
  const seedPresets = useMemo<SeedPreset[]>(
    () =>
      SCENARIO_PRESETS.map((preset) => ({
        seed: preset.seed,
        label: preset.name,
        description: preset.prompt,
      })),
    [],
  );
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
  const interventionRecords = useMemo<InterventionRecord[]>(() => {
    const branch = experiment.branches.find((candidate) => candidate.id === activeBranchId);
    if (!branch) return [];
    return branch.commandLog.map((entry) => {
      const x = entry.command.tileIndex % simulation.view.width;
      const y = Math.floor(entry.command.tileIndex / simulation.view.width);
      const status =
        entry.outcome.status === "PENDING"
          ? "pending"
          : entry.outcome.status === "APPLIED"
            ? "applied"
            : "rejected";
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
        ...(entry.command.type === "TOGGLE_OBSTACLE"
          ? {}
          : { quantity: entry.command.amount }),
        ...(entry.outcome.status === "PENDING"
          ? { detail: "Waiting for its authoritative tick." }
          : entry.outcome.status === "APPLIED"
            ? { detail: `Applied at tick ${entry.outcome.appliedAtTick}.` }
            : { reason: entry.outcome.reason ?? "The simulation rejected this change." }),
      };
    });
  }, [activeBranchId, experiment.branches, simulation.view.width]);
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
      const preset = scenarioPresetById(id);
      if (preset) setSetupSeed(preset.seed.toString());
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
    onNavigate: (id) => focusCausalRef(parseRef(id)),
    onRetry: () => {
      const last = causalBreadcrumbs.at(-1);
      if (last) focusCausalRef(parseRef(last.id), false);
    },
  };

  return {
    props: {
      open: drawerOpen,
      section,
      experimentName: `${selectedPreset.name} experiment`,
      scenarioLabel: selectedPreset.name,
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
      setup: setupProps,
      newExperimentDialog,
    },
    busy: workspaceBusy,
    openDrawer,
    applyWorldIntervention: (tool, tile) => applyWorldIntervention(tool, tile),
    inspectTimelineEvent,
    recover: recoverExperiment,
  };
}
