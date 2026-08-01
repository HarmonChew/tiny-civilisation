import type { EntityId } from "../model";

export type WorldFocusSource =
  "ROSTER" | "DISH" | "CHRONICLE" | "INSPECTOR" | "EVIDENCE" | "MOMENT";

export type WorldRef =
  | { readonly kind: "creature"; readonly id: EntityId }
  | { readonly kind: "resource"; readonly id: EntityId }
  | { readonly kind: "structure"; readonly id: EntityId }
  | { readonly kind: "group"; readonly id: EntityId }
  | { readonly kind: "event"; readonly id: number }
  | { readonly kind: "memory"; readonly id: number }
  | { readonly kind: "tile"; readonly tileIndex: number }
  | {
      readonly kind: "relationship";
      readonly fromId: EntityId;
      readonly toId: EntityId;
    }
  | {
      readonly kind: "desire";
      readonly creatureId: EntityId;
      readonly decisionId: number;
    }
  | {
      readonly kind: "plan";
      readonly creatureId: EntityId;
      readonly decisionId: number;
    };

export interface WorldFocusState {
  readonly hovered: WorldRef | null;
  readonly keyboardFocused: WorldRef | null;
  readonly selected: WorldRef | null;
  readonly evidenceFocus: WorldRef | null;
  readonly source: WorldFocusSource | null;
}

export const INITIAL_WORLD_FOCUS_STATE: WorldFocusState = {
  hovered: null,
  keyboardFocused: null,
  selected: null,
  evidenceFocus: null,
  source: null,
};

export const creatureRef = (id: EntityId): WorldRef => ({ kind: "creature", id });

export const eventRef = (id: number): WorldRef => ({ kind: "event", id });

export function worldRefKey(ref: WorldRef): string {
  switch (ref.kind) {
    case "creature":
    case "resource":
    case "structure":
    case "group":
    case "event":
    case "memory":
      return `${ref.kind}:${ref.id}`;
    case "tile":
      return `${ref.kind}:${ref.tileIndex}`;
    case "relationship":
      return `${ref.kind}:${ref.fromId}:${ref.toId}`;
    case "desire":
    case "plan":
      return `${ref.kind}:${ref.creatureId}:${ref.decisionId}`;
  }
}

export function sameWorldRef(left: WorldRef | null, right: WorldRef | null): boolean {
  if (left === right) return true;
  if (left === null || right === null) return false;
  return worldRefKey(left) === worldRefKey(right);
}

export function creatureIdFromRef(ref: WorldRef | null): EntityId | null {
  return ref?.kind === "creature" ? ref.id : null;
}

export function eventIdFromRef(ref: WorldRef | null): number | null {
  return ref?.kind === "event" ? ref.id : null;
}
