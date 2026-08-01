export { CoreSimulationRuntime } from "./core-simulation-runtime";
export {
  DirectSimulationEngine,
  type DirectSimulationEngineOptions,
} from "./direct-simulation-engine";
export {
  SimulationWorkerCrashedError,
  StaleRuntimeResponseError,
  WorkerSimulationEngine,
  type SimulationWorkerLike,
  type WorkerSimulationEngineOptions,
} from "./worker-simulation-engine";
export type * from "./types";

import { DirectSimulationEngine } from "./direct-simulation-engine";
import type { SimulationEngine } from "./types";
import {
  WorkerSimulationEngine,
  type SimulationWorkerLike,
} from "./worker-simulation-engine";

export interface CreateSimulationEngineOptions {
  readonly mode?: "auto" | "direct" | "worker";
  readonly worker?: SimulationWorkerLike;
}

export function createSimulationEngine(
  options: CreateSimulationEngineOptions = {},
): SimulationEngine {
  const mode = options.mode ?? "auto";
  if (mode === "direct" || (mode === "auto" && typeof Worker === "undefined")) {
    return new DirectSimulationEngine();
  }
  return new WorkerSimulationEngine(
    options.worker === undefined ? {} : { worker: options.worker },
  );
}
