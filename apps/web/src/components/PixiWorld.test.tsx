import { createSimulation } from "@tiny-civ/sim-core";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeWorldView } from "../sim-adapter";

const camera = vi.hoisted(() => ({
  captureCameraViewport: vi.fn(() => ({ zoom: 2.2, panX: 91, panY: -37 })),
  frameReplayCamera: vi.fn(),
  restoreCameraViewport: vi.fn(),
  screenToWorld: vi.fn(() => ({ x: 1, y: 1 })),
  setTransform: vi.fn(),
  tileAtPoint: vi.fn((): unknown => undefined),
}));

vi.mock("pixi.js", () => {
  class Application {
    canvas = document.createElement("canvas");
    screen = { width: 800, height: 600 };
    stage = { addChild: vi.fn() };
    init = vi.fn(async () => undefined);
    destroy = vi.fn();
  }
  class Container {
    addChild = vi.fn();
  }
  return { Application, Container };
});

vi.mock("./pixi/camera", () => camera);

vi.mock("./pixi/layers", () => ({
  drawInterventionPreview: vi.fn(),
  drawWorld: vi.fn(),
}));

vi.mock("./pixi/runtime", () => ({
  createRenderLayers: () => ({
    terrain: {},
    traffic: {},
    groupInfluence: {},
    intentions: {},
    resources: {},
    structures: {},
    memorials: {},
    interaction: {},
    interventionPreview: {},
    creatures: {},
    frame: {},
  }),
}));

import { PixiWorld } from "./PixiWorld";

describe("PixiWorld replay camera", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("isolates replay framing and restores the one captured live viewport", async () => {
    const view = makeWorldView(createSimulation(4_182));
    const callbacks = {
      onSelect: vi.fn(),
      onHover: vi.fn(),
      onWorldAction: vi.fn(),
    };
    const { rerender } = render(
      <PixiWorld
        view={view}
        selectedId={2}
        focusedId={null}
        followedId={2}
        tool="inspect"
        overlays={{ resources: true, intentions: false, groups: true, traffic: true }}
        {...callbacks}
      />,
    );
    await waitFor(() => expect(camera.setTransform).toHaveBeenCalled());
    const liveTransformCount = camera.setTransform.mock.calls.length;
    const replayCamera = {
      eventId: 31,
      subjectId: 1,
      actorIds: [1],
      targetIds: [2],
      locationTileIndex: null,
    } as const;

    rerender(
      <PixiWorld
        view={view}
        selectedId={1}
        focusedId={null}
        followedId={null}
        tool="inspect"
        overlays={{ resources: true, intentions: false, groups: true, traffic: true }}
        replayCamera={replayCamera}
        mutationDisabled
        {...callbacks}
      />,
    );
    const dish = screen.getByRole("application", { name: /replay frame/i });
    expect(dish.getAttribute("tabindex")).toBe("-1");
    expect(dish.getAttribute("aria-disabled")).toBe("true");
    expect(camera.captureCameraViewport).toHaveBeenCalledOnce();
    expect(camera.frameReplayCamera).toHaveBeenCalledOnce();

    fireEvent.wheel(dish, { deltaY: -120, clientX: 100, clientY: 100 });
    fireEvent.keyDown(dish, { key: "+" });
    fireEvent.pointerMove(dish, { clientX: 100, clientY: 100 });
    expect(camera.setTransform).toHaveBeenCalledTimes(liveTransformCount);
    expect(camera.screenToWorld).not.toHaveBeenCalled();

    rerender(
      <PixiWorld
        view={{ ...view, tick: view.tick + 1 }}
        selectedId={1}
        focusedId={null}
        followedId={null}
        tool="inspect"
        overlays={{ resources: true, intentions: false, groups: true, traffic: true }}
        replayCamera={replayCamera}
        mutationDisabled
        {...callbacks}
      />,
    );
    expect(camera.captureCameraViewport).toHaveBeenCalledOnce();
    expect(camera.frameReplayCamera).toHaveBeenCalledTimes(2);

    rerender(
      <PixiWorld
        view={view}
        selectedId={2}
        focusedId={null}
        followedId={2}
        tool="inspect"
        overlays={{ resources: true, intentions: false, groups: true, traffic: true }}
        {...callbacks}
      />,
    );
    expect(camera.restoreCameraViewport).toHaveBeenCalledOnce();
    expect(camera.restoreCameraViewport.mock.calls[0]?.[1]).toEqual({
      zoom: 2.2,
      panX: 91,
      panY: -37,
    });
    expect(camera.setTransform.mock.calls.at(-1)?.[1]).toBe(2);
  });

  it("selects a nearby shelter through the typed world focus callback", async () => {
    const baseView = makeWorldView(createSimulation(4_182));
    const view = {
      ...baseView,
      creatures: [],
      structures: [
        {
          id: 900,
          kind: "SHELTER",
          x: 1,
          y: 1,
          groupId: 3,
          progress: 100,
          stored: 0,
          capacity: 6,
          condition: 82,
          baseCapacity: 6,
          effectiveCapacity: 6,
          reservedSpaces: 2,
          restingCreatures: 1,
          memberOccupancy: 1,
          guestOccupancy: 0,
          upkeepNeeded: false,
        },
      ],
    };
    camera.screenToWorld.mockReturnValue({ x: 1.5, y: 1.5 });
    camera.tileAtPoint.mockReturnValue(view.tiles[0]);
    const onSelect = vi.fn();
    const onSelectSubject = vi.fn();
    render(
      <PixiWorld
        view={view}
        selectedId={null}
        focusedId={null}
        followedId={null}
        tool="inspect"
        overlays={{ resources: true, intentions: false, groups: true, traffic: true }}
        onSelect={onSelect}
        onSelectSubject={onSelectSubject}
        onHover={vi.fn()}
        onWorldAction={vi.fn()}
      />,
    );

    const dish = await screen.findByRole("application", {
      name: /click a creature, memorial, or structure/i,
    });
    fireEvent.pointerDown(dish, { pointerId: 4, button: 0, clientX: 120, clientY: 90 });
    fireEvent.pointerUp(dish, { pointerId: 4, button: 0, clientX: 120, clientY: 90 });

    expect(onSelectSubject).toHaveBeenCalledWith({ kind: "structure", id: 900 });
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("selects a memorial through the same typed world focus callback", async () => {
    const baseView = makeWorldView(createSimulation(4_182));
    const view = {
      ...baseView,
      creatures: [],
      structures: [],
      memorials: [
        {
          id: 910,
          deceasedId: 90,
          deceasedName: "Aro",
          tileIndex: 0,
          x: 1,
          y: 1,
          createdTick: 10,
          expiresTick: 610,
          estate: { food: 1, material: 2, water: 3 },
          mournersRemaining: 1,
        },
      ],
    };
    camera.screenToWorld.mockReturnValue({ x: 1.5, y: 1.5 });
    camera.tileAtPoint.mockReturnValue(view.tiles[0]);
    const onSelect = vi.fn();
    const onSelectSubject = vi.fn();
    render(
      <PixiWorld
        view={view}
        selectedId={null}
        focusedId={null}
        followedId={null}
        tool="inspect"
        overlays={{ resources: true, intentions: false, groups: true, traffic: true }}
        onSelect={onSelect}
        onSelectSubject={onSelectSubject}
        onHover={vi.fn()}
        onWorldAction={vi.fn()}
      />,
    );

    const dish = await screen.findByRole("application", {
      name: /click a creature, memorial, or structure/i,
    });
    fireEvent.pointerDown(dish, {
      pointerId: 5,
      button: 0,
      clientX: 120,
      clientY: 90,
    });
    fireEvent.pointerUp(dish, {
      pointerId: 5,
      button: 0,
      clientX: 120,
      clientY: 90,
    });

    expect(onSelectSubject).toHaveBeenCalledWith({ kind: "memorial", id: 910 });
    expect(onSelect).not.toHaveBeenCalled();
  });
});
