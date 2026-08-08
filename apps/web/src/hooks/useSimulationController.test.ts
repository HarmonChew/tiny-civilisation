import {
  SCENARIO_IDS,
  createScenarioReference,
  createSimulation,
  serializeSimulationSave,
  type LifeRecord,
  type SimulationState,
} from "@tiny-civ/sim-core";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { RuntimeClientMessage } from "../workers/protocol";
import {
  SimulationWorkerServer,
  type SimulationWorkerServerPort,
} from "../workers/simulation-worker-server";
import type { SimulationWorkerLike } from "../runtime";

const { createEngineMock } = vi.hoisted(() => ({
  createEngineMock: vi.fn(),
}));

vi.mock("../runtime/browser-simulation-engine", () => ({
  createBrowserSimulationEngine: createEngineMock,
}));

import { WorkerSimulationEngine } from "../runtime";
import { useSimulationController } from "./useSimulationController";

class CrashableInProcessWorker implements SimulationWorkerLike {
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

  crash(message: string): void {
    this.onerror?.(new ErrorEvent("error", { message, error: new Error(message) }));
  }
}

function createOperations(worker: CrashableInProcessWorker) {
  return worker.requests
    .filter(
      (
        message,
      ): message is Extract<
        RuntimeClientMessage,
        { kind: "tiny-civilisation/runtime-request" }
      > => message.kind === "tiny-civilisation/runtime-request",
    )
    .filter((message) => message.operation.type === "create")
    .map((message) => message.operation);
}

function lifeRecord(id: number): LifeRecord {
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
  };
}

function stateWithManyLifeRecords(): SimulationState {
  const state = createSimulation(23);
  state.lifeRecords = Array.from({ length: 101 }, (_, index) => lifeRecord(10_000 + index));
  state.metrics.deaths = state.lifeRecords.length;
  return state;
}

describe("simulation controller Worker recovery", () => {
  afterEach(() => {
    createEngineMock.mockReset();
  });

  it.each(SCENARIO_IDS)(
    "replaces a crashed Worker and restarts the exact %s identity",
    async (scenarioId) => {
      const scenario = createScenarioReference(scenarioId, 42);
      const firstPort = new CrashableInProcessWorker();
      const replacementPort = new CrashableInProcessWorker();
      const firstEngine = new WorkerSimulationEngine({ worker: firstPort });
      const replacementEngine = new WorkerSimulationEngine({
        worker: replacementPort,
      });
      createEngineMock
        .mockReturnValueOnce(firstEngine)
        .mockReturnValueOnce(replacementEngine);

      const { result, unmount } = renderHook(() => useSimulationController(scenario));
      await waitFor(() => expect(result.current.initialized).toBe(true));
      expect(result.current.scenario).toEqual(scenario);
      expect(createOperations(firstPort)).toEqual([{ type: "create", scenario }]);

      act(() => firstPort.crash(`worker boom: ${scenarioId}`));
      await waitFor(() =>
        expect(result.current.fatalError).toBe(`worker boom: ${scenarioId}`),
      );

      let recovered = null as Awaited<ReturnType<(typeof result.current)["restart"]>>;
      await act(async () => {
        recovered = await result.current.restart();
      });

      expect(createEngineMock).toHaveBeenCalledTimes(2);
      expect(firstPort.terminated).toBe(true);
      expect(createOperations(replacementPort)).toEqual([{ type: "create", scenario }]);
      expect(recovered?.scenario.reference).toEqual(scenario);
      expect(result.current.scenario).toEqual(scenario);
      expect(result.current.seed).toBe(scenario.seed);
      expect(result.current.fatalError).toBeNull();
      expect(result.current.timelineRevision).toBe(1);

      unmount();
      expect(replacementPort.terminated).toBe(true);
    },
  );

  it("loads every permanent life-record page and retains it across hot frames", async () => {
    const port = new CrashableInProcessWorker();
    const engine = new WorkerSimulationEngine({ worker: port });
    createEngineMock.mockReturnValueOnce(engine);
    const { result, unmount } = renderHook(() => useSimulationController(23));
    await waitFor(() => expect(result.current.initialized).toBe(true));

    await act(async () => {
      await result.current.load(serializeSimulationSave(stateWithManyLifeRecords()));
    });
    await waitFor(() => expect(result.current.view.lifeRecords).toHaveLength(101));
    expect(result.current.view.lifeRecords?.map((record) => record.id)).toEqual(
      Array.from({ length: 101 }, (_, index) => 10_000 + index),
    );
    expect(result.current.view.lifeRecords?.[0]?.inheritedTraits).toContainEqual({
      key: "generosity",
      label: "Generosity",
      value: 50,
    });

    const lifeRecordQueries = port.requests.flatMap((message) =>
      message.kind === "tiny-civilisation/runtime-request" &&
      message.operation.type === "get-life-records"
        ? [message.operation.query]
        : [],
    );
    expect(lifeRecordQueries).toEqual(
      expect.arrayContaining([{ limit: 100 }, { cursor: 10_099, limit: 100 }]),
    );

    await act(async () => {
      await result.current.advance(1);
    });
    expect(result.current.view.lifeRecords).toHaveLength(101);

    unmount();
    expect(port.terminated).toBe(true);
  });
});
