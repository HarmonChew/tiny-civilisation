import type {
  CausalEvidenceProjectionV1,
  CausalEvidenceQueryOptions,
  CausalEvidenceRef,
  ExperimentOutcomeComparisonV1,
  ExperimentOutcomeV1,
  ScheduledPlayerCommand,
  SimulationReplayV1,
  SimulationState,
} from "@tiny-civ/sim-core";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import type { InterventionTool, TileView, WorldView } from "../model";
import {
  createSimulationEngine,
  type InterventionAcknowledgement,
  type LongRunningOperationOptions,
  type ReplayResult,
  type RunToTickResult,
  type RuntimeCanonicalHash,
  type RuntimeCheckpoint,
  type RuntimeEntityDetail,
  type RuntimeInterventionOutcomeProjection,
  type RuntimeQueryOptions,
  type SimulationEngine,
  type SimulationFrame,
} from "../runtime";
import { makeWorldViewFromSnapshot, ticksPerSecond } from "../sim-adapter";

export type SimulationSpeed = 1 | 2 | 4;

const EMPTY_VIEW: WorldView = {
  tick: 0,
  timeLabel: "Day 1 · 00:00",
  hash: "",
  width: 48,
  height: 32,
  tiles: [],
  creatures: [],
  resources: [],
  structures: [],
  groups: [],
  events: [],
  population: 0,
  foodStock: 0,
};

export interface SimulationController {
  view: WorldView;
  seed: number;
  /** Changes whenever the authoritative timeline is replaced rather than advanced. */
  timelineRevision: number;
  initialized: boolean;
  busy: boolean;
  fatalError: string | null;
  playing: boolean;
  setPlaying: Dispatch<SetStateAction<boolean>>;
  speed: SimulationSpeed;
  setSpeed: Dispatch<SetStateAction<SimulationSpeed>>;
  feedback: string;
  pause: () => Promise<WorldView | null>;
  advance: (ticks: number) => Promise<WorldView | null>;
  restart: (seed?: number) => Promise<WorldView | null>;
  applyIntervention: (
    tool: Exclude<InterventionTool, "inspect">,
    tile: TileView,
    amount?: number,
  ) => Promise<InterventionAcknowledgement | null>;
  getState: () => Promise<SimulationState | null>;
  getCanonicalHash: (options?: RuntimeQueryOptions) => Promise<RuntimeCanonicalHash | null>;
  getCheckpoint: (options?: RuntimeQueryOptions) => Promise<RuntimeCheckpoint | null>;
  getCausalEvidence: (
    focus: CausalEvidenceRef,
    query?: CausalEvidenceQueryOptions,
    options?: RuntimeQueryOptions,
  ) => Promise<CausalEvidenceProjectionV1 | null>;
  getEntityDetail: (
    ref: CausalEvidenceRef,
    options?: RuntimeQueryOptions,
  ) => Promise<RuntimeEntityDetail | null>;
  getInterventionOutcomes: (
    commands: readonly ScheduledPlayerCommand[],
    options?: RuntimeQueryOptions,
  ) => Promise<readonly RuntimeInterventionOutcomeProjection[] | null>;
  getOutcome: (options?: RuntimeQueryOptions) => Promise<ExperimentOutcomeV1 | null>;
  compareOutcome: (
    baseline: ExperimentOutcomeV1,
    options?: RuntimeQueryOptions,
  ) => Promise<ExperimentOutcomeComparisonV1 | null>;
  save: () => Promise<string>;
  load: (serialized: string) => Promise<WorldView>;
  runToTick: (
    targetTick: number,
    options?: LongRunningOperationOptions,
  ) => Promise<RunToTickResult>;
  replay: (
    replay: SimulationReplayV1,
    options?: LongRunningOperationOptions,
  ) => Promise<ReplayResult>;
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export function useSimulationController(initialSeed = 4_182): SimulationController {
  const engineRef = useRef<SimulationEngine | null>(null);
  if (!engineRef.current) engineRef.current = createSimulationEngine();

  const unsubscribeRef = useRef<(() => void) | null>(null);
  const retainedTilesRef = useRef<readonly TileView[]>([]);
  const verifiedHashRef = useRef<RuntimeCanonicalHash | null>(null);
  const mountedRef = useRef(true);
  const advanceInFlightRef = useRef(false);
  const [view, setView] = useState<WorldView>(EMPTY_VIEW);
  const [seed, setSeed] = useState(initialSeed >>> 0);
  const [timelineRevision, setTimelineRevision] = useState(0);
  const [initialized, setInitialized] = useState(false);
  const [busy, setBusy] = useState(true);
  const [fatalError, setFatalError] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<SimulationSpeed>(1);
  const [feedback, setFeedback] = useState(
    "Observation is paused. Set a question, then begin when you are ready.",
  );

  const applyFrame = useCallback((frame: SimulationFrame): WorldView => {
    if (frame.hash !== null) {
      verifiedHashRef.current = { tick: frame.tick, hash: frame.hash };
    }
    const verifiedHash = verifiedHashRef.current;
    const nextView = makeWorldViewFromSnapshot(
      frame.snapshot,
      verifiedHash?.hash ?? null,
      retainedTilesRef.current,
      verifiedHash?.tick ?? null,
    );
    if (frame.snapshot.tiles.length > 0) retainedTilesRef.current = nextView.tiles;
    if (mountedRef.current) {
      setView(nextView);
      setSeed(frame.seed);
      setInitialized(true);
      setBusy(false);
      setFatalError(null);
    }
    return nextView;
  }, []);

  const fail = useCallback((error: unknown, fallback: string) => {
    if (!mountedRef.current) return;
    setFatalError(errorMessage(error, fallback));
    setPlaying(false);
    setBusy(false);
  }, []);

  const subscribeToEngine = useCallback(
    (engine: SimulationEngine) => {
      unsubscribeRef.current?.();
      unsubscribeRef.current = engine.subscribe((status) => {
        if (!mountedRef.current) return;
        if (status.phase === "replaying") setBusy(true);
        if (status.phase === "ready" || status.phase === "running") setBusy(false);
        if ((status.phase === "error" || status.phase === "crashed") && status.error) {
          fail(status.error, status.error);
        }
      });
    },
    [fail],
  );

  useEffect(() => {
    mountedRef.current = true;
    const engine = engineRef.current ?? createSimulationEngine();
    engineRef.current = engine;
    subscribeToEngine(engine);
    void engine
      .create(initialSeed)
      .then(applyFrame)
      .catch((error) => fail(error, "The simulation could not start."));
    return () => {
      mountedRef.current = false;
      unsubscribeRef.current?.();
      unsubscribeRef.current = null;
      engine.dispose();
      engineRef.current = null;
    };
  }, [applyFrame, fail, initialSeed, subscribeToEngine]);

  useEffect(() => {
    if (!initialized || fatalError) return;
    const engine = engineRef.current;
    if (!engine) return;
    const operation = playing ? engine.play() : engine.pause();
    void operation.then(applyFrame).catch((error) => {
      fail(error, playing ? "The simulation could not start." : "Pause failed.");
    });
  }, [applyFrame, fail, fatalError, initialized, playing]);

  useEffect(() => {
    if (!playing || fatalError || !initialized) return;
    let frameRequest = 0;
    let lastTime = performance.now();
    let accumulator = 0;
    const loop = (now: number) => {
      const elapsed = Math.min(250, now - lastTime);
      lastTime = now;
      accumulator += (elapsed / 1_000) * ticksPerSecond * speed;
      const ticks = Math.min(20, Math.floor(accumulator));
      if (ticks > 0 && !advanceInFlightRef.current) {
        accumulator -= ticks;
        advanceInFlightRef.current = true;
        const engine = engineRef.current;
        if (engine) {
          void engine
            .advance(ticks)
            .then(applyFrame)
            .catch((error) => fail(error, "The simulation stopped."))
            .finally(() => {
              advanceInFlightRef.current = false;
            });
        } else {
          advanceInFlightRef.current = false;
        }
      }
      frameRequest = requestAnimationFrame(loop);
    };
    frameRequest = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frameRequest);
  }, [applyFrame, fail, fatalError, initialized, playing, speed]);

  const advance = useCallback(
    async (ticks: number): Promise<WorldView | null> => {
      const engine = engineRef.current;
      if (!engine || ticks <= 0) return null;
      try {
        setPlaying(false);
        const frame = await engine.step(ticks);
        return applyFrame(frame);
      } catch (error) {
        fail(error, "The simulation could not advance.");
        return null;
      }
    },
    [applyFrame, fail],
  );

  const pause = useCallback(async (): Promise<WorldView | null> => {
    const engine = engineRef.current;
    if (!engine) return null;
    setPlaying(false);
    try {
      const frame = await engine.pause();
      return applyFrame(frame);
    } catch (error) {
      fail(error, "Pause failed.");
      return null;
    }
  }, [applyFrame, fail]);

  const restart = useCallback(
    async (nextSeed = seed): Promise<WorldView | null> => {
      let engine = engineRef.current;
      if (
        !engine ||
        engine.status.phase === "crashed" ||
        engine.status.phase === "disposed"
      ) {
        unsubscribeRef.current?.();
        unsubscribeRef.current = null;
        engine?.dispose();
        engine = createSimulationEngine();
        engineRef.current = engine;
        advanceInFlightRef.current = false;
        subscribeToEngine(engine);
      }
      try {
        setBusy(true);
        setPlaying(false);
        const frame = await engine.create(nextSeed >>> 0);
        verifiedHashRef.current = null;
        const nextView = applyFrame(frame);
        setTimelineRevision((current) => current + 1);
        setFeedback(
          `Seed ${frame.seed} is ready at tick 0. No interventions carried forward.`,
        );
        return nextView;
      } catch (error) {
        fail(error, "Restart failed.");
        return null;
      }
    },
    [applyFrame, fail, seed, subscribeToEngine],
  );

  const applyIntervention = useCallback(
    async (
      tool: Exclude<InterventionTool, "inspect">,
      tile: TileView,
      amount = 12,
    ): Promise<InterventionAcknowledgement | null> => {
      const engine = engineRef.current;
      if (!engine) return null;
      const common = { applyAtTick: view.tick, tileIndex: tile.index };
      const command =
        tool === "add-food"
          ? ({ ...common, type: "ADD_FOOD", amount } as const)
          : tool === "remove-food"
            ? ({ ...common, type: "REMOVE_FOOD", amount } as const)
            : ({ ...common, type: "TOGGLE_OBSTACLE", blocked: !tile.blocked } as const);
      try {
        const acknowledgement = await engine.intervene(command);
        applyFrame(acknowledgement.frame);
        if (!acknowledgement.accepted) {
          setFeedback(acknowledgement.reason);
          return acknowledgement;
        }
        let frame = acknowledgement.frame;
        if (!playing) {
          try {
            frame = await engine.step(1);
            applyFrame(frame);
          } catch (error) {
            fail(error, "The intervention was scheduled, but the simulation stopped.");
          }
        }
        const scheduled = acknowledgement.command;
        const x = scheduled.tileIndex % frame.snapshot.width;
        const y = Math.floor(scheduled.tileIndex / frame.snapshot.width);
        if (tool === "obstacle") {
          setFeedback(
            `${scheduled.blocked ? "Obstacle placement" : "Passage opening"} scheduled at ${x}, ${y} for tick ${scheduled.applyAtTick}. The chronicle records whether it could be applied.`,
          );
        } else {
          setFeedback(
            `${tool === "add-food" ? "Food addition" : "Food removal"} of ${scheduled.amount} units scheduled at ${x}, ${y} for tick ${scheduled.applyAtTick}.`,
          );
        }
        return acknowledgement;
      } catch (error) {
        setFeedback(errorMessage(error, "That intervention could not be scheduled."));
        return null;
      }
    },
    [applyFrame, fail, playing, view.tick],
  );

  const getState = useCallback(async (): Promise<SimulationState | null> => {
    const engine = engineRef.current;
    return engine ? engine.getState() : null;
  }, []);

  const getCanonicalHash = useCallback(
    async (options?: RuntimeQueryOptions): Promise<RuntimeCanonicalHash | null> => {
      const engine = engineRef.current;
      if (!engine) return null;
      const canonical = await engine.getCanonicalHash(options);
      verifiedHashRef.current = canonical;
      if (mountedRef.current) {
        setView((current) =>
          current.tick === canonical.tick
            ? { ...current, hash: canonical.hash, hashTick: canonical.tick }
            : current,
        );
      }
      return canonical;
    },
    [],
  );

  const getCheckpoint = useCallback(
    async (options?: RuntimeQueryOptions): Promise<RuntimeCheckpoint | null> => {
      const engine = engineRef.current;
      if (!engine) return null;
      const checkpoint = await engine.getCheckpoint(options);
      verifiedHashRef.current = { tick: checkpoint.tick, hash: checkpoint.hash };
      if (mountedRef.current) {
        setView((current) =>
          current.tick === checkpoint.tick
            ? { ...current, hash: checkpoint.hash, hashTick: checkpoint.tick }
            : current,
        );
      }
      return checkpoint;
    },
    [],
  );

  const getCausalEvidence = useCallback(
    async (
      focus: CausalEvidenceRef,
      query?: CausalEvidenceQueryOptions,
      options?: RuntimeQueryOptions,
    ): Promise<CausalEvidenceProjectionV1 | null> => {
      const engine = engineRef.current;
      return engine ? engine.getCausalEvidence(focus, query, options) : null;
    },
    [],
  );

  const getEntityDetail = useCallback(
    async (
      ref: CausalEvidenceRef,
      options?: RuntimeQueryOptions,
    ): Promise<RuntimeEntityDetail | null> => {
      const engine = engineRef.current;
      return engine ? engine.getEntityDetail(ref, options) : null;
    },
    [],
  );

  const getInterventionOutcomes = useCallback(
    async (
      commands: readonly ScheduledPlayerCommand[],
      options?: RuntimeQueryOptions,
    ): Promise<readonly RuntimeInterventionOutcomeProjection[] | null> => {
      const engine = engineRef.current;
      return engine ? engine.getInterventionOutcomes(commands, options) : null;
    },
    [],
  );

  const getOutcome = useCallback(
    async (options?: RuntimeQueryOptions): Promise<ExperimentOutcomeV1 | null> => {
      const engine = engineRef.current;
      return engine ? engine.getOutcome(options) : null;
    },
    [],
  );

  const compareOutcome = useCallback(
    async (
      baseline: ExperimentOutcomeV1,
      options?: RuntimeQueryOptions,
    ): Promise<ExperimentOutcomeComparisonV1 | null> => {
      const engine = engineRef.current;
      return engine ? engine.compareOutcome(baseline, options) : null;
    },
    [],
  );

  const save = useCallback(async (): Promise<string> => {
    const engine = engineRef.current;
    if (!engine) throw new Error("The simulation is not ready to save.");
    setPlaying(false);
    const frame = await engine.pause();
    const serialized = await engine.save();
    applyFrame(frame);
    return serialized;
  }, [applyFrame]);

  const load = useCallback(
    async (serialized: string): Promise<WorldView> => {
      const engine = engineRef.current;
      if (!engine) throw new Error("The simulation is not ready to load.");
      setBusy(true);
      try {
        setPlaying(false);
        const frame = await engine.load(serialized);
        const nextView = applyFrame(frame);
        setTimelineRevision((current) => current + 1);
        setFeedback(`Seed ${frame.seed} restored at tick ${frame.tick}.`);
        return nextView;
      } finally {
        if (mountedRef.current) setBusy(false);
      }
    },
    [applyFrame],
  );

  const runToTick = useCallback(
    async (
      targetTick: number,
      options?: LongRunningOperationOptions,
    ): Promise<RunToTickResult> => {
      const engine = engineRef.current;
      if (!engine) throw new Error("The simulation is not ready to replay.");
      setBusy(true);
      setPlaying(false);
      try {
        const result = await engine.runToTick(targetTick, options);
        applyFrame(result.frame);
        return result;
      } finally {
        if (mountedRef.current) setBusy(false);
      }
    },
    [applyFrame],
  );

  const replay = useCallback(
    async (
      replayContract: SimulationReplayV1,
      options?: LongRunningOperationOptions,
    ): Promise<ReplayResult> => {
      const engine = engineRef.current;
      if (!engine) throw new Error("The simulation is not ready to replay.");
      setBusy(true);
      setPlaying(false);
      try {
        const result = await engine.replay(replayContract, options);
        applyFrame(result.frame);
        setTimelineRevision((current) => current + 1);
        return result;
      } finally {
        if (mountedRef.current) setBusy(false);
      }
    },
    [applyFrame],
  );

  return {
    view,
    seed,
    timelineRevision,
    initialized,
    busy,
    fatalError,
    playing,
    setPlaying,
    speed,
    setSpeed,
    feedback,
    pause,
    advance,
    restart,
    applyIntervention,
    getState,
    getCanonicalHash,
    getCheckpoint,
    getCausalEvidence,
    getEntityDetail,
    getInterventionOutcomes,
    getOutcome,
    compareOutcome,
    save,
    load,
    runToTick,
    replay,
  };
}
