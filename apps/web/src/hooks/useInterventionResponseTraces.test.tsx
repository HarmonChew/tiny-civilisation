import { renderHook, waitFor } from "@testing-library/react";
import {
  createInterventionResponseTrace,
  observeInterventionResponse,
  type InterventionLogEntryV1,
} from "@tiny-civ/sim-core";
import { describe, expect, it, vi } from "vitest";
import type { WorldView } from "../model";
import { DEFAULT_SCENARIO_VIEW } from "../experiment/scenario-presets";
import { useInterventionResponseTraces } from "./useInterventionResponseTraces";

const commandLog: readonly InterventionLogEntryV1[] = [
  {
    command: {
      commandId: 1,
      applyAtTick: 10,
      type: "ADD_FOOD",
      tileIndex: 5,
      amount: 12,
      blocked: null,
    },
    outcome: {
      status: "APPLIED",
      appliedAtTick: 10,
      resolvedTileIndex: 5,
      quantity: 12,
      blocked: null,
      eventIds: [100],
      reason: null,
    },
    responseTrace: null,
  },
];

function view(tick: number, downstream = false): WorldView {
  return {
    scenario: DEFAULT_SCENARIO_VIEW,
    tick,
    timeLabel: "00:01",
    hash: "abcdef1234567890",
    width: 4,
    height: 3,
    population: 1,
    foodStock: 12,
    tiles: [],
    resources: [],
    structures: [],
    groups: [],
    creatures: [
      {
        id: 1,
        name: "Iri",
        color: 0x8da268,
        x: 1.5,
        y: 1.5,
        alive: true,
        role: "Forager",
        desire: "SECURE_PROVISIONS",
        plan: "FORAGE_FOR_FOOD",
        goal: "SECURE_PROVISIONS",
        action: "GATHER_FOOD",
        actionPhase: "WORKING",
        reason: "New food was recorded",
        summary: { desire: "", plan: "", action: "", reason: "" },
        route: [],
        health: 100,
        hunger: 50,
        fatigue: 10,
        thirst: 30,
        traits: [],
        inventory: [],
        candidates: [],
        memories: [],
        relationships: [],
      },
    ],
    events: [
      {
        id: 1_000_001,
        tick: 10,
        category: "player",
        type: "INTERVENTION",
        title: "Food added",
        detail: "Food was added at tile 1, 1.",
        actorIds: [],
        targetIds: [90],
        causedByEventIds: [100],
        importance: 60,
        attentionTier: "SIGNIFICANT",
        clusterKey: "history:intervention",
        locationTileIndex: 5,
        commandId: 1,
        commandSourceEventId: 100,
        commandOutcome: "APPLIED",
        playerCaused: true,
      },
      ...(downstream
        ? [
            {
              id: 101,
              tick,
              category: "resources" as const,
              type: "FOOD_GATHERED",
              title: "Food gathered",
              detail: "Iri gathered from the added patch.",
              actorIds: [1],
              targetIds: [90],
              causedByEventIds: [100],
              importance: 20,
              attentionTier: "NOTABLE" as const,
              clusterKey: "gather:1:90",
              locationTileIndex: 5,
              playerCaused: false,
            },
          ]
        : []),
    ],
  };
}

describe("useInterventionResponseTraces", () => {
  it("advances a settled command trace from its promoted outcome to action", async () => {
    const { result, rerender } = renderHook(
      ({ currentView }) =>
        useInterventionResponseTraces({
          streamKey: "branch-a",
          commandLog,
          view: currentView,
        }),
      { initialProps: { currentView: view(10) } },
    );
    await waitFor(() => expect(result.current.get(1)?.phase).toBe("OBSERVING"));
    expect(result.current.get(1)?.outcome?.eventId).toBe(100);

    rerender({ currentView: view(20, true) });
    await waitFor(() =>
      expect(result.current.get(1)?.responses[0]).toMatchObject({
        participantId: 1,
        status: "USED",
        beats: [expect.objectContaining({ kind: "ACTED" })],
      }),
    );
  });

  it("resets traces when the branch stream changes", async () => {
    const { result, rerender } = renderHook(
      ({ streamKey, entries }) =>
        useInterventionResponseTraces({
          streamKey,
          commandLog: entries,
          view: view(10),
        }),
      { initialProps: { streamKey: "branch-a", entries: commandLog } },
    );
    await waitFor(() => expect(result.current.has(1)).toBe(true));
    rerender({ streamKey: "branch-b", entries: [] });
    await waitFor(() => expect(result.current.size).toBe(0));
  });

  it("keeps the same trace reference when an identical frame is projected again", async () => {
    const stableView = view(10);
    const { result, rerender } = renderHook(
      ({ currentView }) =>
        useInterventionResponseTraces({
          streamKey: "branch-a",
          commandLog,
          view: currentView,
        }),
      { initialProps: { currentView: stableView } },
    );
    await waitFor(() => expect(result.current.get(1)?.phase).toBe("OBSERVING"));
    const trace = result.current.get(1);

    rerender({ currentView: { ...stableView, creatures: [...stableView.creatures] } });

    await waitFor(() => expect(result.current.get(1)).toBe(trace));
  });

  it("publishes persistence updates only for material evidence and closure changes", async () => {
    const onMaterialChange = vi.fn();
    const { result, rerender } = renderHook(
      ({ currentView }) =>
        useInterventionResponseTraces({
          streamKey: "branch-a",
          commandLog,
          view: currentView,
          onMaterialChange,
        }),
      { initialProps: { currentView: view(10) } },
    );
    await waitFor(() => expect(onMaterialChange).toHaveBeenCalledTimes(1));
    const published = result.current.get(1);

    rerender({ currentView: view(11) });
    await waitFor(() => expect(result.current.get(1)).toBe(published));
    expect(onMaterialChange).toHaveBeenCalledTimes(1);

    rerender({ currentView: view(20, true) });
    await waitFor(() => expect(onMaterialChange).toHaveBeenCalledTimes(2));
    expect(onMaterialChange.mock.calls[1]?.[1]).toMatchObject({
      responses: [{ participantId: 1, status: "USED" }],
    });
  });

  it("coalesces same-turn publication and persistence outside the passive effect", async () => {
    const onMaterialChange = vi.fn();
    const { result, rerender } = renderHook(
      ({ currentView }) =>
        useInterventionResponseTraces({
          streamKey: "branch-a",
          commandLog,
          view: currentView,
          onMaterialChange,
        }),
      { initialProps: { currentView: view(10) } },
    );

    rerender({ currentView: view(20, true) });

    expect(onMaterialChange).not.toHaveBeenCalled();

    await waitFor(() => {
      expect(result.current.get(1)?.responses[0]).toMatchObject({
        participantId: 1,
        status: "USED",
      });
      expect(onMaterialChange).toHaveBeenCalledTimes(1);
    });
    expect(onMaterialChange.mock.calls[0]?.[1]).toMatchObject({
      responses: [{ participantId: 1, status: "USED" }],
    });

    rerender({ currentView: { ...view(20, true) } });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(onMaterialChange).toHaveBeenCalledTimes(1);
  });

  it("discards a queued trace when the stream changes before publication", async () => {
    const onMaterialChange = vi.fn();
    const { result, rerender } = renderHook(
      ({ entries, streamKey }) =>
        useInterventionResponseTraces({
          streamKey,
          commandLog: entries,
          view: view(10),
          onMaterialChange,
        }),
      { initialProps: { entries: commandLog, streamKey: "branch-a" } },
    );

    rerender({ entries: [], streamKey: "branch-b" });

    await waitFor(() => expect(result.current.size).toBe(0));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(onMaterialChange).not.toHaveBeenCalled();
  });

  it("cancels a queued trace when the hook unmounts", async () => {
    const onMaterialChange = vi.fn();
    const { unmount } = renderHook(() =>
      useInterventionResponseTraces({
        streamKey: "branch-a",
        commandLog,
        view: view(10),
        onMaterialChange,
      }),
    );

    unmount();

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(onMaterialChange).not.toHaveBeenCalled();
  });

  it("retains queued evidence until a persistence callback becomes available", async () => {
    const onMaterialChange = vi.fn();
    const { rerender } = renderHook(
      ({ callback }) =>
        useInterventionResponseTraces({
          streamKey: "branch-a",
          commandLog,
          view: view(10),
          ...(callback ? { onMaterialChange: callback } : {}),
        }),
      {
        initialProps: {
          callback: undefined as
            | ((
                commandId: number,
                trace: ReturnType<typeof createInterventionResponseTrace>,
              ) => void)
            | undefined,
        },
      },
    );

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(onMaterialChange).not.toHaveBeenCalled();

    rerender({ callback: onMaterialChange });

    await waitFor(() => expect(onMaterialChange).toHaveBeenCalledTimes(1));
  });

  it("seeds its visible trace map from persisted experiment evidence", async () => {
    const persistedTrace = observeInterventionResponse(
      createInterventionResponseTrace(commandLog[0]!.command, [1]),
      {
        tick: 10,
        width: 4,
        creatures: view(10).creatures,
        events: view(10).events,
      },
    );
    const persistedLog: readonly InterventionLogEntryV1[] = [
      { ...commandLog[0]!, responseTrace: persistedTrace },
    ];
    const { result } = renderHook(() =>
      useInterventionResponseTraces({
        streamKey: "branch-a",
        commandLog: persistedLog,
        view: view(10),
      }),
    );

    await waitFor(() => expect(result.current.get(1)).toEqual(persistedTrace));
  });
});
