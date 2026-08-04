import { describe, expect, it } from "vitest";

import { createScenarioReference } from "@tiny-civ/sim-core";

import {
  scenarioDefinitionIdentity,
  summarizeScenarioIdentity,
} from "./scenario-reporting.js";

describe("headless scenario reporting", () => {
  it("retains the full definition identity and sorted unique map hashes", () => {
    const first = createScenarioReference("split-banks", 2);
    const second = createScenarioReference("split-banks", 9);

    expect(
      summarizeScenarioIdentity([
        { scenario: first, compiledMapHash: "bbbbbbbbbbbbbbbb" },
        { scenario: second, compiledMapHash: "aaaaaaaaaaaaaaaa" },
        { scenario: second, compiledMapHash: "bbbbbbbbbbbbbbbb" },
      ]),
    ).toEqual({
      scenario: scenarioDefinitionIdentity(first),
      compiledMapHashes: ["aaaaaaaaaaaaaaaa", "bbbbbbbbbbbbbbbb"],
    });
  });

  it("rejects empty and cross-definition aggregates", () => {
    expect(() => summarizeScenarioIdentity([])).toThrow(
      "Cannot summarize scenario identity for an empty run collection.",
    );
    expect(() =>
      summarizeScenarioIdentity([
        {
          scenario: createScenarioReference("petri-world", 1),
          compiledMapHash: "aaaaaaaaaaaaaaaa",
        },
        {
          scenario: createScenarioReference("unequal-table", 1),
          compiledMapHash: "bbbbbbbbbbbbbbbb",
        },
      ]),
    ).toThrow("Cannot aggregate runs from different scenario definitions.");
  });
});
