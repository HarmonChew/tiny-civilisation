export type EntityId = number;
export type GroupId = number;
export type Tick = number;
export type Unit = number;
export type FixedPosition = number;

export const TILE_FIXED_UNITS = 256;

export type TerrainKind = "GROUND" | "SHALLOW_WATER" | "ROCK";
export type ResourceKind = "FOOD" | "MATERIAL";
export type InventoryKind = ResourceKind;

export interface TileState {
  index: number;
  x: number;
  y: number;
  terrain: TerrainKind;
  walkCost: number;
  blocked: boolean;
  navigationRevision: number;
}

export interface WorldState {
  width: number;
  height: number;
  tiles: TileState[];
  navigationRevision: number;
}

export interface Inventory {
  capacity: number;
  food: number;
  material: number;
}

export interface CreatureNeeds {
  hunger: Unit;
  fatigue: Unit;
}

export interface CreatureTraits {
  generosity: Unit;
  aggression: Unit;
  sociability: Unit;
  loyalty: Unit;
}

export interface CreatureSkills {
  foraging: Unit;
  combat: Unit;
}

export type ActionKind =
  | "EXPLORE"
  | "GATHER_FOOD"
  | "GATHER_MATERIAL"
  | "EAT"
  | "REST"
  | "SHARE"
  | "KEEP"
  | "STEAL"
  | "DEPOSIT"
  | "WITHDRAW"
  | "BUILD_STORAGE"
  | "GUARD"
  | "ATTACK"
  | "FLEE"
  | "JOIN_GROUP";

export type ActionPhase = "MOVING" | "WORKING";

export interface UtilityFactor {
  key: string;
  contribution: number;
  evidenceEventIds: number[];
}

export interface DecisionCandidate {
  action: ActionKind;
  targetEntityId: EntityId | null;
  targetTileIndex: number | null;
  utility: number;
  factors: UtilityFactor[];
}

export type DecisionSwitchReason =
  | "NO_ACTIVE_GOAL"
  | "GOAL_COMPLETED"
  | "EMERGENCY_INTERRUPT"
  | "TARGET_INVALID"
  | "NEW_OPTION_EXCEEDED_HYSTERESIS"
  | "SCHEDULED_RECONSIDERATION";

export interface DecisionRecord {
  id: number;
  tick: Tick;
  actorId: EntityId;
  previousAction: ActionKind | null;
  selectedAction: ActionKind;
  selectedTargetId: EntityId | null;
  switchReason: DecisionSwitchReason;
  candidates: DecisionCandidate[];
}

export interface ActiveGoal {
  kind: ActionKind;
  targetEntityId: EntityId | null;
  targetTileIndex: number | null;
  selectedAtTick: Tick;
  minimumCommitUntilTick: Tick;
  nextReconsiderationTick: Tick;
  expectedUtility: number;
  decisionRecordId: number;
}

export interface ActiveAction {
  kind: ActionKind;
  phase: ActionPhase;
  startedAtTick: Tick;
  targetEntityId: EntityId | null;
  targetTileIndex: number | null;
  path: number[];
  pathIndex: number;
  progress: Unit;
  workRequired: Unit;
  navigationRevision: number;
}

export type CreatureRole =
  | "FORAGER"
  | "BUILDER"
  | "GUARD"
  | "LEADER"
  | "DRIFTER";

export interface CreatureState {
  id: EntityId;
  name: string;
  color: number;
  alive: boolean;
  tileIndex: number;
  x: FixedPosition;
  y: FixedPosition;
  health: Unit;
  needs: CreatureNeeds;
  traits: CreatureTraits;
  skills: CreatureSkills;
  inventory: Inventory;
  groupId: GroupId | null;
  role: CreatureRole;
  activeGoal: ActiveGoal | null;
  activeAction: ActiveAction | null;
  nextDecisionTick: Tick;
  lastActionKind: ActionKind | null;
  lastActionTick: Tick;
  actionCounts: Record<ActionKind, number>;
  memoryIds: number[];
}

export interface ResourceNode {
  id: EntityId;
  kind: ResourceKind;
  tileIndex: number;
  currentStock: number;
  maximumStock: number;
  regenerationEveryTicks: number;
  regenerationAmount: number;
}

export type StructureKind = "STORAGE" | "STORAGE_SITE";

export interface StructureState {
  id: EntityId;
  kind: StructureKind;
  tileIndex: number;
  groupId: GroupId;
  material: number;
  materialRequired: number;
  progress: Unit;
  workRequired: Unit;
  inventory: Inventory;
  guardIds: EntityId[];
  completedTick: Tick | null;
}

export interface GroupState {
  id: GroupId;
  name: string;
  stage: "PROVISIONAL" | "PERSISTENT";
  foundedTick: Tick;
  memberIds: EntityId[];
  leaderId: EntityId | null;
  homeTileIndex: number;
  storageStructureId: EntityId | null;
  cohesion: Unit;
  sharingNorm: number;
  majorEventIds: number[];
}

export type MemoryKind =
  | "HELP_RECEIVED"
  | "THEFT_OBSERVED"
  | "HARM_RECEIVED"
  | "RESOURCE_FOUND"
  | "GROUP_FOUNDED";

export interface EpisodicMemory {
  id: number;
  ownerId: EntityId;
  kind: MemoryKind;
  createdTick: Tick;
  subjectEntityId: EntityId | null;
  locationTileIndex: number | null;
  valence: number;
  importance: Unit;
  strength: Unit;
  sourceEventIds: number[];
}

export interface RelationshipEdge {
  id: number;
  fromId: EntityId;
  toId: EntityId;
  trust: number;
  fear: Unit;
  familiarity: Unit;
  rivalry: Unit;
  lastInteractionTick: Tick;
  significantEventIds: number[];
}

export type DomainEventType =
  | "SIMULATION_STARTED"
  | "PLAYER_ADDED_FOOD"
  | "PLAYER_REMOVED_FOOD"
  | "PLAYER_TOGGLED_OBSTACLE"
  | "ACTION_STARTED"
  | "FOOD_GATHERED"
  | "MATERIAL_GATHERED"
  | "FOOD_EATEN"
  | "FOOD_SHARED"
  | "THEFT_COMMITTED"
  | "THEFT_WITNESSED"
  | "FOOD_DEPOSITED"
  | "FOOD_WITHDRAWN"
  | "MATERIAL_DEPOSITED"
  | "STORAGE_SITE_STARTED"
  | "STORAGE_COMPLETED"
  | "CREATURE_ATTACKED"
  | "CREATURE_FLED"
  | "CREATURE_GUARDED"
  | "CREATURE_JOINED_GROUP"
  | "GROUP_FOUNDED"
  | "LEADER_SELECTED";

export interface DomainEvent {
  id: number;
  tick: Tick;
  type: DomainEventType;
  actorIds: EntityId[];
  targetIds: EntityId[];
  groupIds: GroupId[];
  locationTileIndex: number | null;
  resourceKind: ResourceKind | null;
  quantity: number;
  causedByEventIds: number[];
  decisionRecordIds: number[];
  importance: number;
  summary: string;
}

export type HistoricalEventType =
  | "INTERVENTION"
  | "GROUP_FORMED"
  | "LEADERSHIP"
  | "STORAGE_BUILT"
  | "SOCIAL_BOND"
  | "THEFT"
  | "CONFRONTATION";

export interface HistoricalEvent {
  id: number;
  tick: Tick;
  type: HistoricalEventType;
  title: string;
  summary: string;
  sourceEventIds: number[];
  actorIds: EntityId[];
  groupIds: GroupId[];
  importance: number;
}

export interface SimulationMetrics {
  foodGathered: number;
  foodShared: number;
  thefts: number;
  witnessedThefts: number;
  attacks: number;
  groupsFormed: number;
  storagesCompleted: number;
  playerInterventions: number;
  invalidPathFailures: number;
}

export interface SimulationConfiguration {
  ticksPerSecond: number;
  maxDomainEvents: number;
  maxHistoryEvents: number;
  maxDecisionRecords: number;
  maxMemoriesPerCreature: number;
  maxRelationshipsPerCreature: number;
}

export interface SimulationState {
  schemaVersion: number;
  seed: number;
  tick: Tick;
  nextEntityId: EntityId;
  nextCommandId: number;
  nextEventId: number;
  nextHistoryId: number;
  nextDecisionId: number;
  nextMemoryId: number;
  nextRelationshipId: number;
  nextGroupId: GroupId;
  randomState: number;
  world: WorldState;
  creatures: CreatureState[];
  resourceNodes: ResourceNode[];
  structures: StructureState[];
  groups: GroupState[];
  relationships: RelationshipEdge[];
  memories: EpisodicMemory[];
  commandQueue: ScheduledPlayerCommand[];
  domainEvents: DomainEvent[];
  historyEvents: HistoricalEvent[];
  decisionRecords: DecisionRecord[];
  metrics: SimulationMetrics;
  configuration: SimulationConfiguration;
}

export interface AddFoodCommand {
  type: "ADD_FOOD";
  applyAtTick?: Tick;
  tileIndex?: number;
  x?: number;
  y?: number;
  amount?: number;
}

export interface RemoveFoodCommand {
  type: "REMOVE_FOOD";
  applyAtTick?: Tick;
  tileIndex?: number;
  x?: number;
  y?: number;
  amount?: number;
}

export interface ToggleObstacleCommand {
  type: "TOGGLE_OBSTACLE";
  applyAtTick?: Tick;
  tileIndex?: number;
  x?: number;
  y?: number;
  blocked?: boolean;
}

export type PlayerCommand =
  | AddFoodCommand
  | RemoveFoodCommand
  | ToggleObstacleCommand;

export interface ScheduledPlayerCommand {
  commandId: number;
  applyAtTick: Tick;
  type: PlayerCommand["type"];
  tileIndex: number;
  amount: number;
  blocked: boolean | null;
}

export interface RenderTile {
  index: number;
  x: number;
  y: number;
  terrain: TerrainKind;
  blocked: boolean;
}

export interface RenderCreature {
  id: EntityId;
  name: string;
  color: number;
  x: number;
  y: number;
  tileIndex: number;
  health: Unit;
  hunger: Unit;
  fatigue: Unit;
  food: number;
  material: number;
  groupId: GroupId | null;
  role: CreatureRole;
  action: ActionKind | null;
  targetTileIndex: number | null;
}

export interface RenderResourceNode {
  id: EntityId;
  kind: ResourceKind;
  tileIndex: number;
  currentStock: number;
  maximumStock: number;
}

export interface RenderStructure {
  id: EntityId;
  kind: StructureKind;
  tileIndex: number;
  groupId: GroupId;
  progress: Unit;
  food: number;
  material: number;
  guardIds: EntityId[];
}

export interface RenderSnapshot {
  tick: Tick;
  timeLabel: string;
  width: number;
  height: number;
  tiles: RenderTile[];
  creatures: RenderCreature[];
  resourceNodes: RenderResourceNode[];
  structures: RenderStructure[];
  groups: GroupState[];
  recentEvents: DomainEvent[];
  historyEvents: HistoricalEvent[];
  metrics: SimulationMetrics;
}
