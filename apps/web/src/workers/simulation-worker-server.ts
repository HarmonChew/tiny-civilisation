import { CoreSimulationRuntime } from "../runtime/core-simulation-runtime";
import type { SimulationRuntime } from "../runtime/types";
import type {
  RuntimeClientMessage,
  RuntimeOperation,
  RuntimeOperationResult,
  RuntimeWorkerMessage,
  SerializedRuntimeError,
} from "./protocol";
import { RUNTIME_PROTOCOL_VERSION } from "./protocol";

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

function isCancellableOperation(operation: RuntimeOperation): boolean {
  return (
    operation.type === "run-to-tick" ||
    operation.type === "replay" ||
    operation.type === "get-canonical-hash" ||
    operation.type === "get-checkpoint" ||
    operation.type === "get-causal-evidence" ||
    operation.type === "get-entity-detail" ||
    operation.type === "get-life-records" ||
    operation.type === "get-intervention-outcomes" ||
    operation.type === "get-outcome" ||
    operation.type === "compare-outcome"
  );
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
    if (isCancellableOperation(operation)) {
      this.activeOperations.set(requestId, controller);
      if (this.cancelledRequests.has(requestId)) controller.abort();
    }
    try {
      const value = await this.execute(requestId, operation, controller.signal);
      this.port.postMessage({
        kind: "tiny-civilisation/runtime-response",
        protocolVersion: RUNTIME_PROTOCOL_VERSION,
        requestId,
        ok: true,
        status: this.runtime.status,
        value,
      });
    } catch (error) {
      this.port.postMessage({
        kind: "tiny-civilisation/runtime-response",
        protocolVersion: RUNTIME_PROTOCOL_VERSION,
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
        if (operation.scenario !== undefined && operation.seed !== undefined) {
          throw new Error("Create accepts either a scenario reference or a legacy seed.");
        }
        return this.runtime.create(operation.scenario ?? operation.seed);
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
      case "get-state":
        return this.runtime.getState();
      case "get-canonical-hash":
        return this.runtime.getCanonicalHash({ signal });
      case "get-checkpoint":
        return this.runtime.getCheckpoint({ signal });
      case "get-causal-evidence":
        return this.runtime.getCausalEvidence(operation.focus, operation.query, {
          signal,
        });
      case "get-entity-detail":
        return this.runtime.getEntityDetail(operation.ref, { signal });
      case "get-life-records":
        return this.runtime.getLifeRecords(operation.query, { signal });
      case "get-intervention-outcomes":
        return this.runtime.getInterventionOutcomes(operation.commands, { signal });
      case "get-outcome":
        return this.runtime.getOutcome({ signal });
      case "compare-outcome":
        return this.runtime.compareOutcome(operation.baseline, { signal });
      case "save":
        return this.runtime.save();
      case "load":
        return this.runtime.load(operation.serialized);
      case "run-to-tick":
        return this.runtime.runToTick(operation.targetTick, {
          signal,
          ...(operation.chunkSize === undefined ? {} : { chunkSize: operation.chunkSize }),
          ...(operation.captureTicks === undefined
            ? {}
            : { captureTicks: operation.captureTicks }),
          onProgress: (progress) =>
            this.port.postMessage({
              kind: "tiny-civilisation/runtime-progress",
              protocolVersion: RUNTIME_PROTOCOL_VERSION,
              requestId,
              progress,
            }),
        });
      case "replay":
        return this.runtime.replay(operation.replay, {
          signal,
          ...(operation.chunkSize === undefined ? {} : { chunkSize: operation.chunkSize }),
          ...(operation.captureTicks === undefined
            ? {}
            : { captureTicks: operation.captureTicks }),
          onProgress: (progress) =>
            this.port.postMessage({
              kind: "tiny-civilisation/runtime-progress",
              protocolVersion: RUNTIME_PROTOCOL_VERSION,
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
