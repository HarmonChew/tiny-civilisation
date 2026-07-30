import { Application, Container, Graphics } from "pixi.js";
import { useEffect, useRef, useState } from "react";
import type {
  EntityId,
  InterventionTool,
  OverlaySettings,
  Point,
  TileView,
  WorldAction,
  WorldView,
} from "../model";

interface PixiWorldProps {
  view: WorldView;
  selectedId: EntityId | null;
  followedId: EntityId | null;
  tool: InterventionTool;
  overlays: OverlaySettings;
  onSelect: (id: EntityId | null) => void;
  onWorldAction: (action: WorldAction) => void;
}

interface Layers {
  terrain: Graphics;
  groupInfluence: Graphics;
  intentions: Graphics;
  frame: Graphics;
  resources: Container;
  structures: Container;
  creatures: Container;
}

interface Viewport {
  zoom: number;
  panX: number;
  panY: number;
  baseScale: number;
}

interface Runtime {
  app: Application;
  root: Container;
  layers: Layers;
  viewport: Viewport;
  creatureMarks: Map<EntityId, Graphics>;
  resourceMarks: Map<EntityId, Graphics>;
  structureMarks: Map<EntityId, Graphics>;
  terrainSignature: string;
  view: WorldView;
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

const PALETTE = {
  ground: 0x69725a,
  groundAlternate: 0x606a53,
  shallowWater: 0x52757a,
  rock: 0x353c36,
  grid: 0xbac19e,
  frame: 0xe8d8b8,
  food: 0xd98a55,
  material: 0xc1ad85,
  storage: 0xe5c77f,
  ink: 0x202722,
  selected: 0xffd98f,
  danger: 0xce6450,
} as const;

const GROUP_COLORS = [0x8ea66c, 0xd4775f, 0x71a0a6, 0xc4a461, 0xa68bb1];

const safeCreatureColor = (color: number, groupId?: number): number => {
  if (Number.isInteger(color) && color > 0 && color <= 0xffffff) return color;
  return GROUP_COLORS[(groupId ?? 0) % GROUP_COLORS.length] ?? GROUP_COLORS[0]!;
};

const setTransform = (runtime: Runtime, followedId: number | null) => {
  const { app, root, viewport, view } = runtime;
  // `app.screen` is expressed in CSS pixels. Renderer width/height can already
  // be resolution-adjusted, so dividing them again shrinks the dish on HiDPI
  // displays.
  const width = Math.max(1, app.screen.width);
  const height = Math.max(1, app.screen.height);
  viewport.baseScale = Math.max(
    3,
    Math.min((width - 28) / view.width, (height - 28) / view.height),
  );
  const scale = viewport.baseScale * viewport.zoom;
  root.scale.set(scale);

  const followed = followedId === null
    ? undefined
    : view.creatures.find((creature) => creature.id === followedId);
  if (followed) {
    root.x = width / 2 - followed.x * scale;
    root.y = height / 2 - followed.y * scale;
    return;
  }

  root.x = (width - view.width * scale) / 2 + viewport.panX;
  root.y = (height - view.height * scale) / 2 + viewport.panY;
};

const terrainColor = (tile: TileView): number => {
  if (/WATER/i.test(tile.terrain)) return PALETTE.shallowWater;
  if (tile.blocked || /ROCK|BARRIER/i.test(tile.terrain)) return PALETTE.rock;
  return (tile.x + tile.y) % 2 === 0 ? PALETTE.ground : PALETTE.groundAlternate;
};

const removeMissingMarks = (
  marks: Map<number, Graphics>,
  activeIds: Set<number>,
) => {
  for (const [id, mark] of marks) {
    if (activeIds.has(id)) continue;
    mark.destroy();
    marks.delete(id);
  }
};

const drawWorld = (
  runtime: Runtime,
  selectedId: EntityId | null,
  followedId: EntityId | null,
  overlays: OverlaySettings,
) => {
  const { layers, view } = runtime;
  const signature = `${view.width}x${view.height}:${view.tiles
    .map((tile) => `${tile.terrain[0] ?? "G"}${tile.blocked ? 1 : 0}`)
    .join("")}`;

  if (signature !== runtime.terrainSignature) {
    runtime.terrainSignature = signature;
    layers.terrain.clear();
    for (const tile of view.tiles) {
      layers.terrain
        .rect(tile.x, tile.y, 1.01, 1.01)
        .fill({ color: terrainColor(tile) });
      if (tile.hazard > 0) {
        layers.terrain
          .circle(tile.x + 0.5, tile.y + 0.5, 0.13 + tile.hazard / 500)
          .fill({ color: PALETTE.danger, alpha: 0.3 });
      }
    }
  }

  layers.frame
    .clear()
    .rect(-0.15, -0.15, view.width + 0.3, view.height + 0.3)
    .stroke({ color: PALETTE.frame, width: 0.22, alpha: 0.7 });

  layers.groupInfluence.clear();
  if (overlays.groups) {
    for (const group of view.groups) {
      if (!group.home) continue;
      const color = GROUP_COLORS[group.id % GROUP_COLORS.length] ?? GROUP_COLORS[0]!;
      layers.groupInfluence
        .circle(group.home.x, group.home.y, Math.max(2.6, Math.sqrt(group.memberIds.length) * 2.1))
        .fill({ color, alpha: 0.09 })
        .stroke({ color, alpha: 0.45, width: 0.12 });
    }
  }

  const resourceIds = new Set<number>();
  for (const resource of view.resources) {
    resourceIds.add(resource.id);
    let mark = runtime.resourceMarks.get(resource.id);
    if (!mark) {
      mark = new Graphics();
      runtime.resourceMarks.set(resource.id, mark);
      layers.resources.addChild(mark);
    }
    const ratio = resource.capacity > 0 ? resource.stock / resource.capacity : 0;
    const color = /FOOD/i.test(resource.kind) ? PALETTE.food : PALETTE.material;
    mark
      .clear()
      .circle(0, 0, 0.2 + Math.max(0, Math.min(1, ratio)) * 0.18)
      .fill({ color, alpha: overlays.resources ? 0.98 : 0.58 })
      .circle(-0.18, -0.12, 0.11)
      .fill({ color, alpha: overlays.resources ? 0.76 : 0.34 })
      .circle(0.17, -0.15, 0.1)
      .fill({ color, alpha: overlays.resources ? 0.76 : 0.34 });
    mark.position.set(resource.x + 0.5, resource.y + 0.5);
    mark.visible = resource.stock > 0;
  }
  removeMissingMarks(runtime.resourceMarks, resourceIds);

  const structureIds = new Set<number>();
  for (const structure of view.structures) {
    structureIds.add(structure.id);
    let mark = runtime.structureMarks.get(structure.id);
    if (!mark) {
      mark = new Graphics();
      runtime.structureMarks.set(structure.id, mark);
      layers.structures.addChild(mark);
    }
    const completed = structure.progress >= 99;
    mark
      .clear()
      .rect(-0.46, -0.4, 0.92, 0.8)
      .fill({ color: completed ? PALETTE.storage : PALETTE.material, alpha: 0.95 })
      .stroke({ color: PALETTE.ink, width: 0.1 })
      .moveTo(-0.33, -0.4)
      .lineTo(0, -0.64)
      .lineTo(0.33, -0.4)
      .stroke({ color: PALETTE.ink, width: 0.12 });
    if (!completed) {
      mark
        .rect(-0.42, 0.48, 0.84, 0.09)
        .fill({ color: PALETTE.ink, alpha: 0.55 })
        .rect(-0.42, 0.48, 0.84 * (structure.progress / 100), 0.09)
        .fill({ color: PALETTE.storage });
    }
    mark.position.set(structure.x + 0.5, structure.y + 0.5);
  }
  removeMissingMarks(runtime.structureMarks, structureIds);

  layers.intentions.clear();
  if (overlays.intentions) {
    for (const creature of view.creatures) {
      if (!creature.alive || !creature.goalTarget) continue;
      const selected = creature.id === selectedId;
      layers.intentions
        .moveTo(creature.x, creature.y)
        .lineTo(creature.goalTarget.x, creature.goalTarget.y)
        .stroke({
          color: selected ? PALETTE.selected : safeCreatureColor(creature.color, creature.groupId),
          width: selected ? 0.13 : 0.055,
          alpha: selected ? 0.9 : 0.28,
        });
    }
  }

  const creatureIds = new Set<number>();
  for (const creature of view.creatures) {
    creatureIds.add(creature.id);
    let mark = runtime.creatureMarks.get(creature.id);
    if (!mark) {
      mark = new Graphics();
      runtime.creatureMarks.set(creature.id, mark);
      layers.creatures.addChild(mark);
    }
    const color = safeCreatureColor(creature.color, creature.groupId);
    const selected = creature.id === selectedId;
    const followed = creature.id === followedId;
    const health = Math.max(0, Math.min(1, creature.health / 100));
    mark.clear();
    if (followed) {
      mark.circle(0, 0, 0.67).stroke({
        color: PALETTE.selected,
        width: 0.08,
        alpha: 0.45,
      });
    }
    if (selected) {
      mark
        .circle(0, 0, 0.52)
        .fill({ color: PALETTE.selected, alpha: 0.18 })
        .stroke({ color: PALETTE.selected, width: 0.12 });
    }
    mark
      .circle(0, 0, 0.33)
      .fill({ color, alpha: creature.alive ? 1 : 0.35 })
      .stroke({ color: PALETTE.ink, width: 0.09 })
      .arc(0, 0, 0.4, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * health)
      .stroke({
        color: health < 0.35 ? PALETTE.danger : PALETTE.frame,
        width: 0.07,
        alpha: 0.9,
      });
    if (creature.groupId !== undefined) {
      mark
        .circle(0.25, -0.25, 0.1)
        .fill({
          color:
            GROUP_COLORS[creature.groupId % GROUP_COLORS.length] ?? GROUP_COLORS[0]!,
        });
    }
    mark.position.set(creature.x, creature.y);
    mark.visible = creature.alive;
  }
  removeMissingMarks(runtime.creatureMarks, creatureIds);
  setTransform(runtime, followedId);
};

const screenToWorld = (runtime: Runtime, clientX: number, clientY: number): Point => {
  const rect = runtime.app.canvas.getBoundingClientRect();
  const scale = runtime.viewport.baseScale * runtime.viewport.zoom;
  return {
    x: (clientX - rect.left - runtime.root.x) / scale,
    y: (clientY - rect.top - runtime.root.y) / scale,
  };
};

const tileAtPoint = (view: WorldView, point: Point): TileView | undefined => {
  const x = Math.floor(point.x);
  const y = Math.floor(point.y);
  if (x < 0 || y < 0 || x >= view.width || y >= view.height) return undefined;
  return (
    view.tiles.find((tile) => tile.x === x && tile.y === y) ??
    view.tiles[y * view.width + x]
  );
};

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
  const runtimeRef = useRef<Runtime | null>(null);
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
        const layers: Layers = {
          terrain: new Graphics(),
          groupInfluence: new Graphics(),
          intentions: new Graphics(),
          frame: new Graphics(),
          resources: new Container(),
          structures: new Container(),
          creatures: new Container(),
        };
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

        const runtime: Runtime = {
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

        resizeObserver = new ResizeObserver(() => {
          requestAnimationFrame(() => {
            if (!runtimeRef.current) return;
            setTransform(runtimeRef.current, propsRef.current.followedId);
          });
        });
        resizeObserver.observe(host);
      } catch (error) {
        setRenderError(error instanceof Error ? error.message : "The dish renderer could not start.");
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
    const totalDistance = Math.hypot(event.clientX - drag.originX, event.clientY - drag.originY);
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
