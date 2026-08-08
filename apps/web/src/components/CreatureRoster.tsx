import { AlertTriangle, Droplets, PackageOpen, Route, UsersRound } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import type { CreatureView, EntityId, GroupView, LifeRecordView } from "../model";
import { humanize } from "./ui";

const IDENTITY_GLYPHS = ["A", "B", "C", "D", "E", "F", "G", "H"] as const;

interface CreatureAlert {
  readonly label: string;
  readonly tone: "danger" | "warning" | "watch" | "quiet";
}

function alertFor(creature: CreatureView): CreatureAlert | null {
  if (!creature.alive) return { label: "No longer active", tone: "quiet" };
  if (creature.health <= 35) return { label: "Health risk", tone: "danger" };
  if (/ATTACK|FLEE/i.test(creature.action)) {
    return {
      label: /FLEE/i.test(creature.action) ? "Fleeing" : "Conflict",
      tone: "danger",
    };
  }
  if (creature.thirst >= 75) return { label: "Very thirsty", tone: "warning" };
  if (creature.hunger >= 75) return { label: "Very hungry", tone: "warning" };
  if (creature.fatigue >= 75) return { label: "Very tired", tone: "warning" };
  if (/GUARD|STEAL/i.test(creature.action))
    return { label: "Watch closely", tone: "watch" };
  return null;
}

function carriedWater(creature: CreatureView): number {
  return creature.inventory
    .filter((stack) => /WATER/i.test(stack.kind))
    .reduce((total, stack) => total + Math.max(0, stack.quantity), 0);
}

function carriedSummary(creature: CreatureView): string {
  if (creature.inventory.length === 0) return "Empty-handed";
  return creature.inventory
    .map((stack) => `${stack.quantity} ${humanize(stack.kind).toLowerCase()}`)
    .join(", ");
}

function creatureAccessibleName(
  creature: CreatureView,
  groupName: string,
  alert: CreatureAlert | null,
): string {
  return [
    creature.name,
    creature.role,
    creature.lifeStage ? humanize(creature.lifeStage) : undefined,
    creature.sex ? `${humanize(creature.sex)} biological sex` : undefined,
    creature.dependent ? "dependent youth" : undefined,
    creature.pregnant
      ? `pregnant, due at tick ${creature.pregnancyDueTick ?? "unknown"}`
      : undefined,
    creature.criticalSinceTick !== undefined
      ? `critical health since tick ${creature.criticalSinceTick}`
      : undefined,
    creature.mourning ? "mourning" : undefined,
    `goal ${humanize(creature.goal)}`,
    `now ${humanize(creature.action)}`,
    `thirst ${Math.round(creature.thirst)} percent`,
    groupName,
    carriedSummary(creature),
    creature.waterAccess
      ? `nearest water source ${creature.waterAccess.sourceId}, stock ${creature.waterAccess.sourceStock} of ${creature.waterAccess.sourceCapacity}, weighted access cost ${creature.waterAccess.weightedCost}, ${creature.waterAccess.claimedInteractionSlots} of ${creature.waterAccess.interactionCapacity} slots claimed`
      : "no reachable water source",
    alert?.label,
  ]
    .filter(Boolean)
    .join(", ");
}

export function CreatureRoster({
  creatures,
  lifeRecords = [],
  groups,
  selectedId,
  keyboardFocusedId,
  onSelect,
  onKeyboardFocus,
  onHover,
  onSelectRemembered,
}: {
  creatures: CreatureView[];
  lifeRecords?: LifeRecordView[];
  groups: GroupView[];
  selectedId: EntityId | null;
  keyboardFocusedId: EntityId | null;
  onSelect: (id: EntityId) => void;
  onKeyboardFocus: (id: EntityId | null) => void;
  onHover: (id: EntityId | null) => void;
  onSelectRemembered?: ((id: EntityId) => void) | undefined;
}) {
  const [viewMode, setViewMode] = useState<"living" | "remembered">("living");
  const orderedCreatures = useMemo(
    () => [...creatures].sort((left, right) => left.id - right.id),
    [creatures],
  );
  const creatureIds = orderedCreatures.map((creature) => creature.id).join(":");
  const [rovingId, setRovingId] = useState<EntityId | null>(
    keyboardFocusedId ?? selectedId ?? orderedCreatures[0]?.id ?? null,
  );
  const buttonRefs = useRef(new Map<EntityId, HTMLButtonElement>());

  useEffect(() => {
    const preferred = keyboardFocusedId ?? selectedId;
    if (
      preferred !== null &&
      orderedCreatures.some((creature) => creature.id === preferred)
    ) {
      setRovingId(preferred);
      return;
    }
    setRovingId((current) =>
      current !== null && orderedCreatures.some((creature) => creature.id === current)
        ? current
        : (orderedCreatures[0]?.id ?? null),
    );
  }, [creatureIds, keyboardFocusedId, orderedCreatures, selectedId]);

  const moveFocus = (nextIndex: number) => {
    if (orderedCreatures.length === 0) return;
    const normalizedIndex = (nextIndex + orderedCreatures.length) % orderedCreatures.length;
    const creature = orderedCreatures[normalizedIndex];
    if (!creature) return;
    setRovingId(creature.id);
    onKeyboardFocus(creature.id);
    buttonRefs.current.get(creature.id)?.focus();
  };

  const handleKeyDown = (
    event: KeyboardEvent<HTMLButtonElement>,
    creatureIndex: number,
  ) => {
    let nextIndex: number;
    switch (event.key) {
      case "ArrowDown":
      case "ArrowRight":
        nextIndex = creatureIndex + 1;
        break;
      case "ArrowUp":
      case "ArrowLeft":
        nextIndex = creatureIndex - 1;
        break;
      case "Home":
        nextIndex = 0;
        break;
      case "End":
        nextIndex = orderedCreatures.length - 1;
        break;
      case "Escape":
        event.preventDefault();
        onKeyboardFocus(null);
        event.currentTarget.blur();
        return;
      default:
        return;
    }
    event.preventDefault();
    moveFocus(nextIndex);
  };

  return (
    <section className="creature-roster" aria-labelledby="creature-roster-heading">
      <div className="creature-roster__heading">
        <div>
          <span className="eyebrow">Named subjects</span>
          <h2 id="creature-roster-heading">Creature roster</h2>
        </div>
        <span
          className="creature-roster__count"
          aria-label={`${creatures.length} creatures`}
        >
          {creatures.length.toString().padStart(2, "0")}
        </span>
      </div>
      <div className="creature-roster__views" role="group" aria-label="Roster view">
        <button
          type="button"
          className={viewMode === "living" ? "is-active" : ""}
          aria-pressed={viewMode === "living"}
          onClick={() => setViewMode("living")}
        >
          Living {orderedCreatures.length}
        </button>
        <button
          type="button"
          className={viewMode === "remembered" ? "is-active" : ""}
          aria-pressed={viewMode === "remembered"}
          onClick={() => setViewMode("remembered")}
        >
          Remembered {lifeRecords.length}
        </button>
      </div>
      {viewMode === "remembered" ? (
        lifeRecords.length === 0 ? (
          <p className="empty-copy">No permanent life records have been written.</p>
        ) : (
          <ul className="creature-roster__list" aria-label="Remembered lives">
            {[...lifeRecords]
              .sort((left, right) => right.deathTick - left.deathTick || left.id - right.id)
              .map((record) => (
                <li key={record.id}>
                  <button
                    type="button"
                    className={`creature-roster__item creature-roster__item--remembered ${record.id === selectedId ? "is-selected" : ""}`}
                    aria-pressed={record.id === selectedId}
                    aria-label={`${record.name}, remembered ${humanize(record.finalLifeStage).toLowerCase()}, ${record.deathTick < 0 ? "death tick not recorded" : `died at tick ${record.deathTick}`}, cause ${humanize(record.deathCause).toLowerCase()}`}
                    disabled={onSelectRemembered === undefined}
                    onClick={() => onSelectRemembered?.(record.id)}
                  >
                    <span className="creature-roster__identity" aria-hidden="true">
                      *
                    </span>
                    <span className="creature-roster__body">
                      <span className="creature-roster__name-line">
                        <strong>{record.name}</strong>
                        <span>{humanize(record.finalLifeStage)}</span>
                      </span>
                      <span className="creature-roster__facts">
                        <span>
                          {record.deathTick < 0
                            ? "Death tick not recorded"
                            : `Died at tick ${record.deathTick}`}
                        </span>
                        <span>{humanize(record.deathCause)}</span>
                      </span>
                    </span>
                  </button>
                </li>
              ))}
          </ul>
        )
      ) : orderedCreatures.length === 0 ? (
        <p className="empty-copy">The roster will appear when the dish is ready.</p>
      ) : (
        <ul
          className="creature-roster__list"
          aria-label="Creatures in stable identity order"
          onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget)) onKeyboardFocus(null);
          }}
          onPointerLeave={() => onHover(null)}
        >
          {orderedCreatures.map((creature, index) => {
            const group = groups.find((candidate) => candidate.id === creature.groupId);
            const groupName = group?.name ?? "Ungrouped";
            const alert = alertFor(creature);
            const selected = creature.id === selectedId;
            const carrying = carriedSummary(creature);
            const water = carriedWater(creature);
            return (
              <li key={creature.id}>
                <button
                  ref={(node) => {
                    if (node) buttonRefs.current.set(creature.id, node);
                    else buttonRefs.current.delete(creature.id);
                  }}
                  type="button"
                  className={`creature-roster__item ${selected ? "is-selected" : ""}`}
                  tabIndex={creature.id === rovingId ? 0 : -1}
                  aria-pressed={selected}
                  aria-label={creatureAccessibleName(creature, groupName, alert)}
                  onClick={() => onSelect(creature.id)}
                  onFocus={() => {
                    setRovingId(creature.id);
                    onKeyboardFocus(creature.id);
                  }}
                  onKeyDown={(event) => handleKeyDown(event, index)}
                  onPointerEnter={() => onHover(creature.id)}
                >
                  <span
                    className="creature-roster__identity"
                    style={{
                      borderColor: `#${creature.color.toString(16).padStart(6, "0")}`,
                    }}
                    aria-hidden="true"
                  >
                    {IDENTITY_GLYPHS[Math.abs(creature.id - 1) % IDENTITY_GLYPHS.length]}
                  </span>
                  <span className="creature-roster__body">
                    <span className="creature-roster__name-line">
                      <strong>{creature.name}</strong>
                      <span>{creature.role}</span>
                    </span>
                    <span className="creature-roster__intent">
                      <span>
                        <b>Goal</b> {humanize(creature.goal)}
                      </span>
                      <span>
                        <b>Now</b> {humanize(creature.action)}
                      </span>
                    </span>
                    <span className="creature-roster__facts">
                      {creature.lifeStage && creature.sex ? (
                        <span>
                          {humanize(creature.lifeStage)} / {humanize(creature.sex)}
                          {creature.dependent ? " / dependent" : ""}
                          {creature.pregnant ? " / pregnant" : ""}
                        </span>
                      ) : null}
                      <span>
                        <UsersRound aria-hidden="true" size={11} />
                        {groupName}
                      </span>
                      <span>
                        <PackageOpen aria-hidden="true" size={11} />
                        {carrying}
                      </span>
                      <span>
                        <Droplets aria-hidden="true" size={11} />
                        Thirst {Math.round(creature.thirst)}% / {water} water
                      </span>
                      <span>
                        <Route aria-hidden="true" size={11} />
                        {creature.waterAccess
                          ? `Source ${creature.waterAccess.sourceId}: ${creature.waterAccess.sourceStock}/${creature.waterAccess.sourceCapacity}, cost ${creature.waterAccess.weightedCost}, slots ${creature.waterAccess.claimedInteractionSlots}/${creature.waterAccess.interactionCapacity}`
                          : "No reachable water source"}
                      </span>
                      {alert ? (
                        <span className={`creature-roster__alert is-${alert.tone}`}>
                          <AlertTriangle aria-hidden="true" size={11} />
                          {alert.label}
                        </span>
                      ) : null}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <p className="creature-roster__help">
        Arrow keys browse. Enter selects. Selection stays linked to the dish and notes.
      </p>
    </section>
  );
}
