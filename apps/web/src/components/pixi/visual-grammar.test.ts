import { describe, expect, it } from "vitest";
import type { CreatureView } from "../../model";
import {
  actionFamily,
  carriedAmounts,
  compactLabel,
  directionForCreature,
  identityGlyph,
  identityVariant,
} from "./visual-grammar";

function creature(overrides: Partial<CreatureView> = {}): CreatureView {
  return {
    id: 4,
    name: "Aro",
    color: 0x88a060,
    x: 5,
    y: 6,
    alive: true,
    role: "Guard",
    desire: "PROTECT_PERSON_OR_GROUP",
    plan: "GUARD_SHARED_STORAGE",
    goal: "PROTECT_PERSON_OR_GROUP",
    action: "GUARD",
    actionPhase: "WORKING",
    reason: "A theft was remembered",
    summary: {
      desire: "Aro wants the group to be safe.",
      plan: "Aro plans to guard the store.",
      action: "Aro is guarding.",
      reason: "Aro remembered a theft.",
    },
    route: [],
    health: 90,
    hunger: 20,
    fatigue: 25,
    thirst: 30,
    traits: [],
    inventory: [],
    candidates: [],
    memories: [],
    relationships: [],
    ...overrides,
  };
}

describe("dish visual grammar", () => {
  it("maps every current action family to a distinct readable treatment", () => {
    expect(actionFamily("GATHER_FOOD")).toBe("gather");
    expect(actionFamily("GATHER_WATER")).toBe("gather");
    expect(actionFamily("EAT")).toBe("eat");
    expect(actionFamily("DRINK")).toBe("drink");
    expect(actionFamily("BUILD_STORAGE")).toBe("build");
    expect(actionFamily("ESTABLISH_SHELTER_SITE")).toBe("build");
    expect(actionFamily("BUILD_SHELTER")).toBe("build");
    expect(actionFamily("MAINTAIN_SHELTER")).toBe("maintenance");
    expect(actionFamily("SHARE")).toBe("share");
    expect(actionFamily("SHARE_WATER")).toBe("share");
    expect(actionFamily("GUARD")).toBe("guard");
    expect(actionFamily("ATTACK")).toBe("conflict");
    expect(actionFamily("STEAL")).toBe("conflict");
    expect(actionFamily("FLEE")).toBe("flee");
    expect(actionFamily("REST")).toBe("rest");
    expect(actionFamily("REST_SHELTERED")).toBe("rest");
    expect(actionFamily("DEPOSIT")).toBe("storage");
    expect(actionFamily("EXPLORE")).toBe("travel");
    expect(actionFamily("KEEP")).toBe("storage");
    expect(actionFamily("SHARE", "MOVING")).toBe("share");
  });

  it("keeps identity marks stable and non-color-dependent", () => {
    expect(identityVariant(4)).toBe(identityVariant(4));
    expect(identityGlyph(4)).toBe(identityGlyph(4));
    expect(
      new Set(Array.from({ length: 8 }, (_, index) => identityGlyph(index + 1))).size,
    ).toBe(8);
  });

  it("derives direction from recent motion before falling back to destination", () => {
    expect(
      directionForCreature(
        creature({
          route: [
            { tick: 1, x: 3, y: 6 },
            { tick: 2, x: 4, y: 6 },
          ],
          goalTarget: { x: 5, y: 2 },
        }),
      ),
    ).toMatchObject({ x: 1, y: 0 });
    expect(directionForCreature(creature({ goalTarget: { x: 5, y: 3 } }))).toMatchObject({
      x: 0,
      y: -1,
    });
  });

  it("summarizes attached carrying cues and bounds dish labels", () => {
    expect(
      carriedAmounts(
        creature({
          inventory: [
            { kind: "FOOD", quantity: 2 },
            { kind: "MATERIAL", quantity: 3 },
            { kind: "WATER", quantity: 4 },
          ],
        }),
      ),
    ).toEqual({ food: 2, material: 3, water: 4 });
    expect(compactLabel("PRESERVE_PRIVATE_RESERVE", 16)).toBe("Preserve privat…");
  });
});
