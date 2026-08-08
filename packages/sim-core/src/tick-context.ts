import type {
  CreatureState,
  GroupState,
  RelationshipEdge,
  ResourceNode,
  SimulationState,
  StructureState,
} from "./types.js";

export interface TickLookupContext {
  readonly creatures: Map<number, CreatureState>;
  readonly resources: Map<number, ResourceNode>;
  readonly structures: Map<number, StructureState>;
  readonly groups: Map<number, GroupState>;
  readonly relationships: Map<string, RelationshipEdge>;
}

const activeContexts = new WeakMap<SimulationState, TickLookupContext>();
const relationshipKey = (fromId: number, toId: number): string => `${fromId}:${toId}`;

export function beginTickContext(state: SimulationState): TickLookupContext {
  const context: TickLookupContext = {
    creatures: new Map(state.creatures.map((item) => [item.id, item])),
    resources: new Map(state.resourceNodes.map((item) => [item.id, item])),
    structures: new Map(state.structures.map((item) => [item.id, item])),
    groups: new Map(state.groups.map((item) => [item.id, item])),
    relationships: new Map(
      state.relationships.map((item) => [relationshipKey(item.fromId, item.toId), item]),
    ),
  };
  activeContexts.set(state, context);
  return context;
}

export function endTickContext(state: SimulationState): void {
  activeContexts.delete(state);
}

export function getCreature(state: SimulationState, id: number): CreatureState | null {
  const context = activeContexts.get(state);
  const indexed = context?.creatures.get(id);
  if (indexed) return indexed;
  const found = state.creatures.find((item) => item.id === id) ?? null;
  if (found) context?.creatures.set(id, found);
  return found;
}

export function getResourceNode(state: SimulationState, id: number): ResourceNode | null {
  const context = activeContexts.get(state);
  const indexed = context?.resources.get(id);
  if (indexed) return indexed;
  const found = state.resourceNodes.find((item) => item.id === id) ?? null;
  if (found) context?.resources.set(id, found);
  return found;
}

export function getStructure(state: SimulationState, id: number): StructureState | null {
  const context = activeContexts.get(state);
  const indexed = context?.structures.get(id);
  if (indexed) return indexed;
  const found = state.structures.find((item) => item.id === id) ?? null;
  if (found) context?.structures.set(id, found);
  return found;
}

export function getGroup(state: SimulationState, id: number): GroupState | null {
  const context = activeContexts.get(state);
  const indexed = context?.groups.get(id);
  if (indexed) return indexed;
  const found = state.groups.find((item) => item.id === id) ?? null;
  if (found) context?.groups.set(id, found);
  return found;
}

export function getRelationship(
  state: SimulationState,
  fromId: number,
  toId: number,
): RelationshipEdge | null {
  const context = activeContexts.get(state);
  const key = relationshipKey(fromId, toId);
  const indexed = context?.relationships.get(key);
  if (indexed) return indexed;
  const found =
    state.relationships.find((item) => item.fromId === fromId && item.toId === toId) ??
    null;
  if (found) context?.relationships.set(key, found);
  return found;
}

export function indexRelationship(
  state: SimulationState,
  relationship: RelationshipEdge,
): void {
  activeContexts
    .get(state)
    ?.relationships.set(
      relationshipKey(relationship.fromId, relationship.toId),
      relationship,
    );
}

export function refreshRelationshipIndex(state: SimulationState): void {
  const relationships = activeContexts.get(state)?.relationships;
  if (!relationships) return;
  relationships.clear();
  for (const relationship of state.relationships) {
    relationships.set(
      relationshipKey(relationship.fromId, relationship.toId),
      relationship,
    );
  }
}

export function entityTile(state: SimulationState, entityId: number): number | null {
  return (
    getCreature(state, entityId)?.tileIndex ??
    getResourceNode(state, entityId)?.tileIndex ??
    getStructure(state, entityId)?.tileIndex ??
    state.memorials.find((memorial) => memorial.id === entityId)?.tileIndex ??
    null
  );
}
