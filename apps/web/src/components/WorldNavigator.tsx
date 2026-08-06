import {
  Apple,
  Boxes,
  CircleDot,
  Droplets,
  Hammer,
  MapPin,
  Sprout,
  UsersRound,
} from "lucide-react";
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
  GroupView,
  ResourceView,
  StructureView,
  TimelineEventView,
  WorldView,
} from "../model";
import { identityGlyph } from "./pixi/visual-grammar";
import { deriveTrafficTrails } from "./pixi/traffic-trails";
import { humanize } from "./ui";

export type WorldNavigatorFilter =
  "all" | "creatures" | "groups" | "resources" | "structures";

type NavigableWorldRef = Extract<
  WorldRef,
  { kind: "creature" | "group" | "resource" | "structure" }
>;

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
  readonly group?: GroupView;
  readonly resource?: ResourceView;
  readonly structure?: StructureView;
}

const FILTERS: ReadonlyArray<{
  readonly id: WorldNavigatorFilter;
  readonly label: string;
}> = [
  { id: "all", label: "All" },
  { id: "creatures", label: "Creatures" },
  { id: "groups", label: "Groups" },
  { id: "resources", label: "Resources" },
  { id: "structures", label: "Structures" },
];

const ATTENTION_DEBOUNCE_MS = 400;

const coordinate = (value: number): string =>
  Number.isInteger(value) ? value.toString() : value.toFixed(1).replace(/\.0$/, "");

const locationLabel = (x: number, y: number): string =>
  `column ${coordinate(x)}, row ${coordinate(y)}`;

const resourceTitle = (resource: ResourceView): string =>
  /WATER/i.test(resource.kind) ? "Water source" : `${humanize(resource.kind)} resource`;

const structureTitle = (structure: StructureView): string => humanize(structure.kind);

const structureState = (structure: StructureView): string => {
  if (structure.kind === "SHELTER_SITE") {
    return `${Math.max(0, Math.min(100, Math.round(structure.progress)))} percent built; selected communal shelter site`;
  }
  if (structure.kind === "ABANDONED_SHELTER") {
    return `abandoned shelter; condition ${Math.round(structure.condition ?? 0)} percent`;
  }
  if (structure.kind === "SHELTER") {
    return [
      `condition ${Math.round(structure.condition ?? 0)} percent`,
      `${structure.restingCreatures ?? 0} resting and ${structure.reservedSpaces ?? 0} reserved of ${structure.effectiveCapacity ?? 0} usable spaces`,
      `${structure.memberOccupancy ?? 0} members and ${structure.guestOccupancy ?? 0} guests inside`,
      structure.upkeepNeeded ? "upkeep needed" : "upkeep stable",
    ].join("; ");
  }
  return structure.progress >= 99
    ? `complete, ${structure.stored} of ${structure.capacity} units stored`
    : `${Math.max(0, Math.min(100, Math.round(structure.progress)))} percent built`;
};

function structureAlerts(structure: StructureView): string[] {
  if (structure.kind !== "SHELTER") return [];
  return [
    ...(structure.upkeepNeeded ? ["shelter needs upkeep"] : []),
    ...((structure.reservedSpaces ?? 0) >= (structure.effectiveCapacity ?? 1)
      ? ["all shelter spaces reserved"]
      : []),
  ];
}

function creatureAlerts(creature: CreatureView): string[] {
  return [
    ...(creature.health <= 40 ? ["health risk"] : []),
    ...(creature.hunger >= 75 ? ["high hunger"] : []),
    ...(creature.thirst >= 75 ? ["high thirst"] : []),
    ...(creature.fatigue >= 80 ? ["exhausted"] : []),
    ...(creature.action === "FLEE" ? ["fleeing a threat"] : []),
    ...(creature.action === "ATTACK" ? ["in a confrontation"] : []),
  ];
}

const carriedWater = (creature: CreatureView): number =>
  creature.inventory
    .filter((stack) => /WATER/i.test(stack.kind))
    .reduce((total, stack) => total + Math.max(0, stack.quantity), 0);

function resourceAlerts(resource: ResourceView): string[] {
  if (!/WATER/i.test(resource.kind)) return [];
  if (resource.stock <= 0) return ["water source depleted"];
  if (resource.capacity > 0 && resource.stock / resource.capacity <= 0.25) {
    return ["water source low"];
  }
  return [];
}

function resourceAccessSummary(resource: ResourceView): string | null {
  if (!/WATER/i.test(resource.kind) || !resource.access) return null;
  const access = resource.access;
  const nearest =
    access.nearestWeightedCost === null
      ? "no reachable interaction slot"
      : `nearest weighted travel cost ${access.nearestWeightedCost} move-cost units`;
  return `${access.claimedInteractionSlots} of ${access.interactionCapacity} interaction slots claimed; current access for ${access.reachableCreatures} of ${access.livingCreatures} living creatures; ${nearest}`;
}

export function buildWorldNavigatorItems(view: WorldView): WorldNavigatorItem[] {
  const creatures: WorldNavigatorItem[] = view.creatures
    .filter((creature) => creature.alive)
    .map((creature) => {
      const alerts = creatureAlerts(creature);
      const water = carriedWater(creature);
      return {
        ref: { kind: "creature", id: creature.id },
        category: "creatures",
        id: creature.id,
        x: creature.x,
        y: creature.y,
        title: creature.name,
        kindLabel: creature.role,
        detail: `${humanize(creature.action)} · thirst ${Math.round(creature.thirst)}% · ${water} water carried`,
        accessibleName: [
          creature.name,
          creature.role,
          "creature",
          `at ${locationLabel(creature.x, creature.y)}`,
          `wants ${humanize(creature.desire)}`,
          `plans ${humanize(creature.plan)}`,
          `now ${humanize(creature.action)}`,
          `thirst ${Math.round(creature.thirst)} percent`,
          `carrying ${water} water units`,
          alerts.length > 0 ? `alert: ${alerts.join(", ")}` : null,
          `reason: ${creature.reason}`,
        ]
          .filter((part): part is string => part !== null)
          .join(", "),
        alerts,
        creature,
      };
    });
  const groups: WorldNavigatorItem[] = view.groups.flatMap((group) => {
    if (!group.home) return [];
    const activeShelter = view.structures.find(
      (structure) => structure.id === group.activeShelterId,
    );
    const pendingShelter = view.structures.find(
      (structure) => structure.id === group.pendingShelterId,
    );
    const shelterSummary = activeShelter
      ? `home shelter ${Math.round(activeShelter.condition ?? 0)} percent condition`
      : pendingShelter
        ? `shelter ${Math.round(pendingShelter.progress)} percent built`
        : "no communal shelter";
    return [
      {
        ref: { kind: "group", id: group.id },
        category: "groups",
        id: group.id,
        x: group.home.x,
        y: group.home.y,
        title: group.name,
        kindLabel: group.stage === "PERSISTENT" ? "Persistent group" : "Group",
        detail: `${group.memberIds.length} members; ${shelterSummary}`,
        alerts: activeShelter ? structureAlerts(activeShelter) : [],
        accessibleName: `${group.name}, group at ${locationLabel(group.home.x, group.home.y)}, ${group.memberIds.length} members, ${shelterSummary}`,
        group,
      },
    ];
  });
  const resources: WorldNavigatorItem[] = view.resources.map((resource) => {
    const alerts = resourceAlerts(resource);
    const access = resourceAccessSummary(resource);
    return {
      ref: { kind: "resource", id: resource.id },
      category: "resources",
      id: resource.id,
      x: resource.x,
      y: resource.y,
      title: resourceTitle(resource),
      kindLabel: /WATER/i.test(resource.kind) ? "Water source" : "Resource",
      detail: `${resource.stock} of ${resource.capacity} units available${access ? `; ${access}` : ""}`,
      alerts,
      accessibleName: [
        `${resourceTitle(resource)} ${resource.id}`,
        `at ${locationLabel(resource.x, resource.y)}`,
        `${resource.stock} of ${resource.capacity} units available`,
        access,
        alerts.length > 0 ? `alert: ${alerts.join(", ")}` : null,
      ]
        .filter((part): part is string => part !== null)
        .join(", "),
      resource,
    };
  });
  const structures: WorldNavigatorItem[] = view.structures.map((structure) => {
    const alerts = structureAlerts(structure);
    return {
      ref: { kind: "structure", id: structure.id },
      category: "structures",
      id: structure.id,
      x: structure.x,
      y: structure.y,
      title: structureTitle(structure),
      kindLabel:
        structure.kind === "SHELTER_SITE" || structure.progress < 99
          ? "Construction"
          : structure.kind === "ABANDONED_SHELTER"
            ? "Former home"
            : "Structure",
      detail: structureState(structure),
      alerts,
      accessibleName: [
        `${structureTitle(structure)} ${structure.id}`,
        `at ${locationLabel(structure.x, structure.y)}`,
        structureState(structure),
        alerts.length > 0 ? `alert: ${alerts.join(", ")}` : null,
      ]
        .filter((part): part is string => part !== null)
        .join(", "),
      structure,
    };
  });
  const kindOrder: Record<NavigableWorldRef["kind"], number> = {
    creature: 0,
    group: 1,
    resource: 2,
    structure: 3,
  };

  return [...creatures, ...groups, ...resources, ...structures].sort(
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
  const waterSources = view.resources.filter((resource) => /WATER/i.test(resource.kind));
  const waterStock = waterSources.reduce(
    (total, resource) => total + Math.max(0, resource.stock),
    0,
  );
  const trafficTrails = deriveTrafficTrails(view);
  const busiestTrail = trafficTrails[0];
  const completed = view.structures.filter((structure) => structure.progress >= 99).length;
  const construction = view.structures.length - completed;
  const activeShelters = view.structures.filter(
    (structure) => structure.kind === "SHELTER",
  );
  const shelterSites = view.structures.filter(
    (structure) => structure.kind === "SHELTER_SITE",
  ).length;
  const abandonedShelters = view.structures.filter(
    (structure) => structure.kind === "ABANDONED_SHELTER",
  ).length;
  const shelterOccupancy = activeShelters.reduce(
    (total, shelter) => total + (shelter.restingCreatures ?? 0),
    0,
  );
  const creatureNoun = living.length === 1 ? "creature" : "creatures";
  const tileNoun = occupiedTiles === 1 ? "tile" : "tiles";
  const resourceNoun = view.resources.length === 1 ? "site" : "sites";
  const resourceVerb = view.resources.length === 1 ? "holds" : "hold";
  const structureNoun = completed === 1 ? "structure" : "structures";
  const startingConditions = view.scenario.startingFacts.join(" ");
  const landmarks = view.scenario.landmarks.map((landmark) => landmark.label).join(", ");
  return `${view.scenario.name}, seed ${view.scenario.reference.seed}. ${view.scenario.dramaticQuestion} Starting conditions: ${startingConditions} ${landmarks ? `Named places: ${landmarks}. ` : ""}Current dish: ${view.width} by ${view.height}. ${living.length} living ${creatureNoun} across ${occupiedTiles} occupied ${tileNoun}. ${view.resources.length} resource ${resourceNoun} ${resourceVerb} ${resourceStock} units. ${waterSources.length} water ${waterSources.length === 1 ? "source holds" : "sources hold"} ${waterStock} units. Recent route history contains ${trafficTrails.length} traffic ${trafficTrails.length === 1 ? "trail" : "trails"}${busiestTrail ? `; the busiest was crossed ${busiestTrail.count} times` : ""}. ${completed} complete ${structureNoun} and ${construction} under construction. Settlement: ${activeShelters.length} active shelters with ${shelterOccupancy} creatures resting, ${shelterSites} sites under construction, and ${abandonedShelters} abandoned shelters.`;
}

export function selectedWorldSummary(view: WorldView, selected: WorldRef | null): string {
  if (!selected) return "Nothing selected. Choose a creature or world object to inspect.";
  if (selected.kind === "tile") {
    const tile = view.tiles.find((candidate) => candidate.index === selected.tileIndex);
    if (!tile) return "The selected tile is no longer present in the dish.";
    return `Tile at ${locationLabel(tile.x, tile.y)}. ${humanize(tile.terrain)} terrain; ${tile.blocked ? "blocked" : "walkable"}.`;
  }
  if (selected.kind === "creature") {
    const creature = view.creatures.find((candidate) => candidate.id === selected.id);
    if (!creature) return "The selected creature is no longer present in the dish.";
    return `${creature.name} at ${locationLabel(creature.x, creature.y)}. Thirst ${Math.round(creature.thirst)} percent; carrying ${carriedWater(creature)} water units. ${creature.summary.desire} ${creature.summary.plan} ${creature.summary.action} ${creature.summary.reason}`;
  }
  if (selected.kind === "resource") {
    const resource = view.resources.find((candidate) => candidate.id === selected.id);
    if (!resource) return "The selected resource is no longer present in the dish.";
    const access = resourceAccessSummary(resource);
    return `${resourceTitle(resource)} ${resource.id} at ${locationLabel(resource.x, resource.y)}. ${resource.stock} of ${resource.capacity} units are available.${access ? ` ${access}.` : ""}`;
  }
  if (selected.kind === "structure") {
    const structure = view.structures.find((candidate) => candidate.id === selected.id);
    if (!structure) return "The selected structure is no longer present in the dish.";
    return `${structureTitle(structure)} ${structure.id} at ${locationLabel(structure.x, structure.y)}. ${structureState(structure)}.`;
  }
  if (selected.kind === "group") {
    const group = view.groups.find((candidate) => candidate.id === selected.id);
    if (!group) return "The selected group is no longer present in the dish.";
    const active = view.structures.find(
      (structure) => structure.id === group.activeShelterId,
    );
    const pending = view.structures.find(
      (structure) => structure.id === group.pendingShelterId,
    );
    return `${group.name} has ${group.memberIds.length} members and ${Math.round(group.cohesion)} cohesion. ${active ? `Its active shelter has ${Math.round(active.condition ?? 0)} percent condition and ${active.restingCreatures ?? 0} creatures resting.` : pending ? `Its shelter site is ${Math.round(pending.progress)} percent built.` : "It has no communal shelter."}`;
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
  if (item.group) {
    return (
      <span
        className="world-navigator__mark world-navigator__mark--group"
        aria-hidden="true"
      >
        <UsersRound size={15} />
      </span>
    );
  }
  if (item.resource) {
    return (
      <span
        className="world-navigator__mark world-navigator__mark--resource"
        aria-hidden="true"
      >
        {/WATER/i.test(item.resource.kind) ? (
          <Droplets size={15} />
        ) : /FOOD/i.test(item.resource.kind) ? (
          <Apple size={15} />
        ) : (
          <Boxes size={15} />
        )}
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
  onSelect: (ref: WorldRef) => void;
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
        keyboardFocusedRef.kind !== "group" &&
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

      {view.scenario.landmarks.length > 0 ? (
        <section
          className="world-navigator__landmarks"
          aria-labelledby={`${summaryId}-landmarks`}
        >
          <div>
            <span className="eyebrow">Starting-condition links</span>
            <h3 id={`${summaryId}-landmarks`}>Named places</h3>
          </div>
          <ul>
            {view.scenario.landmarks.map((landmark) => {
              const tileIndex = landmark.tileIndices[0];
              if (tileIndex === undefined) return null;
              const livingHere = view.creatures.filter(
                (creature) =>
                  creature.alive &&
                  landmark.tileIndices.includes(
                    Math.floor(creature.y) * view.width + Math.floor(creature.x),
                  ),
              ).length;
              return (
                <li key={`${landmark.kind}:${landmark.id}`}>
                  <button
                    type="button"
                    aria-label={`Inspect ${landmark.label}, ${landmark.kind === "CHOKEPOINT" ? "chokepoint" : "region"}; ${livingHere.toString()} living creatures currently inside`}
                    onClick={() => onSelect({ kind: "tile", tileIndex })}
                  >
                    <MapPin aria-hidden="true" size={13} />
                    <span>
                      <strong>{landmark.label}</strong>
                      <small>
                        {landmark.kind === "CHOKEPOINT" ? "Chokepoint" : "Region"} /{" "}
                        {livingHere} here now
                      </small>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

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
