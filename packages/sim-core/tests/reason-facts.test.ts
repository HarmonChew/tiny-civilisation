import { describe, expect, it } from "vitest";
import { reasonFactText, type ReasonFact } from "../src/index.js";

function fact(overrides: Partial<ReasonFact> = {}): ReasonFact {
  return {
    kind: "WORLD",
    key: "weather pressure",
    label: "Weather pressure",
    value: 12,
    unit: "UNIT",
    sourceEntityId: null,
    sourceEventIds: [],
    capturedAtTick: 40,
    ...overrides,
  };
}

function becauseSentence(reason: ReasonFact): string {
  return `Iri is doing this because ${reasonFactText(reason)}.`;
}

describe("user-facing reason fact grammar", () => {
  it("turns keep-a-reserve evidence into a grammatical because-clause", () => {
    expect(
      becauseSentence(
        fact({
          kind: "INVENTORY",
          key: "keep a reserve",
          label: "Keep a reserve",
          value: 3,
          unit: "COUNT",
        }),
      ),
    ).toBe("Iri is doing this because keeping a reserve matters to them.");
  });

  it("turns a generic retained fact into a grammatical because-clause", () => {
    expect(becauseSentence(fact())).toBe(
      "Iri is doing this because the retained “weather pressure” factor weighs most.",
    );
  });
});
