import type { Point, TileView, WorldView } from "../../model";
import type { PixiRuntime } from "./runtime";

export function setTransform(runtime: PixiRuntime, followedId: number | null): void {
  const { app, root, viewport, view } = runtime;
  const width = Math.max(1, app.screen.width);
  const height = Math.max(1, app.screen.height);
  viewport.baseScale = Math.max(
    3,
    Math.min((width - 28) / view.width, (height - 28) / view.height),
  );
  const scale = viewport.baseScale * viewport.zoom;
  root.scale.set(scale);
  const followed =
    followedId === null
      ? undefined
      : view.creatures.find((creature) => creature.id === followedId);
  if (followed) {
    root.x = width / 2 - followed.x * scale;
    root.y = height / 2 - followed.y * scale;
    return;
  }
  root.x = (width - view.width * scale) / 2 + viewport.panX;
  root.y = (height - view.height * scale) / 2 + viewport.panY;
}

export function screenToWorld(
  runtime: PixiRuntime,
  clientX: number,
  clientY: number,
): Point {
  const rect = runtime.app.canvas.getBoundingClientRect();
  const scale = runtime.viewport.baseScale * runtime.viewport.zoom;
  return {
    x: (clientX - rect.left - runtime.root.x) / scale,
    y: (clientY - rect.top - runtime.root.y) / scale,
  };
}

export function tileAtPoint(view: WorldView, point: Point): TileView | undefined {
  const x = Math.floor(point.x);
  const y = Math.floor(point.y);
  if (x < 0 || y < 0 || x >= view.width || y >= view.height) return undefined;
  return (
    view.tiles.find((tile) => tile.x === x && tile.y === y) ??
    view.tiles[y * view.width + x]
  );
}
