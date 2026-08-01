import {
  appendExperimentIntervention,
  advanceSimulation,
  compareExperimentOutcomes,
  createCausalEvidenceProjection,
  createExperiment,
  createExperimentOutcome,
  createPendingIntervention,
  createRenderSnapshot,
  createScenarioReference,
  createSimulation,
  hashSimulationState,
  serializeSimulationSave,
  type CausalEvidenceProjectionV1,
  type DomainEvent,
  type ExperimentV1,
  type InterventionLogEntryV1,
  type ScheduledPlayerCommand,
  type SimulationReplayV1,
  type SimulationState,
} from "@tiny-civ/sim-core";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  LongRunningOperationOptions,
  ReplayResult,
  SimulationEngine,
  SimulationFrame,
} from "../runtime";
import { makeWorldView } from "../sim-adapter";
import { reconcilePendingInterventions } from "../experiment/intervention-reconciliation";
import type { InterventionResponseTrace } from "../experiment/intervention-response";
import type { TimelineEventView } from "../model";
import { projectInterventionOutcomes } from "../runtime/state-projections";
import type { SimulationController } from "./useSimulationController";
import {
  causalDetailFromProjection,
  createMomentReplayPresentation,
  interventionNavigationActions,
  interventionResponseRecord,
  timelineReplayWindow,
  useExperimentWorkspace,
} from "./useExperimentWorkspace";

function deferred<Value>() {
  let resolve!: (value: Value) => void;
  const promise = new Promise<Value>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

function replayFrame(tick: number, hash: string): ReplayResult["frame"] {
  return { tick, hash } as ReplayResult["frame"];
}

function capturedReplayFrames(seed: number, ticks: readonly number[]): SimulationFrame[] {
  const state = createSimulation(seed);
  return [...new Set(ticks)]
    .sort((left, right) => left - right)
    .map((tick, revision) => {
      advanceSimulation(state, tick - state.tick);
      return {
        revision,
        seed,
        tick,
        hash: hashSimulationState(state),
        playing: false,
        snapshot: createRenderSnapshot(state),
      };
    });
}

function isolatedReplayEngine(
  implementation: (
    replay: SimulationReplayV1,
    options?: LongRunningOperationOptions,
  ) => Promise<ReplayResult>,
) {
  const replay = vi.fn(implementation);
  const dispose = vi.fn();
  return {
    engine: { replay, dispose } as unknown as SimulationEngine,
    replay,
    dispose,
  };
}

function timelineEvent(tick = 50): TimelineEventView {
  return {
    id: 91,
    tick,
    category: "social",
    type: "FOOD_SHARED",
    title: "A meal was shared",
    detail: "One creature shared food with another.",
    actorIds: [1],
    targetIds: [2],
    causedByEventIds: [],
    importance: 60,
    attentionTier: "SIGNIFICANT",
    clusterKey: "social:meal",
    playerCaused: false,
  };
}

function simulationController(
  overrides: Partial<SimulationController> = {},
): SimulationController {
  const state = createSimulation(4_182);
  const view = overrides.view ?? makeWorldView(state);
  const getState = overrides.getState ?? vi.fn(async () => state);
  const queryState = async (): Promise<SimulationState> => (await getState()) ?? state;
  return {
    view,
    seed: state.seed,
    initialized: true,
    busy: false,
    fatalError: null,
    playing: false,
    setPlaying: vi.fn(),
    speed: 1,
    setSpeed: vi.fn(),
    feedback: "Paused.",
    pause: vi.fn(async () => makeWorldView(state)),
    advance: vi.fn(async () => null),
    restart: vi.fn(async () => null),
    applyIntervention: vi.fn(async () => null),
    getState,
    getCanonicalHash: vi.fn(async () => ({
      tick: view.tick,
      hash: view.hash,
    })),
    getCheckpoint: vi.fn(async () => {
      const current = await queryState();
      return { tick: view.tick, hash: view.hash, state: current };
    }),
    getCausalEvidence: vi.fn(async (focus, query) => {
      const current = await queryState();
      return createCausalEvidenceProjection(current, focus, query);
    }),
    getEntityDetail: vi.fn(async (ref) => {
      const current = await queryState();
      const projection = createCausalEvidenceProjection(current, ref, {
        maxDepth: 0,
        maxNodes: 1,
      });
      return {
        stateTick: projection.stateTick,
        ref,
        node: projection.nodes[0] ?? null,
      };
    }),
    getInterventionOutcomes: vi.fn(async (commands) => {
      const current = await queryState();
      return projectInterventionOutcomes(current, commands);
    }),
    getOutcome: vi.fn(async () => createExperimentOutcome(await queryState())),
    compareOutcome: vi.fn(async (baseline) =>
      compareExperimentOutcomes(baseline, createExperimentOutcome(await queryState())),
    ),
    save: vi.fn(async () => serializeSimulationSave(state)),
    load: vi.fn(async () => makeWorldView(state)),
    runToTick: vi.fn(async () => ({ cancelled: false, frame: null as never })),
    replay: vi.fn(async () => ({
      cancelled: false,
      expectedHash: null,
      actualHash: "",
      hashMatches: null,
      frame: null as never,
    })),
    ...overrides,
  };
}

function scheduledCommand(
  commandId: number,
  overrides: Partial<ScheduledPlayerCommand> = {},
): ScheduledPlayerCommand {
  return {
    commandId,
    applyAtTick: 10,
    type: "ADD_FOOD",
    tileIndex: 7,
    amount: 12,
    blocked: null,
    ...overrides,
  };
}

function experimentWithPendingCommands(commands: readonly ScheduledPlayerCommand[]): {
  experiment: ExperimentV1;
  branchId: string;
} {
  let experiment = createExperiment(createScenarioReference(4_182));
  for (const command of commands) {
    experiment = appendExperimentIntervention(
      experiment,
      experiment.rootBranchId,
      createPendingIntervention(command),
    );
  }
  return { experiment, branchId: experiment.rootBranchId };
}

function addCommandEvent(
  state: SimulationState,
  fields: Partial<DomainEvent> & Pick<DomainEvent, "id" | "commandId" | "commandOutcome">,
): DomainEvent {
  const template = state.domainEvents[0];
  if (!template) throw new Error("Expected the simulation-start event fixture.");
  const event: DomainEvent = {
    ...template,
    tick: 10,
    type: "PLAYER_ADDED_FOOD",
    locationTileIndex: 7,
    quantity: 12,
    commandRejectionReason: null,
    summary: "The observer added food.",
    ...fields,
  };
  state.domainEvents.push(event);
  state.tick = Math.max(state.tick, event.tick);
  return event;
}

function outcomes(experiment: ExperimentV1, branchId: string) {
  return experiment.branches.find((branch) => branch.id === branchId)?.commandLog;
}

beforeEach(() => {
  localStorage.clear();
});

describe("experiment causal detail projection", () => {
  it("uses the closest summarized decision and only factor-linked social evidence", () => {
    const projection = {
      stateTick: 120,
      focus: { kind: "history", id: 11 },
      nodes: [
        {
          ref: { kind: "history", id: 11 },
          label: "Food changed a relationship",
          tick: 100,
          summary: "A retained historical observation.",
          detail: { kind: "history", historyType: "SOCIAL_BOND", importance: 50 },
        },
        {
          ref: { kind: "event", id: 10 },
          label: "older event",
          tick: 50,
          summary: "Older context.",
          detail: {
            kind: "event",
            eventType: "FOOD_GATHERED",
            quantity: 1,
            importance: 20,
          },
        },
        {
          ref: { kind: "event", id: 20 },
          label: "immediate event",
          tick: 100,
          summary: "Immediate source.",
          detail: {
            kind: "event",
            eventType: "FOOD_SHARED",
            quantity: 1,
            importance: 40,
          },
        },
        {
          ref: { kind: "event", id: 99 },
          label: "remembered help",
          tick: 40,
          summary: "Help was remembered.",
          detail: {
            kind: "event",
            eventType: "FOOD_SHARED",
            quantity: 1,
            importance: 30,
          },
        },
        {
          ref: { kind: "decision", id: 1 },
          label: "older decision",
          tick: 50,
          summary: "An unrelated older choice.",
          detail: {
            kind: "decision",
            actorId: 1,
            previousAction: null,
            selectedAction: "KEEP",
            selectedTarget: null,
            switchReason: "INITIAL_SELECTION",
            candidates: [],
          },
        },
        {
          ref: { kind: "decision", id: 2 },
          label: "share decision",
          tick: 100,
          summary: "The direct choice.",
          detail: {
            kind: "decision",
            actorId: 2,
            previousAction: "KEEP",
            selectedAction: "SHARE",
            selectedTarget: null,
            switchReason: "NEW_OPTION_EXCEEDED_HYSTERESIS",
            candidates: [
              {
                action: "SHARE",
                target: null,
                targetTileIndex: null,
                utility: 700,
                factors: [
                  {
                    key: "remembered_help",
                    contribution: 250,
                    evidence: [{ kind: "event", id: 99 }],
                  },
                ],
              },
            ],
          },
        },
        {
          ref: { kind: "memory", id: 1 },
          label: "help received",
          tick: 40,
          summary: "Relevant memory.",
          detail: {
            kind: "memory",
            memoryKind: "HELP_RECEIVED",
            valence: 2_000,
            importance: 3_000,
            strength: 3_000,
          },
        },
        {
          ref: { kind: "memory", id: 2 },
          label: "unrelated memory",
          tick: 50,
          summary: "Unrelated context.",
          detail: {
            kind: "memory",
            memoryKind: "RESOURCE_FOUND",
            valence: 1_000,
            importance: 1_000,
            strength: 1_000,
          },
        },
      ],
      edges: [
        {
          from: { kind: "history", id: 11 },
          to: { kind: "event", id: 10 },
          relation: "SUMMARIZES",
          factorKey: null,
          contribution: null,
        },
        {
          from: { kind: "history", id: 11 },
          to: { kind: "event", id: 20 },
          relation: "SUMMARIZES",
          factorKey: null,
          contribution: null,
        },
        {
          from: { kind: "event", id: 10 },
          to: { kind: "decision", id: 1 },
          relation: "EXPLAINED_BY",
          factorKey: null,
          contribution: null,
        },
        {
          from: { kind: "event", id: 20 },
          to: { kind: "decision", id: 2 },
          relation: "EXPLAINED_BY",
          factorKey: null,
          contribution: null,
        },
        {
          from: { kind: "memory", id: 1 },
          to: { kind: "event", id: 99 },
          relation: "REMEMBERS",
          factorKey: null,
          contribution: null,
        },
        {
          from: { kind: "memory", id: 2 },
          to: { kind: "event", id: 10 },
          relation: "REMEMBERS",
          factorKey: null,
          contribution: null,
        },
      ],
      immediateCauses: [{ kind: "event", id: 20 }],
      laterConsequences: [],
      missingRefs: [],
      truncated: false,
    } as unknown as CausalEvidenceProjectionV1;

    const detail = causalDetailFromProjection(projection);

    expect(detail?.decision?.chosenAction).toBe("SHARE");
    expect(detail?.decision?.actorLabel).toBe("Creature 2");
    expect(detail?.socialEvidence.map((item) => item.id)).toEqual(["memory:1"]);
  });

  it("cancels stale evidence queries and reports every navigate and retry focus", async () => {
    const state = createSimulation(4_182);
    const firstRef = { kind: "creature", id: state.creatures[0]!.id } as const;
    const secondRef = { kind: "creature", id: state.creatures[1]!.id } as const;
    const firstProjection = createCausalEvidenceProjection(state, firstRef, {
      maxDepth: 3,
      maxNodes: 120,
    });
    const secondProjection = createCausalEvidenceProjection(state, secondRef, {
      maxDepth: 3,
      maxNodes: 120,
    });
    const first = deferred<CausalEvidenceProjectionV1>();
    const second = deferred<CausalEvidenceProjectionV1>();
    const getCausalEvidence = vi
      .fn()
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise)
      .mockResolvedValue(secondProjection);
    const onFocusEvidence = vi.fn();
    const simulation = simulationController({ getCausalEvidence });
    const { result } = renderHook(() =>
      useExperimentWorkspace({ simulation, onSelectCreature: vi.fn(), onFocusEvidence }),
    );

    act(() => {
      result.current.props.causal.onNavigate(`creature:${firstRef.id.toString()}`);
      result.current.props.causal.onNavigate(`creature:${secondRef.id.toString()}`);
    });

    expect(onFocusEvidence.mock.calls.map(([ref]) => ref)).toEqual([firstRef, secondRef]);
    expect(getCausalEvidence.mock.calls[0]?.[2]?.signal?.aborted).toBe(true);
    await act(async () => second.resolve(secondProjection));
    await waitFor(() =>
      expect(result.current.props.causal.detail?.id).toBe(
        `creature:${secondRef.id.toString()}`,
      ),
    );

    await act(async () => first.resolve(firstProjection));
    expect(result.current.props.causal.detail?.id).toBe(
      `creature:${secondRef.id.toString()}`,
    );

    act(() => result.current.props.causal.onRetry?.());
    await waitFor(() => expect(onFocusEvidence).toHaveBeenCalledTimes(3));
    expect(onFocusEvidence).toHaveBeenLastCalledWith(secondRef);
  });
});

describe("experiment workspace operation lock", () => {
  it("acquires synchronously and blocks interventions until a save settles", async () => {
    const state = createSimulation(4_182);
    const save = deferred<string>();
    const applyIntervention = vi.fn(async () => null);
    const simulation = simulationController({
      view: makeWorldView(state),
      getState: vi.fn(async () => state),
      save: vi.fn(() => save.promise),
      applyIntervention,
    });
    const { result } = renderHook(() =>
      useExperimentWorkspace({ simulation, onSelectCreature: vi.fn() }),
    );
    const tile = simulation.view.tiles[0]!;
    let blockedIntervention!: Promise<void>;

    act(() => {
      result.current.props.actions.onSave();
      blockedIntervention = result.current.applyWorldIntervention("add-food", tile);
    });

    expect(result.current.busy).toBe(true);
    expect(result.current.props.actions.disabled).toBe(true);
    expect(result.current.props.bookmarks.disabled).toBe(true);
    expect(result.current.props.composer.disabled).toBe(true);
    await act(async () => blockedIntervention);
    expect(applyIntervention).not.toHaveBeenCalled();

    await act(async () => {
      save.resolve(serializeSimulationSave(state));
      await save.promise;
    });
    await waitFor(() => expect(result.current.busy).toBe(false));
    expect(result.current.props.currentTick).toBe(0);
    expect(hashSimulationState(state)).toBe(simulation.view.hash);
  });

  it("accepts only the first of two rapid world interventions", async () => {
    const state = createSimulation(4_182);
    const acknowledgement = deferred<{
      accepted: true;
      outcome: "scheduled";
      command: {
        commandId: number;
        applyAtTick: number;
        type: "ADD_FOOD";
        tileIndex: number;
        amount: number;
        blocked: null;
      };
    }>();
    const applyIntervention = vi.fn(() => acknowledgement.promise as never);
    const simulation = simulationController({
      view: makeWorldView(state),
      getState: vi.fn(async () => state),
      applyIntervention,
    });
    const { result } = renderHook(() =>
      useExperimentWorkspace({ simulation, onSelectCreature: vi.fn() }),
    );
    const tile = simulation.view.tiles[0]!;
    let first!: Promise<void>;
    let second!: Promise<void>;

    act(() => {
      first = result.current.applyWorldIntervention("add-food", tile);
      second = result.current.applyWorldIntervention("add-food", tile);
    });

    await waitFor(() => expect(applyIntervention).toHaveBeenCalledTimes(1));
    await act(async () => {
      acknowledgement.resolve({
        accepted: true,
        outcome: "scheduled",
        command: {
          commandId: 1,
          applyAtTick: 0,
          type: "ADD_FOOD",
          tileIndex: tile.index,
          amount: 12,
          blocked: null,
        },
      });
      await Promise.all([first, second]);
    });

    expect(result.current.busy).toBe(false);
    expect(result.current.props.interventions).toHaveLength(1);
  });
});

describe("isolated experiment replay", () => {
  it("declares a bounded moment window and clamps its aftermath to the branch horizon", () => {
    expect(timelineReplayWindow(50, 60)).toEqual({
      preludeStartTick: 30,
      momentTick: 50,
      actionEndTick: 51,
      aftermathEndTick: 60,
    });
    expect(timelineReplayWindow(5, 12)).toEqual({
      preludeStartTick: 0,
      momentTick: 5,
      actionEndTick: 6,
      aftermathEndTick: 12,
    });
  });

  it("turns captured authoritative frames into approach, decision, action, and aftermath views", () => {
    const event = {
      ...timelineEvent(1),
      reason: "A retained food fact supported the recorded choice.",
    };
    const window = {
      preludeStartTick: 0,
      momentTick: 1,
      actionEndTick: 2,
      aftermathEndTick: 3,
    };
    const captured = capturedReplayFrames(4_182, [0, 1, 2, 3]).map((frame, index) =>
      index === 0 ? frame : { ...frame, snapshot: { ...frame.snapshot, tiles: [] } },
    );
    const presentation = createMomentReplayPresentation(event, window, captured);

    expect(presentation?.beats.map((beat) => [beat.id, beat.tick])).toEqual([
      ["APPROACH", 0],
      ["DECISION", 1],
      ["ACTION", 2],
      ["AFTERMATH", 3],
    ]);
    expect(presentation?.beats.map((beat) => beat.view.tick)).toEqual([0, 1, 2, 3]);
    expect(presentation?.beats.every((beat) => beat.view.tiles.length > 0)).toBe(true);
    expect(presentation?.beats[1]?.summary).toBe(event.reason);
    expect(presentation?.beats[2]?.summary).toBe(event.detail);
  });

  it("replays a timeline moment in a disposable engine without changing the live view", async () => {
    const state = createSimulation(4_182);
    state.tick = 70;
    const liveView = makeWorldView(state);
    const simulation = simulationController({ view: liveView });
    const isolated = isolatedReplayEngine(async (replay, options) => {
      const targetTick = replay.finalTick ?? 0;
      options?.onProgress?.({
        operation: "replay",
        currentTick: 50,
        targetTick,
        completedTicks: 50,
        totalTicks: targetTick,
        fraction: 50 / targetTick,
      });
      return {
        cancelled: false,
        expectedHash: replay.finalHash ?? null,
        actualHash: replay.finalHash ?? "isolated-moment-hash",
        hashMatches: replay.finalHash ? true : null,
        frame: replayFrame(targetTick, replay.finalHash ?? "isolated-moment-hash"),
        capturedFrames: capturedReplayFrames(state.seed, [30, 50, 51, 70]),
      };
    });
    const { result } = renderHook(() =>
      useExperimentWorkspace({
        simulation,
        onSelectCreature: vi.fn(),
        createReplayEngine: () => isolated.engine,
      }),
    );

    await act(async () => {
      await result.current.replayTimelineEvent(timelineEvent());
    });

    expect(isolated.replay).toHaveBeenCalledTimes(1);
    expect(isolated.replay.mock.calls[0]?.[0]).toMatchObject({
      seed: state.seed,
      finalTick: 70,
      finalHash: liveView.hash,
    });
    expect(isolated.replay.mock.calls[0]?.[1]?.captureTicks).toEqual([30, 50, 51, 70]);
    expect(isolated.dispose).toHaveBeenCalledTimes(1);
    expect(simulation.replay).not.toHaveBeenCalled();
    expect(simulation.load).not.toHaveBeenCalled();
    expect(simulation.save).not.toHaveBeenCalled();
    expect(simulation.view).toBe(liveView);
    expect(simulation.view.tick).toBe(70);
    expect(simulation.view.hash).toBe(liveView.hash);
    expect(result.current.props.currentTick).toBe(70);
    expect(result.current.props.open).toBe(true);
    expect(result.current.props.section).toBe("replay");
    expect(result.current.props.replay.replay).toMatchObject({
      phase: "complete",
      currentTick: 70,
      targetTick: 70,
      progressPercent: 100,
      hash: { status: "match", expected: liveView.hash, actual: liveView.hash },
    });
    expect(result.current.props.replay.replay.message).toContain("moment tick 50");
    expect(result.current.props.replay.replay.message).toContain("window 30-70");
    expect(result.current.momentReplay?.beats.map((beat) => beat.label)).toEqual([
      "Approach",
      "Decision",
      "Action",
      "Aftermath",
    ]);
    expect(result.current.momentReplay?.activeBeatIndex).toBe(0);

    act(() => result.current.selectMomentReplayBeat(3));
    expect(result.current.momentReplay?.activeBeatIndex).toBe(3);
    act(() => result.current.exitMomentReplay());
    expect(result.current.momentReplay).toBeNull();
  });

  it("uses an explicitly paused live boundary and withholds mismatched frames", async () => {
    const state = createSimulation(4_182);
    state.tick = 70;
    const liveView = makeWorldView(state);
    const simulation = simulationController({
      view: liveView,
      getCanonicalHash: vi.fn(async () => ({
        tick: 65,
        hash: "paused-boundary-hash",
      })),
    });
    const isolated = isolatedReplayEngine(async (replay) => ({
      cancelled: false,
      expectedHash: replay.finalHash ?? null,
      actualHash: "mismatched-isolated-hash",
      hashMatches: false,
      frame: replayFrame(replay.finalTick ?? 0, "mismatched-isolated-hash"),
      capturedFrames: capturedReplayFrames(state.seed, [30, 50, 51, 65]),
    }));
    const { result } = renderHook(() =>
      useExperimentWorkspace({
        simulation,
        onSelectCreature: vi.fn(),
        createReplayEngine: () => isolated.engine,
      }),
    );
    let replayed = true;

    await act(async () => {
      replayed = await result.current.replayTimelineEvent(timelineEvent(), {
        tick: 65,
        hash: "paused-boundary-hash",
      });
    });

    expect(isolated.replay.mock.calls[0]?.[0]).toMatchObject({
      finalTick: 65,
      finalHash: "paused-boundary-hash",
    });
    expect(isolated.replay.mock.calls[0]?.[1]?.captureTicks).toEqual([30, 50, 51, 65]);
    expect(replayed).toBe(false);
    expect(result.current.momentReplay).toBeNull();
    expect(result.current.props.replay.replay.hash.status).toBe("mismatch");
    expect(simulation.view).toBe(liveView);
  });

  it("cancels a timeline replay without restoring or changing the live view", async () => {
    const state = createSimulation(4_182);
    state.tick = 80;
    const liveView = makeWorldView(state);
    const simulation = simulationController({ view: liveView });
    const started = deferred<void>();
    const isolated = isolatedReplayEngine(
      async (replay, options) =>
        new Promise<ReplayResult>((resolve) => {
          const finish = () =>
            resolve({
              cancelled: true,
              expectedHash: replay.finalHash ?? null,
              actualHash: "cancelled-isolated-hash",
              hashMatches: null,
              frame: replayFrame(42, "cancelled-isolated-hash"),
            });
          started.resolve();
          if (options?.signal?.aborted) finish();
          else options?.signal?.addEventListener("abort", finish, { once: true });
        }),
    );
    const { result } = renderHook(() =>
      useExperimentWorkspace({
        simulation,
        onSelectCreature: vi.fn(),
        createReplayEngine: () => isolated.engine,
      }),
    );
    let replayPromise!: Promise<boolean>;

    act(() => {
      replayPromise = result.current.replayTimelineEvent(timelineEvent());
    });
    await started.promise;
    act(() => result.current.props.replay.onCancel());
    await act(async () => replayPromise);

    expect(result.current.props.replay.replay.phase).toBe("cancelled");
    expect(result.current.props.replay.replay.message).toContain(
      "active view was never changed",
    );
    expect(isolated.dispose).toHaveBeenCalledTimes(1);
    expect(simulation.replay).not.toHaveBeenCalled();
    expect(simulation.load).not.toHaveBeenCalled();
    expect(simulation.view).toBe(liveView);
    expect(simulation.view.tick).toBe(80);
    expect(simulation.view.hash).toBe(liveView.hash);
    expect(result.current.props.currentTick).toBe(80);
  });

  it("reports an isolated timeline replay error without restoring or changing the live view", async () => {
    const state = createSimulation(4_182);
    state.tick = 80;
    const liveView = makeWorldView(state);
    const simulation = simulationController({ view: liveView });
    const isolated = isolatedReplayEngine(async () => {
      throw new Error("The isolated replay engine stopped.");
    });
    const { result } = renderHook(() =>
      useExperimentWorkspace({
        simulation,
        onSelectCreature: vi.fn(),
        createReplayEngine: () => isolated.engine,
      }),
    );

    await act(async () => {
      await result.current.replayTimelineEvent(timelineEvent());
    });

    expect(result.current.props.replay.replay.phase).toBe("error");
    expect(result.current.props.replay.replay.message).toContain(
      "The isolated replay engine stopped.",
    );
    expect(result.current.props.replay.replay.message).toContain("moment tick 50");
    expect(result.current.props.replay.replay.message).toContain(
      "active view was never changed",
    );
    expect(isolated.dispose).toHaveBeenCalledTimes(1);
    expect(simulation.replay).not.toHaveBeenCalled();
    expect(simulation.load).not.toHaveBeenCalled();
    expect(simulation.view).toBe(liveView);
    expect(simulation.view.tick).toBe(80);
    expect(simulation.view.hash).toBe(liveView.hash);
    expect(result.current.props.currentTick).toBe(80);
  });

  it("aborts and disposes an in-flight isolated replay when the workspace unmounts", async () => {
    const state = createSimulation(4_182);
    state.tick = 80;
    const simulation = simulationController({ view: makeWorldView(state) });
    const started = deferred<void>();
    let observedAbort = false;
    const isolated = isolatedReplayEngine(
      async (replay, options) =>
        new Promise<ReplayResult>((resolve) => {
          const finish = () => {
            observedAbort = options?.signal?.aborted ?? false;
            resolve({
              cancelled: true,
              expectedHash: replay.finalHash ?? null,
              actualHash: "unmounted-isolated-hash",
              hashMatches: null,
              frame: replayFrame(0, "unmounted-isolated-hash"),
            });
          };
          started.resolve();
          if (options?.signal?.aborted) finish();
          else options?.signal?.addEventListener("abort", finish, { once: true });
        }),
    );
    const { result, unmount } = renderHook(() =>
      useExperimentWorkspace({
        simulation,
        onSelectCreature: vi.fn(),
        createReplayEngine: () => isolated.engine,
      }),
    );
    let replayPromise!: Promise<boolean>;

    act(() => {
      replayPromise = result.current.replayTimelineEvent(timelineEvent());
    });
    await started.promise;
    unmount();
    await replayPromise;

    expect(observedAbort).toBe(true);
    expect(isolated.dispose).toHaveBeenCalledOnce();
    expect(simulation.view.tick).toBe(80);
  });

  it("keeps the existing replay panel action isolated from the live controller", async () => {
    const state = createSimulation(4_182);
    state.tick = 40;
    const liveView = makeWorldView(state);
    const simulation = simulationController({ view: liveView });
    const isolated = isolatedReplayEngine(async (replay) => ({
      cancelled: false,
      expectedHash: replay.finalHash ?? null,
      actualHash: replay.finalHash ?? "replay-hash",
      hashMatches: true,
      frame: replayFrame(replay.finalTick ?? 0, replay.finalHash ?? "replay-hash"),
    }));
    const { result } = renderHook(() =>
      useExperimentWorkspace({
        simulation,
        onSelectCreature: vi.fn(),
        createReplayEngine: () => isolated.engine,
      }),
    );

    act(() => result.current.props.replay.onReplay());
    await waitFor(() => expect(result.current.props.replay.replay.phase).toBe("complete"));

    expect(isolated.replay.mock.calls[0]?.[0]).toMatchObject({
      finalTick: 40,
      finalHash: liveView.hash,
    });
    expect(isolated.dispose).toHaveBeenCalledTimes(1);
    expect(simulation.save).not.toHaveBeenCalled();
    expect(simulation.replay).not.toHaveBeenCalled();
    expect(simulation.load).not.toHaveBeenCalled();
    expect(simulation.view).toBe(liveView);
    expect(result.current.props.currentTick).toBe(40);
  });
});

describe("experiment workspace reconciliation", () => {
  it("settles an applied command only from its authoritative command ID and outcome", () => {
    const command = scheduledCommand(1);
    const { experiment, branchId } = experimentWithPendingCommands([command]);
    const state = createSimulation(4_182);
    const event = addCommandEvent(state, {
      id: 101,
      commandId: command.commandId,
      commandOutcome: "APPLIED",
      // These legacy presentation fields deliberately disagree with the command.
      type: "PLAYER_REMOVED_FOOD",
      locationTileIndex: 42,
    });

    const settled = reconcilePendingInterventions(experiment, branchId, state);

    expect(outcomes(settled, branchId)?.[0]?.outcome).toEqual({
      status: "APPLIED",
      appliedAtTick: command.applyAtTick,
      resolvedTileIndex: command.tileIndex,
      quantity: event.quantity,
      blocked: command.blocked,
      eventIds: [event.id],
      reason: null,
    });
    expect(reconcilePendingInterventions(settled, branchId, state)).toBe(settled);
  });

  it("maps occupied-tile rejection codes to factual recovery guidance", () => {
    const command = scheduledCommand(1, {
      type: "TOGGLE_OBSTACLE",
      amount: 0,
      blocked: true,
    });
    const { experiment, branchId } = experimentWithPendingCommands([command]);
    const state = createSimulation(4_182);
    const event = addCommandEvent(state, {
      id: 102,
      commandId: command.commandId,
      commandOutcome: "REJECTED",
      commandRejectionReason: "OCCUPIED_TILE",
      type: "PLAYER_TOGGLED_OBSTACLE",
      quantity: 0,
      summary: "The passage closed successfully.",
    });

    const settled = reconcilePendingInterventions(experiment, branchId, state);
    const outcome = outcomes(settled, branchId)?.[0]?.outcome;

    expect(outcome).toMatchObject({
      status: "REJECTED",
      eventIds: [event.id],
      reason:
        "The target tile was occupied by a creature, resource, or structure. Choose an empty tile and try again.",
    });
    expect(reconcilePendingInterventions(settled, branchId, state)).toBe(settled);
  });

  it("settles authoritative events delivered after the scheduled tick", () => {
    const command = scheduledCommand(1, { applyAtTick: 5 });
    const { experiment, branchId } = experimentWithPendingCommands([command]);
    const state = createSimulation(4_182);
    const event = addCommandEvent(state, {
      id: 103,
      tick: 40,
      commandId: command.commandId,
      commandOutcome: "APPLIED",
    });

    const settled = reconcilePendingInterventions(experiment, branchId, state);

    expect(outcomes(settled, branchId)?.[0]?.outcome).toMatchObject({
      status: "APPLIED",
      appliedAtTick: 5,
      eventIds: [event.id],
    });
    expect(reconcilePendingInterventions(settled, branchId, state)).toBe(settled);
  });

  it("awaits detached state for a late event and does not settle it again", async () => {
    const state = createSimulation(4_182);
    const initialView = makeWorldView(state);
    const command = scheduledCommand(1, {
      applyAtTick: 0,
      tileIndex: initialView.tiles[0]?.index ?? 0,
    });
    const getState = vi.fn(async () => state);
    const stableController = simulationController({
      view: initialView,
      getState,
      applyIntervention: vi.fn(
        async () =>
          ({
            accepted: true,
            outcome: "scheduled",
            command,
          }) as never,
      ),
    });
    const { result, rerender } = renderHook(
      ({ view }) =>
        useExperimentWorkspace({
          simulation: { ...stableController, view },
          onSelectCreature: vi.fn(),
        }),
      { initialProps: { view: initialView } },
    );

    await act(async () => {
      await result.current.applyWorldIntervention("add-food", initialView.tiles[0]!);
    });
    expect(result.current.props.interventions[0]?.status).toBe("pending");
    expect(getState).toHaveBeenCalledTimes(1);

    addCommandEvent(state, {
      id: 106,
      tick: 20,
      commandId: command.commandId,
      commandOutcome: "APPLIED",
    });
    const eventView = makeWorldView(state);
    rerender({ view: eventView });
    await waitFor(() =>
      expect(result.current.props.interventions[0]?.status).toBe("applied"),
    );
    expect(getState).toHaveBeenCalledTimes(2);

    state.tick = 21;
    rerender({ view: makeWorldView(state) });
    expect(getState).toHaveBeenCalledTimes(2);
  });

  it("does not reuse a same-tick, same-tile event for the wrong command ID", () => {
    const first = scheduledCommand(1);
    const second = scheduledCommand(2);
    const { experiment, branchId } = experimentWithPendingCommands([first, second]);
    const state = createSimulation(4_182);
    const secondEvent = addCommandEvent(state, {
      id: 104,
      commandId: second.commandId,
      commandOutcome: "APPLIED",
    });

    const reconciled = reconcilePendingInterventions(experiment, branchId, state);
    const commandLog = outcomes(reconciled, branchId);

    expect(commandLog?.[0]?.outcome).toEqual({ status: "PENDING" });
    expect(commandLog?.[1]?.outcome).toMatchObject({
      status: "APPLIED",
      eventIds: [secondEvent.id],
    });
    expect(reconcilePendingInterventions(reconciled, branchId, state)).toBe(reconciled);
  });

  it("does not infer rejection from summary prose", () => {
    const command = scheduledCommand(1, {
      type: "TOGGLE_OBSTACLE",
      amount: 0,
      blocked: true,
    });
    const { experiment, branchId } = experimentWithPendingCommands([command]);
    const state = createSimulation(4_182);
    addCommandEvent(state, {
      id: 105,
      commandId: command.commandId,
      commandOutcome: "APPLIED",
      type: "PLAYER_TOGGLED_OBSTACLE",
      summary: "The route could not look more obstructed after this successful change.",
    });

    const settled = reconcilePendingInterventions(experiment, branchId, state);

    expect(outcomes(settled, branchId)?.[0]?.outcome).toMatchObject({
      status: "APPLIED",
      reason: null,
    });
  });

  it("does not reconcile again when only the controller object or workspace UI changes", async () => {
    const state = createSimulation(4_182);
    const getState = vi.fn(async () => state);
    const stableController = simulationController({ getState });
    const onSelectCreature = vi.fn();
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    try {
      const { result, rerender } = renderHook(
        ({ tick, revision }: { tick: number; revision: string }) =>
          useExperimentWorkspace({
            simulation: {
              ...stableController,
              view: { ...stableController.view, tick, hash: revision },
            },
            onSelectCreature,
          }),
        { initialProps: { tick: 0, revision: "revision-0" } },
      );

      await waitFor(() => expect(result.current.props.currentTick).toBe(0));
      expect(getState).not.toHaveBeenCalled();

      rerender({ tick: 0, revision: "revision-0" });
      expect(getState).not.toHaveBeenCalled();

      act(() => result.current.openDrawer("explain"));
      expect(result.current.props.open).toBe(true);
      expect(result.current.props.section).toBe("explain");
      expect(getState).not.toHaveBeenCalled();

      for (let tick = 1; tick <= 24; tick += 1) {
        state.tick = tick;
        rerender({ tick, revision: `revision-${tick}` });
        expect(getState).not.toHaveBeenCalled();
      }

      const maximumDepthWarnings = consoleError.mock.calls.filter((arguments_) =>
        arguments_.some(
          (argument) =>
            typeof argument === "string" &&
            argument.toLowerCase().includes("maximum update depth"),
        ),
      );
      expect(maximumDepthWarnings).toEqual([]);
    } finally {
      consoleError.mockRestore();
    }
  });
});

describe("experiment intervention navigation", () => {
  it("builds actions for every navigation target from retained evidence", () => {
    const reason = {
      code: "ACTION_EVENT_LINKED_TO_COMMAND" as const,
      fact: "A completed event was linked to the command.",
      sourceEventIds: [100, 101, 102],
      observationTick: 12,
      locationTileIndex: 7,
    };
    const trace: InterventionResponseTrace = {
      schemaVersion: 1,
      command: { commandId: 1, applyAtTick: 10, type: "ADD_FOOD", tileIndex: 7 },
      participantIds: [1],
      windowTicks: 120,
      phase: "CLOSED",
      outcome: {
        eventId: 100,
        tick: 10,
        status: "APPLIED",
        rejectionReason: null,
        targetEntityIds: [],
      },
      windowStartTick: 10,
      windowEndTick: 130,
      observedThroughTick: 130,
      closedAtTick: 130,
      closureReason: {
        code: "WINDOW_ELAPSED",
        fact: "The bounded post-command response window elapsed.",
        sourceEventIds: [100],
      },
      responses: [
        {
          participantId: 1,
          status: "USED",
          firstObservedTick: 12,
          reason,
          beats: [{ kind: "ACTED", tick: 12, reason }],
          failure: null,
        },
      ],
      unclassifiedParticipantIds: [],
      seenEventIds: [100, 101, 102],
    };
    const entry: InterventionLogEntryV1 = {
      command: scheduledCommand(1),
      outcome: {
        status: "APPLIED",
        appliedAtTick: 10,
        resolvedTileIndex: 7,
        quantity: 12,
        blocked: null,
        eventIds: [100],
        reason: null,
      },
      responseTrace: trace,
    };
    const events: TimelineEventView[] = [
      {
        ...timelineEvent(12),
        id: 101,
        title: "Iri acted",
        attentionTier: "ROUTINE",
      },
      {
        ...timelineEvent(13),
        id: 102,
        title: "Shared food",
        attentionTier: "SIGNIFICANT",
      },
    ];

    expect(
      interventionNavigationActions({
        entry,
        trace,
        branchId: "food-branch",
        parentBranchId: "baseline",
        creatureNames: new Map([[1, "Iri"]]),
        events,
      }),
    ).toEqual([
      {
        id: "location-7",
        label: "Tile 7",
        target: { kind: "location", tileIndex: 7 },
      },
      {
        id: "raw-event-100",
        label: "Command outcome",
        target: { kind: "raw-evidence", ref: { kind: "event", id: 100 } },
      },
      {
        id: "responder-1",
        label: "Iri",
        target: { kind: "responding-creature", creatureId: 1 },
      },
      {
        id: "evidence-101",
        label: "Event 101 · Iri acted · tick 12",
        target: { kind: "linked-evidence", ref: { kind: "event", id: 101 } },
      },
      {
        id: "moment-102",
        label: "Event 102 · Shared food · tick 13",
        target: { kind: "linked-moment", eventId: 102 },
      },
      {
        id: "comparison-food-branch",
        label: "Baseline vs branch",
        target: { kind: "comparison", branchId: "food-branch" },
      },
      {
        id: "replay-food-branch",
        label: "Replay this branch",
        target: { kind: "branch-replay", branchId: "food-branch" },
      },
    ]);
  });

  it("routes every action kind and ignores stale branch-scoped actions", async () => {
    const getCausalEvidence = vi.fn(
      async (_focus: Parameters<SimulationController["getCausalEvidence"]>[0]) => null,
    );
    const getOutcome = vi.fn(async () => null);
    const onSelectCreature = vi.fn();
    const applyIntervention: SimulationController["applyIntervention"] = async (
      _tool,
      tile,
      amount = 12,
    ) => ({
      accepted: true,
      outcome: "scheduled",
      command: {
        commandId: 1,
        applyAtTick: 1,
        type: "ADD_FOOD",
        tileIndex: tile.index,
        amount,
        blocked: null,
      },
      frame: capturedReplayFrames(4_182, [0])[0]!,
    });
    const simulation = simulationController({
      getCausalEvidence,
      getOutcome,
      applyIntervention,
    });
    const { result } = renderHook(() =>
      useExperimentWorkspace({ simulation, onSelectCreature }),
    );
    await act(async () => {
      await result.current.applyWorldIntervention("add-food", simulation.view.tiles[0]!);
    });
    const intervention = result.current.props.interventions[0];
    if (!intervention) throw new Error("Expected a recorded intervention.");
    const activeBranchAction = intervention.navigationActions?.find(
      (action) => action.target.kind === "comparison",
    );
    if (activeBranchAction?.target.kind !== "comparison") {
      throw new Error("Expected an active-branch comparison action.");
    }
    const activeBranchId = activeBranchAction.target.branchId;
    const navigate = result.current.props.onNavigateIntervention;
    expect(navigate).toBeDefined();
    if (!navigate) throw new Error("Expected intervention navigation to be wired.");
    act(() => result.current.openDrawer("record"));
    expect(result.current.props.open).toBe(true);

    await act(async () => {
      navigate(intervention.id, {
        id: "raw-event-100",
        label: "Command outcome",
        target: { kind: "raw-evidence", ref: { kind: "event", id: 100 } },
      });
      navigate(intervention.id, {
        id: "location-7",
        label: "Tile 7",
        target: { kind: "location", tileIndex: 7 },
      });
      navigate(intervention.id, {
        id: "responder-2",
        label: "Nia",
        target: { kind: "responding-creature", creatureId: 2 },
      });
      navigate(intervention.id, {
        id: "evidence-101",
        label: "Later decision",
        target: { kind: "linked-evidence", ref: { kind: "decision", id: 101 } },
      });
      navigate(intervention.id, {
        id: "moment-102",
        label: "Later moment",
        target: { kind: "linked-moment", eventId: 102 },
      });
      await Promise.resolve();
    });

    expect(getCausalEvidence.mock.calls.map(([ref]) => ref)).toEqual([
      { kind: "event", id: 100 },
      { kind: "tile", id: 7 },
      { kind: "decision", id: 101 },
      { kind: "event", id: 102 },
    ]);
    expect(onSelectCreature).toHaveBeenCalledOnce();
    expect(onSelectCreature).toHaveBeenCalledWith(2);
    expect(result.current.props.open).toBe(false);

    await act(async () => {
      navigate("stale-record", {
        id: "raw-event-999",
        label: "Stale command outcome",
        target: { kind: "raw-evidence", ref: { kind: "event", id: 999 } },
      });
      await Promise.resolve();
    });
    expect(getCausalEvidence).toHaveBeenCalledTimes(4);

    act(() => {
      navigate(intervention.id, {
        id: "comparison-stale-branch",
        label: "Baseline vs branch",
        target: { kind: "comparison", branchId: "stale-branch" },
      });
      navigate(intervention.id, {
        id: "replay-stale-branch",
        label: "Replay this branch",
        target: { kind: "branch-replay", branchId: "stale-branch" },
      });
    });
    expect(result.current.props.section).toBe("record");
    expect(getOutcome).not.toHaveBeenCalled();

    await act(async () => {
      navigate(intervention.id, {
        id: `comparison-${activeBranchId}`,
        label: "Baseline vs branch",
        target: { kind: "comparison", branchId: activeBranchId },
      });
      await Promise.resolve();
    });
    expect(result.current.props.section).toBe("compare");
    await waitFor(() => expect(getOutcome).toHaveBeenCalledOnce());

    act(() => {
      result.current.props.onSectionChange("record");
      navigate(intervention.id, {
        id: "replay-stale-branch",
        label: "Replay this branch",
        target: { kind: "branch-replay", branchId: "stale-branch" },
      });
    });
    expect(result.current.props.section).toBe("record");

    act(() => {
      navigate(intervention.id, {
        id: `replay-${activeBranchId}`,
        label: "Replay this branch",
        target: { kind: "branch-replay", branchId: activeBranchId },
      });
    });
    expect(result.current.props.section).toBe("replay");
  });
});

describe("experiment intervention presentation", () => {
  it("counts a typed reach failure as recorded evidence with singular grammar", () => {
    const reason = {
      code: "LINKED_PLAN_WAS_BLOCKED" as const,
      fact: "A plan linked to the command was blocked before reaching the target.",
      sourceEventIds: [100, 101],
      observationTick: 12,
      locationTileIndex: 5,
    };
    const trace: InterventionResponseTrace = {
      schemaVersion: 1,
      command: { commandId: 1, applyAtTick: 10, type: "ADD_FOOD", tileIndex: 5 },
      participantIds: [1],
      windowTicks: 120,
      phase: "CLOSED",
      outcome: {
        eventId: 100,
        tick: 10,
        status: "APPLIED",
        rejectionReason: null,
        targetEntityIds: [90],
      },
      windowStartTick: 10,
      windowEndTick: 130,
      observedThroughTick: 130,
      closedAtTick: 130,
      closureReason: {
        code: "WINDOW_ELAPSED",
        fact: "The bounded post-command response window elapsed.",
        sourceEventIds: [100],
      },
      responses: [
        {
          participantId: 1,
          status: "FAILED_TO_REACH",
          firstObservedTick: 12,
          reason,
          beats: [],
          failure: { code: "FAILED_TO_REACH", tick: 12, reason },
        },
      ],
      unclassifiedParticipantIds: [],
      seenEventIds: [100, 101],
    };

    const record = interventionResponseRecord(trace, new Map([[1, "Iri"]]));

    expect(record.summary).toBe(
      "1 participant has recorded response evidence; 0 participants have no recorded response in this window.",
    );
    expect(record.participantLines).toEqual([
      "Iri: failed to reach — A plan linked to the command was blocked before reaching the target.",
    ]);
  });

  it("limits the obstacle occupancy caveat to passage closures", () => {
    const simulation = simulationController();
    const first = simulation.view.tiles[0]!;
    const second = simulation.view.tiles[1]!;
    const blockedTile = { ...first, blocked: true };
    const openTile = { ...second, blocked: false };
    const view = {
      ...simulation.view,
      tiles: [blockedTile, openTile, ...simulation.view.tiles.slice(2)],
    };
    const controller = { ...simulation, view };
    const onSelectCreature = vi.fn();
    const { result } = renderHook(() =>
      useExperimentWorkspace({
        simulation: controller,
        onSelectCreature,
      }),
    );

    act(() => {
      result.current.props.composer.onToolChange("obstacle");
      result.current.props.composer.onTargetXChange(String(blockedTile.x));
      result.current.props.composer.onTargetYChange(String(blockedTile.y));
    });
    expect(result.current.props.composer.preview?.mechanicalChange).toBe(
      "Open the target passage.",
    );

    act(() => {
      result.current.props.composer.onTargetXChange(String(openTile.x));
      result.current.props.composer.onTargetYChange(String(openTile.y));
    });
    expect(result.current.props.composer.preview?.mechanicalChange).toBe(
      "Close the target passage if the authoritative occupancy check permits it.",
    );
  });
});
