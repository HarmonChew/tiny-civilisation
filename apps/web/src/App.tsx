import {
  Apple,
  BookOpen,
  BrickWall,
  CircleDot,
  Clock3,
  Eraser,
  Eye,
  Focus,
  Footprints,
  HeartPulse,
  Layers3,
  LocateFixed,
  MousePointer2,
  PackageOpen,
  Pause,
  Play,
  RotateCcw,
  Route,
  Shield,
  Sparkles,
  Sprout,
  StepForward,
  UsersRound,
  Warehouse,
  type LucideIcon,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PixiWorld } from "./components/PixiWorld";
import type {
  CandidateView,
  CreatureView,
  EntityId,
  InterventionTool,
  MemoryView,
  OverlaySettings,
  RelationshipView,
  TimelineCategory,
  TimelineEventView,
  WorldAction,
  WorldView,
} from "./model";
import {
  advanceSimulationTicks,
  createSimulationState,
  makeWorldView,
  queueIntervention,
  ticksPerSecond,
} from "./sim-adapter";

const DEFAULT_SEED = 4182;

const EMPTY_VIEW: WorldView = {
  tick: 0,
  timeLabel: "T+0s",
  hash: "",
  width: 48,
  height: 32,
  tiles: [],
  creatures: [],
  resources: [],
  structures: [],
  groups: [],
  events: [],
  population: 0,
  foodStock: 0,
};

type MobileRegion = "chronicle" | "dish" | "subject";

interface IconButtonProps {
  label: string;
  icon: LucideIcon;
  pressed?: boolean;
  disabled?: boolean;
  className?: string;
  onClick: () => void;
  children?: React.ReactNode;
}

function IconButton({
  label,
  icon: Icon,
  pressed,
  disabled,
  className = "",
  onClick,
  children,
}: IconButtonProps) {
  return (
    <button
      type="button"
      className={`icon-button ${pressed ? "is-pressed" : ""} ${className}`}
      aria-label={label}
      aria-pressed={pressed}
      title={label}
      disabled={disabled}
      onClick={onClick}
    >
      <Icon aria-hidden="true" size={16} strokeWidth={1.8} />
      {children ? <span>{children}</span> : null}
    </button>
  );
}

const humanize = (value: string): string =>
  value
    .replace(/[_-]+/g, " ")
    .toLowerCase()
    .replace(/^\w/, (letter) => letter.toUpperCase());

const formatScore = (value: number): string => {
  const normalized = Math.abs(value) > 1.5 ? value / 1000 : value;
  return normalized.toFixed(2);
};

const tickLabel = (tick: number): string =>
  `${Math.floor(tick / ticksPerSecond)}s · tick ${tick.toLocaleString()}`;

function Meter({
  label,
  value,
  tone = "moss",
  inverse = false,
}: {
  label: string;
  value: number;
  tone?: "moss" | "coral" | "water" | "gold";
  inverse?: boolean;
}) {
  const bounded = Math.max(0, Math.min(100, value));
  return (
    <div
      className="meter"
      aria-label={`${label}: ${Math.round(bounded)} percent`}
      title={`${Math.round(bounded)}%`}
    >
      <div className="meter__label">
        <span>{label}</span>
        <span className="number">{Math.round(bounded)}</span>
      </div>
      <div
        className={`meter__track meter__track--${tone}`}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(bounded)}
      >
        <span
          className={inverse ? "meter__fill meter__fill--inverse" : "meter__fill"}
          style={{ width: `${bounded}%` }}
        />
      </div>
    </div>
  );
}

function SectionTitle({
  icon: Icon,
  children,
  annotation,
}: {
  icon: LucideIcon;
  children: React.ReactNode;
  annotation?: string;
}) {
  return (
    <div className="section-title">
      <Icon aria-hidden="true" size={15} strokeWidth={1.8} />
      <h3>{children}</h3>
      {annotation ? <span>{annotation}</span> : null}
    </div>
  );
}

function GroupLedger({
  view,
  onSelect,
}: {
  view: WorldView;
  onSelect: (id: EntityId) => void;
}) {
  const storageCount = view.structures.filter((structure) =>
    /STORAGE/i.test(structure.kind),
  ).length;
  return (
    <section className="ledger" aria-labelledby="census-heading">
      <div className="ledger__heading">
        <div>
          <span className="eyebrow">Live census</span>
          <h2 id="census-heading">The dish at a glance</h2>
        </div>
        <CircleDot aria-hidden="true" size={20} />
      </div>
      <dl className="ledger__figures">
        <div>
          <dt>Living</dt>
          <dd>{view.population}</dd>
        </div>
        <div>
          <dt>Groups</dt>
          <dd>{view.groups.length}</dd>
        </div>
        <div>
          <dt>Stores</dt>
          <dd>{storageCount}</dd>
        </div>
        <div>
          <dt>Wild food</dt>
          <dd>{view.foodStock}</dd>
        </div>
      </dl>
      <div className="group-ledger">
        {view.groups.length === 0 ? (
          <p className="empty-copy">
            No persistent group yet. Watch for repeated proximity, trust, and shared work.
          </p>
        ) : (
          view.groups.slice(0, 4).map((group) => {
            const leader = view.creatures.find((creature) => creature.id === group.leaderId);
            const stores = view.structures.filter((structure) =>
              group.storageIds.includes(structure.id),
            );
            return (
              <div className="group-line" key={group.id}>
                <div className="group-line__identity">
                  <span className="group-mark" aria-hidden="true" />
                  <div>
                    <strong>{group.name}</strong>
                    <span>
                      {group.memberIds.length} members
                      {leader ? (
                        <>
                          {" · "}
                          <button type="button" onClick={() => onSelect(leader.id)}>
                            {leader.name} leads
                          </button>
                        </>
                      ) : null}
                    </span>
                  </div>
                </div>
                <div className="group-line__facts">
                  <span>{Math.round(group.cohesion)} cohesion</span>
                  <span>{stores.length > 0 ? `${stores.length} store` : "no store"}</span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}

const filterOptions: Array<{ id: TimelineCategory; label: string }> = [
  { id: "all", label: "All" },
  { id: "social", label: "Social" },
  { id: "resources", label: "Resources" },
  { id: "conflict", label: "Conflict" },
  { id: "group", label: "Groups" },
  { id: "player", label: "You" },
];

function TimelinePanel({
  view,
  filter,
  onFilter,
  onSelect,
  onSelectEvent,
}: {
  view: WorldView;
  filter: TimelineCategory;
  onFilter: (filter: TimelineCategory) => void;
  onSelect: (id: EntityId) => void;
  onSelectEvent: (event: TimelineEventView) => void;
}) {
  const events = view.events.filter((event) => filter === "all" || event.category === filter);
  return (
    <div className="chronicle-scroll">
      <GroupLedger view={view} onSelect={onSelect} />
      <section className="chronicle" aria-labelledby="chronicle-heading">
        <div className="section-heading-row">
          <div>
            <span className="eyebrow">Verified observations</span>
            <h2 id="chronicle-heading">Field chronicle</h2>
          </div>
          <BookOpen aria-hidden="true" size={19} />
        </div>
        <div className="filter-strip" aria-label="Timeline filters">
          {filterOptions.map((option) => (
            <button
              type="button"
              key={option.id}
              className={filter === option.id ? "is-active" : ""}
              aria-pressed={filter === option.id}
              onClick={() => onFilter(option.id)}
            >
              {option.label}
            </button>
          ))}
        </div>
        {events.length === 0 ? (
          <div className="timeline-empty">
            <Sparkles aria-hidden="true" size={19} />
            <strong>No {filter === "all" ? "major" : filter} observations yet.</strong>
            <span>The chronicle records outcomes only after the simulation emits facts.</span>
          </div>
        ) : (
          <ol className="timeline-list">
            {events.slice(0, 80).map((event) => (
              <TimelineEntry
                key={`${event.id}-${event.tick}`}
                event={event}
                onSelectEvent={onSelectEvent}
              />
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}

function TimelineEntry({
  event,
  onSelectEvent,
}: {
  event: TimelineEventView;
  onSelectEvent: (event: TimelineEventView) => void;
}) {
  const actorId = event.decisionActorId ?? event.actorIds[0] ?? event.targetIds[0];
  return (
    <li className={`timeline-entry timeline-entry--${event.category}`}>
      <span className="timeline-entry__pin" aria-hidden="true" />
      <article>
        <div className="timeline-entry__meta">
          <time>{tickLabel(event.tick)}</time>
          <span>{event.category}</span>
        </div>
        {actorId ? (
          <button
            type="button"
            className="timeline-entry__body"
            onClick={() => onSelectEvent(event)}
            aria-label={`${event.title}. Inspect involved creature.`}
          >
            <strong>{event.title}</strong>
            <span>{event.detail}</span>
          </button>
        ) : (
          <div className="timeline-entry__body">
            <strong>{event.title}</strong>
            <span>{event.detail}</span>
          </div>
        )}
        {event.causedByEventIds.length > 0 ? (
          <span className="source-note">
            traced to {event.causedByEventIds.length} earlier{" "}
            {event.causedByEventIds.length === 1 ? "event" : "events"}
          </span>
        ) : null}
      </article>
    </li>
  );
}

function CandidateRow({ candidate, rank }: { candidate: CandidateView; rank: number }) {
  const positives = candidate.factors.filter((factor) => factor.contribution > 0);
  const negatives = candidate.factors.filter((factor) => factor.contribution < 0);
  return (
    <details className="candidate" open={candidate.selected || rank === 0}>
      <summary>
        <span className="candidate__rank">{rank + 1}</span>
        <span className="candidate__name">
          {humanize(candidate.action)}
          {candidate.selected ? <em>chosen</em> : null}
        </span>
        <span className="candidate__score number">{formatScore(candidate.utility)}</span>
      </summary>
      <div className="factor-list">
        {candidate.factors.length === 0 ? (
          <span className="empty-copy">No factor detail retained for this alternative.</span>
        ) : (
          <>
            {positives.map((factor, index) => (
              <div className="factor factor--positive" key={`${factor.key}-p-${index}`}>
                <span aria-hidden="true">+</span>
                <span>{factor.label}</span>
                <strong className="number">{formatScore(Math.abs(factor.contribution))}</strong>
              </div>
            ))}
            {negatives.map((factor, index) => (
              <div className="factor factor--negative" key={`${factor.key}-n-${index}`}>
                <span aria-hidden="true">−</span>
                <span>{factor.label}</span>
                <strong className="number">{formatScore(Math.abs(factor.contribution))}</strong>
              </div>
            ))}
          </>
        )}
      </div>
    </details>
  );
}

function MemoryLine({
  memory,
  creatures,
}: {
  memory: MemoryView;
  creatures: CreatureView[];
}) {
  const subject = creatures.find((creature) => creature.id === memory.subjectId);
  const tone = memory.valence < -0.05 ? "harm" : memory.valence > 0.05 ? "help" : "neutral";
  return (
    <li className={`memory-line memory-line--${tone}`}>
      <span className="memory-line__mark" aria-hidden="true" />
      <div>
        <strong>{humanize(memory.kind)}</strong>
        <span>
          {subject ? `involving ${subject.name} · ` : ""}
          strength {Math.round(memory.strength)}
        </span>
      </div>
      <time>{Math.round(memory.ageTicks / ticksPerSecond)}s ago</time>
    </li>
  );
}

function RelationshipLine({
  relationship,
  onSelect,
}: {
  relationship: RelationshipView;
  onSelect: (id: EntityId) => void;
}) {
  const trustLabel =
    relationship.trust > 0.2
      ? "trusted"
      : relationship.trust < -0.2
        ? "distrusted"
        : "uncertain";
  return (
    <li className="relationship-line">
      <button type="button" onClick={() => onSelect(relationship.otherId)}>
        <span>
          <strong>{relationship.otherName}</strong>
          <em>{relationship.direction === "toward" ? "feels toward" : "feels toward this subject"}</em>
        </span>
        <span className={`relationship-trust relationship-trust--${trustLabel}`}>
          {trustLabel}
        </span>
      </button>
      <div className="relationship-measures">
        <span>trust {Math.round(relationship.trust * 100)}</span>
        <span>fear {Math.round(relationship.fear)}</span>
        <span>familiarity {Math.round(relationship.familiarity)}</span>
      </div>
    </li>
  );
}

function InspectorPanel({
  creature,
  view,
  evidenceEvent,
  followed,
  onFollow,
  onSelect,
}: {
  creature: CreatureView | null;
  view: WorldView;
  evidenceEvent: TimelineEventView | null;
  followed: boolean;
  onFollow: () => void;
  onSelect: (id: EntityId) => void;
}) {
  if (!creature) {
    return (
      <div className="inspector-empty">
        <Focus aria-hidden="true" size={28} />
        <span className="eyebrow">Subject notebook</span>
        <h2>Select a creature in the dish</h2>
        <p>
          Inspect its current intention, alternatives, remembered events, and directional
          relationships. Nothing shown here changes its decisions.
        </p>
      </div>
    );
  }

  const group = view.groups.find((item) => item.id === creature.groupId);
  const evidenceCandidates = evidenceEvent?.decisionCandidates ?? [];
  const shownCandidates =
    evidenceCandidates.length > 0 ? evidenceCandidates : creature.candidates;
  return (
    <div className="inspector-scroll">
      <section className="subject-header" aria-labelledby="subject-heading">
        <div className="subject-header__top">
          <div className="subject-avatar" aria-hidden="true">
            <span style={{ backgroundColor: `#${creature.color.toString(16).padStart(6, "0")}` }} />
          </div>
          <div>
            <span className="eyebrow">
              {creature.role}
              {group ? ` · ${group.name}` : " · ungrouped"}
            </span>
            <h2 id="subject-heading">{creature.name}</h2>
          </div>
          <IconButton
            label={followed ? `Stop following ${creature.name}` : `Follow ${creature.name}`}
            icon={LocateFixed}
            pressed={followed}
            onClick={onFollow}
          />
        </div>
        <div className="current-intention">
          <span>Current intention</span>
          <strong>{humanize(creature.goal)}</strong>
          <em>{humanize(creature.action)}</em>
        </div>
        <div className="vitals-grid">
          <Meter label="Health" value={creature.health} tone="moss" />
          <Meter label="Hunger" value={creature.hunger} tone="coral" inverse />
          <Meter label="Fatigue" value={creature.fatigue} tone="gold" inverse />
        </div>
      </section>

      <section className="inspector-section" aria-labelledby="intentions-heading">
        <SectionTitle
          icon={Route}
          annotation={evidenceCandidates.length > 0 ? "event evidence" : "top five"}
        >
          <span id="intentions-heading">Considered paths</span>
        </SectionTitle>
        {evidenceCandidates.length > 0 && evidenceEvent ? (
          <div className="evidence-note">
            <span>Decision retained at {tickLabel(evidenceEvent.tick)}</span>
            <strong>{evidenceEvent.title}</strong>
          </div>
        ) : null}
        {shownCandidates.length === 0 ? (
          <p className="empty-copy">
            This creature has not retained a decision record yet. Let the simulation run
            until its next reconsideration.
          </p>
        ) : (
          <div className="candidate-list">
            {shownCandidates.map((candidate, index) => (
              <CandidateRow
                candidate={candidate}
                rank={index}
                key={`${candidate.action}-${candidate.targetId ?? "none"}-${index}`}
              />
            ))}
          </div>
        )}
      </section>

      <section className="inspector-section" aria-labelledby="traits-heading">
        <SectionTitle icon={Sparkles}>
          <span id="traits-heading">Disposition</span>
        </SectionTitle>
        <div className="trait-list">
          {creature.traits.map((trait) => (
            <Meter key={trait.key} label={trait.label} value={trait.value} tone="water" />
          ))}
        </div>
      </section>

      <section className="inspector-section" aria-labelledby="inventory-heading">
        <SectionTitle icon={PackageOpen}>
          <span id="inventory-heading">Carried things</span>
        </SectionTitle>
        {creature.inventory.length === 0 ? (
          <p className="empty-copy">Nothing carried.</p>
        ) : (
          <dl className="inventory-list">
            {creature.inventory.map((stack) => (
              <div key={stack.kind}>
                <dt>{humanize(stack.kind)}</dt>
                <dd className="number">{stack.quantity}</dd>
              </div>
            ))}
          </dl>
        )}
      </section>

      <section className="inspector-section" aria-labelledby="memory-heading">
        <SectionTitle icon={BookOpen} annotation={`${creature.memories.length} retained`}>
          <span id="memory-heading">Salient memories</span>
        </SectionTitle>
        {creature.memories.length === 0 ? (
          <p className="empty-copy">No strong episodic memory has formed yet.</p>
        ) : (
          <ol className="memory-list">
            {creature.memories.map((memory) => (
              <MemoryLine key={memory.id} memory={memory} creatures={view.creatures} />
            ))}
          </ol>
        )}
      </section>

      <section className="inspector-section" aria-labelledby="relationships-heading">
        <SectionTitle icon={UsersRound} annotation="directional">
          <span id="relationships-heading">Relationships</span>
        </SectionTitle>
        {creature.relationships.length === 0 ? (
          <p className="empty-copy">
            No relationship edge is strong enough to keep. Shared time and consequential
            interactions will create one.
          </p>
        ) : (
          <ol className="relationship-list">
            {creature.relationships.map((relationship) => (
              <RelationshipLine
                key={`${relationship.direction}-${relationship.otherId}`}
                relationship={relationship}
                onSelect={onSelect}
              />
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}

const toolOptions: Array<{
  id: InterventionTool;
  label: string;
  icon: LucideIcon;
  help: string;
}> = [
  {
    id: "inspect",
    label: "Inspect",
    icon: MousePointer2,
    help: "Select a creature, or drag the dish to pan.",
  },
  {
    id: "add-food",
    label: "Add food",
    icon: Apple,
    help: "Place food at a tile. Creatures decide whether to notice and use it.",
  },
  {
    id: "remove-food",
    label: "Remove food",
    icon: Eraser,
    help: "Remove food from a tile and record the intervention.",
  },
  {
    id: "obstacle",
    label: "Toggle obstacle",
    icon: BrickWall,
    help: "Open or close a tile. Existing routes will be reconsidered.",
  },
];

function WorldStage({
  view,
  selectedId,
  followedId,
  tool,
  overlays,
  feedback,
  onTool,
  onOverlay,
  onSelect,
  onWorldAction,
}: {
  view: WorldView;
  selectedId: EntityId | null;
  followedId: EntityId | null;
  tool: InterventionTool;
  overlays: OverlaySettings;
  feedback: string;
  onTool: (tool: InterventionTool) => void;
  onOverlay: (overlay: keyof OverlaySettings) => void;
  onSelect: (id: EntityId | null) => void;
  onWorldAction: (action: WorldAction) => void;
}) {
  const activeTool = toolOptions.find((option) => option.id === tool) ?? toolOptions[0]!;
  const ActiveToolIcon = activeTool.icon;
  return (
    <section className="dish-stage" aria-labelledby="dish-heading">
      <div className="dish-toolbar">
        <div className="tool-group" aria-label="Dish tools">
          {toolOptions.map((option) => (
            <IconButton
              key={option.id}
              label={option.label}
              icon={option.icon}
              pressed={tool === option.id}
              onClick={() => onTool(option.id)}
            >
              {option.label}
            </IconButton>
          ))}
        </div>
        <div className="overlay-group" aria-label="Map overlays">
          <IconButton
            label="Toggle resource emphasis"
            icon={Eye}
            pressed={overlays.resources}
            onClick={() => onOverlay("resources")}
          />
          <IconButton
            label="Toggle intention paths"
            icon={Route}
            pressed={overlays.intentions}
            onClick={() => onOverlay("intentions")}
          />
          <IconButton
            label="Toggle group influence"
            icon={Layers3}
            pressed={overlays.groups}
            onClick={() => onOverlay("groups")}
          />
        </div>
      </div>
      <div className="dish-heading">
        <div>
          <span className="eyebrow">Specimen field · seed {DEFAULT_SEED}</span>
          <h2 id="dish-heading">Living dish</h2>
        </div>
        <span className="dish-heading__instruction">
          <ActiveToolIcon aria-hidden="true" size={15} />
          {activeTool.help}
        </span>
      </div>
      <div className="dish-well">
        <PixiWorld
          view={view}
          selectedId={selectedId}
          followedId={followedId}
          tool={tool}
          overlays={overlays}
          onSelect={onSelect}
          onWorldAction={onWorldAction}
        />
        <div className="dish-legend" aria-label="World legend">
          <span><i className="legend-dot legend-dot--creature" /> creature</span>
          <span><i className="legend-dot legend-dot--food" /> food</span>
          <span><i className="legend-dot legend-dot--material" /> material</span>
          <span><i className="legend-dot legend-dot--storage" /> storage</span>
        </div>
      </div>
      <div className="dish-caption">
        <span className="feedback-line" role="status" aria-live="polite">
          {feedback}
        </span>
        <span>Wheel to zoom · drag to pan · Shift-drag with a tool</span>
      </div>
    </section>
  );
}

export default function App() {
  const initialRef = useRef<{ state: unknown; view: WorldView; error: string | null } | null>(
    null,
  );
  if (!initialRef.current) {
    try {
      const state = createSimulationState(DEFAULT_SEED);
      initialRef.current = { state, view: makeWorldView(state), error: null };
    } catch (error) {
      initialRef.current = {
        state: null,
        view: EMPTY_VIEW,
        error: error instanceof Error ? error.message : "The simulation could not start.",
      };
    }
  }

  const simRef = useRef(initialRef.current.state);
  const [view, setView] = useState<WorldView>(initialRef.current.view);
  const [fatalError, setFatalError] = useState<string | null>(initialRef.current.error);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState<1 | 2 | 4>(1);
  const [selectedId, setSelectedId] = useState<EntityId | null>(
    initialRef.current.view.creatures[0]?.id ?? null,
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
  const [feedback, setFeedback] = useState(
    "Conditions are stable. The creatures retain authority over every action.",
  );

  const refresh = useCallback(() => {
    if (!simRef.current) return;
    try {
      setView(makeWorldView(simRef.current));
    } catch (error) {
      setFatalError(error instanceof Error ? error.message : "The simulation view failed.");
      setPlaying(false);
    }
  }, []);

  const advance = useCallback(
    (ticks: number) => {
      if (!simRef.current || ticks <= 0) return;
      try {
        simRef.current = advanceSimulationTicks(simRef.current, ticks);
        refresh();
      } catch (error) {
        setFatalError(error instanceof Error ? error.message : "The simulation stopped.");
        setPlaying(false);
      }
    },
    [refresh],
  );

  useEffect(() => {
    if (!playing || fatalError) return;
    let frame = 0;
    let lastTime = performance.now();
    let accumulator = 0;
    const loop = (now: number) => {
      const elapsed = Math.min(250, now - lastTime);
      lastTime = now;
      accumulator += (elapsed / 1000) * ticksPerSecond * speed;
      const ticks = Math.min(20, Math.floor(accumulator));
      if (ticks > 0) {
        accumulator -= ticks;
        advance(ticks);
      }
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [advance, fatalError, playing, speed]);

  const restart = useCallback(() => {
    try {
      const state = createSimulationState(DEFAULT_SEED);
      simRef.current = state;
      const nextView = makeWorldView(state);
      setView(nextView);
      setSelectedId(nextView.creatures[0]?.id ?? null);
      setFollowedId(null);
      setSelectedEvidenceEventId(null);
      setTool("inspect");
      setFatalError(null);
      setFeedback(`Seed ${DEFAULT_SEED} restarted. No interventions carried forward.`);
    } catch (error) {
      setFatalError(error instanceof Error ? error.message : "Restart failed.");
      setPlaying(false);
    }
  }, []);

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
      if (tool === "inspect" || !simRef.current) return;
      try {
        simRef.current = queueIntervention(simRef.current, tool, action.tile);
        if (!playing) {
          simRef.current = advanceSimulationTicks(simRef.current, 1);
        }
        refresh();
        if (tool === "obstacle") {
          const change = action.tile.blocked ? "Passage opening" : "Obstacle placement";
          setFeedback(
            `${change} requested at ${action.tile.x}, ${action.tile.y}. Safety rules reject changes that would cover or trap an entity.`,
          );
        } else {
          const verb = tool === "add-food" ? "Food added" : "Food removed";
          setFeedback(
            `${verb} at ${action.tile.x}, ${action.tile.y}. Creatures will respond through their own decisions.`,
          );
        }
      } catch (error) {
        setFeedback(error instanceof Error ? error.message : "That intervention could not be applied.");
      }
    },
    [playing, refresh, tool],
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
    () =>
      view.events.find((event) => event.id === selectedEvidenceEventId) ?? null,
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
          <span className={`pulse-mark ${playing ? "is-running" : ""}`} aria-hidden="true" />
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
            onClick={restart}
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
          <button type="button" onClick={restart}>
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
