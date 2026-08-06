import { WorkerSimulationEngine } from "./worker-simulation-engine";
import type { SimulationEngine } from "./types";

/**
 * Production observation runs use the versioned Worker boundary. Direct engines
 * remain available for deterministic parity tests and explicit tooling, but are
 * not shipped as a duplicate copy of the simulation in the browser bootstrap.
 */
export function createBrowserSimulationEngine(): SimulationEngine {
  if (typeof Worker === "undefined") {
    throw new Error("This browser cannot start the simulation Worker.");
  }
  return new WorkerSimulationEngine();
}
