import type { ActionKind } from "../types.js";

export interface ActionDefinition {
  readonly kind: ActionKind;
  readonly duration: number;
  readonly family: "survival" | "resource" | "social" | "group" | "conflict" | "lifecycle";
}

export const ACTION_DEFINITIONS = [
  { kind: "EXPLORE", duration: 2, family: "survival" },
  { kind: "GATHER_FOOD", duration: 11, family: "resource" },
  { kind: "GATHER_MATERIAL", duration: 13, family: "resource" },
  { kind: "GATHER_WATER", duration: 10, family: "resource" },
  { kind: "EAT", duration: 4, family: "survival" },
  { kind: "DRINK", duration: 3, family: "survival" },
  { kind: "REST", duration: 22, family: "survival" },
  { kind: "ESTABLISH_SHELTER_SITE", duration: 8, family: "group" },
  { kind: "BUILD_SHELTER", duration: 16, family: "group" },
  { kind: "REST_SHELTERED", duration: 18, family: "survival" },
  { kind: "MAINTAIN_SHELTER", duration: 10, family: "group" },
  { kind: "SHARE", duration: 4, family: "social" },
  { kind: "SHARE_WATER", duration: 4, family: "social" },
  { kind: "KEEP", duration: 10, family: "survival" },
  { kind: "STEAL", duration: 5, family: "conflict" },
  { kind: "DEPOSIT", duration: 4, family: "group" },
  { kind: "WITHDRAW", duration: 4, family: "group" },
  { kind: "BUILD_STORAGE", duration: 14, family: "group" },
  { kind: "GUARD", duration: 34, family: "group" },
  { kind: "ATTACK", duration: 4, family: "conflict" },
  { kind: "FLEE", duration: 3, family: "conflict" },
  { kind: "JOIN_GROUP", duration: 5, family: "social" },
  { kind: "FORM_FAMILY", duration: 8, family: "lifecycle" },
  { kind: "CARE_FOR_YOUNG", duration: 12, family: "lifecycle" },
  { kind: "MOURN", duration: 30, family: "lifecycle" },
  { kind: "CLAIM_ESTATE", duration: 10, family: "lifecycle" },
] as const satisfies readonly ActionDefinition[];

const durations = new Map<ActionKind, number>(
  ACTION_DEFINITIONS.map((definition) => [definition.kind, definition.duration]),
);

export function getActionDuration(kind: ActionKind): number {
  const duration = durations.get(kind);
  if (duration === undefined) {
    throw new Error(`Action ${kind} has no registered duration.`);
  }
  return duration;
}
