import {
  createSimulation,
  hashSimulationState,
  serializeSimulationSave,
  type CausalEvidenceProjectionV1,
} from "@tiny-civ/sim-core";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeWorldView } from "../sim-adapter";
import type { SimulationController } from "./useSimulationController";
import {
  causalDetailFromProjection,
  useExperimentWorkspace,
} from "./useExperimentWorkspace";

function deferred<Value>() {
  let resolve!: (value: Value) => void;
  const promise = new Promise<Value>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

function simulationController(
  overrides: Partial<SimulationController> = {},
): SimulationController {
  const state = createSimulation(4_182);
  return {
    view: makeWorldView(state),
    seed: state.seed,
    initialized: true,
    busy: false,
    fatalError: null,
    playing: false,
    setPlaying: vi.fn(),
    speed: 1,
    setSpeed: vi.fn(),
    feedback: "Paused.",
    advance: vi.fn(async () => null),
    restart: vi.fn(async () => null),
    applyIntervention: vi.fn(async () => null),
    getState: vi.fn(() => state),
    save: vi.fn(async () => serializeSimulationSave(state)),
    load: vi.fn(async () => makeWorldView(state)),
    runToTick: vi.fn(async () => ({ cancelled: false, frame: null as never })),
    replay: vi.fn(async () => ({
      cancelled: false,
      expectedHash: null,
      hashMatches: null,
      frame: null as never,
    })),
    ...overrides,
  };
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
});

describe("experiment workspace operation lock", () => {
  it("acquires synchronously and blocks interventions until a save settles", async () => {
    const state = createSimulation(4_182);
    const save = deferred<string>();
    const applyIntervention = vi.fn(async () => null);
    const simulation = simulationController({
      view: makeWorldView(state),
      getState: vi.fn(() => state),
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
      getState: vi.fn(() => state),
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

    expect(applyIntervention).toHaveBeenCalledTimes(1);
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
