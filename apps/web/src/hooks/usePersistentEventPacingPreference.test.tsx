import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import {
  EVENT_PACING_STORAGE_KEY,
  usePersistentEventPacingPreference,
} from "./usePersistentEventPacingPreference";

describe("usePersistentEventPacingPreference", () => {
  beforeEach(() => localStorage.clear());

  it("defaults safely and persists an explicit preference", () => {
    const { result, unmount } = renderHook(() => usePersistentEventPacingPreference());
    expect(result.current[0]).toBe("HIGHLIGHT_ONLY");
    act(() => result.current[1]("PAUSE_CRITICAL"));
    expect(localStorage.getItem(EVENT_PACING_STORAGE_KEY)).toBe("PAUSE_CRITICAL");
    unmount();

    const restored = renderHook(() => usePersistentEventPacingPreference());
    expect(restored.result.current[0]).toBe("PAUSE_CRITICAL");
  });

  it("ignores an unknown stored value", () => {
    localStorage.setItem(EVENT_PACING_STORAGE_KEY, "ALWAYS_STOP");
    const { result } = renderHook(() => usePersistentEventPacingPreference());
    expect(result.current[0]).toBe("HIGHLIGHT_ONLY");
  });
});
