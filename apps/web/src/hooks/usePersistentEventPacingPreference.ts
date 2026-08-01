import { useCallback, useState } from "react";
import { EVENT_PACING_PREFERENCES, type EventPacingPreference } from "@tiny-civ/sim-core";

export const EVENT_PACING_STORAGE_KEY = "tiny-civilisation/event-pacing/v1";

function isEventPacingPreference(value: unknown): value is EventPacingPreference {
  return EVENT_PACING_PREFERENCES.some((preference) => preference === value);
}

function readPreference(): EventPacingPreference {
  try {
    const stored = globalThis.localStorage?.getItem(EVENT_PACING_STORAGE_KEY);
    return isEventPacingPreference(stored) ? stored : "HIGHLIGHT_ONLY";
  } catch {
    return "HIGHLIGHT_ONLY";
  }
}

export function usePersistentEventPacingPreference(): readonly [
  EventPacingPreference,
  (preference: EventPacingPreference) => void,
] {
  const [preference, setPreferenceState] = useState<EventPacingPreference>(readPreference);
  const setPreference = useCallback((next: EventPacingPreference) => {
    setPreferenceState(next);
    try {
      globalThis.localStorage?.setItem(EVENT_PACING_STORAGE_KEY, next);
    } catch {
      // Browser storage is optional; the in-memory preference remains usable.
    }
  }, []);
  return [preference, setPreference] as const;
}
