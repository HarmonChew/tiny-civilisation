import { Graphics } from "pixi.js";
import type { EntityId, OverlaySettings, TileView } from "../../model";
import {
  GROUP_COLORS,
  PALETTE,
  removeMissingMarks,
  safeCreatureColor,
  type PixiRuntime,
} from "./runtime";

const terrainColor = (tile: TileView): number => {
  if (/WATER/i.test(tile.terrain)) return PALETTE.shallowWater;
  if (tile.blocked || /ROCK|BARRIER/i.test(tile.terrain)) return PALETTE.rock;
  return (tile.x + tile.y) % 2 === 0 ? PALETTE.ground : PALETTE.groundAlternate;
};

export const drawWorld = (
  runtime: PixiRuntime,
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
      layers.terrain.rect(tile.x, tile.y, 1.01, 1.01).fill({ color: terrainColor(tile) });
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
        .circle(
          group.home.x,
          group.home.y,
          Math.max(2.6, Math.sqrt(group.memberIds.length) * 2.1),
        )
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
          color: selected
            ? PALETTE.selected
            : safeCreatureColor(creature.color, creature.groupId),
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
      mark.circle(0.25, -0.25, 0.1).fill({
        color: GROUP_COLORS[creature.groupId % GROUP_COLORS.length] ?? GROUP_COLORS[0]!,
      });
    }
    mark.position.set(creature.x, creature.y);
    mark.visible = creature.alive;
  }
  removeMissingMarks(runtime.creatureMarks, creatureIds);
};
