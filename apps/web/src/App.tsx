import type { CausalEvidenceRef } from "@tiny-civ/sim-core";
import {
  CircleDot,
  Clock3,
  FlaskConical,
  Focus,
  Footprints,
  HeartPulse,
  Pause,
  Play,
  RotateCcw,
  Shield,
  Sprout,
  StepForward,
  Warehouse,
} from "lucide-react";
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { TimelinePanel } from "./components/Chronicle";
import { InspectorPanel } from "./components/InspectorPanel";
import { MomentQueue } from "./components/MomentQueue";
import { WorldAttentionAnnouncer, WorldNavigator } from "./components/WorldNavigator";
import { WorldStage } from "./components/WorldStage";
import type { ReplayCameraTarget } from "./components/pixi/camera";
import { IconButton } from "./components/ui";
import {
  creatureIdFromRef,
  creatureRef,
  eventIdFromRef,
  eventRef,
  useWorldFocus,
  type WorldFocusSource,
  type WorldFocusState,
  type WorldRef,
} from "./focus";
import { useExperimentWorkspace } from "./hooks/useExperimentWorkspace";
import { useMomentQueue } from "./hooks/useMomentQueue";
import { usePersistentEventPacingPreference } from "./hooks/usePersistentEventPacingPreference";
import { useSimulationController } from "./hooks/useSimulationController";
import type {
  EntityId,
  InterventionTool,
  OverlaySettings,
  TimelineCategory,
  TimelineEventView,
  WorldAction,
  WorldView,
} from "./model";

const DEFAULT_SEED = 4182;

const ExperimentWorkspace = lazy(async () => ({
  default: (await import("./components/ExperimentWorkspace")).ExperimentWorkspace,
}));
const MomentReplayControls = lazy(async () => ({
  default: (await import("./components/MomentReplayControls")).MomentReplayControls,
}));

type MobileRegion = "chronicle" | "dish" | "subject";

interface MomentReplaySession {
  status: "launching" | "presenting";
  resumePlaying: boolean;
  followedId: EntityId | null;
  focusState: WorldFocusState;
  mobileRegion: MobileRegion;
  cameraTarget: ReplayCameraTarget;
  returnFocus: HTMLElement | null;
}

export function replayCameraTargetForEvent(event: TimelineEventView): ReplayCameraTarget {
  return {
    eventId: event.id,
    subjectId: event.decisionActorId ?? event.actorIds[0] ?? event.targetIds[0] ?? null,
    actorIds: [...event.actorIds],
    targetIds: [...event.targetIds],
    locationTileIndex: event.locationTileIndex ?? null,
  };
}

interface FocusRestorationActions {
  readonly reset: () => void;
  readonly select: (ref: WorldRef | null, source: WorldFocusSource) => void;
  readonly inspectEvidence: (
    ref: WorldRef,
    subject: WorldRef | null,
    source: WorldFocusSource,
  ) => void;
  readonly setHovered: (ref: WorldRef | null, source: WorldFocusSource) => void;
  readonly setKeyboardFocused: (ref: WorldRef | null, source: WorldFocusSource) => void;
}

export function restoreWorldFocusState(
  state: WorldFocusState,
  actions: FocusRestorationActions,
): void {
  actions.reset();
  if (state.source === null) return;
  if (state.evidenceFocus !== null) {
    actions.inspectEvidence(state.evidenceFocus, state.selected, state.source);
  } else {
    actions.select(state.selected, state.source);
  }
  if (state.hovered !== null) actions.setHovered(state.hovered, state.source);
  if (state.keyboardFocused !== null) {
    actions.setKeyboardFocused(state.keyboardFocused, state.source);
  }
}

export interface CausalWorldFocus {
  readonly evidenceFocus: WorldRef;
  readonly selected: WorldRef | null;
}

export function worldFocusForCausalEvidence(
  ref: CausalEvidenceRef,
  view: Pick<
    WorldView,
    "creatures" | "events" | "groups" | "resources" | "structures" | "tiles"
  >,
  currentSelected: WorldRef | null,
): CausalWorldFocus | null {
  switch (ref.kind) {
    case "event": {
      const event = view.events.find((candidate) => candidate.id === ref.id);
      const subjectId =
        event?.decisionActorId ?? event?.actorIds[0] ?? event?.targetIds[0] ?? null;
      return {
        evidenceFocus: eventRef(ref.id),
        selected:
          subjectId !== null && view.creatures.some((creature) => creature.id === subjectId)
            ? creatureRef(subjectId)
            : currentSelected,
      };
    }
    case "memory": {
      const owner = view.creatures.find((creature) =>
        creature.memories.some((memory) => memory.id === ref.id),
      );
      return {
        evidenceFocus: { kind: "memory", id: ref.id },
        selected: owner ? creatureRef(owner.id) : currentSelected,
      };
    }
    case "creature": {
      const evidenceFocus = creatureRef(ref.id);
      return {
        evidenceFocus,
        selected: view.creatures.some((creature) => creature.id === ref.id)
          ? evidenceFocus
          : currentSelected,
      };
    }
    case "resource": {
      const evidenceFocus: WorldRef = { kind: "resource", id: ref.id };
      return {
        evidenceFocus,
        selected: view.resources.some((resource) => resource.id === ref.id)
          ? evidenceFocus
          : currentSelected,
      };
    }
    case "structure": {
      const evidenceFocus: WorldRef = { kind: "structure", id: ref.id };
      return {
        evidenceFocus,
        selected: view.structures.some((structure) => structure.id === ref.id)
          ? evidenceFocus
          : currentSelected,
      };
    }
    case "group": {
      const evidenceFocus: WorldRef = { kind: "group", id: ref.id };
      return {
        evidenceFocus,
        selected: view.groups.some((group) => group.id === ref.id)
          ? evidenceFocus
          : currentSelected,
      };
    }
    case "tile": {
      const evidenceFocus: WorldRef = { kind: "tile", tileIndex: ref.id };
      return {
        evidenceFocus,
        selected: view.tiles.some((tile) => tile.index === ref.id)
          ? evidenceFocus
          : currentSelected,
      };
    }
    case "decision":
    case "relationship":
    case "history":
    case "desire":
    case "plan":
      return null;
  }
}

export default function App() {
  const simulation = useSimulationController(DEFAULT_SEED);
  const {
    view,
    seed,
    initialized,
    busy,
    fatalError,
    playing,
    setPlaying,
    speed,
    setSpeed,
    feedback,
    advance,
  } = simulation;
  const {
    state: focusState,
    setHovered,
    setKeyboardFocused,
    select: selectFocus,
    inspectEvidence,
    clearTransient,
    reset: resetFocus,
  } = useWorldFocus();
  const selectedId = creatureIdFromRef(focusState.selected);
  const selectedEvidenceEventId = eventIdFromRef(focusState.evidenceFocus);
  const focusedCreatureId =
    creatureIdFromRef(focusState.hovered) ?? creatureIdFromRef(focusState.keyboardFocused);
  const focusedWorldRef = focusState.hovered ?? focusState.keyboardFocused;
  const causalFocusContextRef = useRef({ view, selected: focusState.selected });
  causalFocusContextRef.current = { view, selected: focusState.selected };
  const [followedId, setFollowedId] = useState<EntityId | null>(null);
  const [tool, setTool] = useState<InterventionTool>("inspect");
  const [overlays, setOverlays] = useState<OverlaySettings>({
    resources: true,
    intentions: false,
    groups: true,
  });
  const [filter, setFilter] = useState<TimelineCategory>("all");
  const [mobileRegion, setMobileRegion] = useState<MobileRegion>("dish");
  const [pacingPreference, setPacingPreference] = usePersistentEventPacingPreference();
  const automaticPacingRef = useRef<{
    momentId: number;
    action: "SLOW_TO_1X" | "PAUSE";
    restoreSpeed: 1 | 2 | 4;
    resumePlaying: boolean;
  } | null>(null);

  const selectCreature = useCallback(
    (id: EntityId | null, source: WorldFocusSource = "DISH") => {
      selectFocus(id === null ? null : creatureRef(id), source);
      setFollowedId((current) => (current === id ? current : null));
      if (id !== null) setMobileRegion("subject");
    },
    [selectFocus],
  );

  const selectWorldSubject = useCallback(
    (ref: WorldRef, source: WorldFocusSource = "DISH") => {
      selectFocus(ref, source);
      setFollowedId(null);
    },
    [selectFocus],
  );

  const focusCausalEvidence = useCallback(
    (ref: CausalEvidenceRef) => {
      const context = causalFocusContextRef.current;
      const focus = worldFocusForCausalEvidence(ref, context.view, context.selected);
      if (!focus) return;
      inspectEvidence(focus.evidenceFocus, focus.selected, "EVIDENCE");
      const spatialCreatureId = creatureIdFromRef(focus.selected);
      setFollowedId((current) =>
        spatialCreatureId !== null && current === spatialCreatureId ? current : null,
      );
      if (focus.selected !== null) setMobileRegion("subject");
    },
    [inspectEvidence],
  );

  const experimentWorkspace = useExperimentWorkspace({
    simulation,
    onSelectCreature: (id) => selectCreature(id, "EVIDENCE"),
    onFocusEvidence: focusCausalEvidence,
  });
  const workspaceBusy = experimentWorkspace.busy;
  const momentReplaySessionRef = useRef<MomentReplaySession | null>(null);
  const activeReplayBeat =
    experimentWorkspace.momentReplay?.beats[
      experimentWorkspace.momentReplay.activeBeatIndex
    ] ?? null;
  const replayActive = activeReplayBeat !== null;
  const dishView = activeReplayBeat?.view ?? view;
  const replayCamera = replayActive
    ? (momentReplaySessionRef.current?.cameraTarget ?? null)
    : null;

  const restoreMomentReplaySession = useCallback(() => {
    const session = momentReplaySessionRef.current;
    if (!session) return;
    momentReplaySessionRef.current = null;
    restoreWorldFocusState(session.focusState, {
      reset: resetFocus,
      select: selectFocus,
      inspectEvidence,
      setHovered,
      setKeyboardFocused,
    });
    setMobileRegion(session.mobileRegion);
    setPlaying(session.resumePlaying);
    setFollowedId(session.followedId);
    window.requestAnimationFrame(() => {
      const returnTarget = session.returnFocus?.isConnected
        ? session.returnFocus
        : document.getElementById("living-dish");
      returnTarget?.focus();
    });
  }, [
    inspectEvidence,
    resetFocus,
    selectFocus,
    setHovered,
    setKeyboardFocused,
    setPlaying,
  ]);

  const exitMomentReplay = useCallback(() => {
    experimentWorkspace.exitMomentReplay();
    restoreMomentReplaySession();
  }, [experimentWorkspace, restoreMomentReplaySession]);

  useEffect(() => {
    const session = momentReplaySessionRef.current;
    if (session?.status !== "presenting" || replayActive || workspaceBusy) {
      return;
    }
    restoreMomentReplaySession();
  }, [replayActive, restoreMomentReplaySession, workspaceBusy]);

  const recoverWorkspace = useCallback(async () => {
    const recovered = await experimentWorkspace.recover();
    if (!recovered) return;
    momentReplaySessionRef.current = null;
    experimentWorkspace.exitMomentReplay();
    resetFocus();
    setFollowedId(null);
    setTool("inspect");
  }, [experimentWorkspace, resetFocus]);

  const focusTimelineEvent = useCallback(
    (event: TimelineEventView, source: "CHRONICLE" | "MOMENT") => {
      const id = event.decisionActorId ?? event.actorIds[0] ?? event.targetIds[0] ?? null;
      inspectEvidence(eventRef(event.id), id === null ? null : creatureRef(id), source);
      setFollowedId(null);
      setMobileRegion("subject");
    },
    [inspectEvidence],
  );

  const inspectTimelineEvent = useCallback(
    (event: TimelineEventView) => {
      focusTimelineEvent(event, "CHRONICLE");
      experimentWorkspace.inspectTimelineEvent(event);
    },
    [experimentWorkspace, focusTimelineEvent],
  );

  const moments = useMomentQueue({
    events: view.events,
    currentTick: view.tick,
    speed,
    preference: pacingPreference,
    playing,
    streamKey: `${seed.toString()}:${simulation.timelineRevision.toString()}`,
    onInspect: inspectTimelineEvent,
    onPacingRequest: (request) => {
      if (automaticPacingRef.current !== null) return;
      automaticPacingRef.current = {
        momentId: request.momentId,
        action: request.action,
        restoreSpeed: request.restoreSpeed,
        resumePlaying: playing,
      };
      if (request.action === "SLOW_TO_1X") setSpeed(1);
      else setPlaying(false);
    },
    onPacingRelease: (release) => {
      const pacing = automaticPacingRef.current;
      if (!pacing || pacing.momentId !== release.momentId) return;
      automaticPacingRef.current = null;
      setSpeed(pacing.restoreSpeed);
      setPlaying(pacing.resumePlaying);
    },
  });

  const replayMoment = useCallback(
    (momentId: number) => {
      const moment = moments.moments.find((candidate) => candidate.id === momentId);
      if (!moment || workspaceBusy || momentReplaySessionRef.current !== null) return;
      const replaySession: MomentReplaySession = {
        status: "launching",
        resumePlaying: playing,
        followedId,
        focusState: { ...focusState },
        mobileRegion,
        cameraTarget: replayCameraTargetForEvent(moment.latestEvent),
        returnFocus:
          document.activeElement instanceof HTMLElement ? document.activeElement : null,
      };
      momentReplaySessionRef.current = replaySession;
      void (async () => {
        let presenting = false;
        try {
          const pausedView = await simulation.pause();
          if (!pausedView) return;
          setPlaying(false);
          clearTransient();
          focusTimelineEvent(moment.latestEvent, "MOMENT");
          const replayed = await experimentWorkspace.replayTimelineEvent(
            moment.latestEvent,
            pausedView,
          );
          if (!replayed || momentReplaySessionRef.current !== replaySession) return;
          const pacing = automaticPacingRef.current;
          if (pacing?.momentId === momentId) {
            replaySession.resumePlaying = pacing.resumePlaying;
          }
          moments.continueMoment(momentId);
          // Releasing automatic pacing restores the pre-moment state. Keep the
          // live engine paused until the isolated presentation is dismissed.
          setPlaying(false);
          replaySession.status = "presenting";
          presenting = true;
        } catch {
          if (momentReplaySessionRef.current === replaySession) {
            restoreMomentReplaySession();
          }
        } finally {
          if (!presenting && momentReplaySessionRef.current === replaySession) {
            restoreMomentReplaySession();
          }
        }
      })();
    },
    [
      clearTransient,
      experimentWorkspace,
      focusTimelineEvent,
      focusState,
      followedId,
      mobileRegion,
      moments,
      playing,
      restoreMomentReplaySession,
      setPlaying,
      simulation,
      workspaceBusy,
    ],
  );

  const applyWorldAction = useCallback(
    (action: WorldAction) => {
      if (tool === "inspect" || busy || workspaceBusy || replayActive) return;
      void experimentWorkspace.applyWorldIntervention(tool, action.tile);
    },
    [busy, experimentWorkspace, replayActive, tool, workspaceBusy],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (replayActive && event.key === "Escape") {
        event.preventDefault();
        exitMomentReplay();
        return;
      }
      const target = event.target;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        target instanceof HTMLButtonElement
      ) {
        return;
      }
      if (!initialized || busy || workspaceBusy || fatalError) return;
      if (replayActive) return;
      if (event.key === " ") {
        event.preventDefault();
        setPlaying((current) => !current);
      } else if (event.key === ".") {
        event.preventDefault();
        setPlaying(false);
        advance(1);
      } else if (event.key === "1" || event.key === "2" || event.key === "4") {
        setSpeed(Number(event.key) as 1 | 2 | 4);
      } else if (event.key.toLowerCase() === "f" && selectedId !== null) {
        setFollowedId((current) => (current === selectedId ? null : selectedId));
      } else if (event.key === "Escape") {
        setTool("inspect");
        clearTransient();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    advance,
    busy,
    fatalError,
    clearTransient,
    exitMomentReplay,
    initialized,
    replayActive,
    selectedId,
    setPlaying,
    setSpeed,
    workspaceBusy,
  ]);

  const selectedCreature = useMemo(
    () => view.creatures.find((creature) => creature.id === selectedId) ?? null,
    [selectedId, view.creatures],
  );
  const selectedEvidenceEvent = useMemo(
    () => view.events.find((event) => event.id === selectedEvidenceEventId) ?? null,
    [selectedEvidenceEventId, view.events],
  );

  return (
    <div className="app-shell">
      <a className="skip-link" href="#living-dish">
        Skip to living dish
      </a>
      <WorldAttentionAnnouncer view={view} />
      <header className="topbar">
        <div className="brand-lockup">
          <span className="brand-mark" aria-hidden="true">
            <Sprout size={21} strokeWidth={1.8} />
          </span>
          <div>
            <h1>Tiny Civilisation</h1>
            <strong>Field station 01</strong>
          </div>
        </div>
        <div className="simulation-readout" aria-label="Simulation status">
          <span
            className={`pulse-mark ${playing ? "is-running" : ""}`}
            aria-hidden="true"
          />
          <div>
            <span>
              {fatalError
                ? "Simulation unavailable"
                : busy
                  ? "Reconstructing experiment"
                  : replayActive
                    ? "Reviewing isolated moment"
                    : playing
                      ? `Running at ${speed}×`
                      : initialized
                        ? "Observation paused"
                        : "Preparing field station"}
            </span>
            <strong>{view.timeLabel}</strong>
          </div>
        </div>
        <div className="transport" aria-label="Simulation controls">
          <IconButton
            label={playing ? "Pause simulation (Space)" : "Play simulation (Space)"}
            icon={playing ? Pause : Play}
            pressed={playing}
            disabled={
              Boolean(fatalError) || busy || workspaceBusy || replayActive || !initialized
            }
            onClick={() => setPlaying((current) => !current)}
          />
          <IconButton
            label="Advance one tick (period)"
            icon={StepForward}
            disabled={
              Boolean(fatalError) || busy || workspaceBusy || replayActive || !initialized
            }
            onClick={() => {
              setPlaying(false);
              advance(1);
            }}
          />
          <div className="speed-control" aria-label="Simulation speed">
            {([1, 2, 4] as const).map((value) => (
              <button
                type="button"
                key={value}
                className={speed === value ? "is-active" : ""}
                aria-pressed={speed === value}
                disabled={
                  Boolean(fatalError) ||
                  busy ||
                  workspaceBusy ||
                  replayActive ||
                  !initialized
                }
                onClick={() => setSpeed(value)}
              >
                {value}×
              </button>
            ))}
          </div>
          <IconButton
            label="Open experiment notebook"
            icon={FlaskConical}
            pressed={experimentWorkspace.props.open}
            disabled={Boolean(fatalError) || !initialized}
            onClick={() => experimentWorkspace.openDrawer("record")}
          />
          <IconButton
            label="Start a new experiment"
            icon={RotateCcw}
            disabled={busy || workspaceBusy || replayActive || !initialized}
            onClick={experimentWorkspace.props.actions.onRequestNew}
          />
        </div>
      </header>

      <nav className="mobile-region-tabs" aria-label="Workspace regions">
        <button
          type="button"
          className={mobileRegion === "dish" ? "is-active" : ""}
          aria-pressed={mobileRegion === "dish"}
          onClick={() => setMobileRegion("dish")}
        >
          <CircleDot aria-hidden="true" size={17} />
          Dish
        </button>
        <button
          type="button"
          className={mobileRegion === "chronicle" ? "is-active" : ""}
          aria-pressed={mobileRegion === "chronicle"}
          onClick={() => setMobileRegion("chronicle")}
        >
          <Clock3 aria-hidden="true" size={17} />
          Chronicle
        </button>
        <button
          type="button"
          className={mobileRegion === "subject" ? "is-active" : ""}
          aria-pressed={mobileRegion === "subject"}
          onClick={() => setMobileRegion("subject")}
        >
          <Focus aria-hidden="true" size={17} />
          Subject
        </button>
      </nav>

      {fatalError ? (
        <div className="fatal-banner" role="alert">
          <HeartPulse aria-hidden="true" size={18} />
          <div>
            <strong>Simulation unavailable</strong>
            <span>{fatalError}</span>
          </div>
          <button type="button" onClick={() => void recoverWorkspace()}>
            Try restart
          </button>
        </div>
      ) : null}

      <main className="workspace">
        <aside
          className={`workspace-panel workspace-panel--chronicle ${
            mobileRegion === "chronicle" ? "is-mobile-active" : ""
          }`}
          aria-label="Civilisation chronicle"
        >
          <div className="chronicle-scroll">
            <WorldNavigator
              view={view}
              selectedRef={focusState.selected}
              focusedRef={focusedWorldRef}
              keyboardFocusedRef={focusState.keyboardFocused}
              onSelect={(ref) => selectWorldSubject(ref, "ROSTER")}
              onKeyboardFocus={(ref) => setKeyboardFocused(ref, "ROSTER")}
              onHover={(ref) => setHovered(ref, "ROSTER")}
            />
            <TimelinePanel
              view={view}
              filter={filter}
              selectedEventId={selectedEvidenceEventId}
              onFilter={setFilter}
              onSelect={(id) => selectCreature(id, "CHRONICLE")}
              onSelectEvent={inspectTimelineEvent}
              onFocusEvent={(event) =>
                setKeyboardFocused(event === null ? null : eventRef(event.id), "CHRONICLE")
              }
              onHoverEvent={(event) =>
                setHovered(event === null ? null : eventRef(event.id), "CHRONICLE")
              }
            />
          </div>
        </aside>

        <div
          id="living-dish"
          tabIndex={-1}
          className={`workspace-panel workspace-panel--dish ${
            mobileRegion === "dish" ? "is-mobile-active" : ""
          }`}
        >
          <div className="dish-moment-layer">
            {experimentWorkspace.momentReplay ? (
              <Suspense
                fallback={
                  <p className="moment-replay-loading" role="status">
                    Preparing replay controls…
                  </p>
                }
              >
                <MomentReplayControls
                  replay={experimentWorkspace.momentReplay}
                  onSelectBeat={experimentWorkspace.selectMomentReplayBeat}
                  onExit={exitMomentReplay}
                />
              </Suspense>
            ) : (
              <MomentQueue
                moments={moments.moments}
                activeMomentId={moments.activeMomentId}
                resolveParticipantName={(id) =>
                  view.creatures.find((creature) => creature.id === id)?.name
                }
                onSelectMoment={moments.selectMoment}
                onInspectMoment={moments.inspectMoment}
                onReplayMoment={replayMoment}
                onContinueMoment={moments.continueMoment}
                onDismissMoment={moments.dismissMoment}
                pacingPreference={pacingPreference}
                onPacingPreferenceChange={setPacingPreference}
              />
            )}
          </div>
          <WorldStage
            seed={seed}
            view={dishView}
            selectedId={replayActive ? (replayCamera?.subjectId ?? null) : selectedId}
            focusedId={replayActive ? null : focusedCreatureId}
            followedId={replayActive ? null : followedId}
            tool={tool}
            overlays={overlays}
            feedback={
              replayActive
                ? `Showing ${activeReplayBeat.label.toLowerCase()} at tick ${activeReplayBeat.tick}; the live world is paused and unchanged.`
                : feedback
            }
            mutationDisabled={busy || workspaceBusy || replayActive}
            replayCamera={replayCamera}
            onTool={setTool}
            onOverlay={(overlay) =>
              setOverlays((current) => ({ ...current, [overlay]: !current[overlay] }))
            }
            onSelect={(id) => selectCreature(id, "DISH")}
            onHover={(id) => setHovered(id === null ? null : creatureRef(id), "DISH")}
            onWorldAction={applyWorldAction}
          />
        </div>

        <aside
          className={`workspace-panel workspace-panel--inspector ${
            mobileRegion === "subject" ? "is-mobile-active" : ""
          }`}
          aria-label="Selected creature inspector"
        >
          <InspectorPanel
            creature={selectedCreature}
            view={view}
            evidenceEvent={selectedEvidenceEvent}
            followed={selectedId !== null && followedId === selectedId}
            onFollow={() =>
              selectedId !== null &&
              setFollowedId((current) => (current === selectedId ? null : selectedId))
            }
            onSelect={(id) => selectCreature(id, "INSPECTOR")}
          />
        </aside>
      </main>
      <Suspense fallback={null}>
        <ExperimentWorkspace {...experimentWorkspace.props} />
      </Suspense>
      <footer className="status-rail">
        <span>
          <Footprints aria-hidden="true" size={14} />
          {view.population} autonomous creatures
        </span>
        <span>
          <Warehouse aria-hidden="true" size={14} />
          {view.structures.length} built anchors
        </span>
        <span>
          <Shield aria-hidden="true" size={14} />
          renderer reads snapshots only
        </span>
        <span className="status-rail__hash">
          hash {view.hash ? view.hash.slice(0, 12) : "pending"}
        </span>
      </footer>
    </div>
  );
}
