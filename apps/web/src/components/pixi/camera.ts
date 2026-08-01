import type { EntityId, Point, TileView, WorldView } from "../../model";
import type { PixiRuntime, Viewport } from "./runtime";

const MIN_ZOOM = 0.65;
const MAX_ZOOM = 5;
const REPLAY_FRAME_PADDING = 52;
const MIN_REPLAY_SPAN = 6;

export interface CameraViewportSnapshot {
  readonly zoom: number;
  readonly panX: number;
  readonly panY: number;
}

export interface ReplayCameraTarget {
  readonly eventId: number;
  readonly subjectId: EntityId | null;
  readonly actorIds: readonly EntityId[];
  readonly targetIds: readonly EntityId[];
  readonly locationTileIndex: number | null;
}

function baseScaleFor(view: WorldView, width: number, height: number): number {
  return Math.max(3, Math.min((width - 28) / view.width, (height - 28) / view.height));
}

export function captureCameraViewport(viewport: Viewport): CameraViewportSnapshot {
  return {
    zoom: viewport.zoom,
    panX: viewport.panX,
    panY: viewport.panY,
  };
}

export function restoreCameraViewport(
  viewport: Viewport,
  snapshot: CameraViewportSnapshot,
): void {
  viewport.zoom = snapshot.zoom;
  viewport.panX = snapshot.panX;
  viewport.panY = snapshot.panY;
}

function entityPoint(view: WorldView, id: EntityId): Point | null {
  const creature = view.creatures.find((candidate) => candidate.id === id);
  if (creature) return { x: creature.x, y: creature.y };
  const resource = view.resources.find((candidate) => candidate.id === id);
  if (resource) return { x: resource.x + 0.5, y: resource.y + 0.5 };
  const structure = view.structures.find((candidate) => candidate.id === id);
  if (structure) return { x: structure.x + 0.5, y: structure.y + 0.5 };
  const group = view.groups.find((candidate) => candidate.id === id);
  return group?.home ? { x: group.home.x + 0.5, y: group.home.y + 0.5 } : null;
}

export function replayCameraPoints(
  view: WorldView,
  target: ReplayCameraTarget,
): readonly Point[] {
  const entityIds = [
    ...(target.subjectId === null ? [] : [target.subjectId]),
    ...target.actorIds,
    ...target.targetIds,
  ];
  const points: Point[] = [];
  const seenEntityIds = new Set<EntityId>();
  for (const id of entityIds) {
    if (seenEntityIds.has(id)) continue;
    seenEntityIds.add(id);
    const point = entityPoint(view, id);
    if (point) points.push(point);
  }
  if (target.locationTileIndex !== null) {
    const tile = view.tiles.find(
      (candidate) => candidate.index === target.locationTileIndex,
    );
    if (tile) {
      const location = { x: tile.x + 0.5, y: tile.y + 0.5 };
      if (
        !points.some(
          (point) =>
            Math.abs(point.x - location.x) < 0.001 &&
            Math.abs(point.y - location.y) < 0.001,
        )
      ) {
        points.push(location);
      }
    }
  }
  return points;
}

export function calculateReplayViewport(
  view: WorldView,
  target: ReplayCameraTarget,
  screenWidth: number,
  screenHeight: number,
): CameraViewportSnapshot {
  const width = Math.max(1, screenWidth);
  const height = Math.max(1, screenHeight);
  const baseScale = baseScaleFor(view, width, height);
  const points = replayCameraPoints(view, target);
  if (points.length === 0) return { zoom: 1, panX: 0, panY: 0 };

  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const spanX = Math.min(view.width, Math.max(MIN_REPLAY_SPAN, maxX - minX + 2));
  const spanY = Math.min(view.height, Math.max(MIN_REPLAY_SPAN, maxY - minY + 2));
  const availableWidth = Math.max(1, width - REPLAY_FRAME_PADDING * 2);
  const availableHeight = Math.max(1, height - REPLAY_FRAME_PADDING * 2);
  const framedScale = Math.min(availableWidth / spanX, availableHeight / spanY);
  const zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, framedScale / baseScale));
  const scale = baseScale * zoom;
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  return {
    zoom,
    panX: (view.width / 2 - centerX) * scale,
    panY: (view.height / 2 - centerY) * scale,
  };
}

export function setTransform(runtime: PixiRuntime, followedId: number | null): void {
  const { app, root, viewport, view } = runtime;
  const width = Math.max(1, app.screen.width);
  const height = Math.max(1, app.screen.height);
  viewport.baseScale = baseScaleFor(view, width, height);
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

export function frameReplayCamera(runtime: PixiRuntime, target: ReplayCameraTarget): void {
  const viewport = calculateReplayViewport(
    runtime.view,
    target,
    runtime.app.screen.width,
    runtime.app.screen.height,
  );
  restoreCameraViewport(runtime.viewport, viewport);
  setTransform(runtime, null);
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
