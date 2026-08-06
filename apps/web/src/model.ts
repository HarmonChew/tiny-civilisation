import type { ReasonFact, ScenarioReferenceV2 } from "@tiny-civ/sim-core";

export type EntityId = number;

export type TimelineCategory =
  "all" | "social" | "resources" | "conflict" | "group" | "player";

export type InterventionTool =
  | "inspect"
  | "add-food"
  | "remove-food"
  | "add-material"
  | "remove-material"
  | "replenish-water"
  | "drain-water"
  | "obstacle";

export interface Point {
  x: number;
  y: number;
}

export interface TileView {
  index: number;
  x: number;
  y: number;
  terrain: string;
  blocked: boolean;
  fertility: number;
  hazard: number;
}

export interface ResourceView {
  id: EntityId;
  kind: string;
  x: number;
  y: number;
  stock: number;
  capacity: number;
  access?: {
    interactionCapacity: number;
    claimedInteractionSlots: number;
    reachableCreatures: number;
    livingCreatures: number;
    nearestWeightedCost: number | null;
    meanWeightedCost: number | null;
  };
}

export interface StructureView {
  id: EntityId;
  kind: string;
  x: number;
  y: number;
  groupId?: EntityId | undefined;
  progress: number;
  stored: number;
  capacity: number;
  materialDeposited?: number | undefined;
  materialRequired?: number | undefined;
  workRequired?: number | undefined;
  storedMaterial?: number | undefined;
  condition?: number | undefined;
  baseCapacity?: number | undefined;
  effectiveCapacity?: number | undefined;
  reservedSpaces?: number | undefined;
  restingCreatures?: number | undefined;
  memberOccupancy?: number | undefined;
  guestOccupancy?: number | undefined;
  upkeepNeeded?: boolean | undefined;
  siteAssessment?: ShelterSiteAssessmentView | undefined;
  builtFromShelterId?: EntityId | undefined;
}

export interface ShelterSiteAssessmentView {
  selectedAtTick: number;
  memberTravelCost: number;
  storageTravelCost: number;
  foodAccessCost: number;
  materialAccessCost: number;
  waterAccessCost: number;
  crowdingCost: number;
  constructionInvestmentCost: number;
  relocationChangeCost: number;
  totalScore: number;
}

export interface TraitView {
  key: string;
  label: string;
  value: number;
}

export interface InventoryView {
  kind: string;
  quantity: number;
}

export interface UtilityFactorView {
  key: string;
  label: string;
  contribution: number;
  evidenceEventIds: number[];
  factLabel?: string | undefined;
  factValue?: number | string | undefined;
  factUnit?: ReasonFact["unit"] | undefined;
}

export interface CandidateView {
  action: string;
  desire: string;
  plan: string;
  targetId?: EntityId | undefined;
  utility: number;
  factors: UtilityFactorView[];
  selected: boolean;
}

export interface MemoryView {
  id: number;
  kind: string;
  subjectId?: EntityId | undefined;
  strength: number;
  valence: number;
  ageTicks: number;
  sourceEventIds: number[];
}

export interface RelationshipView {
  otherId: EntityId;
  otherName: string;
  direction: "toward" | "from";
  trust: number;
  fear: number;
  familiarity: number;
  rivalry: number;
}

export interface CreatureView {
  id: EntityId;
  name: string;
  color: number;
  x: number;
  y: number;
  alive: boolean;
  groupId?: EntityId | undefined;
  role: string;
  desire: string;
  plan: string;
  goal: string;
  action: string;
  actionPhase: string;
  reason: string;
  summary: {
    desire: string;
    plan: string;
    action: string;
    reason: string;
  };
  goalTarget?: Point | undefined;
  route: Array<Point & { tick: number }>;
  interactionSlot?: Point | undefined;
  waterAccess?:
    | {
        sourceId: EntityId;
        sourceStock: number;
        sourceCapacity: number;
        weightedCost: number;
        reachableSources: number;
        totalSources: number;
        interactionCapacity: number;
        claimedInteractionSlots: number;
      }
    | undefined;
  shelterAccess?:
    | {
        shelterId: EntityId | null;
        weightedCost: number | null;
        eligibility: "MEMBER" | "TRUSTED_GUEST" | "INELIGIBLE" | null;
        condition: number | null;
        effectiveCapacity: number;
        reservedSpaces: number;
        restingCreatures: number;
        destination: "SHELTERED" | "OUTDOOR" | "NONE";
        reason: string;
      }
    | undefined;
  health: number;
  hunger: number;
  fatigue: number;
  thirst: number;
  traits: TraitView[];
  inventory: InventoryView[];
  candidates: CandidateView[];
  memories: MemoryView[];
  relationships: RelationshipView[];
}

export interface GroupView {
  id: EntityId;
  name: string;
  stage?: "PROVISIONAL" | "PERSISTENT" | undefined;
  memberIds: EntityId[];
  leaderId?: EntityId | undefined;
  home?: Point | undefined;
  cohesion: number;
  sharingNorm: number;
  conflictNorm: number;
  storageIds: EntityId[];
  activeShelterId?: EntityId | undefined;
  pendingShelterId?: EntityId | undefined;
  shelterRelocations?: number | undefined;
  shelterCommitUntilTick?: number | undefined;
  shelterRelocationCandidate?:
    | {
        tileIndex: number;
        firstSeenTick: number;
        lastEvaluatedTick: number;
        consecutiveEvaluations: number;
        scoreImprovement: number;
      }
    | undefined;
}

export interface TimelineEventView {
  id: number;
  tick: number;
  category: Exclude<TimelineCategory, "all">;
  type: string;
  title: string;
  detail: string;
  /** Plain factual reason retained with the linked authoritative decision. */
  reason?: string | undefined;
  actorIds: EntityId[];
  targetIds: EntityId[];
  /** Authoritative group subjects retained separately from entity targets. */
  groupIds?: EntityId[] | undefined;
  causedByEventIds: number[];
  importance: number;
  attentionTier: "ROUTINE" | "NOTABLE" | "SIGNIFICANT" | "CRITICAL";
  clusterKey: string;
  locationTileIndex?: number | undefined;
  commandId?: number | undefined;
  /** Original domain-event ID when a command event is presented through history. */
  commandSourceEventId?: number | undefined;
  commandOutcome?: "APPLIED" | "REJECTED" | undefined;
  commandRejectionReason?:
    "OCCUPIED_TILE" | "NO_WATER_SOURCE" | "SOURCE_FULL" | "SOURCE_EMPTY" | undefined;
  playerCaused: boolean;
  decisionActorId?: EntityId | undefined;
  decisionCandidates?: CandidateView[] | undefined;
}

export interface ScenarioView {
  reference: ScenarioReferenceV2;
  compiledMapHash: string;
  name: string;
  role: string;
  dramaticQuestion: string;
  startingFacts: string[];
  observableTensions: string[];
  landmarks: readonly ScenarioLandmarkView[];
}

export interface ScenarioLandmarkView {
  kind: "REGION" | "CHOKEPOINT";
  id: string;
  label: string;
  tileIndices: readonly number[];
}

export interface WorldView {
  scenario: ScenarioView;
  tick: number;
  timeLabel: string;
  hash: string;
  /** Tick of the latest explicitly verified canonical hash. */
  hashTick?: number | undefined;
  width: number;
  height: number;
  tiles: TileView[];
  creatures: CreatureView[];
  resources: ResourceView[];
  structures: StructureView[];
  groups: GroupView[];
  events: TimelineEventView[];
  population: number;
  foodStock: number;
}

export interface OverlaySettings {
  resources: boolean;
  intentions: boolean;
  groups: boolean;
  traffic: boolean;
}

export interface WorldAction {
  tile: TileView;
  worldPosition: Point;
}
