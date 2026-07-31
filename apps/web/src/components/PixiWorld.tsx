import { Application, Container } from "pixi.js";
import { useEffect, useRef, useState } from "react";
import type {
  EntityId,
  InterventionTool,
  OverlaySettings,
  Point,
  WorldAction,
  WorldView,
} from "../model";
import { screenToWorld, setTransform, tileAtPoint } from "./pixi/camera";
import { drawWorld } from "./pixi/layers";
import { createRenderLayers, type PixiRuntime } from "./pixi/runtime";

interface PixiWorldProps {
  view: WorldView;
  selectedId: EntityId | null;
  followedId: EntityId | null;
  tool: InterventionTool;
  overlays: OverlaySettings;
  onSelect: (id: EntityId | null) => void;
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

export function PixiWorld({
  view,
  selectedId,
  followedId,
  tool,
  overlays,
  onSelect,
  onWorldAction,
}: PixiWorldProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const runtimeRef = useRef<PixiRuntime | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const propsRef = useRef({
    view,
    selectedId,
    followedId,
    tool,
    overlays,
    onSelect,
    onWorldAction,
  });
  const [hoveredTile, setHoveredTile] = useState<Point | null>(null);
  const [renderError, setRenderError] = useState<string | null>(null);

  propsRef.current = {
    view,
    selectedId,
    followedId,
    tool,
    overlays,
    onSelect,
    onWorldAction,
  };

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
          layers.groupInfluence,
          layers.intentions,
          layers.resources,
          layers.structures,
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
          propsRef.current.overlays,
        );
        setTransform(runtime, propsRef.current.followedId);

        resizeObserver = new ResizeObserver(() => {
          requestAnimationFrame(() => {
            if (!runtimeRef.current) return;
            setTransform(runtimeRef.current, propsRef.current.followedId);
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
      runtime?.app.destroy(true, { children: true });
    };
  }, []);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime) return;
    runtime.view = view;
    drawWorld(runtime, selectedId, followedId, overlays);
    setTransform(runtime, followedId);
  }, [view, selectedId, followedId, overlays]);

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
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
    const runtime = runtimeRef.current;
    if (!runtime) return;
    const point = screenToWorld(runtime, event.clientX, event.clientY);
    const tile = tileAtPoint(runtime.view, point);
    setHoveredTile(tile ? { x: tile.x, y: tile.y } : null);

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
    const runtime = runtimeRef.current;
    const drag = dragRef.current;
    dragRef.current = null;
    if (!runtime || !drag || drag.pointerId !== event.pointerId || drag.moved) return;

    const point = screenToWorld(runtime, event.clientX, event.clientY);
    const tile = tileAtPoint(runtime.view, point);
    if (!tile) return;

    if (tool !== "inspect") {
      onWorldAction({ tile, worldPosition: point });
      return;
    }

    const nearest = runtime.view.creatures
      .filter((creature) => creature.alive)
      .map((creature) => ({
        id: creature.id,
        distance: Math.hypot(creature.x - point.x, creature.y - point.y),
      }))
      .sort((a, b) => a.distance - b.distance)[0];
    onSelect(nearest && nearest.distance <= 0.9 ? nearest.id : null);
  };

  const handleWheel = (event: React.WheelEvent<HTMLDivElement>) => {
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
      className={`pixi-world pixi-world--${tool}`}
      role="application"
      tabIndex={0}
      aria-label="Living dish map. Click a creature to inspect it. Drag to pan, use the mouse wheel to zoom, or use arrow and plus or minus keys."
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={() => {
        dragRef.current = null;
      }}
      onPointerLeave={() => setHoveredTile(null)}
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
