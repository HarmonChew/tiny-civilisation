import { Application, Container } from "pixi.js";
import { useCallback, useEffect, useRef, useState } from "react";
import type {
  EntityId,
  InterventionTool,
  OverlaySettings,
  Point,
  WorldAction,
  WorldView,
} from "../model";
import type { WorldRef } from "../focus";
import {
  captureCameraViewport,
  frameReplayCamera,
  restoreCameraViewport,
  screenToWorld,
  setTransform,
  tileAtPoint,
  type CameraViewportSnapshot,
  type ReplayCameraTarget,
} from "./pixi/camera";
import { drawInterventionPreview, drawWorld } from "./pixi/layers";
import { createRenderLayers, type PixiRuntime } from "./pixi/runtime";

interface PixiWorldProps {
  view: WorldView;
  selectedId: EntityId | null;
  selectedRef?: WorldRef | null;
  focusedId: EntityId | null;
  followedId: EntityId | null;
  tool: InterventionTool;
  overlays: OverlaySettings;
  mutationDisabled?: boolean;
  replayCamera?: ReplayCameraTarget | null;
  onSelect: (id: EntityId | null) => void;
  onSelectSubject?: ((ref: WorldRef | null) => void) | undefined;
  onHover: (id: EntityId | null) => void;
  onWorldAction: (action: WorldAction) => void;
}

interface DragState {
  pointerId: number;
  originX: number;
  originY: number;
  previousX: number;
  previousY: number;
  moved: boolean;
  mayPan: boolean;
}

interface ReplayCameraSession {
  readonly viewport: CameraViewportSnapshot;
}

export function PixiWorld({
  view,
  selectedId,
  selectedRef = selectedId === null ? null : { kind: "creature", id: selectedId },
  focusedId,
  followedId,
  tool,
  overlays,
  mutationDisabled = false,
  replayCamera = null,
  onSelect,
  onSelectSubject,
  onHover,
  onWorldAction,
}: PixiWorldProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const runtimeRef = useRef<PixiRuntime | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const replayCameraSessionRef = useRef<ReplayCameraSession | null>(null);
  const hoveredCreatureIdRef = useRef<EntityId | null>(null);
  const propsRef = useRef({
    view,
    selectedId,
    selectedRef,
    focusedId,
    followedId,
    tool,
    overlays,
    replayCamera,
    onSelect,
    onSelectSubject,
    onHover,
    onWorldAction,
  });
  const [hoveredTile, setHoveredTile] = useState<Point | null>(null);
  const [renderError, setRenderError] = useState<string | null>(null);

  propsRef.current = {
    view,
    selectedId,
    selectedRef,
    focusedId,
    followedId,
    tool,
    overlays,
    replayCamera,
    onSelect,
    onSelectSubject,
    onHover,
    onWorldAction,
  };

  const updateCamera = useCallback(
    (
      runtime: PixiRuntime,
      target: ReplayCameraTarget | null,
      liveFollowedId: EntityId | null,
    ) => {
      if (target) {
        replayCameraSessionRef.current ??= {
          viewport: captureCameraViewport(runtime.viewport),
        };
        frameReplayCamera(runtime, target);
        return;
      }
      const replaySession = replayCameraSessionRef.current;
      replayCameraSessionRef.current = null;
      if (replaySession) {
        restoreCameraViewport(runtime.viewport, replaySession.viewport);
      }
      setTransform(runtime, liveFollowedId);
    },
    [],
  );

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let disposed = false;
    let resizeObserver: ResizeObserver | undefined;

    const start = async () => {
      try {
        const app = new Application();
        await app.init({
          antialias: true,
          autoDensity: true,
          backgroundAlpha: 0,
          powerPreference: "high-performance",
          resolution: Math.min(window.devicePixelRatio || 1, 2),
          resizeTo: host,
        });
        if (disposed) {
          app.destroy(true);
          return;
        }

        app.canvas.className = "world-canvas";
        app.canvas.setAttribute("aria-hidden", "true");
        host.appendChild(app.canvas);

        const root = new Container();
        const layers = createRenderLayers();
        root.addChild(
          layers.terrain,
          layers.traffic,
          layers.groupInfluence,
          layers.intentions,
          layers.resources,
          layers.structures,
          layers.interaction,
          layers.interventionPreview,
          layers.creatures,
          layers.frame,
        );
        app.stage.addChild(root);

        const runtime: PixiRuntime = {
          app,
          root,
          layers,
          viewport: { zoom: 1, panX: 0, panY: 0, baseScale: 1 },
          creatureMarks: new Map(),
          resourceMarks: new Map(),
          structureMarks: new Map(),
          terrainSignature: "",
          view: propsRef.current.view,
        };
        runtimeRef.current = runtime;
        drawWorld(
          runtime,
          propsRef.current.selectedId,
          propsRef.current.followedId,
          propsRef.current.focusedId,
          propsRef.current.overlays,
          propsRef.current.selectedRef?.kind === "structure"
            ? propsRef.current.selectedRef.id
            : null,
        );
        updateCamera(runtime, propsRef.current.replayCamera, propsRef.current.followedId);

        resizeObserver = new ResizeObserver(() => {
          requestAnimationFrame(() => {
            if (!runtimeRef.current) return;
            updateCamera(
              runtimeRef.current,
              propsRef.current.replayCamera,
              propsRef.current.followedId,
            );
          });
        });
        resizeObserver.observe(host);
      } catch (error) {
        setRenderError(
          error instanceof Error ? error.message : "The dish renderer could not start.",
        );
      }
    };
    void start();

    return () => {
      disposed = true;
      resizeObserver?.disconnect();
      const runtime = runtimeRef.current;
      runtimeRef.current = null;
      replayCameraSessionRef.current = null;
      runtime?.app.destroy(true, { children: true });
    };
  }, [updateCamera]);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime) return;
    runtime.view = view;
    drawWorld(
      runtime,
      selectedId,
      followedId,
      focusedId,
      overlays,
      selectedRef?.kind === "structure" ? selectedRef.id : null,
    );
    updateCamera(runtime, replayCamera, followedId);
  }, [
    view,
    selectedId,
    selectedRef,
    followedId,
    focusedId,
    overlays,
    replayCamera,
    updateCamera,
  ]);

  useEffect(() => {
    if (!replayCamera) return;
    dragRef.current = null;
    setHoveredTile(null);
    if (hoveredCreatureIdRef.current !== null) {
      hoveredCreatureIdRef.current = null;
      onHover(null);
    }
  }, [onHover, replayCamera]);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime) return;
    const tile = hoveredTile
      ? (runtime.view.tiles.find(
          (candidate) => candidate.x === hoveredTile.x && candidate.y === hoveredTile.y,
        ) ?? null)
      : null;
    drawInterventionPreview(runtime, tile ?? null, tool, mutationDisabled);
  }, [hoveredTile, mutationDisabled, tool]);

  const updateHoveredCreature = (id: EntityId | null) => {
    if (hoveredCreatureIdRef.current === id) return;
    hoveredCreatureIdRef.current = id;
    onHover(id);
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (replayCamera) return;
    if (event.button > 1) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      originX: event.clientX,
      originY: event.clientY,
      previousX: event.clientX,
      previousY: event.clientY,
      moved: false,
      mayPan: tool === "inspect" || event.button === 1 || event.shiftKey,
    };
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (replayCamera) {
      setHoveredTile(null);
      updateHoveredCreature(null);
      return;
    }
    const runtime = runtimeRef.current;
    if (!runtime) return;
    const point = screenToWorld(runtime, event.clientX, event.clientY);
    const tile = tileAtPoint(runtime.view, point);
    setHoveredTile(tile ? { x: tile.x, y: tile.y } : null);
    drawInterventionPreview(runtime, tile ?? null, tool, mutationDisabled);
    if (tool === "inspect") {
      const nearest = runtime.view.creatures
        .filter((creature) => creature.alive)
        .map((creature) => ({
          id: creature.id,
          distance: Math.hypot(creature.x - point.x, creature.y - point.y),
        }))
        .sort((left, right) => left.distance - right.distance || left.id - right.id)[0];
      updateHoveredCreature(nearest && nearest.distance <= 0.9 ? nearest.id : null);
    } else {
      updateHoveredCreature(null);
    }

    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId || !drag.mayPan) return;
    const totalDistance = Math.hypot(
      event.clientX - drag.originX,
      event.clientY - drag.originY,
    );
    if (totalDistance > 4) drag.moved = true;
    if (!drag.moved) return;
    runtime.viewport.panX += event.clientX - drag.previousX;
    runtime.viewport.panY += event.clientY - drag.previousY;
    drag.previousX = event.clientX;
    drag.previousY = event.clientY;
    setTransform(runtime, null);
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (replayCamera) {
      dragRef.current = null;
      return;
    }
    const runtime = runtimeRef.current;
    const drag = dragRef.current;
    dragRef.current = null;
    if (!runtime || !drag || drag.pointerId !== event.pointerId || drag.moved) return;

    const point = screenToWorld(runtime, event.clientX, event.clientY);
    const tile = tileAtPoint(runtime.view, point);
    if (!tile) return;

    if (tool !== "inspect") {
      if (mutationDisabled) return;
      onWorldAction({ tile, worldPosition: point });
      return;
    }

    const nearest = runtime.view.creatures
      .filter((creature) => creature.alive)
      .map((creature) => ({
        id: creature.id,
        distance: Math.hypot(creature.x - point.x, creature.y - point.y),
      }))
      .sort((a, b) => a.distance - b.distance || a.id - b.id)[0];
    const nearestStructure = runtime.view.structures
      .map((structure) => ({
        id: structure.id,
        distance: Math.hypot(structure.x + 0.5 - point.x, structure.y + 0.5 - point.y),
      }))
      .sort((left, right) => left.distance - right.distance || left.id - right.id)[0];
    const directStructureHit =
      nearestStructure !== undefined &&
      nearestStructure.distance <= 0.65 &&
      (nearest === undefined ||
        nearest.distance > 0.9 ||
        nearestStructure.distance + 0.2 < nearest.distance);
    if (directStructureHit && onSelectSubject) {
      onSelectSubject({ kind: "structure", id: nearestStructure.id });
      return;
    }
    if (nearest && nearest.distance <= 0.9) {
      onSelect(nearest.id);
      return;
    }
    onSelect(null);
  };

  const handleWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    if (replayCamera) return;
    event.preventDefault();
    const runtime = runtimeRef.current;
    if (!runtime) return;
    const before = screenToWorld(runtime, event.clientX, event.clientY);
    const previousZoom = runtime.viewport.zoom;
    runtime.viewport.zoom = Math.max(
      0.65,
      Math.min(5, previousZoom * Math.exp(-event.deltaY * 0.001)),
    );
    setTransform(runtime, null);
    const after = screenToWorld(runtime, event.clientX, event.clientY);
    const scale = runtime.viewport.baseScale * runtime.viewport.zoom;
    runtime.viewport.panX += (after.x - before.x) * scale;
    runtime.viewport.panY += (after.y - before.y) * scale;
    setTransform(runtime, null);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (replayCamera) return;
    const runtime = runtimeRef.current;
    if (!runtime) return;
    const panStep = 28;
    let handled = true;
    switch (event.key) {
      case "ArrowLeft":
        runtime.viewport.panX += panStep;
        break;
      case "ArrowRight":
        runtime.viewport.panX -= panStep;
        break;
      case "ArrowUp":
        runtime.viewport.panY += panStep;
        break;
      case "ArrowDown":
        runtime.viewport.panY -= panStep;
        break;
      case "+":
      case "=":
        runtime.viewport.zoom = Math.min(5, runtime.viewport.zoom * 1.18);
        break;
      case "-":
        runtime.viewport.zoom = Math.max(0.65, runtime.viewport.zoom / 1.18);
        break;
      case "Home":
        runtime.viewport = { zoom: 1, panX: 0, panY: 0, baseScale: 1 };
        break;
      default:
        handled = false;
    }
    if (handled) {
      event.preventDefault();
      setTransform(runtime, null);
    }
  };

  return (
    <div
      ref={hostRef}
      className={`pixi-world pixi-world--${tool}${replayCamera ? " is-replay-framed" : ""}`}
      role="application"
      tabIndex={replayCamera ? -1 : 0}
      aria-disabled={replayCamera !== null || (mutationDisabled && tool !== "inspect")}
      aria-label={
        replayCamera
          ? "Living dish replay frame. Camera controls are locked until you return to the live world."
          : "Living dish map. Click a creature or structure to inspect it. Drag to pan, use the mouse wheel to zoom, or use arrow and plus or minus keys."
      }
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={() => {
        dragRef.current = null;
        if (runtimeRef.current) {
          drawInterventionPreview(runtimeRef.current, null, tool, mutationDisabled);
        }
        setHoveredTile(null);
        updateHoveredCreature(null);
      }}
      onPointerLeave={() => {
        if (runtimeRef.current) {
          drawInterventionPreview(runtimeRef.current, null, tool, mutationDisabled);
        }
        setHoveredTile(null);
        updateHoveredCreature(null);
      }}
      onWheel={handleWheel}
      onKeyDown={handleKeyDown}
      onContextMenu={(event) => event.preventDefault()}
    >
      {renderError ? (
        <div className="world-render-error" role="alert">
          <strong>The dish could not be rendered.</strong>
          <span>{renderError}</span>
        </div>
      ) : null}
      <span className="world-coordinate" aria-hidden="true">
        {hoveredTile ? `${hoveredTile.x}, ${hoveredTile.y}` : "—, —"}
      </span>
    </div>
  );
}
