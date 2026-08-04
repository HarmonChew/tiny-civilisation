import { SCENARIO_IDS, createScenarioReference } from "@tiny-civ/sim-core";
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

vi.mock("../runtime", async (importOriginal) => {
  const original = await importOriginal<Record<string, unknown>>();
  return { ...original, createSimulationEngine: createEngineMock };
});

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
});
