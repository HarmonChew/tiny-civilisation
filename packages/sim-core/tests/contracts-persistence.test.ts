import { describe, expect, it } from "vitest";
import {
  COMMAND_SCHEMA_VERSION,
  REPLAY_SCHEMA_VERSION,
  SAVE_SCHEMA_VERSION,
  SIMULATION_BEHAVIOR_VERSION,
  SIMULATION_STATE_VERSION,
  SNAPSHOT_SCHEMA_VERSION,
  advanceSimulation,
  createPlayerCommandEnvelope,
  createRenderSnapshot,
  createRenderSnapshotEnvelope,
  createSimulation,
  createSimulationReplay,
  createSimulationSave,
  deserializeSimulationSave,
  hashSimulationState,
  migrateSimulationSave,
  queuePlayerCommand,
  serializeSimulationSave,
} from "../src/index.js";

describe("versioned simulation contracts", () => {
  it("publishes independent command, snapshot, replay, state, and save versions", () => {
    const command = createPlayerCommandEnvelope({
      type: "ADD_FOOD",
      tileIndex: 10,
      amount: 3,
    });
    expect(command.schemaVersion).toBe(COMMAND_SCHEMA_VERSION);
    expect(command.behaviorVersion).toBe(SIMULATION_BEHAVIOR_VERSION);

    const state = createSimulation(41);
    const snapshot = createRenderSnapshot(state);
    expect(snapshot.schemaVersion).toBe(SNAPSHOT_SCHEMA_VERSION);
    expect(snapshot.behaviorVersion).toBe(SIMULATION_BEHAVIOR_VERSION);
    expect(createRenderSnapshotEnvelope(snapshot).snapshot).toBe(snapshot);

    const scheduled = queuePlayerCommand(state, command.command);
    const replay = createSimulationReplay(state.seed, [scheduled]);
    expect(replay.schemaVersion).toBe(REPLAY_SCHEMA_VERSION);
    expect(replay.stateSchemaVersion).toBe(SIMULATION_STATE_VERSION);
    expect(replay.commands).toEqual([scheduled]);
    expect(replay.commands).not.toBe(state.commandQueue);
  });

  it("round trips a save without changing its authoritative hash", () => {
    const state = createSimulation(921);
    advanceSimulation(state, 1_200);
    const before = hashSimulationState(state);
    const serialized = serializeSimulationSave(state);
    const loaded = deserializeSimulationSave(serialized);

    expect(createSimulationSave(state).schemaVersion).toBe(SAVE_SCHEMA_VERSION);
    expect(hashSimulationState(loaded)).toBe(before);
    expect(loaded).not.toBe(state);
  });

  it("fails clearly on invalid and incompatible save data", () => {
    expect(() => deserializeSimulationSave("not json")).toThrow(
      "Save data is not valid JSON",
    );
    expect(() => migrateSimulationSave({ schemaVersion: 1 })).toThrow(
      "Invalid Tiny Civilisation save envelope",
    );

    const save = createSimulationSave(createSimulation(7));
    expect(() => migrateSimulationSave({ ...save, schemaVersion: 999 })).toThrow(
      "Unsupported save schema version 999",
    );
    expect(() => migrateSimulationSave({ ...save, behaviorVersion: 999 })).toThrow(
      "Save behavior version 999 is incompatible",
    );
    expect(() =>
      migrateSimulationSave({ ...save, state: { ...save.state, creatures: null } }),
    ).toThrow("creatures must be an array");
  });
});
