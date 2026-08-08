import {
  SCENARIO_CANONICAL_SEEDS,
  SCENARIO_IDS,
  createScenarioReference,
  createSimulation,
  createSimulationReplay,
  hashSimulationState,
  serializeSimulationSave,
  type LifeRecord,
  type ScheduledPlayerCommand,
  type SimulationState,
} from "@tiny-civ/sim-core";
import { describe, expect, it } from "vitest";
import {
  RUNTIME_PROTOCOL_VERSION,
  type RuntimeClientMessage,
  type RuntimeWorkerMessage,
} from "../workers/protocol";
import {
  SimulationWorkerServer,
  type SimulationWorkerServerPort,
} from "../workers/simulation-worker-server";
import { CoreSimulationRuntime } from "./core-simulation-runtime";
import { DirectSimulationEngine } from "./direct-simulation-engine";
import { createSimulationEngine } from "./index";
import type { SimulationFrame, SimulationRuntimeStatus } from "./types";
import {
  SimulationWorkerCrashedError,
  StaleRuntimeResponseError,
  WorkerSimulationEngine,
  type SimulationWorkerLike,
} from "./worker-simulation-engine";

class InProcessWorker implements SimulationWorkerLike {
  onmessage: ((event: MessageEvent<unknown>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  readonly requests: RuntimeClientMessage[] = [];
  terminated = false;
  private readonly server: SimulationWorkerServer;

  constructor() {
    const port: SimulationWorkerServerPort = {
      postMessage: (message) => {
        queueMicrotask(() =>
          this.onmessage?.(new MessageEvent("message", { data: message })),
        );
      },
    };
    this.server = new SimulationWorkerServer(port);
  }

  postMessage(message: RuntimeClientMessage): void {
    this.requests.push(message);
    queueMicrotask(() => this.server.handleMessage(message));
  }

  terminate(): void {
    this.terminated = true;
  }
}

class ControlledWorker implements SimulationWorkerLike {
  onmessage: ((event: MessageEvent<unknown>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  readonly requests: RuntimeClientMessage[] = [];
  terminated = false;

  postMessage(message: RuntimeClientMessage): void {
    this.requests.push(message);
  }

  terminate(): void {
    this.terminated = true;
  }

  respond(requestId: number, frame: SimulationFrame): void {
    const message: RuntimeWorkerMessage = {
      kind: "tiny-civilisation/runtime-response",
      protocolVersion: RUNTIME_PROTOCOL_VERSION,
      requestId,
      ok: true,
      status: statusFromFrame(frame, requestId),
      value: frame,
    };
    this.onmessage?.(new MessageEvent("message", { data: message }));
  }
}

function statusFromFrame(
  frame: SimulationFrame,
  latestRequestId: number,
): SimulationRuntimeStatus {
  return {
    phase: frame.playing ? "running" : "ready",
    playing: frame.playing,
    revision: frame.revision,
    tick: frame.tick,
    latestRequestId,
    error: null,
  };
}

function requestMessages(worker: ControlledWorker | InProcessWorker) {
  return worker.requests.filter(
    (
      message,
    ): message is Extract<
      RuntimeClientMessage,
      { kind: "tiny-civilisation/runtime-request" }
    > => message.kind === "tiny-civilisation/runtime-request",
  );
}

function lifeRecord(id: number, overrides: Partial<LifeRecord> = {}): LifeRecord {
  return {
    id,
    name: `Remembered ${id.toString()}`,
    color: 0x6f8a58,
    sex: id % 2 === 0 ? "FEMALE" : "MALE",
    motherId: null,
    fatherId: null,
    birthTick: -10_000,
    deathTick: 0,
    ageTicks: 10_000,
    finalLifeStage: "ADULT",
    deathCause: "OLD_AGE",
    finalGroupId: null,
    traitPotential: {
      generosity: 5_000,
      aggression: 5_000,
      sociability: 5_000,
      loyalty: 5_000,
    },
    skillPotential: { foraging: 5_000, combat: 5_000 },
    majorEventIds: [],
    heirId: null,
    ...overrides,
  };
}

function stateWithLifeRecords(): SimulationState {
  const state = createSimulation(23);
  const firstRecordId = 10_000;
  state.lifeRecords.push(
    lifeRecord(firstRecordId),
    lifeRecord(firstRecordId + 1),
    lifeRecord(firstRecordId + 2),
  );
  const memorialId = firstRecordId + 10;
  const tile = state.world.tiles.find((candidate) => !candidate.blocked);
  if (!tile) throw new Error("Missing memorial fixture tile.");
  state.memorials.push({
    id: memorialId,
    deceasedId: firstRecordId + 2,
    tileIndex: tile.index,
    createdTick: 0,
    expiresTick: 600,
    heirId: null,
    estate: { food: 1, material: 2, water: 3 },
    mournerIds: [],
    completedMournerIds: [],
  });
  state.nextEntityId = memorialId + 1;
  state.metrics.deaths = state.lifeRecords.length;
  return state;
}

describe("simulation engines", () => {
  it("keeps every bootstrap below 128 KiB and every 5,000-tick hot frame below 64 KiB", () => {
    for (const scenarioId of SCENARIO_IDS) {
      const runtime = new CoreSimulationRuntime({
        yieldControl: () => Promise.resolve(),
      });
      const initial = runtime.create(
        createScenarioReference(scenarioId, SCENARIO_CANONICAL_SEEDS[scenarioId]),
      );
      const bootstrapBytes = new TextEncoder().encode(JSON.stringify(initial)).byteLength;
      expect(bootstrapBytes, `${scenarioId} bootstrap bytes`).toBeLessThan(128 * 1_024);

      const frame = runtime.step(5_000);
      const payloadBytes = new TextEncoder().encode(JSON.stringify(frame)).byteLength;
      expect(frame).not.toHaveProperty("state");
      expect(frame.hash).toBeNull();
      expect(frame.snapshot.tiles).toEqual([]);
      expect(frame.snapshot.scenario.landmarks).toEqual([]);
      expect(frame.snapshot.recentEvents.length).toBeLessThanOrEqual(24);
      for (const creature of frame.snapshot.creatures) {
        expect(creature).not.toHaveProperty("food");
        expect(creature).not.toHaveProperty("material");
        expect(creature).not.toHaveProperty("strongestReason");
        expect(creature).not.toHaveProperty("interactionClaim");
      }
      expect(
        Math.max(
          ...frame.snapshot.creatures.map((creature) => creature.recentRoute.length),
        ),
      ).toBeLessThanOrEqual(12);
      expect(payloadBytes, `${scenarioId} hot-frame bytes`).toBeLessThan(64 * 1_024);
      runtime.dispose();
    }
  }, 15_000);

  it("keeps direct and Worker execution bit-for-bit identical", async () => {
    const direct = new DirectSimulationEngine();
    const workerPort = new InProcessWorker();
    const worker = new WorkerSimulationEngine({ worker: workerPort });

    const [directInitial, workerInitial] = await Promise.all([
      direct.create(4_182),
      worker.create(4_182),
    ]);
    expect(workerInitial.hash).toBe(directInitial.hash);
    expect(workerInitial.tick).toBe(0);
    expect(workerInitial.playing).toBe(false);
    expect(workerInitial.snapshot.tiles.length).toBeGreaterThan(0);
    expect(directInitial).not.toHaveProperty("state");
    expect(workerInitial).not.toHaveProperty("state");

    const [directPaused, workerPaused] = await Promise.all([
      direct.advance(8),
      worker.advance(8),
    ]);
    expect(workerPaused.hash).toBe(directPaused.hash);
    expect(workerPaused.tick).toBe(0);
    expect(directPaused.snapshot.tiles).toEqual([]);
    expect(workerPaused.snapshot.tiles).toEqual([]);

    await Promise.all([direct.play(), worker.play()]);
    const [directAdvanced, workerAdvanced] = await Promise.all([
      direct.advance(25),
      worker.advance(25),
    ]);
    expect(workerAdvanced.hash).toBe(directAdvanced.hash);

    const [directAck, workerAck] = await Promise.all([
      direct.intervene({ type: "ADD_FOOD", x: 16, y: 10, amount: 30 }),
      worker.intervene({ type: "ADD_FOOD", x: 16, y: 10, amount: 30 }),
    ]);
    expect(workerAck).toEqual(directAck);
    expect(directAck.accepted).toBe(true);

    for (const command of [
      { type: "ADD_MATERIAL" as const, x: 16, y: 10, amount: 9 },
      { type: "REMOVE_MATERIAL" as const, x: 16, y: 10, amount: 4 },
    ]) {
      const [directMaterialAck, workerMaterialAck] = await Promise.all([
        direct.intervene(command),
        worker.intervene(command),
      ]);
      expect(workerMaterialAck).toEqual(directMaterialAck);
      expect(directMaterialAck.accepted).toBe(true);
    }

    const [directApplied, workerApplied] = await Promise.all([
      direct.advance(1),
      worker.advance(1),
    ]);
    expect(workerApplied.hash).toBe(directApplied.hash);

    await Promise.all([direct.pause(), worker.pause()]);
    const [directStepped, workerStepped] = await Promise.all([
      direct.step(19),
      worker.step(19),
    ]);
    expect(workerStepped.hash).toBe(directStepped.hash);
    expect(workerStepped.snapshot).toEqual(directStepped.snapshot);
    expect(workerStepped.snapshot.tiles).toEqual([]);

    const [directState, workerState] = await Promise.all([
      direct.getState(),
      worker.getState(),
    ]);
    expect(workerState).toEqual(directState);
    directState.tick = 9_999;
    workerState.tick = 8_888;
    expect((await direct.getFrame()).tick).toBe(45);
    expect((await worker.getState()).tick).toBe(45);

    const [directSave, workerSave] = await Promise.all([direct.save(), worker.save()]);
    expect(workerSave).toBe(directSave);
    await Promise.all([direct.step(3), worker.step(3)]);
    const [directLoaded, workerLoaded] = await Promise.all([
      direct.load(directSave),
      worker.load(workerSave),
    ]);
    expect(workerLoaded.hash).toBe(directLoaded.hash);
    expect(workerLoaded.playing).toBe(false);
    expect(directLoaded.snapshot.tiles.length).toBeGreaterThan(0);
    expect(workerLoaded.snapshot.tiles).toEqual(directLoaded.snapshot.tiles);

    direct.dispose();
    worker.dispose();
    expect(workerPort.terminated).toBe(true);
  });

  it("keeps direct, repeated, and Worker execution deterministic for every scenario", async () => {
    const mapHashes: string[] = [];

    for (const scenarioId of SCENARIO_IDS) {
      const reference = createScenarioReference(scenarioId, 42);
      const firstDirect = new DirectSimulationEngine();
      const secondDirect = new DirectSimulationEngine();
      const workerPort = new InProcessWorker();
      const worker = new WorkerSimulationEngine({ worker: workerPort });

      const [firstInitial, secondInitial, workerInitial] = await Promise.all([
        firstDirect.create(reference),
        secondDirect.create(reference),
        worker.create(reference),
      ]);
      expect(firstInitial.scenario).toEqual(reference);
      expect(secondInitial).toEqual(firstInitial);
      expect(workerInitial).toEqual(firstInitial);
      mapHashes.push(firstInitial.compiledMapHash);

      const createRequest = requestMessages(workerPort)[0];
      expect(createRequest?.operation).toEqual({ type: "create", scenario: reference });

      const [firstRun, secondRun, workerRun] = await Promise.all([
        firstDirect.runToTick(96, { chunkSize: 96 }),
        secondDirect.runToTick(96, { chunkSize: 7 }),
        worker.runToTick(96, { chunkSize: 11 }),
      ]);
      expect(firstRun.cancelled).toBe(false);
      expect(secondRun.frame).toEqual(firstRun.frame);
      expect(workerRun.frame).toEqual(firstRun.frame);

      const [firstHash, secondHash, workerHash] = await Promise.all([
        firstDirect.getCanonicalHash(),
        secondDirect.getCanonicalHash(),
        worker.getCanonicalHash(),
      ]);
      expect(secondHash).toEqual(firstHash);
      expect(workerHash).toEqual(firstHash);

      const [directSave, workerSave] = await Promise.all([
        firstDirect.save(),
        worker.save(),
      ]);
      expect(workerSave).toBe(directSave);
      const loaded = new DirectSimulationEngine();
      const loadedFrame = await loaded.load(directSave);
      expect(loadedFrame.hash).toBe(firstHash.hash);

      const replay = createSimulationReplay(reference, [], {
        finalTick: 96,
        finalHash: firstHash.hash,
      });
      const replayDirect = new DirectSimulationEngine();
      const replayWorker = new WorkerSimulationEngine({ worker: new InProcessWorker() });
      const [directReplay, workerReplay] = await Promise.all([
        replayDirect.replay(replay, { chunkSize: 96 }),
        replayWorker.replay(replay, { chunkSize: 13 }),
      ]);
      expect(directReplay.hashMatches).toBe(true);
      expect(workerReplay).toEqual(directReplay);

      firstDirect.dispose();
      secondDirect.dispose();
      worker.dispose();
      loaded.dispose();
      replayDirect.dispose();
      replayWorker.dispose();
    }

    expect(new Set(mapHashes).size).toBe(SCENARIO_IDS.length);
  });

  it("keeps canonical state work behind typed on-demand Worker operations", async () => {
    const direct = new DirectSimulationEngine();
    const workerPort = new InProcessWorker();
    const worker = new WorkerSimulationEngine({ worker: workerPort });
    const [directInitial, workerInitial] = await Promise.all([
      direct.create(23),
      worker.create(23),
    ]);
    expect(directInitial.hash).toBeNull();
    expect(workerInitial.hash).toBeNull();

    const [directHash, workerHash] = await Promise.all([
      direct.getCanonicalHash(),
      worker.getCanonicalHash(),
    ]);
    expect(workerHash).toEqual(directHash);
    expect((await direct.getFrame()).hash).toBe(directHash.hash);
    expect((await worker.getFrame()).hash).toBe(workerHash.hash);

    const [directHot, workerHot] = await Promise.all([direct.step(12), worker.step(12)]);
    expect(directHot.hash).toBeNull();
    expect(workerHot.hash).toBeNull();

    const [directCheckpoint, workerCheckpoint] = await Promise.all([
      direct.getCheckpoint(),
      worker.getCheckpoint(),
    ]);
    expect(workerCheckpoint).toEqual(directCheckpoint);
    expect(directCheckpoint.hash).toBe(hashSimulationState(directCheckpoint.state));
    directCheckpoint.state.tick = 9_999;
    expect((await direct.getCheckpoint()).tick).toBe(12);

    const creatureRef = { kind: "creature", id: 1 } as const;
    const [directEvidence, workerEvidence, directDetail, workerDetail] = await Promise.all([
      direct.getCausalEvidence(creatureRef, { maxDepth: 2, maxNodes: 40 }),
      worker.getCausalEvidence(creatureRef, { maxDepth: 2, maxNodes: 40 }),
      direct.getEntityDetail(creatureRef),
      worker.getEntityDetail(creatureRef),
    ]);
    expect(workerEvidence).toEqual(directEvidence);
    expect(workerDetail).toEqual(directDetail);

    const [directLifeRecords, workerLifeRecords] = await Promise.all([
      direct.getLifeRecords({ limit: 50 }),
      worker.getLifeRecords({ limit: 50 }),
    ]);
    expect(workerLifeRecords).toEqual(directLifeRecords);
    expect(workerLifeRecords).toEqual({ records: [], nextCursor: null });

    const [directOutcome, workerOutcome] = await Promise.all([
      direct.getOutcome(),
      worker.getOutcome(),
    ]);
    expect(workerOutcome).toEqual(directOutcome);
    const [directComparison, workerComparison] = await Promise.all([
      direct.compareOutcome(directOutcome),
      worker.compareOutcome(directOutcome),
    ]);
    expect(workerComparison).toEqual(directComparison);
    expect(workerComparison.delta).toMatchObject({
      population: 0,
      wildFood: 0,
      wildMaterial: 0,
    });

    const [directAcknowledgement, workerAcknowledgement] = await Promise.all([
      direct.intervene({ type: "ADD_FOOD", x: 16, y: 10, amount: 3 }),
      worker.intervene({ type: "ADD_FOOD", x: 16, y: 10, amount: 3 }),
    ]);
    if (!directAcknowledgement.accepted || !workerAcknowledgement.accepted) {
      throw new Error("Expected intervention projection fixtures to be accepted.");
    }
    await Promise.all([direct.step(1), worker.step(1)]);
    const [directIntervention, workerIntervention] = await Promise.all([
      direct.getInterventionOutcomes([directAcknowledgement.command]),
      worker.getInterventionOutcomes([workerAcknowledgement.command]),
    ]);
    expect(workerIntervention).toEqual(directIntervention);
    expect(workerIntervention[0]?.outcome?.status).toBe("APPLIED");

    const operationTypes = requestMessages(workerPort).map(
      (message) => message.operation.type,
    );
    expect(operationTypes).toEqual(
      expect.arrayContaining([
        "get-canonical-hash",
        "get-checkpoint",
        "get-causal-evidence",
        "get-entity-detail",
        "get-life-records",
        "get-outcome",
        "compare-outcome",
        "get-intervention-outcomes",
      ]),
    );
    expect(operationTypes).not.toContain("get-state");

    direct.dispose();
    worker.dispose();
  });

  it("keeps paginated life records identical across direct and Worker engines without adding them to hot snapshots", async () => {
    const serialized = serializeSimulationSave(stateWithLifeRecords());
    const direct = new DirectSimulationEngine();
    const workerPort = new InProcessWorker();
    const worker = new WorkerSimulationEngine({ worker: workerPort });

    const [directLoaded, workerLoaded] = await Promise.all([
      direct.load(serialized),
      worker.load(serialized),
    ]);
    expect(workerLoaded.snapshot).toEqual(directLoaded.snapshot);
    expect(directLoaded.snapshot).not.toHaveProperty("lifeRecords");
    expect(directLoaded.snapshot.memorials).toEqual([
      expect.objectContaining({
        id: 10_010,
        deceasedId: 10_002,
        deceasedName: "Remembered 10002",
      }),
    ]);

    const firstQuery = { limit: 2 } as const;
    const [directFirstPage, workerFirstPage] = await Promise.all([
      direct.getLifeRecords(firstQuery),
      worker.getLifeRecords(firstQuery),
    ]);
    expect(workerFirstPage).toEqual(directFirstPage);
    expect(workerFirstPage.records.map((record) => record.id)).toEqual([10_000, 10_001]);
    expect(workerFirstPage.nextCursor).toBe(10_001);

    const secondQuery = { cursor: workerFirstPage.nextCursor, limit: 2 } as const;
    const [directSecondPage, workerSecondPage] = await Promise.all([
      direct.getLifeRecords(secondQuery),
      worker.getLifeRecords(secondQuery),
    ]);
    expect(workerSecondPage).toEqual(directSecondPage);
    expect(workerSecondPage.records.map((record) => record.id)).toEqual([10_002]);
    expect(workerSecondPage.nextCursor).toBeNull();

    const lifeRecordOperations = requestMessages(workerPort)
      .map((message) => message.operation)
      .filter((operation) => operation.type === "get-life-records");
    expect(lifeRecordOperations).toEqual([
      { type: "get-life-records", query: firstQuery },
      { type: "get-life-records", query: secondQuery },
    ]);

    const [directHot, workerHot] = await Promise.all([direct.step(1), worker.step(1)]);
    expect(workerHot.snapshot).toEqual(directHot.snapshot);
    expect(directHot.snapshot).not.toHaveProperty("lifeRecords");
    expect(directHot.snapshot.memorials).toEqual(directLoaded.snapshot.memorials);

    direct.dispose();
    worker.dispose();
  });

  it("keeps hot frames projection-only and resends tiles after navigation changes", async () => {
    const engine = new DirectSimulationEngine();
    const initial = await engine.create(23);
    expect(initial.snapshot.tiles.length).toBeGreaterThan(0);
    expect(initial).not.toHaveProperty("state");

    const hot = await engine.step(1);
    expect(hot.snapshot.tiles).toEqual([]);
    expect(hot).not.toHaveProperty("state");

    const state = await engine.getState();
    const occupied = new Set([
      ...state.creatures
        .filter((creature) => creature.alive)
        .map((creature) => creature.tileIndex),
      ...state.resourceNodes.map((resource) => resource.tileIndex),
      ...state.structures.map((structure) => structure.tileIndex),
    ]);
    const target = state.world.tiles.find(
      (tile) => !tile.blocked && !occupied.has(tile.index),
    );
    if (!target) throw new Error("Missing an open navigation fixture tile.");

    const acknowledgement = await engine.intervene({
      type: "TOGGLE_OBSTACLE",
      applyAtTick: state.tick,
      tileIndex: target.index,
      blocked: true,
    });
    expect(acknowledgement.accepted).toBe(true);
    expect(acknowledgement.frame.snapshot.tiles).toEqual([]);

    const navigationChanged = await engine.step(1);
    expect(navigationChanged.snapshot.navigationRevision).toBeGreaterThan(
      hot.snapshot.navigationRevision,
    );
    expect(navigationChanged.snapshot.tiles).toHaveLength(initial.snapshot.tiles.length);
    expect(navigationChanged.snapshot.tiles[target.index]?.blocked).toBe(true);

    const nextHotFrame = await engine.step(1);
    expect(nextHotFrame.snapshot.tiles).toEqual([]);
    engine.dispose();
  });

  it("returns a factual rejection without corrupting the active run", async () => {
    const engine = new DirectSimulationEngine();
    const initial = await engine.create(23);
    const acknowledgement = await engine.intervene({
      type: "ADD_FOOD",
      tileIndex: 99_999,
    });

    expect(acknowledgement).toMatchObject({
      accepted: false,
      outcome: "rejected",
    });
    if (acknowledgement.accepted) throw new Error("Expected a rejected command.");
    expect(acknowledgement.reason).toContain("invalid tile");
    expect(acknowledgement.frame.hash).toBe(initial.hash);
    expect(engine.status.phase).toBe("ready");
  });

  it("keeps the active state when loading malformed data", async () => {
    const engine = new DirectSimulationEngine();
    const initial = await engine.create(23);
    await expect(engine.load('{"kind":"not-a-save"}')).rejects.toThrow(
      "Invalid Tiny Civilisation save envelope",
    );
    expect((await engine.getFrame()).hash).toBe(initial.hash);
  });

  it("replays scheduled commands with progress and verifies the expected hash", async () => {
    const source = new DirectSimulationEngine();
    await source.create(921);
    const acknowledgement = await source.intervene({
      type: "REMOVE_FOOD",
      x: 10,
      y: 7,
      amount: 7,
      applyAtTick: 12,
    });
    if (!acknowledgement.accepted) throw new Error(acknowledgement.reason);
    await source.runToTick(80, { chunkSize: 11 });
    const expectedHash = (await source.getCanonicalHash()).hash;
    const command = { ...acknowledgement.command } as ScheduledPlayerCommand;
    const replay = createSimulationReplay(921, [command], {
      finalTick: 80,
      finalHash: expectedHash,
    });

    const direct = new DirectSimulationEngine();
    const worker = new WorkerSimulationEngine({ worker: new InProcessWorker() });
    const directProgress: number[] = [];
    const workerProgress: number[] = [];
    const [directResult, workerResult] = await Promise.all([
      direct.replay(replay, {
        chunkSize: 9,
        onProgress: (progress) => directProgress.push(progress.currentTick),
      }),
      worker.replay(replay, {
        chunkSize: 9,
        onProgress: (progress) => workerProgress.push(progress.currentTick),
      }),
    ]);

    expect(directResult.hashMatches).toBe(true);
    expect(workerResult.hashMatches).toBe(true);
    expect(workerResult.frame.hash).toBe(directResult.frame.hash);
    expect(directResult).not.toHaveProperty("capturedFrames");
    expect(workerResult).not.toHaveProperty("capturedFrames");
    expect(directResult.frame.snapshot.tiles.length).toBeGreaterThan(0);
    expect(workerResult.frame.snapshot.tiles).toEqual(directResult.frame.snapshot.tiles);
    expect(directProgress.at(0)).toBe(0);
    expect(directProgress.at(-1)).toBe(80);
    expect(workerProgress).toEqual(directProgress);
  });

  it("supports an explicitly unverified runtime target without weakening persisted replay validation", async () => {
    const reference = createScenarioReference("split-banks", 42);
    const persisted = createSimulationReplay(reference, []);
    const runtimeReplay = { ...persisted, finalTick: 25 };
    const direct = new DirectSimulationEngine();
    const worker = new WorkerSimulationEngine({ worker: new InProcessWorker() });

    const [directResult, workerResult] = await Promise.all([
      direct.replay(runtimeReplay),
      worker.replay(runtimeReplay),
    ]);

    expect(directResult.frame.tick).toBe(25);
    expect(directResult.expectedHash).toBeNull();
    expect(directResult.hashMatches).toBeNull();
    expect(workerResult).toEqual(directResult);
    direct.dispose();
    worker.dispose();
  });

  it("captures replay observation frames with direct and Worker parity", async () => {
    const source = new DirectSimulationEngine();
    const initial = await source.create(23);
    const state = await source.getState();
    const occupied = new Set([
      ...state.creatures
        .filter((creature) => creature.alive)
        .map((creature) => creature.tileIndex),
      ...state.resourceNodes.map((resource) => resource.tileIndex),
      ...state.structures.map((structure) => structure.tileIndex),
    ]);
    const target = state.world.tiles.find(
      (tile) => !tile.blocked && !occupied.has(tile.index),
    );
    if (!target) throw new Error("Missing an open navigation fixture tile.");
    const acknowledgement = await source.intervene({
      type: "TOGGLE_OBSTACLE",
      applyAtTick: 12,
      tileIndex: target.index,
      blocked: true,
    });
    if (!acknowledgement.accepted) throw new Error(acknowledgement.reason);
    await source.runToTick(25);
    const expectedHash = (await source.getCanonicalHash()).hash;
    const replay = createSimulationReplay(
      23,
      [{ ...acknowledgement.command } as ScheduledPlayerCommand],
      { finalTick: 25, finalHash: expectedHash },
    );

    const direct = new DirectSimulationEngine();
    const worker = new WorkerSimulationEngine({ worker: new InProcessWorker() });
    const options = {
      chunkSize: 17,
      captureTicks: [25, 13, 0, 12, 13],
    } as const;
    const [directResult, workerResult] = await Promise.all([
      direct.replay(replay, options),
      worker.replay(replay, options),
    ]);

    expect(directResult.capturedFrames?.map((frame) => frame.tick)).toEqual([
      0, 12, 13, 25,
    ]);
    expect(workerResult.capturedFrames).toEqual(directResult.capturedFrames);
    expect(workerResult.frame).toEqual(directResult.frame);
    const captured = directResult.capturedFrames ?? [];
    expect(captured[0]?.snapshot.tiles).toHaveLength(initial.snapshot.tiles.length);
    expect(captured[1]?.snapshot.tiles).toEqual([]);
    expect(captured[2]?.snapshot.tiles).toHaveLength(initial.snapshot.tiles.length);
    expect(captured[2]?.snapshot.tiles[target.index]?.blocked).toBe(true);
    expect(captured[3]?.snapshot.tiles).toEqual([]);
    expect(directResult.frame).toEqual(captured[3]);

    source.dispose();
    direct.dispose();
    worker.dispose();
  });

  it.each(SCENARIO_IDS)(
    "returns only reached replay captures when a %s Worker replay is cancelled",
    async (scenarioId) => {
      const scenario = createScenarioReference(scenarioId, 42);
      const reference = new DirectSimulationEngine();
      await reference.create(scenario);
      await reference.runToTick(100);
      const expectedHash = (await reference.getCanonicalHash()).hash;
      const replay = createSimulationReplay(scenario, [], {
        finalTick: 100,
        finalHash: expectedHash,
      });
      const worker = new WorkerSimulationEngine({ worker: new InProcessWorker() });
      const controller = new AbortController();
      const progress: number[] = [];
      const result = await worker.replay(replay, {
        signal: controller.signal,
        chunkSize: 50,
        captureTicks: [0, 10, 20, 30],
        onProgress: (update) => {
          progress.push(update.currentTick);
          if (update.currentTick === 20) controller.abort();
        },
      });

      expect(result.cancelled).toBe(true);
      expect(result.frame.tick).toBe(20);
      expect(result.frame.scenario).toEqual(scenario);
      expect(result.capturedFrames?.map((frame) => frame.tick)).toEqual([0, 10, 20]);
      expect(
        result.capturedFrames?.every(
          (frame) => frame.scenario.scenarioId === scenarioId && frame.seed === 42,
        ),
      ).toBe(true);
      expect(result.frame).toEqual(result.capturedFrames?.at(-1));
      expect(progress).toEqual([0, 10, 20]);
      expect(worker.status.phase).toBe("ready");
      reference.dispose();
      worker.dispose();
    },
  );

  it("rejects an unbounded capture request before advancing", async () => {
    const direct = new DirectSimulationEngine();
    await direct.create(4_182);

    await expect(
      direct.runToTick(300, {
        captureTicks: Array.from({ length: 257 }, (_, tick) => tick),
      }),
    ).rejects.toThrow("Capture ticks cannot contain more than 256 entries");
    expect((await direct.getFrame()).tick).toBe(0);
    direct.dispose();
  });

  it("preserves the active runtime when replay execution options are invalid", async () => {
    const direct = new DirectSimulationEngine();
    await direct.create(23);
    await direct.step(17);
    const beforeFrame = await direct.getFrame();
    const beforeState = await direct.getState();
    const replay = createSimulationReplay(921, []);

    await expect(direct.replay(replay, { captureTicks: [1] })).rejects.toThrow(
      "Capture tick 1 must be between 0 and 0",
    );
    expect(await direct.getFrame()).toEqual(beforeFrame);
    expect(await direct.getState()).toEqual(beforeState);

    await expect(
      direct.replay(replay, { chunkSize: Number.POSITIVE_INFINITY }),
    ).rejects.toThrow("Chunk size must be a nonnegative finite number");
    expect(await direct.getFrame()).toEqual(beforeFrame);
    expect(await direct.getState()).toEqual(beforeState);
    expect(direct.status).toMatchObject({ phase: "ready", tick: 17 });
    direct.dispose();
  });

  it("serializes a pause requested while a Worker replay is yielding", async () => {
    const reference = new DirectSimulationEngine();
    await reference.create(921);
    await reference.runToTick(120);
    const expectedHash = (await reference.getCanonicalHash()).hash;
    const replay = createSimulationReplay(921, [], {
      finalTick: 120,
      finalHash: expectedHash,
    });
    const worker = new WorkerSimulationEngine({ worker: new InProcessWorker() });
    await worker.create(921);

    const replayPromise = worker.replay(replay, { chunkSize: 5 });
    const pausePromise = worker.pause();
    const [result, paused] = await Promise.all([replayPromise, pausePromise]);

    expect(result.hashMatches).toBe(true);
    expect(paused.tick).toBe(120);
    expect(worker.status.phase).toBe("ready");
  });

  it("cancels a long Worker run at a deterministic chunk boundary", async () => {
    const worker = new WorkerSimulationEngine({ worker: new InProcessWorker() });
    await worker.create(4_182);
    const controller = new AbortController();
    const progress: number[] = [];
    const result = await worker.runToTick(500, {
      signal: controller.signal,
      chunkSize: 10,
      onProgress: (update) => {
        progress.push(update.currentTick);
        if (update.currentTick === 10) controller.abort();
      },
    });

    expect(result.cancelled).toBe(true);
    expect(result.frame.tick).toBe(10);
    expect(progress).toEqual([0, 10]);
    expect(worker.status.phase).toBe("ready");
  });

  it("cancels an on-demand projection queued behind authoritative work", async () => {
    const workerPort = new InProcessWorker();
    const worker = new WorkerSimulationEngine({ worker: workerPort });
    await worker.create(4_182);
    const projectionAbort = new AbortController();
    let projection: Promise<unknown> | null = null;

    await worker.runToTick(40, {
      chunkSize: 10,
      onProgress: (progress) => {
        if (progress.currentTick !== 10 || projection) return;
        projection = worker.getCausalEvidence(
          { kind: "creature", id: 1 },
          { maxDepth: 3, maxNodes: 120 },
          { signal: projectionAbort.signal },
        );
        void projection.catch(() => undefined);
        projectionAbort.abort();
      },
    });

    if (!projection) throw new Error("The queued projection was not requested.");
    await expect(projection).rejects.toMatchObject({ name: "AbortError" });
    const projectionRequest = requestMessages(workerPort).find(
      (message) => message.operation.type === "get-causal-evidence",
    );
    expect(projectionRequest).toBeDefined();
    expect(workerPort.requests).toContainEqual({
      kind: "tiny-civilisation/runtime-cancel",
      protocolVersion: RUNTIME_PROTOCOL_VERSION,
      requestId: projectionRequest?.requestId,
    });
    worker.dispose();
  });

  it("supports direct cancellation through the runtime execution port", async () => {
    const controller = new AbortController();
    const runtime = new CoreSimulationRuntime({
      yieldControl: () => {
        controller.abort();
        return Promise.resolve();
      },
    });
    const direct = new DirectSimulationEngine({ runtime });
    await direct.create(4_182);
    const result = await direct.runToTick(100, {
      signal: controller.signal,
      chunkSize: 8,
    });
    expect(result).toMatchObject({ cancelled: true, frame: { tick: 8 } });
  });

  it("coalesces animation advances and rejects stale responses", async () => {
    const seedRuntime = new CoreSimulationRuntime();
    const frame = seedRuntime.create(17);
    const controlled = new ControlledWorker();
    const engine = new WorkerSimulationEngine({ worker: controlled });

    const firstAdvance = engine.advance(1);
    const secondAdvance = engine.advance(2);
    const thirdAdvance = engine.advance(3);
    await Promise.resolve();
    const advanceRequests = requestMessages(controlled);
    expect(advanceRequests).toHaveLength(1);
    expect(advanceRequests[0]?.operation).toEqual({ type: "advance", ticks: 6 });
    controlled.respond(advanceRequests[0]?.requestId ?? -1, frame);
    await expect(Promise.all([firstAdvance, secondAdvance, thirdAdvance])).resolves.toEqual(
      [frame, frame, frame],
    );

    const older = engine.getFrame();
    const newer = engine.getFrame();
    const requests = requestMessages(controlled).slice(-2);
    const olderRequest = requests[0];
    const newerRequest = requests[1];
    if (!olderRequest || !newerRequest) throw new Error("Missing controlled requests.");
    controlled.respond(newerRequest.requestId, frame);
    controlled.respond(olderRequest.requestId, frame);
    await expect(newer).resolves.toEqual(frame);
    await expect(older).rejects.toBeInstanceOf(StaleRuntimeResponseError);
  });

  it.each(SCENARIO_IDS)(
    "moves a pending %s create to a crash state when the Worker errors",
    async (scenarioId) => {
      const scenario = createScenarioReference(scenarioId, 42);
      const controlled = new ControlledWorker();
      const engine = new WorkerSimulationEngine({ worker: controlled });
      const pending = engine.create(scenario);
      expect(requestMessages(controlled)[0]?.operation).toEqual({
        type: "create",
        scenario,
      });
      controlled.onerror?.(
        new ErrorEvent("error", { message: "worker boom", error: new Error("boom") }),
      );

      await expect(pending).rejects.toBeInstanceOf(SimulationWorkerCrashedError);
      expect(engine.status).toMatchObject({
        phase: "crashed",
        playing: false,
        error: "worker boom",
      });
      expect(() => engine.getFrame()).toThrow(SimulationWorkerCrashedError);
      engine.dispose();
    },
  );

  it("selects direct and Worker implementations through the public factory", () => {
    const direct = createSimulationEngine({ mode: "direct" });
    const controlled = new ControlledWorker();
    const worker = createSimulationEngine({ mode: "worker", worker: controlled });
    expect(direct).toBeInstanceOf(DirectSimulationEngine);
    expect(worker).toBeInstanceOf(WorkerSimulationEngine);
    direct.dispose();
    worker.dispose();
    expect(controlled.terminated).toBe(true);
  });
});
