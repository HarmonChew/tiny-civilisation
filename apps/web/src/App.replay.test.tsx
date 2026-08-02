import { createSimulation } from "@tiny-civ/sim-core";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MomentReplayPresentation } from "./hooks/useExperimentWorkspace";
import type { UseMomentQueueOptions } from "./hooks/useMomentQueue";
import type { TimelineEventView, WorldView } from "./model";
import { makeWorldView } from "./sim-adapter";

const mocks = vi.hoisted(() => ({
  executeReplay: vi.fn(),
  exitMomentReplay: vi.fn(),
  continueMoment: vi.fn(),
  pause: vi.fn(),
  setPlaying: vi.fn(),
  setSpeed: vi.fn(),
  useExperimentWorkspace: vi.fn(),
  useMomentQueue: vi.fn(),
  usePersistentEventPacingPreference: vi.fn(),
  useSimulationController: vi.fn(),
}));

vi.mock("./hooks/useSimulationController", () => ({
  useSimulationController: mocks.useSimulationController,
}));

vi.mock("./hooks/useExperimentWorkspace", () => ({
  useExperimentWorkspace: mocks.useExperimentWorkspace,
}));

vi.mock("./hooks/useMomentQueue", () => ({
  useMomentQueue: mocks.useMomentQueue,
}));

vi.mock("./hooks/usePersistentEventPacingPreference", () => ({
  usePersistentEventPacingPreference: mocks.usePersistentEventPacingPreference,
}));

vi.mock("./components/Chronicle", () => ({
  TimelinePanel: ({
    onSelectEvent,
  }: {
    onSelectEvent: (event: TimelineEventView) => void;
  }) => (
    <button type="button" onClick={() => onSelectEvent(testContext.priorEvent)}>
      Inspect prior evidence
    </button>
  ),
}));

vi.mock("./components/WorldNavigator", () => ({
  WorldAttentionAnnouncer: () => null,
  WorldNavigator: () => null,
}));

vi.mock("./components/MomentQueue", () => ({
  MomentQueue: ({ onReplayMoment }: { onReplayMoment: (id: number) => void }) => (
    <button type="button" onClick={() => onReplayMoment(9)}>
      Replay focal moment
    </button>
  ),
}));

vi.mock("./components/MomentReplayControls", () => ({
  MomentReplayControls: ({ onExit }: { onExit: () => void }) => (
    <button type="button" onClick={onExit}>
      Exit isolated replay
    </button>
  ),
}));

vi.mock("./components/ExperimentWorkspace", () => ({
  ExperimentWorkspace: () => null,
}));

vi.mock("./components/WorldStage", () => ({
  WorldStage: ({
    selectedId,
    focusedId,
    followedId,
    replayCamera,
    onSelect,
    onHover,
  }: {
    selectedId: number | null;
    focusedId: number | null;
    followedId: number | null;
    replayCamera?: { eventId: number } | null;
    onSelect: (id: number | null) => void;
    onHover: (id: number | null) => void;
  }) => (
    <div
      data-testid="world-stage"
      data-selected={selectedId?.toString() ?? "none"}
      data-focused={focusedId?.toString() ?? "none"}
      data-followed={followedId?.toString() ?? "none"}
      data-replay-event={replayCamera?.eventId.toString() ?? "live"}
    >
      <button type="button" onClick={() => onSelect(2)}>
        Select Nalo
      </button>
      <button type="button" onClick={() => onHover(1)}>
        Hover Iri
      </button>
    </div>
  ),
}));

vi.mock("./components/InspectorPanel", () => ({
  InspectorPanel: ({
    creature,
    evidenceEvent,
    followed,
    onFollow,
  }: {
    creature: { id: number; name: string } | null;
    evidenceEvent: { id: number } | null;
    followed: boolean;
    onFollow: () => void;
  }) => (
    <div
      data-testid="inspector"
      data-creature={creature?.id.toString() ?? "none"}
      data-evidence={evidenceEvent?.id.toString() ?? "none"}
    >
      {creature ? (
        <button type="button" onClick={onFollow}>
          {followed ? "Stop following selected" : "Follow selected"}
        </button>
      ) : null}
    </div>
  ),
}));

interface ReplayTestContext {
  view: WorldView;
  priorEvent: TimelineEventView;
  momentEvent: TimelineEventView;
  momentQueueOptions?: UseMomentQueueOptions;
}

const testContext = {} as ReplayTestContext;

function event(id: number, actorIds: number[], targetIds: number[]): TimelineEventView {
  return {
    id,
    tick: 40,
    category: "social",
    type: "FOOD_SHARED",
    title: `Event ${id.toString()}`,
    detail: "A retained event.",
    actorIds,
    targetIds,
    causedByEventIds: [],
    importance: 60,
    attentionTier: "SIGNIFICANT",
    clusterKey: `event-${id.toString()}`,
    playerCaused: false,
    decisionActorId: actorIds[0],
    locationTileIndex: 10,
  };
}

function replayPresentation(view: WorldView): MomentReplayPresentation {
  return {
    eventId: 9,
    title: "Focal replay",
    activeBeatIndex: 0,
    beats: [
      {
        id: "APPROACH",
        label: "Approach",
        tick: 30,
        summary: "The participants approached.",
        view: { ...view, tick: 30 },
      },
    ],
  };
}

function simulationController(playing = true) {
  return {
    view: testContext.view,
    seed: 4_182,
    timelineRevision: 0,
    initialized: true,
    busy: false,
    fatalError: null,
    playing,
    setPlaying: mocks.setPlaying,
    speed: 2,
    setSpeed: mocks.setSpeed,
    feedback: "Live world",
    advance: vi.fn(),
    pause: mocks.pause,
  };
}

function momentQueueController() {
  return {
    moments: [
      {
        id: 9,
        latestEvent: testContext.momentEvent,
      },
    ],
    activeMomentId: 9,
    selectMoment: vi.fn(),
    inspectMoment: vi.fn(),
    continueMoment: mocks.continueMoment,
    dismissMoment: vi.fn(),
  };
}

function stage(): HTMLElement {
  return screen.getByTestId("world-stage");
}

function expectStageState(expected: {
  selected: string;
  focused: string;
  followed: string;
  replayEvent: string;
}): void {
  expect(stage().getAttribute("data-selected")).toBe(expected.selected);
  expect(stage().getAttribute("data-focused")).toBe(expected.focused);
  expect(stage().getAttribute("data-followed")).toBe(expected.followed);
  expect(stage().getAttribute("data-replay-event")).toBe(expected.replayEvent);
}

import App from "./App";

describe("App isolated replay session", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const baseView = makeWorldView(createSimulation(4_182));
    testContext.priorEvent = event(6, [2], [1]);
    testContext.momentEvent = event(9, [1], [2]);
    testContext.view = {
      ...baseView,
      tick: 80,
      timeLabel: "00:08",
      hash: "live-hash",
      events: [testContext.priorEvent, testContext.momentEvent],
    };
    delete testContext.momentQueueOptions;
    mocks.pause.mockResolvedValue(testContext.view);
    mocks.executeReplay.mockResolvedValue(true);
    mocks.useSimulationController.mockReturnValue(simulationController());
    mocks.usePersistentEventPacingPreference.mockReturnValue(["HIGHLIGHT_ONLY", vi.fn()]);
    mocks.useMomentQueue.mockReturnValue(momentQueueController());
    mocks.useExperimentWorkspace.mockImplementation(() => {
      const [momentReplay, setMomentReplay] = useState<MomentReplayPresentation | null>(
        null,
      );
      return {
        props: {
          open: false,
          actions: { onRequestNew: vi.fn() },
        },
        busy: false,
        momentReplay,
        openDrawer: vi.fn(),
        applyWorldIntervention: vi.fn(),
        inspectTimelineEvent: vi.fn(),
        replayTimelineEvent: async () => {
          const replayed = await mocks.executeReplay();
          if (replayed) setMomentReplay(replayPresentation(testContext.view));
          return replayed;
        },
        selectMomentReplayBeat: vi.fn(),
        exitMomentReplay: () => {
          mocks.exitMomentReplay();
          setMomentReplay(null);
        },
        recover: vi.fn(async () => false),
      };
    });
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      callback(0);
      return 1;
    });
  });

  function establishLiveContext(): void {
    fireEvent.click(screen.getByRole("button", { name: "Select Nalo" }));
    fireEvent.click(screen.getByRole("button", { name: "Inspect prior evidence" }));
    fireEvent.click(screen.getByRole("button", { name: "Follow selected" }));
    fireEvent.click(screen.getByRole("button", { name: "Hover Iri" }));
    expectStageState({
      selected: "2",
      focused: "1",
      followed: "2",
      replayEvent: "live",
    });
    expect(screen.getByTestId("inspector").getAttribute("data-evidence")).toBe("6");
  }

  it("frames the replay subject and restores live play, follow, focus, and DOM focus", async () => {
    render(<App />);
    establishLiveContext();
    const replayButton = screen.getByRole("button", { name: "Replay focal moment" });
    replayButton.focus();
    fireEvent.click(replayButton);

    await screen.findByRole("button", { name: "Exit isolated replay" });
    expectStageState({
      selected: "1",
      focused: "none",
      followed: "none",
      replayEvent: "9",
    });
    expect(mocks.pause).toHaveBeenCalledOnce();
    expect(mocks.continueMoment).toHaveBeenCalledWith(9);
    expect(mocks.setPlaying).toHaveBeenCalledWith(false);

    fireEvent.click(screen.getByRole("button", { name: "Exit isolated replay" }));
    await waitFor(() =>
      expectStageState({
        selected: "2",
        focused: "1",
        followed: "2",
        replayEvent: "live",
      }),
    );
    expect(screen.getByTestId("inspector").getAttribute("data-evidence")).toBe("6");
    expect(mocks.setPlaying.mock.calls.at(-1)?.[0]).toBe(true);
    expect(document.activeElement).toBe(document.getElementById("living-dish"));
  });

  it("restores the untouched live session when isolated replay fails", async () => {
    mocks.executeReplay.mockRejectedValueOnce(new Error("Replay unavailable"));
    render(<App />);
    establishLiveContext();
    const replayButton = screen.getByRole("button", { name: "Replay focal moment" });
    replayButton.focus();
    fireEvent.click(replayButton);

    await waitFor(() => expect(mocks.executeReplay).toHaveBeenCalledOnce());
    await waitFor(() =>
      expectStageState({
        selected: "2",
        focused: "1",
        followed: "2",
        replayEvent: "live",
      }),
    );
    expect(screen.queryByRole("button", { name: "Exit isolated replay" })).toBeNull();
    expect(screen.getByTestId("inspector").getAttribute("data-evidence")).toBe("6");
    expect(mocks.setPlaying.mock.calls.at(-1)?.[0]).toBe(true);
    expect(document.activeElement).toBe(replayButton);
    expect(mocks.continueMoment).not.toHaveBeenCalled();
  });

  it("restores the pre-pause play state after replaying an automatically paused moment", async () => {
    mocks.useMomentQueue.mockImplementation((options: UseMomentQueueOptions) => {
      testContext.momentQueueOptions = options;
      return momentQueueController();
    });
    render(<App />);

    act(() => {
      testContext.momentQueueOptions?.onPacingRequest?.({
        momentId: 9,
        action: "PAUSE",
        restoreSpeed: 2,
        event: testContext.momentEvent,
      });
    });
    expect(mocks.setPlaying).toHaveBeenLastCalledWith(false);

    mocks.useSimulationController.mockReturnValue(simulationController(false));
    fireEvent.click(screen.getByRole("button", { name: "Select Nalo" }));
    fireEvent.click(screen.getByRole("button", { name: "Replay focal moment" }));
    await screen.findByRole("button", { name: "Exit isolated replay" });
    fireEvent.click(screen.getByRole("button", { name: "Exit isolated replay" }));

    await waitFor(() => expect(mocks.setPlaying).toHaveBeenLastCalledWith(true));
  });
});
