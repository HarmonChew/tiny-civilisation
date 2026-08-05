import {
  SCENARIO_DEFINITION_VERSION,
  SCENARIO_IDS,
  SCENARIO_MAP_GENERATION_VERSION,
  type ScenarioId,
  type ScenarioMetadata,
} from "./types.js";

function metadata(
  value: Omit<ScenarioMetadata, "scenarioVersion" | "mapGenerationVersion">,
): ScenarioMetadata {
  return Object.freeze({
    ...value,
    scenarioVersion: SCENARIO_DEFINITION_VERSION,
    mapGenerationVersion: SCENARIO_MAP_GENERATION_VERSION,
    startingFacts: Object.freeze([...value.startingFacts]),
    observableTensions: Object.freeze([...value.observableTensions]),
  });
}

export const SCENARIO_CATALOG: readonly ScenarioMetadata[] = Object.freeze([
  metadata({
    scenarioId: "petri-world",
    name: "Common Store",
    role: "Reference world",
    dramaticQuestion:
      "Can scarcity turn sharing into a durable common reserve before theft hardens rivalry?",
    startingFacts: [
      "Seven creatures begin close together west of the central passage; Taro begins on their edge.",
      "The nearest food patch is small, while a richer patch lies across the passage.",
      "Building material begins between the starting cluster and the passage.",
      "One finite potable-water source lies in the eastern shallows.",
    ],
    observableTensions: [
      "Sharing and private reserves compete under early food pressure.",
      "A common store can attract contribution, guarding, theft, and conflict.",
      "The central passage controls access to the richer eastern food patch.",
      "Water trips expose the cost of reaching the eastern bank.",
    ],
  }),
  metadata({
    scenarioId: "split-banks",
    name: "Split Banks",
    role: "Topology and proximity contrast",
    dramaticQuestion:
      "Will two clusters become separate communities, or will the passage draw them into one?",
    startingFacts: [
      "Two clusters of four begin on opposite banks of a narrow central passage.",
      "Each bank has moderate food with the same combined starting stock as the reference world.",
      "The only material patch sits inside the passage between the two clusters.",
      "A slowly renewing potable-water source sits in the passage itself.",
    ],
    observableTensions: [
      "Passage crossings make first contact and route concentration visible.",
      "Separate groups and stores can emerge before cross-bank familiarity grows.",
      "Shared access to material can pull otherwise independent clusters together.",
      "Water access can turn the passage into a visible bottleneck.",
    ],
  }),
  metadata({
    scenarioId: "scattered-plenty",
    name: "Scattered Plenty",
    role: "Dependence contrast",
    dramaticQuestion:
      "If nobody needs anyone immediately, will familiarity and sharing become a community?",
    startingFacts: [
      "Four separated pairs begin around an open world rather than in one cluster.",
      "Abundant food is distributed near every pair.",
      "Building material is central, away from every starting pair.",
      "Four renewable potable-water sources are distributed through the central shallows.",
    ],
    observableTensions: [
      "Foraging and private-reserve routines can persist without immediate cooperation.",
      "Contact, sharing, group formation, and storage may arrive late or remain absent.",
      "The central material patch creates a later reason for routes to converge.",
      "Distributed water can keep hydration routes from collapsing onto one corridor.",
    ],
  }),
  metadata({
    scenarioId: "unequal-table",
    name: "Unequal Table",
    role: "Need and trait-distribution contrast",
    dramaticQuestion:
      "Will outsiders receive help before the common store becomes a target?",
    startingFacts: [
      "Five comparatively cooperative creatures begin west of the passage.",
      "Taro and two more aggressive creatures begin together on the eastern bank.",
      "Food, material, and terrain match the reference world while water access carries an added contrast.",
      "The thirstier western starters begin across the passage from two eastern water sources.",
    ],
    observableTensions: [
      "The hungriest and least-social creature begins far from the cooperative cluster.",
      "Cross-bank sharing and join attempts can compete with private reserves and theft.",
      "Witnessing, fear, rivalry, guarding, confrontation, and flight remain attributable to actual events.",
      "Unequal starting need and access make water assistance and route pressure observable.",
    ],
  }),
]);

const METADATA_BY_ID = new Map(
  SCENARIO_CATALOG.map((entry) => [entry.scenarioId, entry] as const),
);

if (
  SCENARIO_CATALOG.length !== SCENARIO_IDS.length ||
  SCENARIO_IDS.some((id) => !METADATA_BY_ID.has(id))
) {
  throw new Error(
    "The scenario catalog must contain every supported scenario exactly once.",
  );
}

export function getScenarioMetadata(scenarioId: ScenarioId): ScenarioMetadata {
  const entry = METADATA_BY_ID.get(scenarioId);
  if (!entry) throw new Error(`Unsupported scenario ${scenarioId}.`);
  return entry;
}
