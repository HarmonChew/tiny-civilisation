import { BookOpen, CircleDot, Sparkles } from "lucide-react";
import type { EntityId, TimelineCategory, TimelineEventView, WorldView } from "../model";
import { tickLabel } from "./ui";

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
            const leader = view.creatures.find(
              (creature) => creature.id === group.leaderId,
            );
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

export function TimelinePanel({
  view,
  filter,
  selectedEventId,
  onFilter,
  onSelect,
  onSelectEvent,
  onFocusEvent,
  onHoverEvent,
}: {
  view: WorldView;
  filter: TimelineCategory;
  selectedEventId: number | null;
  onFilter: (filter: TimelineCategory) => void;
  onSelect: (id: EntityId) => void;
  onSelectEvent: (event: TimelineEventView) => void;
  onFocusEvent: (event: TimelineEventView | null) => void;
  onHoverEvent: (event: TimelineEventView | null) => void;
}) {
  const events = view.events.filter(
    (event) => filter === "all" || event.category === filter,
  );
  return (
    <>
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
            <span>
              The chronicle records outcomes only after the simulation emits facts.
            </span>
          </div>
        ) : (
          <ol className="timeline-list">
            {events.slice(0, 80).map((event) => (
              <TimelineEntry
                key={`${event.id}-${event.tick}`}
                event={event}
                selected={event.id === selectedEventId}
                onSelectEvent={onSelectEvent}
                onFocusEvent={onFocusEvent}
                onHoverEvent={onHoverEvent}
              />
            ))}
          </ol>
        )}
      </section>
    </>
  );
}

function TimelineEntry({
  event,
  selected,
  onSelectEvent,
  onFocusEvent,
  onHoverEvent,
}: {
  event: TimelineEventView;
  selected: boolean;
  onSelectEvent: (event: TimelineEventView) => void;
  onFocusEvent: (event: TimelineEventView | null) => void;
  onHoverEvent: (event: TimelineEventView | null) => void;
}) {
  return (
    <li
      className={`timeline-entry timeline-entry--${event.category} ${selected ? "is-selected" : ""}`}
      onPointerEnter={() => onHoverEvent(event)}
      onPointerLeave={() => onHoverEvent(null)}
    >
      <span className="timeline-entry__pin" aria-hidden="true" />
      <article>
        <div className="timeline-entry__meta">
          <time>{tickLabel(event.tick)}</time>
          <span>{event.category}</span>
        </div>
        <button
          type="button"
          className="timeline-entry__body"
          onClick={() => onSelectEvent(event)}
          onFocus={() => onFocusEvent(event)}
          onBlur={() => onFocusEvent(null)}
          aria-current={selected ? "true" : undefined}
          aria-label={`${event.title}. Inspect causal evidence.`}
        >
          <strong>{event.title}</strong>
          <span>{event.detail}</span>
        </button>
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
