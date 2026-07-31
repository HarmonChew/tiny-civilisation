import {
  CircleDot,
  Clock3,
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
import { useCallback, useEffect, useMemo, useState } from "react";
import { TimelinePanel } from "./components/Chronicle";
import { InspectorPanel } from "./components/InspectorPanel";
import { WorldStage } from "./components/WorldStage";
import { IconButton } from "./components/ui";
import { useSimulationController } from "./hooks/useSimulationController";
import type {
  EntityId,
  InterventionTool,
  OverlaySettings,
  TimelineCategory,
  TimelineEventView,
  WorldAction,
} from "./model";

const DEFAULT_SEED = 4182;

type MobileRegion = "chronicle" | "dish" | "subject";

export default function App() {
  const {
    view,
    fatalError,
    playing,
    setPlaying,
    speed,
    setSpeed,
    feedback,
    advance,
    restart,
    applyIntervention,
  } = useSimulationController(DEFAULT_SEED);
  const [selectedId, setSelectedId] = useState<EntityId | null>(
    view.creatures[0]?.id ?? null,
  );
  const [followedId, setFollowedId] = useState<EntityId | null>(null);
  const [tool, setTool] = useState<InterventionTool>("inspect");
  const [overlays, setOverlays] = useState<OverlaySettings>({
    resources: true,
    intentions: false,
    groups: true,
  });
  const [filter, setFilter] = useState<TimelineCategory>("all");
  const [selectedEvidenceEventId, setSelectedEvidenceEventId] = useState<number | null>(
    null,
  );
  const [mobileRegion, setMobileRegion] = useState<MobileRegion>("dish");

  const restartWorkspace = useCallback(() => {
    const nextView = restart();
    if (!nextView) return;
    setSelectedId(nextView.creatures[0]?.id ?? null);
    setFollowedId(null);
    setSelectedEvidenceEventId(null);
    setTool("inspect");
  }, [restart]);

  const selectCreature = useCallback((id: EntityId | null) => {
    setSelectedId(id);
    setSelectedEvidenceEventId(null);
    setFollowedId((current) => (current === id ? current : null));
    if (id !== null) setMobileRegion("subject");
  }, []);

  const inspectTimelineEvent = useCallback((event: TimelineEventView) => {
    const id = event.decisionActorId ?? event.actorIds[0] ?? event.targetIds[0] ?? null;
    setSelectedId(id);
    setFollowedId(null);
    setSelectedEvidenceEventId(event.id);
    setMobileRegion("subject");
  }, []);

  const applyWorldAction = useCallback(
    (action: WorldAction) => {
      if (tool === "inspect") return;
      applyIntervention(tool, action.tile);
    },
    [applyIntervention, tool],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        target instanceof HTMLButtonElement
      ) {
        return;
      }
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
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [advance, selectedId]);

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
      <header className="topbar">
        <div className="brand-lockup">
          <span className="brand-mark" aria-hidden="true">
            <Sprout size={21} strokeWidth={1.8} />
          </span>
          <div>
            <span>Tiny Civilisation</span>
            <strong>Field station 01</strong>
          </div>
        </div>
        <div className="simulation-readout" aria-label="Simulation status">
          <span
            className={`pulse-mark ${playing ? "is-running" : ""}`}
            aria-hidden="true"
          />
          <div>
            <span>{playing ? `Running at ${speed}×` : "Observation paused"}</span>
            <strong>{view.timeLabel}</strong>
          </div>
        </div>
        <div className="transport" aria-label="Simulation controls">
          <IconButton
            label={playing ? "Pause simulation (Space)" : "Play simulation (Space)"}
            icon={playing ? Pause : Play}
            pressed={playing}
            disabled={Boolean(fatalError)}
            onClick={() => setPlaying((current) => !current)}
          />
          <IconButton
            label="Advance one tick (period)"
            icon={StepForward}
            disabled={Boolean(fatalError)}
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
                onClick={() => setSpeed(value)}
              >
                {value}×
              </button>
            ))}
          </div>
          <IconButton
            label={`Restart seed ${DEFAULT_SEED}`}
            icon={RotateCcw}
            onClick={restartWorkspace}
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
          <button type="button" onClick={restartWorkspace}>
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
          <TimelinePanel
            view={view}
            filter={filter}
            onFilter={setFilter}
            onSelect={(id) => selectCreature(id)}
            onSelectEvent={inspectTimelineEvent}
          />
        </aside>

        <div
          id="living-dish"
          className={`workspace-panel workspace-panel--dish ${
            mobileRegion === "dish" ? "is-mobile-active" : ""
          }`}
        >
          <WorldStage
            seed={DEFAULT_SEED}
            view={view}
            selectedId={selectedId}
            followedId={followedId}
            tool={tool}
            overlays={overlays}
            feedback={feedback}
            onTool={setTool}
            onOverlay={(overlay) =>
              setOverlays((current) => ({ ...current, [overlay]: !current[overlay] }))
            }
            onSelect={selectCreature}
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
            onSelect={(id) => selectCreature(id)}
          />
        </aside>
      </main>
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
