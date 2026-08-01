import { Apple, Boxes, CircleDot, Hammer, MapPin, Sprout } from "lucide-react";
import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { sameWorldRef, worldRefKey, type WorldRef } from "../focus";
import type {
  CreatureView,
  ResourceView,
  StructureView,
  TimelineEventView,
  WorldView,
} from "../model";
import { identityGlyph } from "./pixi/visual-grammar";
import { humanize } from "./ui";

export type WorldNavigatorFilter = "all" | "creatures" | "resources" | "structures";

type NavigableWorldRef = Extract<WorldRef, { kind: "creature" | "resource" | "structure" }>;

interface WorldNavigatorItem {
  readonly ref: NavigableWorldRef;
  readonly category: Exclude<WorldNavigatorFilter, "all">;
  readonly id: number;
  readonly x: number;
  readonly y: number;
  readonly title: string;
  readonly kindLabel: string;
  readonly detail: string;
  readonly accessibleName: string;
  readonly alerts: readonly string[];
  readonly creature?: CreatureView;
  readonly resource?: ResourceView;
  readonly structure?: StructureView;
}

const FILTERS: ReadonlyArray<{
  readonly id: WorldNavigatorFilter;
  readonly label: string;
}> = [
  { id: "all", label: "All" },
  { id: "creatures", label: "Creatures" },
  { id: "resources", label: "Resources" },
  { id: "structures", label: "Structures" },
];

const ATTENTION_DEBOUNCE_MS = 400;

const coordinate = (value: number): string =>
  Number.isInteger(value) ? value.toString() : value.toFixed(1).replace(/\.0$/, "");

const locationLabel = (x: number, y: number): string =>
  `column ${coordinate(x)}, row ${coordinate(y)}`;

const resourceTitle = (resource: ResourceView): string =>
  `${humanize(resource.kind)} resource`;

const structureTitle = (structure: StructureView): string => humanize(structure.kind);

const structureState = (structure: StructureView): string =>
  structure.progress >= 99
    ? `complete, ${structure.stored} of ${structure.capacity} units stored`
    : `${Math.max(0, Math.min(100, Math.round(structure.progress)))} percent built`;

function creatureAlerts(creature: CreatureView): string[] {
  return [
    ...(creature.health <= 40 ? ["health risk"] : []),
    ...(creature.hunger >= 75 ? ["high hunger"] : []),
    ...(creature.fatigue >= 80 ? ["exhausted"] : []),
    ...(creature.action === "FLEE" ? ["fleeing a threat"] : []),
    ...(creature.action === "ATTACK" ? ["in a confrontation"] : []),
  ];
}

export function buildWorldNavigatorItems(view: WorldView): WorldNavigatorItem[] {
  const creatures: WorldNavigatorItem[] = view.creatures
    .filter((creature) => creature.alive)
    .map((creature) => {
      const alerts = creatureAlerts(creature);
      return {
        ref: { kind: "creature", id: creature.id },
        category: "creatures",
        id: creature.id,
        x: creature.x,
        y: creature.y,
        title: creature.name,
        kindLabel: creature.role,
        detail: `${humanize(creature.action)} · ${humanize(creature.desire)}`,
        accessibleName: [
          creature.name,
          creature.role,
          "creature",
          `at ${locationLabel(creature.x, creature.y)}`,
          `wants ${humanize(creature.desire)}`,
          `plans ${humanize(creature.plan)}`,
          `now ${humanize(creature.action)}`,
          alerts.length > 0 ? `alert: ${alerts.join(", ")}` : null,
          `reason: ${creature.reason}`,
        ]
          .filter((part): part is string => part !== null)
          .join(", "),
        alerts,
        creature,
      };
    });
  const resources: WorldNavigatorItem[] = view.resources.map((resource) => ({
    ref: { kind: "resource", id: resource.id },
    category: "resources",
    id: resource.id,
    x: resource.x,
    y: resource.y,
    title: resourceTitle(resource),
    kindLabel: "Resource",
    detail: `${resource.stock} of ${resource.capacity} units available`,
    alerts: [],
    accessibleName: `${resourceTitle(resource)} ${resource.id}, at ${locationLabel(
      resource.x,
      resource.y,
    )}, ${resource.stock} of ${resource.capacity} units available`,
    resource,
  }));
  const structures: WorldNavigatorItem[] = view.structures.map((structure) => ({
    ref: { kind: "structure", id: structure.id },
    category: "structures",
    id: structure.id,
    x: structure.x,
    y: structure.y,
    title: structureTitle(structure),
    kindLabel: structure.progress >= 99 ? "Structure" : "Construction",
    detail: structureState(structure),
    alerts: [],
    accessibleName: `${structureTitle(structure)} ${structure.id}, at ${locationLabel(
      structure.x,
      structure.y,
    )}, ${structureState(structure)}`,
    structure,
  }));
  const kindOrder: Record<NavigableWorldRef["kind"], number> = {
    creature: 0,
    resource: 1,
    structure: 2,
  };

  return [...creatures, ...resources, ...structures].sort(
    (left, right) =>
      left.y - right.y ||
      left.x - right.x ||
      left.id - right.id ||
      kindOrder[left.ref.kind] - kindOrder[right.ref.kind],
  );
}

export function worldTextSummary(view: WorldView): string {
  const living = view.creatures.filter((creature) => creature.alive);
  const occupiedTiles = new Set(
    living.map((creature) => `${Math.floor(creature.x)}:${Math.floor(creature.y)}`),
  ).size;
  const resourceStock = view.resources.reduce(
    (total, resource) => total + Math.max(0, resource.stock),
    0,
  );
  const completed = view.structures.filter((structure) => structure.progress >= 99).length;
  const construction = view.structures.length - completed;
  const creatureNoun = living.length === 1 ? "creature" : "creatures";
  const tileNoun = occupiedTiles === 1 ? "tile" : "tiles";
  const resourceNoun = view.resources.length === 1 ? "site" : "sites";
  const resourceVerb = view.resources.length === 1 ? "holds" : "hold";
  const structureNoun = completed === 1 ? "structure" : "structures";
  return `${view.width} by ${view.height} dish. ${living.length} living ${creatureNoun} across ${occupiedTiles} occupied ${tileNoun}. ${view.resources.length} resource ${resourceNoun} ${resourceVerb} ${resourceStock} units. ${completed} complete ${structureNoun} and ${construction} under construction.`;
}

export function selectedWorldSummary(view: WorldView, selected: WorldRef | null): string {
  if (!selected) return "Nothing selected. Choose a creature or world object to inspect.";
  if (selected.kind === "creature") {
    const creature = view.creatures.find((candidate) => candidate.id === selected.id);
    if (!creature) return "The selected creature is no longer present in the dish.";
    return `${creature.name} at ${locationLabel(creature.x, creature.y)}. ${creature.summary.desire} ${creature.summary.plan} ${creature.summary.action} ${creature.summary.reason}`;
  }
  if (selected.kind === "resource") {
    const resource = view.resources.find((candidate) => candidate.id === selected.id);
    if (!resource) return "The selected resource is no longer present in the dish.";
    return `${resourceTitle(resource)} ${resource.id} at ${locationLabel(resource.x, resource.y)}. ${resource.stock} of ${resource.capacity} units are available.`;
  }
  if (selected.kind === "structure") {
    const structure = view.structures.find((candidate) => candidate.id === selected.id);
    if (!structure) return "The selected structure is no longer present in the dish.";
    return `${structureTitle(structure)} ${structure.id} at ${locationLabel(structure.x, structure.y)}. ${structureState(structure)}.`;
  }
  return "The current evidence selection is outside the world-object navigator.";
}

const laterAttentionEvent = (
  current: TimelineEventView | null,
  candidate: TimelineEventView,
): TimelineEventView | null => {
  if (candidate.attentionTier !== "SIGNIFICANT" && candidate.attentionTier !== "CRITICAL") {
    return current;
  }
  if (!current || candidate.tick > current.tick) return candidate;
  if (candidate.tick === current.tick && candidate.id > current.id) return candidate;
  return current;
};

function useAttentionAnnouncement(view: WorldView): string {
  const latest = view.events.reduce<TimelineEventView | null>(laterAttentionEvent, null);
  const latestKey = latest ? `${latest.tick}:${latest.id}` : null;
  const baselineRef = useRef({
    key: latestKey,
    eventTick: latest?.tick ?? null,
    eventId: latest?.id ?? null,
  });
  const lastWorldTickRef = useRef(view.tick);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [announcement, setAnnouncement] = useState("");

  useEffect(() => {
    if (view.tick >= lastWorldTickRef.current) {
      lastWorldTickRef.current = view.tick;
      return;
    }
    lastWorldTickRef.current = view.tick;
    baselineRef.current = {
      key: latestKey,
      eventTick: latest?.tick ?? null,
      eventId: latest?.id ?? null,
    };
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    setAnnouncement("");
  }, [latest?.id, latest?.tick, latestKey, view.tick]);

  useEffect(() => {
    const baseline = baselineRef.current;
    if (latestKey === baseline.key) return;
    const isLater =
      latest !== null &&
      (baseline.eventTick === null ||
        latest.tick > baseline.eventTick ||
        (latest.tick === baseline.eventTick &&
          (baseline.eventId === null || latest.id > baseline.eventId)));
    baselineRef.current = {
      key: latestKey,
      eventTick: latest?.tick ?? null,
      eventId: latest?.id ?? null,
    };
    if (!isLater || !latest) return;

    if (timerRef.current) clearTimeout(timerRef.current);
    const prefix = latest.attentionTier === "CRITICAL" ? "Critical" : "Significant";
    const detail =
      latest.detail.length <= 140
        ? latest.detail
        : `${latest.detail.slice(0, 139).trimEnd()}…`;
    timerRef.current = setTimeout(() => {
      setAnnouncement(`${prefix} event: ${latest.title}. ${detail}`);
      timerRef.current = null;
    }, ATTENTION_DEBOUNCE_MS);
  }, [latest, latestKey]);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  return announcement;
}

export function WorldAttentionAnnouncer({ view }: { view: WorldView }) {
  const announcement = useAttentionAnnouncement(view);
  return (
    <p
      className="world-attention-announcer"
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      {announcement}
    </p>
  );
}

function NavigatorMark({ item }: { item: WorldNavigatorItem }) {
  if (item.creature) {
    return (
      <span
        className="world-navigator__mark world-navigator__mark--creature"
        style={{
          borderColor: `#${item.creature.color.toString(16).padStart(6, "0")}`,
        }}
        aria-hidden="true"
      >
        {identityGlyph(item.creature.id)}
      </span>
    );
  }
  if (item.resource) {
    return (
      <span
        className="world-navigator__mark world-navigator__mark--resource"
        aria-hidden="true"
      >
        {/FOOD/i.test(item.resource.kind) ? <Apple size={15} /> : <Boxes size={15} />}
      </span>
    );
  }
  return (
    <span
      className="world-navigator__mark world-navigator__mark--structure"
      aria-hidden="true"
    >
      {item.structure && item.structure.progress < 99 ? (
        <Hammer size={15} />
      ) : (
        <CircleDot size={15} />
      )}
    </span>
  );
}

export function WorldNavigator({
  view,
  selectedRef,
  focusedRef,
  keyboardFocusedRef,
  onSelect,
  onKeyboardFocus,
  onHover,
}: {
  view: WorldView;
  selectedRef: WorldRef | null;
  focusedRef: WorldRef | null;
  keyboardFocusedRef: WorldRef | null;
  onSelect: (ref: NavigableWorldRef) => void;
  onKeyboardFocus: (ref: NavigableWorldRef | null) => void;
  onHover: (ref: NavigableWorldRef | null) => void;
}) {
  const headingId = useId();
  const summaryId = useId();
  const selectedSummaryId = useId();
  const [filter, setFilter] = useState<WorldNavigatorFilter>("all");
  const orderedItems = useMemo(() => buildWorldNavigatorItems(view), [view]);
  const filteredItems = useMemo(
    () =>
      filter === "all"
        ? orderedItems
        : orderedItems.filter((item) => item.category === filter),
    [filter, orderedItems],
  );
  const filteredKeys = filteredItems.map((item) => worldRefKey(item.ref)).join("|");
  const selectedKey = selectedRef ? worldRefKey(selectedRef) : null;
  const keyboardFocusedKey = keyboardFocusedRef ? worldRefKey(keyboardFocusedRef) : null;
  const [rovingKey, setRovingKey] = useState<string | null>(() => {
    const availableKeys = new Set(orderedItems.map((item) => worldRefKey(item.ref)));
    const preferred = [keyboardFocusedKey, selectedKey].find(
      (key): key is string => key !== null && availableKeys.has(key),
    );
    return preferred ?? (orderedItems[0] ? worldRefKey(orderedItems[0].ref) : null);
  });
  const buttonRefs = useRef(new Map<string, HTMLButtonElement>());
  const filterRefs = useRef(new Map<WorldNavigatorFilter, HTMLButtonElement>());

  useLayoutEffect(() => {
    if (
      keyboardFocusedRef === null ||
      (keyboardFocusedRef.kind !== "creature" &&
        keyboardFocusedRef.kind !== "resource" &&
        keyboardFocusedRef.kind !== "structure") ||
      filteredItems.some((item) => worldRefKey(item.ref) === keyboardFocusedKey)
    ) {
      return;
    }
    const fallback = filteredItems[0];
    if (!fallback) {
      setRovingKey(null);
      onKeyboardFocus(null);
      filterRefs.current.get(filter)?.focus();
      return;
    }
    const fallbackKey = worldRefKey(fallback.ref);
    setRovingKey(fallbackKey);
    buttonRefs.current.get(fallbackKey)?.focus();
  }, [filter, filteredItems, keyboardFocusedKey, keyboardFocusedRef, onKeyboardFocus]);

  useEffect(() => {
    const availableKeys = new Set(filteredItems.map((item) => worldRefKey(item.ref)));
    const preferred = [keyboardFocusedKey, selectedKey].find(
      (key): key is string => key !== null && availableKeys.has(key),
    );
    if (preferred !== undefined) {
      setRovingKey(preferred);
      return;
    }
    setRovingKey((current) =>
      current !== null && filteredItems.some((item) => worldRefKey(item.ref) === current)
        ? current
        : filteredItems[0]
          ? worldRefKey(filteredItems[0].ref)
          : null,
    );
  }, [filteredItems, filteredKeys, keyboardFocusedKey, selectedKey]);

  const focusItem = (index: number) => {
    if (filteredItems.length === 0) return;
    const normalized = (index + filteredItems.length) % filteredItems.length;
    const item = filteredItems[normalized];
    if (!item) return;
    const key = worldRefKey(item.ref);
    setRovingKey(key);
    buttonRefs.current.get(key)?.focus();
  };

  const handleItemKeyDown = (
    event: KeyboardEvent<HTMLButtonElement>,
    item: WorldNavigatorItem,
    index: number,
  ) => {
    switch (event.key) {
      case "ArrowDown":
      case "ArrowRight":
        event.preventDefault();
        focusItem(index + 1);
        return;
      case "ArrowUp":
      case "ArrowLeft":
        event.preventDefault();
        focusItem(index - 1);
        return;
      case "Home":
        event.preventDefault();
        focusItem(0);
        return;
      case "End":
        event.preventDefault();
        focusItem(filteredItems.length - 1);
        return;
      case "Enter":
      case " ":
        event.preventDefault();
        onSelect(item.ref);
        return;
      case "Escape":
        event.preventDefault();
        onKeyboardFocus(null);
        filterRefs.current.get(filter)?.focus();
        return;
      default:
        return;
    }
  };

  return (
    <section
      className="world-navigator"
      aria-labelledby={headingId}
      onPointerLeave={() => onHover(null)}
    >
      <header className="world-navigator__heading">
        <div>
          <span className="eyebrow">Canvas-equivalent index</span>
          <h2 id={headingId}>World navigator</h2>
        </div>
        <Sprout aria-hidden="true" size={20} />
      </header>

      <div className="world-navigator__summaries">
        <section aria-labelledby={summaryId}>
          <h3 id={summaryId}>Dish at a glance</h3>
          <p>{worldTextSummary(view)}</p>
        </section>
        <section className="world-navigator__selection" aria-labelledby={selectedSummaryId}>
          <h3 id={selectedSummaryId}>Selected subject</h3>
          <p>{selectedWorldSummary(view, selectedRef)}</p>
        </section>
      </div>

      <div
        className="world-navigator__filters"
        role="group"
        aria-label="Filter world objects"
      >
        {FILTERS.map((option) => (
          <button
            ref={(node) => {
              if (node) filterRefs.current.set(option.id, node);
              else filterRefs.current.delete(option.id);
            }}
            type="button"
            key={option.id}
            className={filter === option.id ? "is-active" : ""}
            aria-pressed={filter === option.id}
            onClick={() => {
              setFilter(option.id);
              onKeyboardFocus(null);
            }}
          >
            {option.label}
          </button>
        ))}
      </div>

      {filteredItems.length === 0 ? (
        <p className="world-navigator__empty">No matching subjects are present.</p>
      ) : (
        <ul
          className="world-navigator__list"
          aria-label={`${FILTERS.find((option) => option.id === filter)?.label ?? "World subjects"} in spatial order`}
          onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget)) onKeyboardFocus(null);
          }}
        >
          {filteredItems.map((item, index) => {
            const key = worldRefKey(item.ref);
            const selected = sameWorldRef(selectedRef, item.ref);
            const focused = sameWorldRef(focusedRef, item.ref);
            return (
              <li key={key}>
                <button
                  ref={(node) => {
                    if (node) buttonRefs.current.set(key, node);
                    else buttonRefs.current.delete(key);
                  }}
                  type="button"
                  className={`world-navigator__item ${selected ? "is-selected" : ""} ${focused ? "is-focused" : ""}`}
                  tabIndex={key === rovingKey ? 0 : -1}
                  aria-pressed={selected}
                  aria-label={item.accessibleName}
                  onClick={() => onSelect(item.ref)}
                  onFocus={() => {
                    setRovingKey(key);
                    onKeyboardFocus(item.ref);
                  }}
                  onKeyDown={(event) => handleItemKeyDown(event, item, index)}
                  onPointerEnter={() => onHover(item.ref)}
                >
                  <NavigatorMark item={item} />
                  <span className="world-navigator__item-copy">
                    <span className="world-navigator__item-title">
                      <strong>{item.title}</strong>
                      <span>{item.kindLabel}</span>
                    </span>
                    <span>{item.detail}</span>
                    {item.alerts.length > 0 ? (
                      <em className="world-navigator__alert">
                        Alert: {item.alerts.join(" · ")}
                      </em>
                    ) : null}
                  </span>
                  <span className="world-navigator__location" aria-hidden="true">
                    <MapPin size={11} />
                    {coordinate(item.x)},{coordinate(item.y)}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <p className="world-navigator__help">
        Arrow keys browse in spatial order. Enter or Space selects. Escape returns to the
        active filter.
      </p>
    </section>
  );
}
