import { describe, expect, it } from "vitest";
import {
  EXPERIMENT_SCHEMA_VERSION,
  MAX_PERSISTED_JSON_CHARACTERS,
  SIMULATION_BEHAVIOR_VERSION,
  addExperimentBookmark,
  addExperimentCheckpoint,
  appendExperimentIntervention,
  createBranchReplay,
  createExperiment,
  createPendingIntervention,
  createScenarioReference,
  createSimulation,
  createSimulationReplay,
  deserializeExperiment,
  deserializeScenarioReference,
  deserializeSimulationReplay,
  executeSimulationReplay,
  forkExperimentBranch,
  hashSimulationState,
  migrateExperiment,
  migrateSimulationReplay,
  queuePlayerCommand,
  serializeExperiment,
  serializeScenarioReference,
  serializeSimulationReplay,
  setExperimentBranchResult,
  settleExperimentIntervention,
  type ExperimentV1,
} from "../src/index.js";

function buildExperiment(): ExperimentV1 {
  const scenario = createScenarioReference(812);
  let experiment = createExperiment(scenario);
  const state = createSimulation(scenario.seed);
  const command = queuePlayerCommand(state, {
    type: "ADD_FOOD",
    tileIndex: 340,
    amount: 9,
    applyAtTick: 5,
  });
  experiment = appendExperimentIntervention(
    experiment,
    "baseline",
    createPendingIntervention(command),
  );
  experiment = settleExperimentIntervention(experiment, "baseline", 1, {
    status: "APPLIED",
    appliedAtTick: 5,
    resolvedTileIndex: command.tileIndex,
    quantity: 9,
    blocked: null,
    eventIds: [2],
    reason: null,
  });
  const result = executeSimulationReplay(createBranchReplay(experiment, "baseline"), {
    finalTick: 40,
  });
  experiment = setExperimentBranchResult(
    experiment,
    "baseline",
    result.finalTick,
    result.finalHash,
  );
  experiment = addExperimentBookmark(experiment, {
    id: "before-branch",
    branchId: "baseline",
    tick: 10,
    label: "Before the intervention branch",
  });
  return addExperimentCheckpoint(experiment, {
    id: "baseline-40",
    branchId: "baseline",
    tick: 40,
    stateHash: result.finalHash,
  });
}

describe("versioned experiment contracts", () => {
  it("round trips scenario and experiment metadata as immutable values", () => {
    const scenario = createScenarioReference(812);
    expect(deserializeScenarioReference(serializeScenarioReference(scenario))).toEqual(
      scenario,
    );

    const experiment = buildExperiment();
    const loaded = deserializeExperiment(serializeExperiment(experiment));
    expect(loaded).toEqual(experiment);
    expect(loaded.schemaVersion).toBe(EXPERIMENT_SCHEMA_VERSION);
    expect(Object.isFrozen(loaded)).toBe(true);
    expect(Object.isFrozen(loaded.branches)).toBe(true);
    expect(Object.isFrozen(loaded.branches[0]?.commandLog[0]?.command)).toBe(true);
    expect(Object.isFrozen(loaded.branches[0]?.commandLog[0]?.outcome)).toBe(true);
  });

  it("forks from a common prefix without mutating or aliasing the parent branch", () => {
    const baseline = buildExperiment();
    const forked = forkExperimentBranch(
      baseline,
      "baseline",
      "food-shock",
      "Food shock",
      10,
    );
    const branchCommand = {
      commandId: 2,
      applyAtTick: 10,
      type: "REMOVE_FOOD",
      tileIndex: 340,
      amount: 5,
      blocked: null,
    } as const;
    const changed = appendExperimentIntervention(
      forked,
      "food-shock",
      createPendingIntervention(branchCommand),
    );

    expect(baseline.branches).toHaveLength(1);
    expect(
      forked.branches.find((branch) => branch.id === "baseline")?.commandLog,
    ).toHaveLength(1);
    expect(
      changed.branches.find((branch) => branch.id === "food-shock")?.commandLog,
    ).toHaveLength(2);
    expect(
      changed.branches.find((branch) => branch.id === "baseline")?.commandLog,
    ).toHaveLength(1);
    expect(changed.branches[0]).not.toBe(baseline.branches[0]);
  });

  it("invalidates stale results and rejects impossible command outcome horizons", () => {
    const completed = buildExperiment();
    const command = {
      commandId: 2,
      applyAtTick: 50,
      type: "ADD_FOOD",
      tileIndex: 340,
      amount: 3,
      blocked: null,
    } as const;
    const changed = appendExperimentIntervention(
      completed,
      "baseline",
      createPendingIntervention(command),
    );
    expect(changed.branches[0]).toMatchObject({
      targetTick: null,
      expectedHash: null,
    });
    expect(() =>
      setExperimentBranchResult(changed, "baseline", 50, "0000000000000000"),
    ).toThrow("targetTick must be after its last command tick");
    expect(() =>
      settleExperimentIntervention(changed, "baseline", 2, {
        status: "APPLIED",
        appliedAtTick: 51,
        resolvedTileIndex: 340,
        quantity: 3,
        blocked: null,
        eventIds: [3],
        reason: null,
      }),
    ).toThrow("outcome tick must match the scheduled command");
  });

  it("rejects bookmarks outside their branch horizon", () => {
    const completed = setExperimentBranchResult(
      createExperiment(createScenarioReference(42)),
      "baseline",
      10,
      "0".repeat(16),
    );
    const invalid = {
      ...completed,
      bookmarks: [
        {
          id: "future-mark",
          branchId: "baseline",
          tick: 11,
          label: "Beyond the recorded result",
        },
      ],
    };

    expect(() => deserializeExperiment(JSON.stringify(invalid))).toThrow(
      "exceeds its branch horizon",
    );

    const forked = forkExperimentBranch(
      completed,
      "baseline",
      "later-branch",
      "Later branch",
      5,
    );
    expect(() =>
      deserializeExperiment(
        JSON.stringify({
          ...forked,
          bookmarks: [
            {
              id: "early-mark",
              branchId: "later-branch",
              tick: 4,
              label: "Before the fork",
            },
          ],
        }),
      ),
    ).toThrow("precedes its branch fork");
  });

  it("rejects incompatible, malformed, orphaned, and divergent branch data", () => {
    const experiment = buildExperiment();
    expect(() => migrateExperiment({ ...experiment, behaviorVersion: 999 })).toThrow(
      "Experiment behavior version 999 is incompatible",
    );
    expect(() => migrateExperiment({ ...experiment, unknown: true })).toThrow(
      "unsupported field unknown",
    );
    expect(() =>
      migrateExperiment({
        ...experiment,
        branches: [
          ...experiment.branches,
          {
            id: "orphan",
            label: "Orphan",
            parentBranchId: "missing",
            forkTick: 10,
            targetTick: null,
            expectedHash: null,
            commandLog: [],
          },
        ],
      }),
    ).toThrow("has a missing parent");

    const forked = forkExperimentBranch(experiment, "baseline", "branch", "Branch", 10);
    const corrupt = JSON.parse(JSON.stringify(forked)) as ExperimentV1;
    const branch = corrupt.branches.find((candidate) => candidate.id === "branch");
    if (!branch) throw new Error("Test branch missing.");
    (branch.commandLog[0]?.command as { tileIndex: number }).tileIndex += 1;
    const outcome = branch.commandLog[0]?.outcome;
    if (outcome && outcome.status !== "PENDING") {
      (outcome as { resolvedTileIndex: number }).resolvedTileIndex += 1;
    }
    expect(() => migrateExperiment(corrupt)).toThrow("diverges before its fork tick");
  });

  it("fails early on invalid JSON and oversized serialized contracts", () => {
    expect(() => deserializeExperiment("{")).toThrow("Experiment data is not valid JSON");
    expect(() => deserializeScenarioReference("null")).toThrow(
      "Scenario must be an object",
    );
    expect(() =>
      deserializeExperiment(" ".repeat(MAX_PERSISTED_JSON_CHARACTERS + 1)),
    ).toThrow("Experiment data exceeds");
  });
});

describe("replay parsing and execution", () => {
  it("reconstructs the same authoritative state and verifies its hash", () => {
    const state = createSimulation(91);
    const commands = [
      queuePlayerCommand(state, {
        type: "REMOVE_FOOD",
        tileIndex: 346,
        amount: 4,
        applyAtTick: 5,
      }),
      queuePlayerCommand(state, {
        type: "ADD_FOOD",
        tileIndex: 400,
        amount: 7,
        applyAtTick: 12,
      }),
    ];
    // The replay executor installs the same resolved schedule before advancing.
    const unverified = executeSimulationReplay(
      createSimulationReplay(state.seed, commands),
      { finalTick: 80 },
    );
    const replay = createSimulationReplay(state.seed, commands, {
      finalTick: 80,
      finalHash: unverified.finalHash,
    });
    const loaded = deserializeSimulationReplay(serializeSimulationReplay(replay));
    const result = executeSimulationReplay(loaded, { requireHashMatch: true });

    expect(result.hashStatus).toBe("VERIFIED");
    expect(result.finalHash).toBe(hashSimulationState(result.state));
    expect(result.finalTick).toBe(80);
  });

  it("reports and optionally throws on a final hash mismatch", () => {
    const replay = createSimulationReplay(2, [], {
      finalTick: 4,
      finalHash: "0000000000000000",
    });
    expect(executeSimulationReplay(replay).hashStatus).toBe("MISMATCH");
    expect(() => executeSimulationReplay(replay, { requireHashMatch: true })).toThrow(
      "Replay hash mismatch",
    );
  });

  it("deeply rejects malformed and incompatible replay data", () => {
    const replay = createSimulationReplay(4, []);
    expect(() => deserializeSimulationReplay("nope")).toThrow(
      "Replay data is not valid JSON",
    );
    expect(() => migrateSimulationReplay({ ...replay, schemaVersion: 999 })).toThrow(
      "Unsupported replay schema version 999",
    );
    expect(() =>
      migrateSimulationReplay({
        ...replay,
        behaviorVersion: SIMULATION_BEHAVIOR_VERSION,
        commands: [
          {
            commandId: 2,
            applyAtTick: 0,
            type: "ADD_FOOD",
            tileIndex: 3,
            amount: 1,
            blocked: null,
          },
        ],
      }),
    ).toThrow("command IDs must be contiguous");
    expect(() => migrateSimulationReplay({ ...replay, finalTick: 2 })).toThrow(
      "finalTick and finalHash",
    );
    const command = {
      commandId: 1,
      applyAtTick: 4,
      type: "ADD_FOOD",
      tileIndex: 3,
      amount: 1,
      blocked: null,
    } as const;
    expect(() =>
      createSimulationReplay(4, [command], {
        finalTick: 4,
        finalHash: "0000000000000000",
      }),
    ).toThrow("finalTick must be after its last command tick");
    expect(() => executeSimulationReplay(replay, { finalTick: -1 })).toThrow(
      "nonnegative safe integer",
    );
  });
});
