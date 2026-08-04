import type { ScenarioReferenceV2 } from "@tiny-civ/sim-core";

export type ScenarioDefinitionIdentity = Omit<ScenarioReferenceV2, "seed">;

export interface ScenarioRunIdentity {
  readonly scenario: ScenarioReferenceV2;
  readonly compiledMapHash: string;
}

export interface ScenarioAggregateIdentity {
  readonly scenario: ScenarioDefinitionIdentity;
  readonly compiledMapHashes: readonly string[];
}

export function scenarioDefinitionIdentity(
  reference: ScenarioReferenceV2,
): ScenarioDefinitionIdentity {
  const { seed: _seed, ...identity } = reference;
  return identity;
}

export function summarizeScenarioIdentity(
  runs: readonly ScenarioRunIdentity[],
): ScenarioAggregateIdentity {
  const first = runs[0];
  if (first === undefined) {
    throw new Error("Cannot summarize scenario identity for an empty run collection.");
  }

  const scenario = scenarioDefinitionIdentity(first.scenario);
  const expectedIdentity = JSON.stringify(scenario);
  for (const run of runs.slice(1)) {
    if (JSON.stringify(scenarioDefinitionIdentity(run.scenario)) !== expectedIdentity) {
      throw new Error("Cannot aggregate runs from different scenario definitions.");
    }
  }

  return {
    scenario,
    compiledMapHashes: [...new Set(runs.map((run) => run.compiledMapHash))].sort(),
  };
}
