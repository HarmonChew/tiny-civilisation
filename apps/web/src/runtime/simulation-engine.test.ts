import {
  createSimulationReplay,
  type ScheduledPlayerCommand,
  type SimulationState,
} from "@tiny-civ/sim-core";
import { describe, expect, it } from "vitest";
import type { RuntimeClientMessage, RuntimeWorkerMessage } from "../workers/protocol";
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

describe("simulation engines", () => {
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

    const [directPaused, workerPaused] = await Promise.all([
      direct.advance(8),
      worker.advance(8),
    ]);
    expect(workerPaused.hash).toBe(directPaused.hash);
    expect(workerPaused.tick).toBe(0);

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
    expect(workerStepped.state).toEqual(directStepped.state);
    expect(workerStepped.snapshot).toEqual(directStepped.snapshot);

    const exposedState = directStepped.state as SimulationState;
    exposedState.tick = 9_999;
    expect((await direct.getFrame()).tick).toBe(45);

    const [directSave, workerSave] = await Promise.all([direct.save(), worker.save()]);
    expect(workerSave).toBe(directSave);
    await Promise.all([direct.step(3), worker.step(3)]);
    const [directLoaded, workerLoaded] = await Promise.all([
      direct.load(directSave),
      worker.load(workerSave),
    ]);
    expect(workerLoaded.hash).toBe(directLoaded.hash);
    expect(workerLoaded.playing).toBe(false);

    direct.dispose();
    worker.dispose();
    expect(workerPort.terminated).toBe(true);
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
    const expected = await source.runToTick(80, { chunkSize: 11 });
    const command = { ...acknowledgement.command } as ScheduledPlayerCommand;
    const replay = createSimulationReplay(921, [command], {
      finalTick: 80,
      finalHash: expected.frame.hash,
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
    expect(directProgress.at(0)).toBe(0);
    expect(directProgress.at(-1)).toBe(80);
    expect(workerProgress).toEqual(directProgress);
  });

  it("serializes a pause requested while a Worker replay is yielding", async () => {
    const reference = new DirectSimulationEngine();
    await reference.create(921);
    const expected = await reference.runToTick(120);
    const replay = createSimulationReplay(921, [], {
      finalTick: 120,
      finalHash: expected.frame.hash,
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

  it("moves to a crash state and rejects pending work when the Worker errors", async () => {
    const controlled = new ControlledWorker();
    const engine = new WorkerSimulationEngine({ worker: controlled });
    const pending = engine.create(3);
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
  });

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
