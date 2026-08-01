import type { PlayerCommand } from "@tiny-civ/sim-core";
import { CoreSimulationRuntime } from "./core-simulation-runtime";
import type {
  InterventionAcknowledgement,
  LongRunningOperationOptions,
  ReplayResult,
  RunToTickResult,
  RuntimeReplay,
  SimulationEngine,
  SimulationEngineListener,
  SimulationFrame,
  SimulationRuntime,
  SimulationRuntimeStatus,
} from "./types";

export interface DirectSimulationEngineOptions {
  readonly runtime?: SimulationRuntime;
}

export class DirectSimulationEngine implements SimulationEngine {
  readonly kind = "direct" as const;
  private readonly runtime: SimulationRuntime;
  private readonly listeners = new Set<SimulationEngineListener>();
  private requestId = 0;
  private disposed = false;

  constructor(options: DirectSimulationEngineOptions = {}) {
    this.runtime = options.runtime ?? new CoreSimulationRuntime();
  }

  get status(): SimulationRuntimeStatus {
    return this.runtime.status;
  }

  subscribe(listener: SimulationEngineListener): () => void {
    this.assertNotDisposed();
    this.listeners.add(listener);
    listener(this.status);
    return () => this.listeners.delete(listener);
  }

  create(seed?: number): Promise<SimulationFrame> {
    return this.perform(() => this.runtime.create(seed));
  }

  play(): Promise<SimulationFrame> {
    return this.perform(() => this.runtime.setPlaying(true));
  }

  pause(): Promise<SimulationFrame> {
    return this.perform(() => this.runtime.setPlaying(false));
  }

  advance(ticks: number): Promise<SimulationFrame> {
    return this.perform(() => this.runtime.advance(ticks));
  }

  step(ticks = 1): Promise<SimulationFrame> {
    return this.perform(() => this.runtime.step(ticks));
  }

  intervene(command: PlayerCommand): Promise<InterventionAcknowledgement> {
    return this.perform(() => this.runtime.intervene(command));
  }

  getFrame(): Promise<SimulationFrame> {
    return this.perform(() => this.runtime.getFrame());
  }

  save(): Promise<string> {
    return this.perform(() => this.runtime.save());
  }

  load(serialized: string): Promise<SimulationFrame> {
    return this.perform(() => this.runtime.load(serialized));
  }

  runToTick(
    targetTick: number,
    options: LongRunningOperationOptions = {},
  ): Promise<RunToTickResult> {
    return this.performAsync(() => this.runtime.runToTick(targetTick, options));
  }

  replay(
    replay: RuntimeReplay,
    options: LongRunningOperationOptions = {},
  ): Promise<ReplayResult> {
    return this.performAsync(() => this.runtime.replay(replay, options));
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.runtime.dispose();
    this.emit();
    this.listeners.clear();
  }

  private perform<Result>(operation: () => Result): Promise<Result> {
    this.assertNotDisposed();
    this.noteRequest();
    try {
      const result = operation();
      this.emit();
      return Promise.resolve(result);
    } catch (error) {
      this.emit();
      return Promise.reject(error instanceof Error ? error : new Error(String(error)));
    }
  }

  private async performAsync<Result>(operation: () => Promise<Result>): Promise<Result> {
    this.assertNotDisposed();
    this.noteRequest();
    this.emit();
    try {
      const result = await operation();
      this.emit();
      return result;
    } catch (error) {
      this.emit();
      throw error;
    }
  }

  private noteRequest(): void {
    this.requestId += 1;
    if (this.runtime instanceof CoreSimulationRuntime) {
      this.runtime.noteRequest(this.requestId);
    }
  }

  private emit(): void {
    for (const listener of this.listeners) listener(this.status);
  }

  private assertNotDisposed(): void {
    if (this.disposed) throw new Error("Simulation engine is disposed.");
  }
}
