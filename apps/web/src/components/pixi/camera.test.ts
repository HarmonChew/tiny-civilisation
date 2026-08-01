import { createSimulation } from "@tiny-civ/sim-core";
import { describe, expect, it } from "vitest";
import { makeWorldView } from "../../sim-adapter";
import {
  calculateReplayViewport,
  captureCameraViewport,
  replayCameraPoints,
  restoreCameraViewport,
  type ReplayCameraTarget,
} from "./camera";
import type { Viewport } from "./runtime";

function target(overrides: Partial<ReplayCameraTarget> = {}): ReplayCameraTarget {
  return {
    eventId: 41,
    subjectId: 1,
    actorIds: [1],
    targetIds: [2],
    locationTileIndex: null,
    ...overrides,
  };
}

describe("replay camera framing", () => {
  it("captures and restores the exact live pan and zoom without stale aliases", () => {
    const viewport: Viewport = { zoom: 2.4, panX: 137, panY: -42, baseScale: 11 };
    const snapshot = captureCameraViewport(viewport);
    viewport.zoom = 4;
    viewport.panX = -600;
    viewport.panY = 900;

    restoreCameraViewport(viewport, snapshot);

    expect(viewport).toEqual({ zoom: 2.4, panX: 137, panY: -42, baseScale: 11 });
    expect(snapshot).toEqual({ zoom: 2.4, panX: 137, panY: -42 });
  });

  it("frames the focal subject, participants, and event location as one group", () => {
    const view = makeWorldView(createSimulation(4_182));
    const location = view.tiles.find((tile) => tile.x === 22 && tile.y === 14)!;
    const cameraTarget = target({ locationTileIndex: location.index });
    const points = replayCameraPoints(view, cameraTarget);
    const viewport = calculateReplayViewport(view, cameraTarget, 1_000, 700);
    const baseScale = Math.max(
      3,
      Math.min((1_000 - 28) / view.width, (700 - 28) / view.height),
    );
    const scale = baseScale * viewport.zoom;
    const rootX = (1_000 - view.width * scale) / 2 + viewport.panX;
    const rootY = (700 - view.height * scale) / 2 + viewport.panY;
    const screenPoints = points.map((point) => ({
      x: rootX + point.x * scale,
      y: rootY + point.y * scale,
    }));

    expect(points).toContainEqual({ x: location.x + 0.5, y: location.y + 0.5 });
    expect(points).toContainEqual({ x: view.creatures[0]!.x, y: view.creatures[0]!.y });
    expect(points).toContainEqual({ x: view.creatures[1]!.x, y: view.creatures[1]!.y });
    expect(
      (Math.min(...screenPoints.map((point) => point.x)) +
        Math.max(...screenPoints.map((point) => point.x))) /
        2,
    ).toBeCloseTo(500);
    expect(
      (Math.min(...screenPoints.map((point) => point.y)) +
        Math.max(...screenPoints.map((point) => point.y))) /
        2,
    ).toBeCloseTo(350);
    expect(screenPoints.every((point) => point.x >= 0 && point.x <= 1_000)).toBe(true);
    expect(screenPoints.every((point) => point.y >= 0 && point.y <= 700)).toBe(true);
  });

  it("falls back to the whole-world viewport when no focal anchor is retained", () => {
    const view = makeWorldView(createSimulation(921));
    expect(
      calculateReplayViewport(
        view,
        target({
          subjectId: null,
          actorIds: [999_001],
          targetIds: [],
          locationTileIndex: null,
        }),
        900,
        600,
      ),
    ).toEqual({ zoom: 1, panX: 0, panY: 0 });
  });
});
