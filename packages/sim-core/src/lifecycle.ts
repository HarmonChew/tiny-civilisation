import { addHistory, emitDomainEvent } from "./events.js";
import { selectSuccessorAfterLeaderDeath } from "./groups.js";
import { findNearestWalkable } from "./navigation.js";
import { findPath } from "./pathfinding.js";
import { keyedRandomU32, naturalLifespanTicksFor } from "./rng.js";
import { effectiveShelterCapacity, isShelterStructure } from "./shelters.js";
import { addMemory, relationshipFrom } from "./social.js";
import {
  TILE_FIXED_UNITS,
  type ActionKind,
  type CreatureState,
  type DeathCause,
  type EstateInventory,
  type LifeRecord,
  type LifeStage,
  type MemorialState,
  type SimulationState,
} from "./types.js";
import { createEmptyActionCounts } from "./world.js";

export const JUVENILE_MAX_AGE_TICKS = 4_999;
export const ADULT_MIN_AGE_TICKS = 5_000;
export const ELDER_MIN_AGE_TICKS = 15_000;
export const FERTILITY_MIN_AGE_TICKS = 7_500;
export const FERTILITY_MAX_AGE_TICKS = 14_999;
export const GESTATION_TICKS = 1_000;
export const REPRODUCTION_COOLDOWN_TICKS = 6_000;
export const MEMORIAL_LIFETIME_TICKS = 600;
export const MAX_LIVING_POPULATION = 24;
export const MAX_TOTAL_IDENTITIES = 256;
export const NATURAL_LIFESPAN_MIN_TICKS = 18_000;
export const NATURAL_LIFESPAN_SPAN_TICKS = 4_000;
export const CRITICAL_HEALTH_THRESHOLD = 1_200;
export const CRITICAL_DEATH_AFTER_TICKS = 300;

const UNIT_MAX = 10_000;
const clampUnit = (value: number): number =>
  Math.max(0, Math.min(UNIT_MAX, Math.round(value)));

export interface ReproductionEligibility {
  eligible: boolean;
  reasons: string[];
}

export interface LifeRecordQuery {
  cursor?: number | null;
  limit?: number;
  relatedToId?: number | null;
}

export interface LifeRecordPage {
  records: LifeRecord[];
  nextCursor: number | null;
}

export function lifeStageForAge(ageTicks: number): LifeStage {
  if (ageTicks <= JUVENILE_MAX_AGE_TICKS) return "JUVENILE";
  if (ageTicks < ELDER_MIN_AGE_TICKS) return "ADULT";
  return "ELDER";
}

export function lifecycleWorkRate(creature: CreatureState): number {
  return creature.lifeStage === "ELDER" ? 8_000 : UNIT_MAX;
}

const JUVENILE_ACTIONS = new Set<ActionKind>([
  "EXPLORE",
  "EAT",
  "DRINK",
  "REST",
  "REST_SHELTERED",
  "FLEE",
]);

export function isActionAllowedForLifeStage(
  creature: CreatureState,
  action: ActionKind,
): boolean {
  if (creature.lifeStage !== "JUVENILE") return true;
  return JUVENILE_ACTIONS.has(action);
}

export function followDependentCaregivers(state: SimulationState): void {
  for (const dependent of state.creatures
    .filter((creature) => creature.alive && creature.lifeStage === "JUVENILE")
    .sort((left, right) => left.id - right.id)) {
    let caregiver = state.creatures.find(
      (candidate) => candidate.alive && candidate.id === dependent.caregiverId,
    );
    if (!caregiver) {
      caregiver =
        state.creatures.find(
          (candidate) =>
            candidate.alive &&
            (candidate.id === dependent.motherId || candidate.id === dependent.fatherId),
        ) ??
        state.creatures
          .filter(
            (candidate) =>
              candidate.alive &&
              candidate.lifeStage !== "JUVENILE" &&
              candidate.groupId !== null &&
              candidate.groupId === dependent.groupId,
          )
          .sort((left, right) => left.id - right.id)[0];
      dependent.caregiverId = caregiver?.id ?? null;
    }
    if (!caregiver || dependent.activeAction) continue;
    const path = findPath(state.world, dependent.tileIndex, caregiver.tileIndex);
    if (path.length <= 3) continue;
    const nextTile = path[1];
    const tile = nextTile === undefined ? null : state.world.tiles[nextTile];
    if (!tile || tile.blocked) continue;
    dependent.tileIndex = tile.index;
    dependent.x = tile.x * TILE_FIXED_UNITS + TILE_FIXED_UNITS / 2;
    dependent.y = tile.y * TILE_FIXED_UNITS + TILE_FIXED_UNITS / 2;
    dependent.recentRoute.push({
      tick: state.tick,
      tileIndex: tile.index,
      x: dependent.x,
      y: dependent.y,
    });
    if (dependent.recentRoute.length > state.configuration.maxRouteSamplesPerCreature) {
      dependent.recentRoute.splice(
        0,
        dependent.recentRoute.length - state.configuration.maxRouteSamplesPerCreature,
      );
    }
  }
}

function livingCreatures(state: SimulationState): CreatureState[] {
  return state.creatures.filter((creature) => creature.alive);
}

function identityRecord(
  state: SimulationState,
  id: number,
): CreatureState | LifeRecord | null {
  return (
    state.creatures.find((creature) => creature.id === id) ??
    state.lifeRecords.find((record) => record.id === id) ??
    null
  );
}

function uniqueIdentityCount(state: SimulationState): number {
  return new Set([
    ...state.creatures.map((creature) => creature.id),
    ...state.lifeRecords.map((record) => record.id),
  ]).size;
}

function reservedPregnancies(state: SimulationState): number {
  return state.creatures.filter((creature) => creature.alive && creature.pregnancy).length;
}

export function populationFamilyPressure(state: SimulationState): number {
  const reserved = livingCreatures(state).length + reservedPregnancies(state);
  if (reserved <= 8) return 2_200;
  if (reserved <= 12) return 1_400;
  if (reserved <= 16) return 600;
  if (reserved <= 20) return -800;
  if (reserved <= 23) return -2_400;
  return -10_000;
}

function isCloseKin(
  state: SimulationState,
  left: CreatureState,
  right: CreatureState,
): boolean {
  const leftParents = [left.motherId, left.fatherId].filter(
    (id): id is number => id !== null,
  );
  const rightParents = [right.motherId, right.fatherId].filter(
    (id): id is number => id !== null,
  );
  if (leftParents.includes(right.id) || rightParents.includes(left.id)) return true;
  if (leftParents.some((id) => rightParents.includes(id))) return true;
  const rightGrandparents = rightParents.flatMap((id) => {
    const parent = identityRecord(state, id);
    return parent ? [parent.motherId, parent.fatherId] : [];
  });
  const leftGrandparents = leftParents.flatMap((id) => {
    const parent = identityRecord(state, id);
    return parent ? [parent.motherId, parent.fatherId] : [];
  });
  return rightGrandparents.includes(left.id) || leftGrandparents.includes(right.id);
}

export function reproductionEligibility(
  state: SimulationState,
  female: CreatureState,
  male: CreatureState,
): ReproductionEligibility {
  const reasons: string[] = [];
  if (!female.alive || !male.alive) reasons.push("both parents must be alive");
  if (female.sex !== "FEMALE" || male.sex !== "MALE") {
    reasons.push("a female and male parent are required");
  }
  const familyGroup = state.groups.find(
    (group) =>
      group.id === female.groupId &&
      group.id === male.groupId &&
      group.status === "ACTIVE" &&
      group.stage === "PERSISTENT",
  );
  if (!familyGroup) {
    reasons.push("both parents must share the same active persistent group");
  } else {
    const shelter = state.structures.find(
      (structure) => structure.id === familyGroup.activeShelterId,
    );
    const dependentReservations = state.creatures.filter(
      (creature) =>
        creature.alive &&
        creature.groupId === familyGroup.id &&
        (creature.lifeStage === "JUVENILE" || creature.pregnancy !== null),
    ).length;
    if (
      !isShelterStructure(shelter) ||
      shelter.kind !== "SHELTER" ||
      dependentReservations + 1 > effectiveShelterCapacity(shelter)
    ) {
      reasons.push("the shared shelter has no dependent-priority reservation");
    }
  }
  if (
    female.ageTicks < FERTILITY_MIN_AGE_TICKS ||
    female.ageTicks > FERTILITY_MAX_AGE_TICKS ||
    male.ageTicks < FERTILITY_MIN_AGE_TICKS ||
    male.ageTicks > FERTILITY_MAX_AGE_TICKS
  ) {
    reasons.push("both parents must be within the fertile adult age range");
  }
  if (female.pregnancy) reasons.push("the prospective mother is already pregnant");
  if (
    state.tick < female.reproductionCooldownUntilTick ||
    state.tick < male.reproductionCooldownUntilTick
  ) {
    reasons.push("a parent is still in reproductive cooldown");
  }
  if (isCloseKin(state, female, male)) reasons.push("close kin cannot form a family");
  const forward = relationshipFrom(state, female.id, male.id);
  const backward = relationshipFrom(state, male.id, female.id);
  if ((forward?.trust ?? 0) < 3_000 || (backward?.trust ?? 0) < 3_000) {
    reasons.push("mutual trust is below 3000");
  }
  if ((forward?.familiarity ?? 0) < 1_000 || (backward?.familiarity ?? 0) < 1_000) {
    reasons.push("mutual familiarity is below 1000");
  }
  if (
    (forward?.fear ?? 0) >= 2_500 ||
    (backward?.fear ?? 0) >= 2_500 ||
    (forward?.rivalry ?? 0) >= 2_500 ||
    (backward?.rivalry ?? 0) >= 2_500
  ) {
    reasons.push("fear or rivalry is too high");
  }
  if (female.health < 6_500 || male.health < 6_500) {
    reasons.push("both parents need at least 6500 health");
  }
  if (
    female.needs.hunger >= 6_500 ||
    male.needs.hunger >= 6_500 ||
    female.needs.thirst >= 6_500 ||
    male.needs.thirst >= 6_500 ||
    female.needs.fatigue >= 7_500 ||
    male.needs.fatigue >= 7_500
  ) {
    reasons.push("survival needs are too urgent");
  }
  if (!state.resourceNodes.some((node) => node.kind === "WATER" && node.currentStock > 0)) {
    reasons.push("no stocked water source remains");
  }
  const availableFood =
    state.resourceNodes
      .filter((node) => node.kind === "FOOD")
      .reduce((total, node) => total + node.currentStock, 0) +
    state.structures
      .filter((structure) => structure.kind === "STORAGE")
      .reduce((total, structure) => total + structure.inventory.food, 0);
  if (availableFood < livingCreatures(state).length) {
    reasons.push("food reserves cannot support the living population");
  }
  if (livingCreatures(state).length + reservedPregnancies(state) >= MAX_LIVING_POPULATION) {
    reasons.push("the population cap of 24 is reserved");
  }
  if (uniqueIdentityCount(state) + reservedPregnancies(state) >= MAX_TOTAL_IDENTITIES) {
    reasons.push("the total identity cap of 256 is reserved");
  }
  return { eligible: reasons.length === 0, reasons };
}

export function eligibleFamilyPartners(
  state: SimulationState,
  female: CreatureState,
): CreatureState[] {
  return state.creatures
    .filter(
      (candidate) =>
        candidate.id !== female.id &&
        candidate.sex === "MALE" &&
        reproductionEligibility(state, female, candidate).eligible,
    )
    .sort((left, right) => left.id - right.id);
}

export function completeFamilyFormation(
  state: SimulationState,
  actor: CreatureState,
  partnerId: number | null,
): boolean {
  const partner = state.creatures.find((creature) => creature.id === partnerId) ?? null;
  const female =
    actor.sex === "FEMALE" ? actor : partner?.sex === "FEMALE" ? partner : null;
  const male = actor.sex === "MALE" ? actor : partner?.sex === "MALE" ? partner : null;
  if (!female || !male || !reproductionEligibility(state, female, male).eligible)
    return false;
  female.pregnancy = {
    fatherId: male.id,
    conceivedTick: state.tick,
    dueTick: state.tick + GESTATION_TICKS,
  };
  female.reproductionCooldownUntilTick = state.tick + REPRODUCTION_COOLDOWN_TICKS;
  male.reproductionCooldownUntilTick = state.tick + REPRODUCTION_COOLDOWN_TICKS;
  state.metrics.pregnanciesStarted += 1;
  const familyEvent = emitDomainEvent(state, {
    type: "FAMILY_FORMED",
    actorIds: [female.id, male.id],
    groupIds: [female.groupId, male.groupId].filter((id): id is number => id !== null),
    locationTileIndex: female.tileIndex,
    quantity: 1,
    importance: 55,
    summary: `${female.name} and ${male.name} formed a family bond.`,
  });
  const pregnancyEvent = emitDomainEvent(state, {
    type: "PREGNANCY_STARTED",
    actorIds: [female.id, male.id],
    locationTileIndex: female.tileIndex,
    quantity: female.pregnancy.dueTick,
    causedByEventIds: [familyEvent.id],
    importance: 62,
    summary: `${female.name} became pregnant; the child is due at tick ${female.pregnancy.dueTick.toString()}.`,
  });
  female.majorLifeEventIds.push(familyEvent.id, pregnancyEvent.id);
  male.majorLifeEventIds.push(familyEvent.id, pregnancyEvent.id);
  const paired = state.creatures.find(
    (creature) =>
      creature.id !== actor.id &&
      creature.activeAction?.kind === "FORM_FAMILY" &&
      creature.activeAction.targetEntityId === actor.id,
  );
  if (paired) {
    paired.activeAction = null;
    paired.activeGoal = null;
    paired.activeDesire = null;
    paired.activePlan = null;
    paired.nextDecisionTick = state.tick + 1;
  }
  return true;
}

function inheritedValue(
  state: SimulationState,
  channel: string,
  motherValue: number,
  fatherValue: number,
  childId: number,
): number {
  const jitter = (keyedRandomU32(state.seed, channel, state.tick, childId) % 1_501) - 750;
  return clampUnit(Math.round((motherValue + fatherValue) / 2) + jitter);
}

function childName(state: SimulationState, childId: number): string {
  const starts = ["A", "E", "I", "Ka", "Lo", "Me", "Na", "Po", "Ri", "So", "Ta", "Ve"];
  const ends = ["ra", "ri", "lo", "na", "mi", "so", "ta", "va"];
  const first =
    starts[
      keyedRandomU32(state.seed, "child-name-a", state.tick, childId) % starts.length
    ]!;
  const second =
    ends[keyedRandomU32(state.seed, "child-name-b", state.tick, childId) % ends.length]!;
  return `${first}${second}-${childId.toString(36).toUpperCase()}`;
}

function createChild(
  state: SimulationState,
  mother: CreatureState,
  father: CreatureState | LifeRecord,
): CreatureState {
  const id = state.nextEntityId++;
  const fatherCreature = "traits" in father ? father : null;
  const traits = {
    generosity: inheritedValue(
      state,
      "child-generosity",
      mother.traitPotential.generosity,
      father.traitPotential.generosity,
      id,
    ),
    aggression: inheritedValue(
      state,
      "child-aggression",
      mother.traitPotential.aggression,
      father.traitPotential.aggression,
      id,
    ),
    sociability: inheritedValue(
      state,
      "child-sociability",
      mother.traitPotential.sociability,
      father.traitPotential.sociability,
      id,
    ),
    loyalty: inheritedValue(
      state,
      "child-loyalty",
      mother.traitPotential.loyalty,
      father.traitPotential.loyalty,
      id,
    ),
  };
  const skills = {
    foraging: inheritedValue(
      state,
      "child-foraging",
      mother.skillPotential.foraging,
      father.skillPotential.foraging,
      id,
    ),
    combat: inheritedValue(
      state,
      "child-combat",
      mother.skillPotential.combat,
      father.skillPotential.combat,
      id,
    ),
  };
  const groupId = state.groups.some(
    (group) => group.id === mother.groupId && group.status === "ACTIVE",
  )
    ? mother.groupId
    : fatherCreature &&
        state.groups.some(
          (group) => group.id === fatherCreature.groupId && group.status === "ACTIVE",
        )
      ? fatherCreature.groupId
      : null;
  const colorJitter = keyedRandomU32(state.seed, "child-color", state.tick, id) & 0x1f1f1f;
  const color = ((mother.color + father.color) >>> 1) ^ colorJitter;
  return {
    id,
    name: childName(state, id),
    color: color & 0xffffff,
    alive: true,
    sex:
      (keyedRandomU32(state.seed, "child-sex", state.tick, id) & 1) === 0
        ? "FEMALE"
        : "MALE",
    ageTicks: 0,
    lifeStage: "JUVENILE",
    naturalLifespanTicks: naturalLifespanTicksFor(state.seed, id),
    birthTick: state.tick,
    motherId: mother.id,
    fatherId: father.id,
    caregiverId: mother.id,
    dependentUntilTick: state.tick + ADULT_MIN_AGE_TICKS,
    criticalSinceTick: null,
    criticalDamage: null,
    traitPotential: { ...traits },
    skillPotential: { ...skills },
    pregnancy: null,
    reproductionCooldownUntilTick: state.tick + FERTILITY_MIN_AGE_TICKS,
    death: null,
    mournedLifeRecordIds: [],
    majorLifeEventIds: [],
    tileIndex: mother.tileIndex,
    x: mother.x,
    y: mother.y,
    health: UNIT_MAX,
    needs: { hunger: 1_500, fatigue: 1_000, thirst: 1_500 },
    traits,
    skills: {
      foraging: Math.floor(skills.foraging / 3),
      combat: Math.floor(skills.combat / 3),
    },
    inventory: { capacity: 3, food: 0, material: 0, water: 0 },
    groupId,
    role: "FORAGER",
    activeDesire: null,
    activePlan: null,
    activeGoal: null,
    activeAction: null,
    nextDecisionTick: state.tick + 1,
    lastActionKind: null,
    lastActionTick: -1,
    actionCounts: createEmptyActionCounts(),
    memoryIds: [],
    intentHistory: [],
    recentRoute: [
      { tick: state.tick, tileIndex: mother.tileIndex, x: mother.x, y: mother.y },
    ],
  };
}

function losePregnancy(
  state: SimulationState,
  mother: CreatureState,
  reason: string,
): void {
  const pregnancy = mother.pregnancy;
  if (!pregnancy) return;
  mother.pregnancy = null;
  state.metrics.pregnanciesLost += 1;
  emitDomainEvent(state, {
    type: "PREGNANCY_LOST",
    actorIds: [mother.id],
    targetIds: [pregnancy.fatherId],
    locationTileIndex: mother.tileIndex,
    quantity: pregnancy.dueTick,
    importance: 72,
    summary: `${mother.name}'s pregnancy ended before birth because ${reason}.`,
  });
}

export function processPregnanciesAndBirths(state: SimulationState): void {
  const dueMothers = state.creatures
    .filter(
      (creature) =>
        creature.alive && creature.pregnancy && creature.pregnancy.dueTick <= state.tick,
    )
    .sort((left, right) => left.id - right.id);
  for (const mother of dueMothers) {
    const pregnancy = mother.pregnancy;
    if (!pregnancy) continue;
    if (
      livingCreatures(state).length >= MAX_LIVING_POPULATION ||
      uniqueIdentityCount(state) >= MAX_TOTAL_IDENTITIES
    ) {
      losePregnancy(state, mother, "the population or identity ceiling was reached");
      continue;
    }
    const father = identityRecord(state, pregnancy.fatherId);
    if (!father) {
      losePregnancy(state, mother, "the recorded father identity was unavailable");
      continue;
    }
    const child = createChild(state, mother, father);
    mother.pregnancy = null;
    state.creatures.push(child);
    if (child.groupId !== null) {
      const group = state.groups.find((candidate) => candidate.id === child.groupId);
      if (group && !group.memberIds.includes(child.id)) {
        group.memberIds.push(child.id);
        group.memberIds.sort((left, right) => left - right);
      }
    }
    state.metrics.births += 1;
    const event = emitDomainEvent(state, {
      type: "CREATURE_BORN",
      actorIds: [mother.id, father.id],
      targetIds: [child.id],
      groupIds: child.groupId === null ? [] : [child.groupId],
      locationTileIndex: child.tileIndex,
      quantity: child.ageTicks,
      importance: 82,
      summary: `${child.name} was born to ${mother.name} and ${father.name}.`,
    });
    child.majorLifeEventIds.push(event.id);
    mother.majorLifeEventIds.push(event.id);
    if (fatherCreature(state, father.id))
      fatherCreature(state, father.id)!.majorLifeEventIds.push(event.id);
    addMemory(state, child, "BIRTH_WITNESSED", mother.id, child.tileIndex, 7_000, 8_500, [
      event.id,
    ]);
    addHistory(
      state,
      "BIRTH",
      `${child.name} was born`,
      event.summary,
      [event.id],
      [mother.id, father.id, child.id],
      child.groupId === null ? [] : [child.groupId],
      82,
    );
  }
}

function fatherCreature(state: SimulationState, id: number): CreatureState | null {
  return state.creatures.find((creature) => creature.id === id && creature.alive) ?? null;
}

export function eligibleCareDependents(
  state: SimulationState,
  caregiver: CreatureState,
): CreatureState[] {
  if (caregiver.lifeStage === "JUVENILE") return [];
  return state.creatures
    .filter(
      (candidate) =>
        candidate.alive &&
        candidate.lifeStage === "JUVENILE" &&
        candidate.id !== caregiver.id &&
        (candidate.caregiverId === caregiver.id ||
          candidate.motherId === caregiver.id ||
          candidate.fatherId === caregiver.id ||
          (candidate.groupId !== null && candidate.groupId === caregiver.groupId)),
    )
    .sort((left, right) => left.id - right.id);
}

export function completeCareForYoung(
  state: SimulationState,
  caregiver: CreatureState,
  dependentId: number | null,
): boolean {
  const dependent = eligibleCareDependents(state, caregiver).find(
    (candidate) => candidate.id === dependentId,
  );
  if (!dependent) return false;
  let food = 0;
  let water = 0;
  if (caregiver.inventory.food > 0 && dependent.needs.hunger >= 2_500) {
    caregiver.inventory.food -= 1;
    food = 1;
    dependent.needs.hunger = clampUnit(dependent.needs.hunger - 2_200);
  }
  if (caregiver.inventory.water > 0 && dependent.needs.thirst >= 2_500) {
    caregiver.inventory.water -= 1;
    water = 1;
    dependent.needs.thirst = clampUnit(dependent.needs.thirst - 2_500);
  }
  dependent.needs.fatigue = clampUnit(dependent.needs.fatigue - 700);
  dependent.health = clampUnit(dependent.health + 120);
  if (dependent.caregiverId === null) dependent.caregiverId = caregiver.id;
  state.metrics.careActions += 1;
  const event = emitDomainEvent(state, {
    type: "CARE_GIVEN",
    actorIds: [caregiver.id],
    targetIds: [dependent.id],
    groupIds: caregiver.groupId === null ? [] : [caregiver.groupId],
    locationTileIndex: dependent.tileIndex,
    quantity: food + water,
    importance: 36,
    summary: `${caregiver.name} cared for ${dependent.name}${food + water > 0 ? " and shared provisions" : " through attention and rest"}.`,
  });
  addMemory(
    state,
    dependent,
    "CARE_RECEIVED",
    caregiver.id,
    dependent.tileIndex,
    5_000,
    6_500,
    [event.id],
  );
  return true;
}

function sharedChildren(
  state: SimulationState,
  leftId: number,
  rightId: number,
): Array<CreatureState | LifeRecord> {
  return [...state.creatures, ...state.lifeRecords].filter(
    (identity) =>
      (identity.motherId === leftId && identity.fatherId === rightId) ||
      (identity.motherId === rightId && identity.fatherId === leftId),
  );
}

function selectHeir(
  state: SimulationState,
  deceased: {
    id: number;
    motherId: number | null;
    fatherId: number | null;
    groupId?: number | null;
    finalGroupId?: number | null;
  },
): CreatureState | null {
  const living = livingCreatures(state).filter((candidate) => candidate.id !== deceased.id);
  const coParents = living
    .map((candidate) => ({
      candidate,
      newestSharedChild: sharedChildren(state, deceased.id, candidate.id).reduce(
        (newest, child) => Math.max(newest, child.birthTick),
        Number.NEGATIVE_INFINITY,
      ),
    }))
    .filter((entry) => Number.isFinite(entry.newestSharedChild))
    .sort(
      (left, right) =>
        right.newestSharedChild - left.newestSharedChild ||
        left.candidate.id - right.candidate.id,
    );
  if (coParents[0]) return coParents[0].candidate;
  const children = living
    .filter(
      (candidate) =>
        candidate.motherId === deceased.id || candidate.fatherId === deceased.id,
    )
    .sort((left, right) => right.ageTicks - left.ageTicks || left.id - right.id);
  if (children[0]) return children[0];
  const parents = [deceased.motherId, deceased.fatherId]
    .map((id) => living.find((candidate) => candidate.id === id) ?? null)
    .filter((candidate): candidate is CreatureState => candidate !== null);
  if (parents[0]) return parents[0];
  const siblings = living
    .filter((candidate) => {
      const sameMother =
        deceased.motherId !== null && candidate.motherId === deceased.motherId;
      const sameFather =
        deceased.fatherId !== null && candidate.fatherId === deceased.fatherId;
      return sameMother || sameFather;
    })
    .sort((left, right) => {
      const leftFull =
        left.motherId === deceased.motherId && left.fatherId === deceased.fatherId;
      const rightFull =
        right.motherId === deceased.motherId && right.fatherId === deceased.fatherId;
      return (
        Number(rightFull) - Number(leftFull) ||
        right.ageTicks - left.ageTicks ||
        left.id - right.id
      );
    });
  if (siblings[0]) return siblings[0];
  const groupId = deceased.groupId ?? deceased.finalGroupId ?? null;
  if (groupId === null) return null;
  return (
    living
      .filter((candidate) => candidate.groupId === groupId)
      .map((candidate) => ({
        candidate,
        trust:
          (relationshipFrom(state, deceased.id, candidate.id)?.trust ?? 0) +
          (relationshipFrom(state, candidate.id, deceased.id)?.trust ?? 0),
      }))
      .sort(
        (left, right) => right.trust - left.trust || left.candidate.id - right.candidate.id,
      )[0]?.candidate ?? null
  );
}

function isFirstDegreeOrCoParent(
  state: SimulationState,
  candidate: CreatureState,
  deceased: CreatureState,
): boolean {
  if (
    candidate.id === deceased.motherId ||
    candidate.id === deceased.fatherId ||
    candidate.motherId === deceased.id ||
    candidate.fatherId === deceased.id
  ) {
    return true;
  }
  const sibling =
    (deceased.motherId !== null && candidate.motherId === deceased.motherId) ||
    (deceased.fatherId !== null && candidate.fatherId === deceased.fatherId);
  return sibling || sharedChildren(state, candidate.id, deceased.id).length > 0;
}

function selectMourners(state: SimulationState, deceased: CreatureState): number[] {
  const living = livingCreatures(state).filter((candidate) => candidate.id !== deceased.id);
  const kin = living.filter((candidate) =>
    isFirstDegreeOrCoParent(state, candidate, deceased),
  );
  const kinIds = new Set(kin.map((candidate) => candidate.id));
  const groupmates = living
    .filter(
      (candidate) =>
        candidate.groupId !== null &&
        candidate.groupId === deceased.groupId &&
        !kinIds.has(candidate.id),
    )
    .map((candidate) => ({
      candidate,
      salience: Math.max(
        relationshipFrom(state, candidate.id, deceased.id)?.trust ?? 0,
        relationshipFrom(state, deceased.id, candidate.id)?.trust ?? 0,
      ),
    }))
    .filter((entry) => entry.salience > 0)
    .sort(
      (left, right) =>
        right.salience - left.salience || left.candidate.id - right.candidate.id,
    )
    .slice(0, 6)
    .map((entry) => entry.candidate);
  return [...kin, ...groupmates]
    .map((candidate) => candidate.id)
    .sort((left, right) => left - right);
}

export function transitionToDead(
  state: SimulationState,
  creature: CreatureState,
  cause: DeathCause,
  causedByEventIds: number[] = [],
): boolean {
  if (!creature.alive) return false;
  const finalGroupId = creature.groupId;
  const mourners = selectMourners(state, creature);
  const heir = selectHeir(state, { ...creature, finalGroupId });
  creature.alive = false;
  creature.health = 0;
  creature.activeAction = null;
  creature.activeGoal = null;
  creature.activePlan = null;
  creature.activeDesire = null;
  for (const structure of state.structures) {
    structure.guardIds = structure.guardIds.filter((id) => id !== creature.id);
  }
  if (creature.pregnancy) losePregnancy(state, creature, "the mother died");
  const group = state.groups.find((candidate) => candidate.id === finalGroupId);
  const wasLeader = group?.leaderId === creature.id;
  if (group) {
    group.memberIds = group.memberIds.filter((id) => id !== creature.id);
    if (wasLeader) group.leaderId = null;
  }
  for (const orphan of state.creatures
    .filter(
      (candidate) =>
        candidate.alive &&
        candidate.lifeStage === "JUVENILE" &&
        candidate.caregiverId === creature.id,
    )
    .sort((left, right) => left.id - right.id)) {
    const livingParent = [orphan.motherId, orphan.fatherId]
      .map(
        (id) =>
          state.creatures.find(
            (candidate) =>
              candidate.alive && candidate.id === id && candidate.id !== creature.id,
          ) ?? null,
      )
      .find((candidate): candidate is CreatureState => candidate !== null);
    const groupAdult = state.creatures
      .filter(
        (candidate) =>
          candidate.alive &&
          candidate.id !== creature.id &&
          candidate.lifeStage !== "JUVENILE" &&
          candidate.groupId === finalGroupId &&
          state.groups.some(
            (candidateGroup) =>
              candidateGroup.id === finalGroupId && candidateGroup.status === "ACTIVE",
          ),
      )
      .sort((left, right) => left.id - right.id)[0];
    orphan.caregiverId = livingParent?.id ?? groupAdult?.id ?? null;
  }
  for (const partner of state.creatures) {
    if (
      partner.id !== creature.id &&
      partner.activeAction?.kind === "FORM_FAMILY" &&
      partner.activeAction.targetEntityId === creature.id
    ) {
      partner.activeAction = null;
      partner.activeGoal = null;
      partner.activeDesire = null;
      partner.activePlan = null;
      partner.nextDecisionTick = state.tick + 1;
    }
  }
  creature.groupId = null;
  const deathEvent = emitDomainEvent(state, {
    type: "CREATURE_DIED",
    actorIds: [creature.id],
    groupIds: finalGroupId === null ? [] : [finalGroupId],
    locationTileIndex: creature.tileIndex,
    quantity: creature.ageTicks,
    causedByEventIds,
    importance: 92,
    summary: `${creature.name} died from ${cause.toLowerCase().replaceAll("_", " ")} at age ${creature.ageTicks.toString()} ticks.`,
  });
  creature.death = { tick: state.tick, cause, eventId: deathEvent.id };
  creature.majorLifeEventIds.push(deathEvent.id);
  const record: LifeRecord = {
    id: creature.id,
    name: creature.name,
    color: creature.color,
    sex: creature.sex,
    motherId: creature.motherId,
    fatherId: creature.fatherId,
    birthTick: creature.birthTick,
    deathTick: state.tick,
    ageTicks: creature.ageTicks,
    finalLifeStage: creature.lifeStage,
    deathCause: cause,
    finalGroupId,
    traitPotential: { ...creature.traitPotential },
    skillPotential: { ...creature.skillPotential },
    majorEventIds: [...creature.majorLifeEventIds],
    heirId: heir?.id ?? null,
  };
  state.lifeRecords.push(record);
  const memorial: MemorialState = {
    id: state.nextEntityId++,
    deceasedId: creature.id,
    tileIndex: findNearestWalkable(state, creature.tileIndex),
    createdTick: state.tick,
    expiresTick: state.tick + MEMORIAL_LIFETIME_TICKS,
    heirId: heir?.id ?? null,
    estate: {
      food: creature.inventory.food,
      material: creature.inventory.material,
      water: creature.inventory.water,
    },
    mournerIds: mourners,
    completedMournerIds: [],
  };
  state.memorials.push(memorial);
  emitDomainEvent(state, {
    type: "MEMORIAL_CREATED",
    actorIds: mourners,
    targetIds: [memorial.id, creature.id],
    groupIds: finalGroupId === null ? [] : [finalGroupId],
    locationTileIndex: memorial.tileIndex,
    quantity: memorial.expiresTick,
    causedByEventIds: [deathEvent.id],
    importance: 68,
    summary: `A memorial for ${creature.name} will remain for ${MEMORIAL_LIFETIME_TICKS.toString()} ticks.`,
  });
  state.metrics.deaths += 1;
  addHistory(
    state,
    "DEATH",
    `${creature.name} died`,
    deathEvent.summary,
    [deathEvent.id],
    [creature.id],
    finalGroupId === null ? [] : [finalGroupId],
    92,
  );
  if (group && wasLeader && group.status === "ACTIVE") {
    selectSuccessorAfterLeaderDeath(state, group, creature, deathEvent.id);
  }
  return true;
}

export function recordCriticalDamage(
  state: SimulationState,
  creature: CreatureState,
  damage: Partial<Record<"starvation" | "dehydration" | "exhaustion" | "injury", number>>,
  causedByEventIds: number[] = [],
): void {
  if (creature.health > CRITICAL_HEALTH_THRESHOLD) {
    return;
  }
  const started = creature.criticalSinceTick === null;
  if (started) creature.criticalSinceTick = state.tick;
  const retained = creature.criticalDamage ?? {
    starvation: 0,
    dehydration: 0,
    exhaustion: 0,
    injury: 0,
  };
  retained.starvation += Math.max(0, Math.round(damage.starvation ?? 0));
  retained.dehydration += Math.max(0, Math.round(damage.dehydration ?? 0));
  retained.exhaustion += Math.max(0, Math.round(damage.exhaustion ?? 0));
  retained.injury += Math.max(0, Math.round(damage.injury ?? 0));
  creature.criticalDamage = retained;
  if (started) {
    const event = emitDomainEvent(state, {
      type: "CRITICAL_HEALTH_STARTED",
      actorIds: [creature.id],
      groupIds: creature.groupId === null ? [] : [creature.groupId],
      locationTileIndex: creature.tileIndex,
      quantity: creature.health,
      causedByEventIds,
      importance: 84,
      summary: `${creature.name} entered critical health at ${creature.health.toString()} health.`,
    });
    addHistory(
      state,
      "HEALTH_CRISIS",
      `${creature.name} entered critical health`,
      event.summary,
      [event.id, ...causedByEventIds],
      [creature.id],
      creature.groupId === null ? [] : [creature.groupId],
      84,
    );
  }
}

export function clearRecoveredCriticalStates(state: SimulationState): void {
  for (const creature of state.creatures) {
    if (
      !creature.alive ||
      creature.health <= CRITICAL_HEALTH_THRESHOLD ||
      creature.criticalSinceTick === null
    )
      continue;
    const startEvent = [...state.domainEvents]
      .reverse()
      .find(
        (event) =>
          event.type === "CRITICAL_HEALTH_STARTED" &&
          event.tick === creature.criticalSinceTick &&
          event.actorIds.includes(creature.id),
      );
    emitDomainEvent(state, {
      type: "CRITICAL_HEALTH_RECOVERED",
      actorIds: [creature.id],
      groupIds: creature.groupId === null ? [] : [creature.groupId],
      locationTileIndex: creature.tileIndex,
      quantity: creature.health,
      causedByEventIds: startEvent ? [startEvent.id] : [],
      importance: 42,
      summary: `${creature.name} recovered from critical health.`,
    });
    creature.criticalSinceTick = null;
    creature.criticalDamage = null;
  }
}

export function processCriticalMortality(state: SimulationState): void {
  for (const creature of [...state.creatures].sort((left, right) => left.id - right.id)) {
    if (
      !creature.alive ||
      creature.criticalSinceTick === null ||
      state.tick - creature.criticalSinceTick + 1 < CRITICAL_DEATH_AFTER_TICKS
    ) {
      continue;
    }
    const facts = creature.criticalDamage ?? {
      starvation: 0,
      dehydration: 0,
      exhaustion: 0,
      injury: 0,
    };
    const cause = [
      { cause: "DEHYDRATION" as const, damage: facts.dehydration, priority: 4 },
      { cause: "STARVATION" as const, damage: facts.starvation, priority: 3 },
      { cause: "EXHAUSTION" as const, damage: facts.exhaustion, priority: 2 },
      { cause: "INJURY" as const, damage: facts.injury, priority: 1 },
    ].sort(
      (left, right) => right.damage - left.damage || right.priority - left.priority,
    )[0]!;
    const startEvent = [...state.domainEvents]
      .reverse()
      .find(
        (event) =>
          event.type === "CRITICAL_HEALTH_STARTED" &&
          event.tick === creature.criticalSinceTick &&
          event.actorIds.includes(creature.id),
      );
    transitionToDead(state, creature, cause.cause, startEvent ? [startEvent.id] : []);
  }
}

export function updateLifecycleAges(state: SimulationState): void {
  const ordered = [...state.creatures].sort((left, right) => left.id - right.id);
  for (const creature of ordered) {
    if (!creature.alive) continue;
    const previousStage = creature.lifeStage;
    creature.ageTicks += 1;
    creature.lifeStage = lifeStageForAge(creature.ageTicks);
    if (creature.lifeStage !== previousStage) {
      const event = emitDomainEvent(state, {
        type: "LIFE_STAGE_CHANGED",
        actorIds: [creature.id],
        groupIds: creature.groupId === null ? [] : [creature.groupId],
        locationTileIndex: creature.tileIndex,
        quantity: creature.ageTicks,
        importance: 48,
        summary: `${creature.name} entered the ${creature.lifeStage.toLowerCase()} life stage.`,
      });
      creature.majorLifeEventIds.push(event.id);
      if (creature.lifeStage === "ADULT") {
        creature.caregiverId = null;
        creature.dependentUntilTick = null;
      }
    }
  }
}

export function processNaturalMortality(state: SimulationState): void {
  for (const creature of [...state.creatures].sort((left, right) => left.id - right.id)) {
    if (creature.alive && creature.ageTicks >= creature.naturalLifespanTicks) {
      transitionToDead(state, creature, "OLD_AGE");
    }
  }
}

export function processAgesAndNaturalMortality(state: SimulationState): void {
  updateLifecycleAges(state);
  processNaturalMortality(state);
}

export function eligibleMemorialsForMourner(
  state: SimulationState,
  creature: CreatureState,
): MemorialState[] {
  return state.memorials
    .filter(
      (memorial) =>
        memorial.expiresTick > state.tick &&
        memorial.mournerIds.includes(creature.id) &&
        !memorial.completedMournerIds.includes(creature.id),
    )
    .sort((left, right) => left.expiresTick - right.expiresTick || left.id - right.id);
}

export function completeMourning(
  state: SimulationState,
  creature: CreatureState,
  memorialId: number | null,
): boolean {
  const memorial = eligibleMemorialsForMourner(state, creature).find(
    (candidate) => candidate.id === memorialId,
  );
  if (!memorial) return false;
  memorial.completedMournerIds.push(creature.id);
  memorial.completedMournerIds.sort((left, right) => left - right);
  creature.mournedLifeRecordIds.push(memorial.deceasedId);
  const deceased = state.lifeRecords.find((record) => record.id === memorial.deceasedId);
  const event = emitDomainEvent(state, {
    type: "MOURNING_COMPLETED",
    actorIds: [creature.id],
    targetIds: [memorial.deceasedId, memorial.id],
    groupIds:
      deceased?.finalGroupId === null || deceased?.finalGroupId === undefined
        ? []
        : [deceased.finalGroupId],
    locationTileIndex: memorial.tileIndex,
    quantity: 1,
    causedByEventIds: memorialCreationEvidence(state, memorial),
    importance: 58,
    summary: `${creature.name} mourned ${deceased?.name ?? "a lost life"} at the memorial.`,
  });
  addMemory(
    state,
    creature,
    "DEATH_MOURNED",
    memorial.deceasedId,
    memorial.tileIndex,
    -3_000,
    7_000,
    [event.id],
  );
  state.metrics.mournings += 1;
  return true;
}

function estateQuantity(estate: EstateInventory): number {
  return estate.food + estate.material + estate.water;
}

function memorialCreationEvidence(
  state: SimulationState,
  memorial: MemorialState,
): number[] {
  const event = [...state.domainEvents]
    .reverse()
    .find(
      (candidate) =>
        candidate.type === "MEMORIAL_CREATED" && candidate.targetIds[0] === memorial.id,
    );
  return event ? [event.id] : [];
}

function transferEstateToHeir(
  heir: CreatureState,
  estate: EstateInventory,
): EstateInventory {
  let space = Math.max(
    0,
    heir.inventory.capacity -
      heir.inventory.food -
      heir.inventory.material -
      heir.inventory.water,
  );
  const water = Math.min(space, estate.water);
  heir.inventory.water += water;
  space -= water;
  const food = Math.min(space, estate.food);
  heir.inventory.food += food;
  space -= food;
  const material = Math.min(space, estate.material);
  heir.inventory.material += material;
  return {
    food: estate.food - food,
    material: estate.material - material,
    water: estate.water - water,
  };
}

export function eligibleEstateMemorials(
  state: SimulationState,
  creature: CreatureState,
): MemorialState[] {
  return state.memorials
    .filter(
      (memorial) =>
        memorial.expiresTick > state.tick &&
        memorial.heirId === creature.id &&
        estateQuantity(memorial.estate) > 0,
    )
    .sort((left, right) => left.expiresTick - right.expiresTick || left.id - right.id);
}

export function completeEstateClaim(
  state: SimulationState,
  heir: CreatureState,
  memorialId: number | null,
): boolean {
  const memorial = eligibleEstateMemorials(state, heir).find(
    (candidate) => candidate.id === memorialId,
  );
  if (!memorial) return false;
  const before = estateQuantity(memorial.estate);
  memorial.estate = transferEstateToHeir(heir, memorial.estate);
  const deceased = state.lifeRecords.find((record) => record.id === memorial.deceasedId);
  if (deceased) memorial.estate = depositEstateOverflow(state, deceased, memorial.estate);
  const transferred = before - estateQuantity(memorial.estate);
  if (transferred <= 0) return false;
  const event = emitDomainEvent(state, {
    type: "ESTATE_CLAIMED",
    actorIds: [heir.id],
    targetIds: [memorial.deceasedId, memorial.id],
    groupIds:
      deceased?.finalGroupId === null || deceased?.finalGroupId === undefined
        ? []
        : [deceased.finalGroupId],
    locationTileIndex: memorial.tileIndex,
    quantity: transferred,
    causedByEventIds: memorialCreationEvidence(state, memorial),
    importance: 52,
    summary: `${heir.name} inherited ${transferred.toString()} provisions from ${deceased?.name ?? "an estate"}.`,
  });
  heir.majorLifeEventIds.push(event.id);
  if (deceased) deceased.majorEventIds.push(event.id);
  state.metrics.estatesClaimed += 1;
  return true;
}

function depositEstateOverflow(
  state: SimulationState,
  record: LifeRecord,
  estate: EstateInventory,
): EstateInventory {
  const group = state.groups.find(
    (candidate) => candidate.id === record.finalGroupId && candidate.status === "ACTIVE",
  );
  const storage = state.structures.find(
    (structure) =>
      structure.id === group?.storageStructureId && structure.kind === "STORAGE",
  );
  if (!storage) return estate;
  let space = Math.max(
    0,
    storage.inventory.capacity - storage.inventory.food - storage.inventory.material,
  );
  const food = Math.min(space, estate.food);
  storage.inventory.food += food;
  space -= food;
  const material = Math.min(space, estate.material);
  storage.inventory.material += material;
  return {
    food: estate.food - food,
    material: estate.material - material,
    water: estate.water,
  };
}

export function processMemorialsAndEstates(state: SimulationState): void {
  const retained: MemorialState[] = [];
  for (const memorial of [...state.memorials].sort((left, right) => left.id - right.id)) {
    const heir = state.creatures.find(
      (creature) => creature.id === memorial.heirId && creature.alive,
    );
    const record = state.lifeRecords.find(
      (candidate) => candidate.id === memorial.deceasedId,
    );
    if (!heir && record) {
      const replacement = selectHeir(state, record);
      memorial.heirId = replacement?.id ?? null;
      record.heirId = memorial.heirId;
    }
    if (state.tick < memorial.expiresTick) {
      retained.push(memorial);
      continue;
    }
    if (record) memorial.estate = depositEstateOverflow(state, record, memorial.estate);
    emitDomainEvent(state, {
      type: "ESTATE_CLOSED",
      actorIds: memorial.heirId === null ? [] : [memorial.heirId],
      targetIds: [memorial.deceasedId, memorial.id],
      groupIds:
        record?.finalGroupId === null || record?.finalGroupId === undefined
          ? []
          : [record.finalGroupId],
      locationTileIndex: memorial.tileIndex,
      quantity: estateQuantity(memorial.estate),
      causedByEventIds: memorialCreationEvidence(state, memorial),
      importance: 38,
      summary: `The memorial estate for ${record?.name ?? "a lost life"} closed with ${estateQuantity(memorial.estate).toString()} provisions recorded as unclaimed loss.`,
    });
  }
  state.memorials = retained;
}

export function updateLifecycleGroupExtinction(state: SimulationState): void {
  for (const group of state.groups
    .filter((candidate) => candidate.status === "ACTIVE")
    .sort((left, right) => left.id - right.id)) {
    const members = state.creatures.filter(
      (creature) => creature.alive && creature.groupId === group.id,
    );
    if (members.length > 0) continue;
    group.status = "EXTINCT";
    group.extinctTick = state.tick;
    group.memberIds = [];
    group.leaderId = null;
    const removedSiteIds = new Set<number>();
    for (const structure of state.structures) {
      if (structure.groupId !== group.id) continue;
      structure.guardIds = [];
      if (structure.kind === "SHELTER") structure.kind = "ABANDONED_SHELTER";
      if (structure.kind === "STORAGE") structure.kind = "ABANDONED_STORAGE";
      if (structure.kind === "STORAGE_SITE" || structure.kind === "SHELTER_SITE") {
        removedSiteIds.add(structure.id);
        const returned = Math.max(0, structure.material);
        if (returned > 0) {
          state.resourceNodes.push({
            id: state.nextEntityId++,
            kind: "MATERIAL",
            tileIndex: structure.tileIndex,
            currentStock: returned,
            maximumStock: returned,
            regenerationEveryTicks: 0,
            regenerationAmount: 0,
          });
        }
      }
    }
    state.structures = state.structures.filter(
      (structure) => !removedSiteIds.has(structure.id),
    );
    group.storageStructureId = null;
    group.activeShelterId = null;
    group.pendingShelterId = null;
    group.shelterCommitUntilTick = 0;
    group.shelterRelocationCandidate = null;
    state.metrics.groupsExtinct += 1;
    const event = emitDomainEvent(state, {
      type: "GROUP_EXTINCT",
      groupIds: [group.id],
      locationTileIndex: group.homeTileIndex,
      quantity: 0,
      importance: 88,
      summary: `The ${group.name} group became extinct after its last member died.`,
    });
    group.majorEventIds.push(event.id);
    addHistory(
      state,
      "GROUP_EXTINCTION",
      `The ${group.name} group became extinct`,
      event.summary,
      [event.id],
      [],
      [group.id],
      88,
    );
  }
}

export function finalizeLifecycleDeaths(state: SimulationState): void {
  state.creatures = state.creatures.filter((creature) => creature.alive);
}

function relatedLifeRecord(
  state: SimulationState,
  record: LifeRecord,
  relatedToId: number,
): boolean {
  if (
    record.id === relatedToId ||
    record.motherId === relatedToId ||
    record.fatherId === relatedToId
  ) {
    return true;
  }
  const subject = identityRecord(state, relatedToId);
  if (!subject) return false;
  return (
    subject.motherId === record.id ||
    subject.fatherId === record.id ||
    (subject.motherId !== null && subject.motherId === record.motherId) ||
    (subject.fatherId !== null && subject.fatherId === record.fatherId)
  );
}

export function queryLifeRecords(
  state: SimulationState,
  query: LifeRecordQuery = {},
): LifeRecordPage {
  const cursor = Math.max(0, Math.floor(query.cursor ?? 0));
  const limit = Math.max(1, Math.min(100, Math.floor(query.limit ?? 50)));
  const ordered = state.lifeRecords
    .filter(
      (record) =>
        query.relatedToId === null ||
        query.relatedToId === undefined ||
        relatedLifeRecord(state, record, query.relatedToId),
    )
    .filter((record) => record.id > cursor)
    .sort((left, right) => left.id - right.id);
  const page = ordered.slice(0, limit).map((record) => ({
    ...record,
    traitPotential: { ...record.traitPotential },
    skillPotential: { ...record.skillPotential },
    majorEventIds: [...record.majorEventIds],
  }));
  return {
    records: page,
    nextCursor: page.length < ordered.length ? (page.at(-1)?.id ?? null) : null,
  };
}
