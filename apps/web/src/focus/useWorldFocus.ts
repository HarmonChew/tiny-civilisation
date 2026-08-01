import { useCallback, useMemo, useReducer } from "react";
import { worldFocusReducer } from "./reducer";
import {
  INITIAL_WORLD_FOCUS_STATE,
  type WorldFocusSource,
  type WorldFocusState,
  type WorldRef,
} from "./types";

export interface WorldFocusController {
  readonly state: WorldFocusState;
  readonly setHovered: (ref: WorldRef | null, source: WorldFocusSource) => void;
  readonly setKeyboardFocused: (ref: WorldRef | null, source: WorldFocusSource) => void;
  readonly select: (ref: WorldRef | null, source: WorldFocusSource) => void;
  readonly inspectEvidence: (
    ref: WorldRef,
    subject: WorldRef | null,
    source: WorldFocusSource,
  ) => void;
  readonly clearTransient: () => void;
  readonly reset: () => void;
}

export function useWorldFocus(): WorldFocusController {
  const [state, dispatch] = useReducer(worldFocusReducer, INITIAL_WORLD_FOCUS_STATE);

  const setHovered = useCallback((ref: WorldRef | null, source: WorldFocusSource) => {
    dispatch({ type: "hover", ref, source });
  }, []);
  const setKeyboardFocused = useCallback(
    (ref: WorldRef | null, source: WorldFocusSource) => {
      dispatch({ type: "keyboard-focus", ref, source });
    },
    [],
  );
  const select = useCallback((ref: WorldRef | null, source: WorldFocusSource) => {
    dispatch({ type: "select", ref, source });
  }, []);
  const inspectEvidence = useCallback(
    (ref: WorldRef, subject: WorldRef | null, source: WorldFocusSource) => {
      dispatch({ type: "inspect-evidence", ref, subject, source });
    },
    [],
  );
  const clearTransient = useCallback(() => dispatch({ type: "clear-transient" }), []);
  const reset = useCallback(() => dispatch({ type: "reset" }), []);

  return useMemo(
    () => ({
      state,
      setHovered,
      setKeyboardFocused,
      select,
      inspectEvidence,
      clearTransient,
      reset,
    }),
    [clearTransient, inspectEvidence, reset, select, setHovered, setKeyboardFocused, state],
  );
}
