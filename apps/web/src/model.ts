export type EntityId = number;

export type TimelineCategory =
  | "all"
  | "social"
  | "resources"
  | "conflict"
  | "group"
  | "player";

export type InterventionTool = "inspect" | "add-food" | "remove-food" | "obstacle";

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
}

export interface CandidateView {
  action: string;
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
  goal: string;
  action: string;
  goalTarget?: Point | undefined;
  health: number;
  hunger: number;
  fatigue: number;
  traits: TraitView[];
  inventory: InventoryView[];
  candidates: CandidateView[];
  memories: MemoryView[];
  relationships: RelationshipView[];
}

export interface GroupView {
  id: EntityId;
  name: string;
  memberIds: EntityId[];
  leaderId?: EntityId | undefined;
  home?: Point | undefined;
  cohesion: number;
  sharingNorm: number;
  conflictNorm: number;
  storageIds: EntityId[];
}

export interface TimelineEventView {
  id: number;
  tick: number;
  category: Exclude<TimelineCategory, "all">;
  type: string;
  title: string;
  detail: string;
  actorIds: EntityId[];
  targetIds: EntityId[];
  causedByEventIds: number[];
  importance: number;
  playerCaused: boolean;
  decisionActorId?: EntityId | undefined;
  decisionCandidates?: CandidateView[] | undefined;
}

export interface WorldView {
  tick: number;
  timeLabel: string;
  hash: string;
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
}

export interface WorldAction {
  tile: TileView;
  worldPosition: Point;
}
