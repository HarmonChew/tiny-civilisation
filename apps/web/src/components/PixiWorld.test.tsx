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
  tileAtPoint: vi.fn(() => undefined),
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
    groupInfluence: {},
    intentions: {},
    resources: {},
    structures: {},
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
        overlays={{ resources: true, intentions: false, groups: true }}
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
        overlays={{ resources: true, intentions: false, groups: true }}
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
        overlays={{ resources: true, intentions: false, groups: true }}
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
        overlays={{ resources: true, intentions: false, groups: true }}
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
});
