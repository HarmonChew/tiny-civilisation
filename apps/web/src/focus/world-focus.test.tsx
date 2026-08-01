import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { worldFocusReducer } from "./reducer";
import {
  INITIAL_WORLD_FOCUS_STATE,
  creatureIdFromRef,
  creatureRef,
  eventIdFromRef,
  eventRef,
  sameWorldRef,
  worldRefKey,
} from "./types";
import { useWorldFocus } from "./useWorldFocus";

describe("world focus model", () => {
  it("keeps transient focus separate from persistent selection and evidence", () => {
    const aro = creatureRef(4);
    const event = eventRef(19);
    const hovered = worldFocusReducer(INITIAL_WORLD_FOCUS_STATE, {
      type: "hover",
      ref: aro,
      source: "ROSTER",
    });
    expect(hovered.hovered).toEqual(aro);
    expect(hovered.selected).toBeNull();

    const inspected = worldFocusReducer(hovered, {
      type: "inspect-evidence",
      ref: event,
      subject: aro,
      source: "CHRONICLE",
    });
    expect(creatureIdFromRef(inspected.selected)).toBe(4);
    expect(eventIdFromRef(inspected.evidenceFocus)).toBe(19);
    expect(inspected.hovered).toEqual(aro);

    const selected = worldFocusReducer(inspected, {
      type: "select",
      ref: creatureRef(7),
      source: "DISH",
    });
    expect(creatureIdFromRef(selected.selected)).toBe(7);
    expect(selected.evidenceFocus).toBeNull();
  });

  it("compares every reference by its stable typed identity", () => {
    expect(sameWorldRef(creatureRef(2), creatureRef(2))).toBe(true);
    expect(sameWorldRef(creatureRef(2), eventRef(2))).toBe(false);
    expect(worldRefKey({ kind: "relationship", fromId: 3, toId: 8 })).toBe(
      "relationship:3:8",
    );
    expect(worldRefKey({ kind: "plan", creatureId: 3, decisionId: 41 })).toBe("plan:3:41");
  });

  it("exposes stable controller actions around the reducer", () => {
    const { result } = renderHook(() => useWorldFocus());
    const initialSelect = result.current.select;

    act(() => result.current.setKeyboardFocused(creatureRef(1), "ROSTER"));
    expect(creatureIdFromRef(result.current.state.keyboardFocused)).toBe(1);
    expect(result.current.select).toBe(initialSelect);

    act(() => result.current.inspectEvidence(eventRef(12), creatureRef(1), "CHRONICLE"));
    expect(eventIdFromRef(result.current.state.evidenceFocus)).toBe(12);
    expect(creatureIdFromRef(result.current.state.selected)).toBe(1);

    act(() => result.current.clearTransient());
    expect(result.current.state.keyboardFocused).toBeNull();
    expect(eventIdFromRef(result.current.state.evidenceFocus)).toBe(12);

    act(() => result.current.reset());
    expect(result.current.state).toEqual(INITIAL_WORLD_FOCUS_STATE);
  });
});
