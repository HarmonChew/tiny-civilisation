import { CoreSimulationRuntime } from "../runtime/core-simulation-runtime";
import type { SimulationRuntime } from "../runtime/types";
import type {
  RuntimeClientMessage,
  RuntimeOperation,
  RuntimeOperationResult,
  RuntimeWorkerMessage,
  SerializedRuntimeError,
} from "./protocol";

export interface SimulationWorkerServerPort {
  postMessage(message: RuntimeWorkerMessage): void;
}

function serializeError(error: unknown): SerializedRuntimeError {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      ...(error.stack ? { stack: error.stack } : {}),
    };
  }
  return { name: "Error", message: String(error) };
}

export class SimulationWorkerServer {
  private readonly activeOperations = new Map<number, AbortController>();
  private readonly cancelledRequests = new Set<number>();
  private operationQueue: Promise<void> = Promise.resolve();

  constructor(
    private readonly port: SimulationWorkerServerPort,
    private readonly runtime: SimulationRuntime = new CoreSimulationRuntime(),
  ) {}

  handleMessage(message: RuntimeClientMessage): void {
    if (message.kind === "tiny-civilisation/runtime-cancel") {
      this.cancelledRequests.add(message.requestId);
      this.activeOperations.get(message.requestId)?.abort();
      return;
    }
    this.operationQueue = this.operationQueue.then(() =>
      this.handleRequest(message.requestId, message.operation),
    );
  }

  private async handleRequest(
    requestId: number,
    operation: RuntimeOperation,
  ): Promise<void> {
    if (this.runtime instanceof CoreSimulationRuntime) {
      this.runtime.noteRequest(requestId);
    }
    const controller = new AbortController();
    if (operation.type === "run-to-tick" || operation.type === "replay") {
      this.activeOperations.set(requestId, controller);
      if (this.cancelledRequests.has(requestId)) controller.abort();
    }
    try {
      const value = await this.execute(requestId, operation, controller.signal);
      this.port.postMessage({
        kind: "tiny-civilisation/runtime-response",
        requestId,
        ok: true,
        status: this.runtime.status,
        value,
      });
    } catch (error) {
      this.port.postMessage({
        kind: "tiny-civilisation/runtime-response",
        requestId,
        ok: false,
        status: this.runtime.status,
        error: serializeError(error),
      });
    } finally {
      this.activeOperations.delete(requestId);
      this.cancelledRequests.delete(requestId);
    }
  }

  private execute(
    requestId: number,
    operation: RuntimeOperation,
    signal: AbortSignal,
  ): RuntimeOperationResult | Promise<RuntimeOperationResult> {
    switch (operation.type) {
      case "create":
        return this.runtime.create(operation.seed);
      case "set-playing":
        return this.runtime.setPlaying(operation.playing);
      case "advance":
        return this.runtime.advance(operation.ticks);
      case "step":
        return this.runtime.step(operation.ticks);
      case "intervene":
        return this.runtime.intervene(operation.command);
      case "get-frame":
        return this.runtime.getFrame();
      case "save":
        return this.runtime.save();
      case "load":
        return this.runtime.load(operation.serialized);
      case "run-to-tick":
        return this.runtime.runToTick(operation.targetTick, {
          signal,
          ...(operation.chunkSize === undefined ? {} : { chunkSize: operation.chunkSize }),
          onProgress: (progress) =>
            this.port.postMessage({
              kind: "tiny-civilisation/runtime-progress",
              requestId,
              progress,
            }),
        });
      case "replay":
        return this.runtime.replay(operation.replay, {
          signal,
          ...(operation.chunkSize === undefined ? {} : { chunkSize: operation.chunkSize }),
          onProgress: (progress) =>
            this.port.postMessage({
              kind: "tiny-civilisation/runtime-progress",
              requestId,
              progress,
            }),
        });
      case "dispose":
        this.runtime.dispose();
        return this.runtime.status;
    }
  }
}
