import type { CreatureView, Point } from "../../model";

export type CreatureActionFamily =
  | "travel"
  | "gather"
  | "eat"
  | "drink"
  | "build"
  | "maintenance"
  | "share"
  | "guard"
  | "conflict"
  | "flee"
  | "rest"
  | "storage"
  | "observe";

export interface DirectionVector extends Point {
  readonly angle: number;
}

export interface CarriedAmounts {
  readonly food: number;
  readonly material: number;
  readonly water: number;
}

export const IDENTITY_GLYPHS = ["●", "▲", "■", "◆", "✦", "+", "×", "="] as const;

function normalizedAction(action: string): string {
  return action
    .trim()
    .replace(/[\s-]+/g, "_")
    .toUpperCase();
}

export function actionFamily(action: string, phase = ""): CreatureActionFamily {
  const normalized = normalizedAction(action);
  if (
    normalized === "GATHER_FOOD" ||
    normalized === "GATHER_MATERIAL" ||
    normalized === "GATHER_WATER"
  ) {
    return "gather";
  }
  if (normalized === "EAT") return "eat";
  if (normalized === "DRINK") return "drink";
  if (
    normalized === "BUILD_STORAGE" ||
    normalized === "ESTABLISH_SHELTER_SITE" ||
    normalized === "BUILD_SHELTER"
  ) {
    return "build";
  }
  if (normalized === "MAINTAIN_SHELTER") return "maintenance";
  if (normalized === "SHARE" || normalized === "SHARE_WATER" || normalized === "JOIN_GROUP")
    return "share";
  if (normalized === "GUARD") return "guard";
  if (normalized === "ATTACK" || normalized === "STEAL") return "conflict";
  if (normalized === "FLEE") return "flee";
  if (normalized === "REST" || normalized === "REST_SHELTERED") return "rest";
  if (normalized === "DEPOSIT" || normalized === "WITHDRAW" || normalized === "KEEP") {
    return "storage";
  }
  if (normalized === "EXPLORE" || normalizedAction(phase) === "MOVING") {
    return "travel";
  }
  return "observe";
}

export function identityVariant(id: number): number {
  return (Math.imul(id >>> 0, 2_654_435_761) >>> 0) % IDENTITY_GLYPHS.length;
}

export function identityGlyph(id: number): (typeof IDENTITY_GLYPHS)[number] {
  return IDENTITY_GLYPHS[identityVariant(id)] ?? IDENTITY_GLYPHS[0];
}

export function directionForCreature(creature: CreatureView): DirectionVector | null {
  for (let index = creature.route.length - 1; index >= 0; index -= 1) {
    const sample = creature.route[index];
    if (!sample) continue;
    const x = creature.x - sample.x;
    const y = creature.y - sample.y;
    const distance = Math.hypot(x, y);
    if (distance > 0.025)
      return { x: x / distance, y: y / distance, angle: Math.atan2(y, x) };
  }

  if (!creature.goalTarget) return null;
  const x = creature.goalTarget.x - creature.x;
  const y = creature.goalTarget.y - creature.y;
  const distance = Math.hypot(x, y);
  if (distance <= 0.025) return null;
  return { x: x / distance, y: y / distance, angle: Math.atan2(y, x) };
}

export function carriedAmounts(creature: CreatureView): CarriedAmounts {
  let food = 0;
  let material = 0;
  let water = 0;
  for (const stack of creature.inventory) {
    if (/FOOD/i.test(stack.kind)) food += Math.max(0, stack.quantity);
    if (/MATERIAL/i.test(stack.kind)) material += Math.max(0, stack.quantity);
    if (/WATER/i.test(stack.kind)) water += Math.max(0, stack.quantity);
  }
  return { food, material, water };
}

export function compactLabel(value: string, maximumLength = 24): string {
  const label = value
    .replace(/[_-]+/g, " ")
    .toLowerCase()
    .replace(/^\w/, (letter) => letter.toUpperCase());
  return label.length <= maximumLength
    ? label
    : `${label.slice(0, Math.max(1, maximumLength - 1)).trimEnd()}…`;
}
