import {
  INITIAL_WORLD_FOCUS_STATE,
  sameWorldRef,
  type WorldFocusSource,
  type WorldFocusState,
  type WorldRef,
} from "./types";

export type WorldFocusAction =
  | {
      readonly type: "hover";
      readonly ref: WorldRef | null;
      readonly source: WorldFocusSource;
    }
  | {
      readonly type: "keyboard-focus";
      readonly ref: WorldRef | null;
      readonly source: WorldFocusSource;
    }
  | {
      readonly type: "select";
      readonly ref: WorldRef | null;
      readonly source: WorldFocusSource;
    }
  | {
      readonly type: "inspect-evidence";
      readonly ref: WorldRef;
      readonly subject: WorldRef | null;
      readonly source: WorldFocusSource;
    }
  | { readonly type: "clear-transient" }
  | { readonly type: "reset" };

export function worldFocusReducer(
  state: WorldFocusState,
  action: WorldFocusAction,
): WorldFocusState {
  switch (action.type) {
    case "hover":
      if (sameWorldRef(state.hovered, action.ref)) return state;
      return { ...state, hovered: action.ref, source: action.source };
    case "keyboard-focus":
      if (sameWorldRef(state.keyboardFocused, action.ref)) return state;
      return { ...state, keyboardFocused: action.ref, source: action.source };
    case "select":
      if (
        sameWorldRef(state.selected, action.ref) &&
        state.evidenceFocus === null &&
        state.source === action.source
      ) {
        return state;
      }
      return {
        ...state,
        selected: action.ref,
        evidenceFocus: null,
        source: action.source,
      };
    case "inspect-evidence":
      if (
        sameWorldRef(state.evidenceFocus, action.ref) &&
        sameWorldRef(state.selected, action.subject) &&
        state.source === action.source
      ) {
        return state;
      }
      return {
        ...state,
        selected: action.subject,
        evidenceFocus: action.ref,
        source: action.source,
      };
    case "clear-transient":
      if (state.hovered === null && state.keyboardFocused === null) return state;
      return { ...state, hovered: null, keyboardFocused: null };
    case "reset":
      if (
        state.hovered === null &&
        state.keyboardFocused === null &&
        state.selected === null &&
        state.evidenceFocus === null &&
        state.source === null
      ) {
        return state;
      }
      return INITIAL_WORLD_FOCUS_STATE;
  }
}
