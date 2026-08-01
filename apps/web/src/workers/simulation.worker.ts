import type { RuntimeClientMessage, RuntimeWorkerMessage } from "./protocol";
import { SimulationWorkerServer } from "./simulation-worker-server";

interface WorkerScope {
  postMessage(message: RuntimeWorkerMessage): void;
  addEventListener(
    type: "message",
    listener: (event: MessageEvent<RuntimeClientMessage>) => void,
  ): void;
}

const scope = globalThis as unknown as WorkerScope;
const server = new SimulationWorkerServer({
  postMessage: (message) => scope.postMessage(message),
});

scope.addEventListener("message", (event) => server.handleMessage(event.data));
