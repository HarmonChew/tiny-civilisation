import type { ScenarioReferenceV2 } from "./scenarios/types.js";

export type EntityId = number;
export type GroupId = number;
export type Tick = number;
export type Unit = number;
export type FixedPosition = number;

export const TILE_FIXED_UNITS = 256;

export type TerrainKind = "GROUND" | "SHALLOW_WATER" | "ROCK";
export type ResourceKind = "FOOD" | "MATERIAL" | "WATER";
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
  water: number;
}

export interface CreatureNeeds {
  hunger: Unit;
  fatigue: Unit;
  thirst: Unit;
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
  | "GATHER_WATER"
  | "EAT"
  | "DRINK"
  | "REST"
  | "ESTABLISH_SHELTER_SITE"
  | "BUILD_SHELTER"
  | "REST_SHELTERED"
  | "MAINTAIN_SHELTER"
  | "SHARE"
  | "SHARE_WATER"
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
  | "RELIEVE_THIRST"
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
  | "DRINK_CARRIED_WATER"
  | "FORAGE_FOR_FOOD"
  | "FETCH_WATER"
  | "WITHDRAW_SHARED_FOOD"
  | "REST_SAFELY"
  | "ESTABLISH_SHELTER"
  | "BUILD_COMMUNAL_SHELTER"
  | "REST_IN_SHELTER"
  | "MAINTAIN_COMMUNAL_SHELTER"
  | "BUILD_PRIVATE_RESERVE"
  | "SHARE_WITH_OTHER"
  | "SHARE_WATER_WITH_OTHER"
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
  unit: "UNIT" | "COUNT" | "TILES" | "TICKS" | "MOVE_COST" | "LABEL" | null;
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
  | "MAINTENANCE"
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

export type StorageStructureKind = "STORAGE" | "STORAGE_SITE";
export type ShelterStructureKind = "SHELTER_SITE" | "SHELTER" | "ABANDONED_SHELTER";
export type StructureKind = StorageStructureKind | ShelterStructureKind;

export interface StructureStateBase {
  id: EntityId;
  kind: StructureKind;
  tileIndex: number;
  groupId: GroupId;
  material: number;
  materialRequired: number;
  progress: Unit;
  workRequired: Unit;
  /** Shelters keep a zero-capacity inventory; water is never communally stored. */
  inventory: Inventory;
  guardIds: EntityId[];
  completedTick: Tick | null;
}

export interface StorageStructureState extends StructureStateBase {
  kind: StorageStructureKind;
}

export interface ShelterSiteAssessment {
  selectedAtTick: Tick;
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

export type ShelterConditionBand = "GOOD" | "WORN" | "LOW";

export interface ShelterStructureState extends StructureStateBase {
  kind: ShelterStructureKind;
  condition: Unit;
  baseCapacity: number;
  siteAssessment: ShelterSiteAssessment;
  builtFromShelterId: EntityId | null;
  maintenanceMaterialSpent: number;
  lastMaintainedTick: Tick | null;
  lastUsedTick: Tick | null;
  conditionBand: ShelterConditionBand;
}

export type StructureState = StorageStructureState | ShelterStructureState;

export interface ShelterRelocationCandidate {
  tileIndex: number;
  firstSeenTick: Tick;
  lastEvaluatedTick: Tick;
  consecutiveEvaluations: number;
  scoreImprovement: number;
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
  activeShelterId: EntityId | null;
  pendingShelterId: EntityId | null;
  shelterRelocations: number;
  shelterCommitUntilTick: Tick;
  shelterRelocationCandidate: ShelterRelocationCandidate | null;
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
  | "HYDRATION_RULES_ENABLED"
  | "SHELTER_RULES_ENABLED"
  | "PLAYER_ADDED_FOOD"
  | "PLAYER_REMOVED_FOOD"
  | "PLAYER_ADDED_MATERIAL"
  | "PLAYER_REMOVED_MATERIAL"
  | "PLAYER_REPLENISHED_WATER"
  | "PLAYER_DRAINED_WATER"
  | "PLAYER_TOGGLED_OBSTACLE"
  | "DESIRE_CHANGED"
  | "PLAN_CHANGED"
  | "PLAN_BLOCKED"
  | "ACTION_STARTED"
  | "FOOD_GATHERED"
  | "MATERIAL_GATHERED"
  | "WATER_GATHERED"
  | "FOOD_EATEN"
  | "WATER_DRUNK"
  | "FOOD_SHARED"
  | "WATER_SHARED"
  | "WATER_SOURCE_DEPLETED"
  | "SEVERE_THIRST_STARTED"
  | "SEVERE_THIRST_RESOLVED"
  | "THEFT_COMMITTED"
  | "THEFT_WITNESSED"
  | "FOOD_DEPOSITED"
  | "FOOD_WITHDRAWN"
  | "MATERIAL_DEPOSITED"
  | "STORAGE_SITE_STARTED"
  | "STORAGE_WORK_ADVANCED"
  | "STORAGE_COMPLETED"
  | "SHELTER_SITE_SELECTED"
  | "SHELTER_CONSTRUCTION_STARTED"
  | "SHELTER_WORK_ADVANCED"
  | "SHELTER_COMPLETED"
  | "SHELTER_RESTED"
  | "SHELTER_MAINTAINED"
  | "SHELTER_CONDITION_LOW"
  | "SHELTER_CONDITION_RECOVERED"
  | "SHELTER_CROWDED"
  | "SHELTER_GUEST_USED"
  | "SHELTER_ABANDONED"
  | "SHELTER_RELOCATED"
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

export type CommandRejectionReason =
  "OCCUPIED_TILE" | "NO_WATER_SOURCE" | "SOURCE_FULL" | "SOURCE_EMPTY" | null;

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
  | "SHELTER_BUILT"
  | "SETTLEMENT_RELOCATED"
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
  waterGathered: number;
  waterDrunk: number;
  waterShared: number;
  severeThirstCreatureTicks: number;
  waterGatherContentions: number;
  thefts: number;
  witnessedThefts: number;
  attacks: number;
  groupsFormed: number;
  storagesCompleted: number;
  sheltersCompleted: number;
  shelteredRests: number;
  outdoorRests: number;
  shelterMaintenanceMaterial: number;
  shelterDeniedClaims: number;
  shelterGuestUses: number;
  shelterRelocations: number;
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
  /** Immutable catalog identity used to reconstruct this exact starting world. */
  scenario: ScenarioReferenceV2;
  /** Hash of the compiler output before any simulation ticks or interventions. */
  compiledMapHash: string;
  /** Convenience copy retained for keyed runtime decisions; must equal scenario.seed. */
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

export interface AddMaterialCommand {
  type: "ADD_MATERIAL";
  applyAtTick?: Tick;
  tileIndex?: number;
  x?: number;
  y?: number;
  amount?: number;
}

export interface RemoveMaterialCommand {
  type: "REMOVE_MATERIAL";
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

export interface ReplenishWaterCommand {
  type: "REPLENISH_WATER";
  applyAtTick?: Tick;
  tileIndex?: number;
  x?: number;
  y?: number;
  amount?: number;
}

export interface DrainWaterCommand {
  type: "DRAIN_WATER";
  applyAtTick?: Tick;
  tileIndex?: number;
  x?: number;
  y?: number;
  amount?: number;
}

export type PlayerCommand =
  | AddFoodCommand
  | RemoveFoodCommand
  | AddMaterialCommand
  | RemoveMaterialCommand
  | ToggleObstacleCommand
  | ReplenishWaterCommand
  | DrainWaterCommand;

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
  thirst: Unit;
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
  waterAccess: RenderCreatureWaterAccess | null;
  shelterAccess: RenderCreatureShelterAccess | null;
  recentRoute: Array<{ tick: Tick; x: number; y: number }>;
  summary: CreatureObservationSummary;
  latestDecision: DecisionRecord | null;
  memories: EpisodicMemory[];
  relationships: RelationshipEdge[];
}

export interface RenderCreatureWaterAccess {
  sourceId: EntityId;
  sourceStock: number;
  sourceCapacity: number;
  weightedCost: number;
  reachableSources: number;
  totalSources: number;
  interactionCapacity: number;
  claimedInteractionSlots: number;
}

export type ShelterEligibility = "MEMBER" | "TRUSTED_GUEST" | "INELIGIBLE";

export interface RenderCreatureShelterAccess {
  shelterId: EntityId | null;
  weightedCost: number | null;
  eligibility: ShelterEligibility | null;
  condition: Unit | null;
  effectiveCapacity: number;
  reservedSpaces: number;
  restingCreatures: number;
  destination: "SHELTERED" | "OUTDOOR" | "NONE";
  reason: string;
}

export interface RenderResourceNode {
  id: EntityId;
  kind: ResourceKind;
  tileIndex: number;
  currentStock: number;
  maximumStock: number;
  waterAccess: RenderWaterSourceAccess | null;
}

export interface RenderWaterSourceAccess {
  interactionCapacity: number;
  claimedInteractionSlots: number;
  reachableCreatures: number;
  livingCreatures: number;
  nearestWeightedCost: number | null;
  meanWeightedCost: number | null;
}

export interface RenderStructure {
  id: EntityId;
  kind: StructureKind;
  tileIndex: number;
  groupId: GroupId;
  progress: Unit;
  workRequired: Unit;
  food: number;
  material: number;
  storedMaterial: number;
  storageCapacity: number;
  materialRequired: number;
  water: number;
  guardIds: EntityId[];
  condition: Unit | null;
  baseCapacity: number | null;
  effectiveCapacity: number | null;
  reservedSpaces: number;
  restingCreatures: number;
  memberOccupancy: number;
  guestOccupancy: number;
  upkeepNeeded: boolean;
  siteAssessment: ShelterSiteAssessment | null;
  builtFromShelterId: EntityId | null;
}

export interface RenderScenario {
  reference: ScenarioReferenceV2;
  compiledMapHash: string;
  name: string;
  role: string;
  dramaticQuestion: string;
  startingFacts: string[];
  observableTensions: string[];
  landmarks: RenderScenarioLandmark[];
}

export interface RenderScenarioLandmark {
  kind: "REGION" | "CHOKEPOINT";
  id: string;
  label: string;
  tileIndices: number[];
}

export interface RenderSnapshot {
  schemaVersion: number;
  behaviorVersion: number;
  scenario: RenderScenario;
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
