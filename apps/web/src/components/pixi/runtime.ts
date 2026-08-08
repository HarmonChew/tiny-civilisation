import { Container, Graphics, type Application } from "pixi.js";
import type { EntityId, WorldView } from "../../model";

export interface RenderLayers {
  terrain: Graphics;
  traffic: Graphics;
  groupInfluence: Graphics;
  intentions: Graphics;
  interaction: Graphics;
  interventionPreview: Graphics;
  frame: Graphics;
  resources: Container;
  structures: Container;
  memorials: Container;
  creatures: Container;
}

export interface Viewport {
  zoom: number;
  panX: number;
  panY: number;
  baseScale: number;
}

export interface PixiRuntime {
  app: Application;
  root: Container;
  layers: RenderLayers;
  viewport: Viewport;
  creatureMarks: Map<EntityId, Graphics>;
  resourceMarks: Map<EntityId, Graphics>;
  structureMarks: Map<EntityId, Graphics>;
  memorialMarks: Map<EntityId, Graphics>;
  terrainSignature: string;
  view: WorldView;
}

export const PALETTE = {
  ground: 0x69725a,
  groundAlternate: 0x606a53,
  shallowWater: 0x52757a,
  water: 0x79b6bc,
  rock: 0x353c36,
  frame: 0xe8d8b8,
  food: 0xd98a55,
  material: 0xc1ad85,
  storage: 0xe5c77f,
  ink: 0x202722,
  selected: 0xffd98f,
  danger: 0xce6450,
  paper: 0xfff3d3,
  action: 0xf0b86e,
  traffic: 0xe3c68b,
} as const;

export const GROUP_COLORS = [0x8ea66c, 0xd4775f, 0x71a0a6, 0xc4a461, 0xa68bb1] as const;

export function createRenderLayers(): RenderLayers {
  return {
    terrain: new Graphics(),
    traffic: new Graphics(),
    groupInfluence: new Graphics(),
    intentions: new Graphics(),
    interaction: new Graphics(),
    interventionPreview: new Graphics(),
    frame: new Graphics(),
    resources: new Container(),
    structures: new Container(),
    memorials: new Container(),
    creatures: new Container(),
  };
}

export function safeCreatureColor(color: number, groupId?: number): number {
  if (Number.isInteger(color) && color > 0 && color <= 0xffffff) return color;
  return GROUP_COLORS[(groupId ?? 0) % GROUP_COLORS.length] ?? GROUP_COLORS[0];
}

export function removeMissingMarks(
  marks: Map<number, Graphics>,
  activeIds: ReadonlySet<number>,
): void {
  for (const [id, mark] of marks) {
    if (activeIds.has(id)) continue;
    mark.destroy();
    marks.delete(id);
  }
}
