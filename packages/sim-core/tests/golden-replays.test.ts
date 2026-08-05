import { describe, expect, it } from "vitest";
import {
  advanceSimulation,
  createSimulation,
  hashSimulationState,
  queuePlayerCommand,
  REPLAY_SCHEMA_VERSION,
  SIMULATION_BEHAVIOR_VERSION,
  type AddFoodCommand,
  type RemoveFoodCommand,
  type ScheduledPlayerCommand,
  type SimulationMetrics,
  type SimulationState,
  type ToggleObstacleCommand,
} from "../src/index.js";

type ReplayCommand =
  | Omit<AddFoodCommand, "applyAtTick">
  | Omit<RemoveFoodCommand, "applyAtTick">
  | Omit<ToggleObstacleCommand, "applyAtTick">;

interface ReplayIntervention {
  readonly atTick: number;
  readonly command: ReplayCommand;
}

interface GoldenReplayScenario {
  readonly id: string;
  readonly seed: number;
  readonly interventions: readonly ReplayIntervention[];
  readonly checkpoints: readonly number[];
  readonly jsonRoundTripAtTicks: readonly number[];
}

interface GoldenCheckpoint {
  readonly tick: number;
  readonly hash: string;
  readonly schemaVersion: number;
  readonly population: number;
  readonly groups: number;
  readonly metrics: SimulationMetrics;
}

interface GoldenReplayResult {
  readonly id: string;
  readonly seed: number;
  readonly scheduledCommands: ScheduledPlayerCommand[];
  readonly jsonRoundTripAtTicks: readonly number[];
  readonly checkpoints: GoldenCheckpoint[];
}

interface GoldenReplayCorpus {
  readonly replaySchemaVersion: typeof REPLAY_SCHEMA_VERSION;
  readonly simulationSchemaVersion: number;
  readonly simulationBehaviorVersion: number;
  readonly scenarios: GoldenReplayResult[];
}

const SCENARIOS = [
  {
    id: "default-social-loop",
    seed: 4_182,
    interventions: [],
    checkpoints: [0, 51, 166, 473, 1_000, 5_000],
    jsonRoundTripAtTicks: [],
  },
  {
    id: "peaceful-save-resume",
    seed: 921,
    interventions: [],
    checkpoints: [0, 181, 1_200, 2_400],
    jsonRoundTripAtTicks: [1_200],
  },
  {
    id: "food-shock",
    seed: 4_182,
    interventions: [
      {
        atTick: 25,
        command: { type: "REMOVE_FOOD", x: 10, y: 7, amount: 20 },
      },
      {
        atTick: 80,
        command: { type: "ADD_FOOD", x: 16, y: 10, amount: 30 },
      },
      {
        atTick: 240,
        command: { type: "ADD_FOOD", x: 10, y: 7, amount: 12 },
      },
    ],
    checkpoints: [0, 25, 26, 80, 81, 240, 241, 1_000],
    jsonRoundTripAtTicks: [],
  },
  {
    id: "chokepoint-close-reopen",
    seed: 23,
    interventions: [
      {
        atTick: 0,
        command: { type: "TOGGLE_OBSTACLE", x: 24, y: 14, blocked: true },
      },
      {
        atTick: 0,
        command: { type: "TOGGLE_OBSTACLE", x: 24, y: 15, blocked: true },
      },
      {
        atTick: 0,
        command: { type: "TOGGLE_OBSTACLE", x: 24, y: 16, blocked: true },
      },
      {
        atTick: 0,
        command: { type: "TOGGLE_OBSTACLE", x: 24, y: 17, blocked: true },
      },
      {
        atTick: 120,
        command: { type: "TOGGLE_OBSTACLE", x: 24, y: 15, blocked: false },
      },
    ],
    checkpoints: [0, 1, 120, 121, 600],
    jsonRoundTripAtTicks: [],
  },
] as const satisfies readonly GoldenReplayScenario[];

function assertNonnegativeInteger(value: number, label: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${label} must be a nonnegative integer; received ${value}.`);
  }
}

function assertStrictlyAscending(values: readonly number[], label: string): void {
  let previous = -1;
  for (const value of values) {
    assertNonnegativeInteger(value, label);
    if (value <= previous) {
      throw new Error(`${label} must be strictly ascending.`);
    }
    previous = value;
  }
}

function validateScenarios(scenarios: readonly GoldenReplayScenario[]): void {
  const ids = new Set<string>();
  for (const scenario of scenarios) {
    if (ids.has(scenario.id)) {
      throw new Error(`Replay scenario ID ${scenario.id} is duplicated.`);
    }
    ids.add(scenario.id);

    assertNonnegativeInteger(scenario.seed, `${scenario.id} seed`);
    assertStrictlyAscending(scenario.checkpoints, `${scenario.id} checkpoints`);
    if (scenario.checkpoints[0] !== 0) {
      throw new Error(`${scenario.id} must have an initial tick 0 checkpoint.`);
    }

    const finalCheckpoint = scenario.checkpoints.at(-1);
    if (finalCheckpoint === undefined) {
      throw new Error(`${scenario.id} must have at least one checkpoint.`);
    }

    let previousInterventionTick = -1;
    for (const intervention of scenario.interventions) {
      assertNonnegativeInteger(intervention.atTick, `${scenario.id} intervention tick`);
      if (intervention.atTick < previousInterventionTick) {
        throw new Error(`${scenario.id} interventions must be ordered by scheduled tick.`);
      }
      if (intervention.atTick >= finalCheckpoint) {
        throw new Error(
          `${scenario.id} interventions must occur before the final checkpoint.`,
        );
      }
      if ("applyAtTick" in intervention.command) {
        throw new Error(
          `${scenario.id} intervention ticks must be declared with atTick only.`,
        );
      }
      previousInterventionTick = intervention.atTick;
    }

    assertStrictlyAscending(
      scenario.jsonRoundTripAtTicks,
      `${scenario.id} JSON round-trip ticks`,
    );
    for (const tick of scenario.jsonRoundTripAtTicks) {
      if (!scenario.checkpoints.includes(tick)) {
        throw new Error(`${scenario.id} JSON round trips must occur at checkpoints.`);
      }
      if (tick >= finalCheckpoint) {
        throw new Error(
          `${scenario.id} JSON round trips must precede the final checkpoint.`,
        );
      }
    }
  }
}

function scheduleIntervention(
  state: SimulationState,
  intervention: ReplayIntervention,
): ScheduledPlayerCommand {
  const { atTick, command } = intervention;
  switch (command.type) {
    case "ADD_FOOD":
      return queuePlayerCommand(state, { ...command, applyAtTick: atTick });
    case "REMOVE_FOOD":
      return queuePlayerCommand(state, { ...command, applyAtTick: atTick });
    case "TOGGLE_OBSTACLE":
      return queuePlayerCommand(state, { ...command, applyAtTick: atTick });
  }
}

function captureCheckpoint(state: SimulationState): GoldenCheckpoint {
  return {
    tick: state.tick,
    hash: hashSimulationState(state),
    schemaVersion: state.schemaVersion,
    population: state.creatures.filter((creature) => creature.alive).length,
    groups: state.groups.length,
    metrics: { ...state.metrics },
  };
}

function jsonRoundTrip(state: SimulationState): SimulationState {
  const hashBeforeSerialization = hashSimulationState(state);
  const loaded = JSON.parse(JSON.stringify(state)) as SimulationState;
  expect(hashSimulationState(loaded)).toBe(hashBeforeSerialization);
  return loaded;
}

function runScenario(scenario: GoldenReplayScenario): GoldenReplayResult {
  let state = createSimulation(scenario.seed);
  const scheduledCommands: ScheduledPlayerCommand[] = [];
  const checkpoints: GoldenCheckpoint[] = [];
  const checkpointTicks = new Set(scenario.checkpoints);
  const roundTripTicks = new Set(scenario.jsonRoundTripAtTicks);
  const interventionsByTick = new Map<number, ReplayIntervention[]>();

  for (const intervention of scenario.interventions) {
    const interventions = interventionsByTick.get(intervention.atTick) ?? [];
    interventions.push(intervention);
    interventionsByTick.set(intervention.atTick, interventions);
  }

  const finalTick = scenario.checkpoints.at(-1) ?? 0;
  for (let tick = 0; tick <= finalTick; tick += 1) {
    expect(state.tick).toBe(tick);

    if (checkpointTicks.has(tick)) {
      checkpoints.push(captureCheckpoint(state));
    }
    if (roundTripTicks.has(tick)) {
      state = jsonRoundTrip(state);
    }

    for (const intervention of interventionsByTick.get(tick) ?? []) {
      const scheduled = scheduleIntervention(state, intervention);
      scheduledCommands.push({ ...scheduled });
    }

    if (tick < finalTick) {
      advanceSimulation(state, 1);
    }
  }

  expect(scheduledCommands.map((command) => command.applyAtTick)).toEqual(
    scenario.interventions.map((intervention) => intervention.atTick),
  );
  for (let index = 1; index < scheduledCommands.length; index += 1) {
    const previous = scheduledCommands[index - 1];
    const current = scheduledCommands[index];
    expect(current?.commandId).toBeGreaterThan(previous?.commandId ?? -1);
  }

  return {
    id: scenario.id,
    seed: scenario.seed,
    scheduledCommands,
    jsonRoundTripAtTicks: [...scenario.jsonRoundTripAtTicks],
    checkpoints,
  };
}

describe("golden deterministic replays", () => {
  it("matches the versioned replay corpus", async () => {
    validateScenarios(SCENARIOS);
    const scenarios = SCENARIOS.map(runScenario);
    const simulationSchemaVersions = new Set(
      scenarios.flatMap((scenario) =>
        scenario.checkpoints.map((checkpoint) => checkpoint.schemaVersion),
      ),
    );
    expect(simulationSchemaVersions.size).toBe(1);

    const simulationSchemaVersion = simulationSchemaVersions.values().next().value;
    if (simulationSchemaVersion === undefined) {
      throw new Error("The golden replay corpus has no simulation schema version.");
    }

    const corpus: GoldenReplayCorpus = {
      replaySchemaVersion: REPLAY_SCHEMA_VERSION,
      simulationSchemaVersion,
      simulationBehaviorVersion: SIMULATION_BEHAVIOR_VERSION,
      scenarios,
    };

    await expect(`${JSON.stringify(corpus, null, 2)}\n`).toMatchFileSnapshot(
      "./fixtures/golden-replays.v4.json",
    );
  }, 15_000);
});
