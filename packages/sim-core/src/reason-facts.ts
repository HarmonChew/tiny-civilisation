import type {
  ReasonFact,
  ReasonFactKind,
  SimulationState,
  UtilityFactor,
} from "./types.js";

export const REASON_FACT_KIND_ORDER = [
  "NEED",
  "INVENTORY",
  "MEMORY",
  "RELATIONSHIP",
  "ROLE",
  "GROUP",
  "RESOURCE",
  "STRUCTURE",
  "TRAVEL",
  "CROWDING",
  "INTERVENTION",
  "TRAIT",
  "WORLD",
  "LIFECYCLE",
] as const satisfies readonly ReasonFactKind[];

const implementationOnly = new Set([
  "bounded decision variation",
  "goal continuity",
  "plan continuity",
]);

function humanize(value: string): string {
  return value.replaceAll("_", " ").replace(/^\w/, (letter) => letter.toUpperCase());
}

function kindForKey(key: string): ReasonFactKind {
  if (
    /family|child|parent|pregnan|birth|mourn|estate|heir|life stage|population/i.test(key)
  ) {
    return "LIFECYCLE";
  }
  if (/hunger|thirst|fatigue|injury|health|rest|hydration/i.test(key)) return "NEED";
  if (/carried|reserve|surplus|inventory/i.test(key)) return "INVENTORY";
  if (/remember|grievance/i.test(key)) return "MEMORY";
  if (/trust|fear|rivalry|affinity/i.test(key)) return "RELATIONSHIP";
  if (/loyalty|generous|aggress|social disposition|private preference/i.test(key)) {
    return "TRAIT";
  }
  if (/group|communal|member/i.test(key)) return "GROUP";
  if (/storage|store|guard/i.test(key)) return "STRUCTURE";
  if (/food|water|material|stock|forag|resource|source/i.test(key)) return "RESOURCE";
  if (/travel|distance|route/i.test(key)) return "TRAVEL";
  if (/crowd|slot|witness/i.test(key)) return "CROWDING";
  return "WORLD";
}

export function captureReasonFact(
  state: SimulationState,
  key: string,
  snapshot: Pick<ReasonFact, "value" | "unit" | "sourceEntityId">,
  evidenceEventIds: readonly number[] = [],
): ReasonFact | null {
  if (implementationOnly.has(key)) return null;
  return {
    kind: kindForKey(key),
    key,
    label: humanize(key),
    value: typeof snapshot.value === "number" ? Math.round(snapshot.value) : snapshot.value,
    unit: snapshot.unit,
    sourceEntityId: snapshot.sourceEntityId,
    sourceEventIds: [...evidenceEventIds],
    capturedAtTick: state.tick,
  };
}

export function selectStrongestReason(
  factors: readonly UtilityFactor[],
): ReasonFact | null {
  const kindRank = new Map(REASON_FACT_KIND_ORDER.map((kind, index) => [kind, index]));
  return (
    factors
      .filter((factor) => factor.contribution > 0 && !implementationOnly.has(factor.key))
      .sort(
        (left, right) =>
          right.contribution - left.contribution ||
          (left.fact === null ? 1 : 0) - (right.fact === null ? 1 : 0) ||
          (kindRank.get(left.fact?.kind ?? "WORLD") ?? 99) -
            (kindRank.get(right.fact?.kind ?? "WORLD") ?? 99) ||
          left.key.localeCompare(right.key) ||
          (left.fact?.sourceEntityId ?? -1) - (right.fact?.sourceEntityId ?? -1),
      )[0]?.fact ?? null
  );
}

export function reasonFactText(fact: ReasonFact | null): string {
  if (!fact) return "is reconsidering what matters";
  switch (fact.key) {
    case "personal hunger":
    case "urgent hunger":
      return "hunger is pressing";
    case "personal thirst":
    case "urgent thirst":
      return "thirst is pressing";
    case "need for rest":
    case "personal fatigue":
      return "fatigue is rising";
    case "recipient hunger":
      return "someone nearby is hungry";
    case "recipient thirst":
      return "someone nearby is severely thirsty";
    case "remembered grievance":
      return "a recent grievance is still vivid";
    case "fear of aggressor":
    case "fear of target":
      return "a remembered threat feels close";
    case "protect shared storage":
      return "the shared store needs watching";
    case "group needs a store":
    case "shared storage opportunity":
      return "their group still needs a shared store";
    case "empty food reserve":
      return "they have no food in reserve";
    case "known stock":
      return "food is known to be available there";
    case "known water stock":
      return "potable water is known to be available there";
    case "keep a reserve":
      return "keeping a reserve matters to them";
    default:
      return `the retained “${fact.label.toLowerCase()}” factor weighs most`;
  }
}
