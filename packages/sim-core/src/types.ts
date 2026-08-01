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

export type DesireKind =
  | "RELIEVE_HUNGER"
  | "RECOVER_ENERGY"
  | "SECURE_PROVISIONS"
  | "PRESERVE_PRIVATE_RESERVE"
  | "BELONG"
  | "RECIPROCATE_OR_REPAIR"
  | "PROTECT_PERSON_OR_GROUP"
  | "AVOID_THREAT"
  | "COMPLETE_SHARED_WORK";

export type PlanKind =
  | "EAT_CARRIED_FOOD"
  | "FORAGE_FOR_FOOD"
  | "WITHDRAW_SHARED_FOOD"
  | "REST_SAFELY"
  | "BUILD_PRIVATE_RESERVE"
  | "SHARE_WITH_OTHER"
  | "CONTRIBUTE_TO_STORAGE"
  | "JOIN_COMMUNITY"
  | "GUARD_SHARED_ASSET"
  | "CONFRONT_THREAT"
  | "ESCAPE_THREAT"
  | "COMPLETE_STORAGE"
  | "EXPLORE_SURROUNDINGS"
  | "TAKE_FOOD";

export type ReasonFactKind =
  | "NEED"
  | "INVENTORY"
  | "TRAIT"
  | "ROLE"
  | "GROUP"
  | "MEMORY"
  | "RELATIONSHIP"
  | "RESOURCE"
  | "STRUCTURE"
  | "TRAVEL"
  | "CROWDING"
  | "INTERVENTION"
  | "WORLD";

/** A value captured at decision time. UI prose may format it but may not infer beyond it. */
export interface ReasonFact {
  kind: ReasonFactKind;
  key: string;
  label: string;
  value: number | string | null;
  unit: "UNIT" | "COUNT" | "TILES" | "TICKS" | "LABEL" | null;
  sourceEntityId: EntityId | null;
  sourceEventIds: number[];
  capturedAtTick: Tick;
}

export interface UtilityFactor {
  key: string;
  contribution: number;
  evidenceEventIds: number[];
  fact: ReasonFact | null;
}

export interface DecisionCandidate {
  action: ActionKind;
  desire: DesireKind;
  plan: PlanKind;
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
  selectedDesire: DesireKind;
  selectedPlan: PlanKind;
  selectedTargetId: EntityId | null;
  strongestReason: ReasonFact | null;
  switchReason: DecisionSwitchReason;
  candidates: DecisionCandidate[];
}

export interface ActiveDesire {
  kind: DesireKind;
  subjectEntityId: EntityId | null;
  startedAtTick: Tick;
  minimumCommitUntilTick: Tick;
  nextReconsiderationTick: Tick;
  strength: Unit;
  selectedByDecisionId: number;
}

export type PlanStatus = "ACTIVE" | "BLOCKED" | "COMPLETED" | "ABANDONED";

export type InteractionPurpose =
  | "EXPLORE"
  | "GATHER"
  | "REST"
  | "SOCIAL"
  | "STORAGE_ACCESS"
  | "CONSTRUCTION"
  | "GUARD"
  | "CONFLICT"
  | "FLIGHT";

export interface InteractionClaim {
  anchorKind: "RESOURCE" | "STRUCTURE" | "GROUP_HOME" | "CREATURE" | "TILE";
  anchorId: number;
  purpose: InteractionPurpose;
  slotIndex: number;
  tileIndex: number;
  targetX: FixedPosition;
  targetY: FixedPosition;
  claimedAtTick: Tick;
}

export interface ActivePlan {
  kind: PlanKind;
  desireKind: DesireKind;
  targetEntityId: EntityId | null;
  targetTileIndex: number | null;
  startedAtTick: Tick;
  status: PlanStatus;
  selectedByDecisionId: number;
  expectedUtility: number;
  strongestReason: ReasonFact | null;
  interactionClaim: InteractionClaim | null;
}

export interface IntentHistoryEntry {
  tick: Tick;
  desire: DesireKind;
  plan: PlanKind;
  status: PlanStatus;
  reason: ReasonFact | null;
}

export interface RouteSample {
  tick: Tick;
  tileIndex: number;
  x: FixedPosition;
  y: FixedPosition;
}

export interface FactualSummaryClause {
  text: string;
  factRefs: ReasonFact[];
}

export interface CreatureObservationSummary {
  desire: FactualSummaryClause;
  plan: FactualSummaryClause;
  action: FactualSummaryClause;
  reason: FactualSummaryClause;
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
  interactionClaim: InteractionClaim | null;
}

export type CreatureRole = "FORAGER" | "BUILDER" | "GUARD" | "LEADER" | "DRIFTER";

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
  activeDesire: ActiveDesire | null;
  activePlan: ActivePlan | null;
  activeGoal: ActiveGoal | null;
  activeAction: ActiveAction | null;
  nextDecisionTick: Tick;
  lastActionKind: ActionKind | null;
  lastActionTick: Tick;
  actionCounts: Record<ActionKind, number>;
  memoryIds: number[];
  intentHistory: IntentHistoryEntry[];
  recentRoute: RouteSample[];
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
  "HELP_RECEIVED" | "THEFT_OBSERVED" | "HARM_RECEIVED" | "RESOURCE_FOUND" | "GROUP_FOUNDED";

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
  | "DESIRE_CHANGED"
  | "PLAN_CHANGED"
  | "PLAN_BLOCKED"
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
  | "STORAGE_WORK_ADVANCED"
  | "STORAGE_COMPLETED"
  | "THREAT_NOTICED"
  | "CONFRONTATION_APPROACHED"
  | "CREATURE_ATTACKED"
  | "CONFRONTATION_AFTERMATH"
  | "CREATURE_FLED"
  | "CREATURE_GUARDED"
  | "CREATURE_JOINED_GROUP"
  | "GROUP_FOUNDED"
  | "LEADER_SELECTED";

export type AttentionTier = "ROUTINE" | "NOTABLE" | "SIGNIFICANT" | "CRITICAL";

export type CommandOutcomeCode = "APPLIED" | "REJECTED";

export type CommandRejectionReason = "OCCUPIED_TILE" | null;

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
  attentionTier: AttentionTier;
  clusterKey: string;
  commandId: number | null;
  commandOutcome: CommandOutcomeCode | null;
  commandRejectionReason: CommandRejectionReason;
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
  /** Claim attempts that encountered at least one occupied interaction slot. */
  interactionContentions: number;
  /** Required interaction claims that could not obtain any reachable slot. */
  failedInteractionClaims: number;
}

export interface SimulationConfiguration {
  ticksPerSecond: number;
  maxDomainEvents: number;
  maxHistoryEvents: number;
  maxDecisionRecords: number;
  maxMemoriesPerCreature: number;
  maxRelationshipsPerCreature: number;
  maxIntentHistoryPerCreature: number;
  maxRouteSamplesPerCreature: number;
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

export type PlayerCommand = AddFoodCommand | RemoveFoodCommand | ToggleObstacleCommand;

export const MAX_PLAYER_COMMAND_AMOUNT = 999;

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
  alive: boolean;
  x: number;
  y: number;
  tileIndex: number;
  health: Unit;
  hunger: Unit;
  fatigue: Unit;
  groupId: GroupId | null;
  role: CreatureRole;
  traits: CreatureTraits;
  skills: CreatureSkills;
  inventory: Inventory;
  desire: DesireKind | null;
  plan: PlanKind | null;
  action: ActionKind | null;
  actionPhase: ActionPhase | null;
  targetTileIndex: number | null;
  destinationX: number | null;
  destinationY: number | null;
  recentRoute: Array<{ tick: Tick; x: number; y: number }>;
  summary: CreatureObservationSummary;
  latestDecision: DecisionRecord | null;
  memories: EpisodicMemory[];
  relationships: RelationshipEdge[];
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
  schemaVersion: number;
  behaviorVersion: number;
  tick: Tick;
  timeLabel: string;
  width: number;
  height: number;
  navigationRevision: number;
  tiles: RenderTile[];
  creatures: RenderCreature[];
  resourceNodes: RenderResourceNode[];
  structures: RenderStructure[];
  groups: GroupState[];
  recentEvents: DomainEvent[];
  historyEvents: HistoricalEvent[];
  metrics: SimulationMetrics;
}
