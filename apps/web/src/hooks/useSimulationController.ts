import type { SimulationState } from "@tiny-civ/sim-core";
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
  advanceSimulationTicks,
  createSimulationState,
  makeWorldView,
  queueIntervention,
  ticksPerSecond,
} from "../sim-adapter";

export type SimulationSpeed = 1 | 2 | 4;

const EMPTY_VIEW: WorldView = {
  tick: 0,
  timeLabel: "T+0s",
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

interface InitialSimulation {
  state: SimulationState | null;
  view: WorldView;
  error: string | null;
}

export interface SimulationController {
  view: WorldView;
  fatalError: string | null;
  playing: boolean;
  setPlaying: Dispatch<SetStateAction<boolean>>;
  speed: SimulationSpeed;
  setSpeed: Dispatch<SetStateAction<SimulationSpeed>>;
  feedback: string;
  advance: (ticks: number) => void;
  restart: () => WorldView | null;
  applyIntervention: (tool: Exclude<InterventionTool, "inspect">, tile: TileView) => void;
}

function initialize(seed: number): InitialSimulation {
  try {
    const state = createSimulationState(seed);
    return { state, view: makeWorldView(state), error: null };
  } catch (error) {
    return {
      state: null,
      view: EMPTY_VIEW,
      error: error instanceof Error ? error.message : "The simulation could not start.",
    };
  }
}

export function useSimulationController(seed: number): SimulationController {
  const initialRef = useRef<InitialSimulation | null>(null);
  if (!initialRef.current) initialRef.current = initialize(seed);

  const simRef = useRef<SimulationState | null>(initialRef.current.state);
  const [view, setView] = useState<WorldView>(initialRef.current.view);
  const [fatalError, setFatalError] = useState<string | null>(initialRef.current.error);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState<SimulationSpeed>(1);
  const [feedback, setFeedback] = useState(
    "Conditions are stable. The creatures retain authority over every action.",
  );

  const fail = useCallback((error: unknown, fallback: string) => {
    setFatalError(error instanceof Error ? error.message : fallback);
    setPlaying(false);
  }, []);

  const refresh = useCallback(() => {
    if (!simRef.current) return;
    try {
      setView(makeWorldView(simRef.current));
    } catch (error) {
      fail(error, "The simulation view failed.");
    }
  }, [fail]);

  const advance = useCallback(
    (ticks: number) => {
      if (!simRef.current || ticks <= 0) return;
      try {
        advanceSimulationTicks(simRef.current, ticks);
        refresh();
      } catch (error) {
        fail(error, "The simulation stopped.");
      }
    },
    [fail, refresh],
  );

  useEffect(() => {
    if (!playing || fatalError) return;
    let frame = 0;
    let lastTime = performance.now();
    let accumulator = 0;
    const loop = (now: number) => {
      const elapsed = Math.min(250, now - lastTime);
      lastTime = now;
      accumulator += (elapsed / 1_000) * ticksPerSecond * speed;
      const ticks = Math.min(20, Math.floor(accumulator));
      if (ticks > 0) {
        accumulator -= ticks;
        advance(ticks);
      }
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [advance, fatalError, playing, speed]);

  const restart = useCallback((): WorldView | null => {
    try {
      const state = createSimulationState(seed);
      const nextView = makeWorldView(state);
      simRef.current = state;
      setView(nextView);
      setFatalError(null);
      setFeedback(`Seed ${seed} restarted. No interventions carried forward.`);
      return nextView;
    } catch (error) {
      fail(error, "Restart failed.");
      return null;
    }
  }, [fail, seed]);

  const applyIntervention = useCallback(
    (tool: Exclude<InterventionTool, "inspect">, tile: TileView) => {
      if (!simRef.current) return;
      try {
        queueIntervention(simRef.current, tool, tile);
        if (!playing) advanceSimulationTicks(simRef.current, 1);
        refresh();
        if (tool === "obstacle") {
          const change = tile.blocked ? "Passage opening" : "Obstacle placement";
          setFeedback(
            `${change} requested at ${tile.x}, ${tile.y}. Safety rules reject changes that would cover or trap an entity.`,
          );
        } else {
          const verb = tool === "add-food" ? "Food added" : "Food removed";
          setFeedback(
            `${verb} at ${tile.x}, ${tile.y}. Creatures will respond through their own decisions.`,
          );
        }
      } catch (error) {
        setFeedback(
          error instanceof Error
            ? error.message
            : "That intervention could not be applied.",
        );
      }
    },
    [playing, refresh],
  );

  return {
    view,
    fatalError,
    playing,
    setPlaying,
    speed,
    setSpeed,
    feedback,
    advance,
    restart,
    applyIntervention,
  };
}
