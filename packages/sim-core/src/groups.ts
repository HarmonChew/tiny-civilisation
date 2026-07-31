import { addHistory, emitDomainEvent } from "./events.js";
import { findNearestWalkable } from "./navigation.js";
import { tileCoordinates, tileIndexAt } from "./pathfinding.js";
import { keyedRandomU32, keyedRandomUnit } from "./rng.js";
import { addMemory, relationshipFrom } from "./social.js";
import { getCreature } from "./tick-context.js";
import type { CreatureState, GroupState, SimulationState } from "./types.js";

const UNIT_MAX = 10_000;
const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.max(minimum, Math.min(maximum, Math.round(value)));
const clampUnit = (value: number): number => clamp(value, 0, UNIT_MAX);

function groupName(state: SimulationState, id: number): string {
  const first = ["Moss", "River", "Amber", "Fern", "Stone", "Reed"];
  const second = ["bank", "hollow", "reach", "rest", "bend", "gate"];
  const firstIndex =
    keyedRandomU32(state.seed, "group-name-a", state.tick, id) % first.length;
  const secondIndex =
    keyedRandomU32(state.seed, "group-name-b", state.tick, id) % second.length;
  return `${first[firstIndex] ?? "Moss"}${second[secondIndex] ?? "bank"}`;
}

function leaderSupport(
  state: SimulationState,
  creature: CreatureState,
  members: CreatureState[],
): number {
  let relationshipSupport = 0;
  for (const member of members) {
    if (member.id === creature.id) continue;
    relationshipSupport += relationshipFrom(state, member.id, creature.id)?.trust ?? 0;
  }
  return (
    creature.traits.sociability * 2 +
    creature.traits.generosity +
    creature.traits.loyalty +
    creature.skills.foraging +
    creature.skills.combat / 2 +
    relationshipSupport +
    (keyedRandomUnit(
      state.seed,
      "leader-support",
      state.tick - (state.tick % 50),
      creature.id,
    ) -
      5_000) /
      8
  );
}

function selectLeader(
  state: SimulationState,
  group: GroupState,
  recordHistory: boolean,
): void {
  const members = group.memberIds
    .map((id) => getCreature(state, id))
    .filter((creature): creature is CreatureState => Boolean(creature?.alive));
  if (members.length === 0) {
    group.leaderId = null;
    return;
  }
  const ranked = members
    .map((creature) => ({
      creature,
      support: leaderSupport(state, creature, members),
    }))
    .sort(
      (left, right) => right.support - left.support || left.creature.id - right.creature.id,
    );
  const selected = ranked[0]?.creature ?? members[0];
  if (!selected || group.leaderId === selected.id) return;
  const previous = group.leaderId;
  group.leaderId = selected.id;
  const event = emitDomainEvent(state, {
    type: "LEADER_SELECTED",
    actorIds: [selected.id],
    targetIds: previous === null ? [] : [previous],
    groupIds: [group.id],
    locationTileIndex: group.homeTileIndex,
    importance: 65,
    summary:
      previous === null
        ? `${selected.name} became the first leader of ${group.name}.`
        : `${selected.name} replaced ${getCreature(state, previous)?.name ?? "the former leader"} as leader of ${group.name}.`,
  });
  group.majorEventIds.push(event.id);
  if (recordHistory) {
    addHistory(
      state,
      "LEADERSHIP",
      `${selected.name} became leader`,
      event.summary,
      [event.id],
      previous === null ? [selected.id] : [selected.id, previous],
      [group.id],
      65,
    );
  }
}

function formGroup(state: SimulationState, members: CreatureState[]): void {
  let sumX = 0;
  let sumY = 0;
  for (const member of members) {
    const point = tileCoordinates(state.world, member.tileIndex);
    sumX += point.x;
    sumY += point.y;
  }
  const home = findNearestWalkable(
    state,
    tileIndexAt(
      state.world,
      Math.round(sumX / members.length),
      Math.round(sumY / members.length),
    ),
  );
  const id = state.nextGroupId++;
  const group: GroupState = {
    id,
    name: groupName(state, id),
    stage: "PROVISIONAL",
    foundedTick: state.tick,
    memberIds: members.map((member) => member.id).sort((a, b) => a - b),
    leaderId: null,
    homeTileIndex: home,
    storageStructureId: null,
    cohesion: 5_000,
    sharingNorm: 1_000,
    majorEventIds: [],
  };
  state.groups.push(group);
  for (const member of members) member.groupId = id;
  state.metrics.groupsFormed += 1;
  const event = emitDomainEvent(state, {
    type: "GROUP_FOUNDED",
    actorIds: group.memberIds,
    groupIds: [id],
    locationTileIndex: home,
    importance: 80,
    summary: `${members.map((member) => member.name).join(", ")} formed the ${group.name} group around repeated sharing and sustained proximity.`,
  });
  group.majorEventIds.push(event.id);
  for (const member of members) {
    addMemory(state, member, "GROUP_FOUNDED", null, home, 4_000, 7_500, [event.id]);
  }
  addHistory(
    state,
    "GROUP_FORMED",
    `The ${group.name} group formed`,
    event.summary,
    [event.id],
    group.memberIds,
    [id],
    80,
  );
  selectLeader(state, group, true);
}

export function updateGroups(state: SimulationState): void {
  if (state.tick % 50 !== 0) return;

  const eligible = state.creatures
    .filter(
      (creature) =>
        creature.alive && creature.groupId === null && creature.traits.sociability >= 3_500,
    )
    .sort((left, right) => left.id - right.id);
  const unvisited = new Set(eligible.map((creature) => creature.id));
  for (const seed of eligible) {
    if (!unvisited.has(seed.id)) continue;
    const memberIds: number[] = [];
    const frontier = [seed.id];
    unvisited.delete(seed.id);
    while (frontier.length > 0) {
      const currentId = frontier.shift();
      if (currentId === undefined) break;
      memberIds.push(currentId);
      for (const candidate of eligible) {
        if (!unvisited.has(candidate.id)) continue;
        const forward = relationshipFrom(state, currentId, candidate.id);
        const backward = relationshipFrom(state, candidate.id, currentId);
        const familiar =
          (forward?.familiarity ?? 0) >= 300 && (backward?.familiarity ?? 0) >= 300;
        const safe = (forward?.trust ?? 0) > -500 && (backward?.trust ?? 0) > -500;
        if (familiar && safe) {
          unvisited.delete(candidate.id);
          frontier.push(candidate.id);
        }
      }
    }
    const cooperativeEvents = state.domainEvents.filter(
      (event) =>
        event.type === "FOOD_SHARED" &&
        event.tick >= state.tick - 500 &&
        event.actorIds.some((id) => memberIds.includes(id)) &&
        event.targetIds.some((id) => memberIds.includes(id)),
    ).length;
    if (memberIds.length >= 3 && cooperativeEvents >= 2) {
      const members = memberIds
        .map((id) => getCreature(state, id))
        .filter((creature): creature is CreatureState => Boolean(creature));
      formGroup(state, members);
    }
  }

  for (const group of state.groups) {
    const members = group.memberIds
      .map((id) => getCreature(state, id))
      .filter((creature): creature is CreatureState => Boolean(creature?.alive));
    let trustTotal = 0;
    let trustCount = 0;
    for (const member of members) {
      for (const other of members) {
        if (member.id === other.id) continue;
        const edge = relationshipFrom(state, member.id, other.id);
        if (edge) {
          trustTotal += edge.trust + edge.familiarity / 2;
          trustCount += 1;
        }
      }
      if (group.leaderId === member.id) {
        member.role = "LEADER";
      } else if (member.actionCounts.GUARD > member.actionCounts.GATHER_FOOD) {
        member.role = "GUARD";
      } else if (member.actionCounts.BUILD_STORAGE > member.actionCounts.GATHER_FOOD) {
        member.role = "BUILDER";
      } else {
        member.role = "FORAGER";
      }
    }
    group.cohesion = clampUnit(4_000 + (trustCount === 0 ? 0 : trustTotal / trustCount));
    if (group.leaderId === null || state.tick % 200 === 0) {
      selectLeader(state, group, false);
    }
  }
}
