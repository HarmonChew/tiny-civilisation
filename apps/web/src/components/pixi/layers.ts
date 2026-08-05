import { Graphics } from "pixi.js";
import type {
  CreatureView,
  EntityId,
  InterventionTool,
  OverlaySettings,
  Point,
  TileView,
} from "../../model";
import { drawCreatureMark } from "./creature-marks";
import {
  GROUP_COLORS,
  PALETTE,
  removeMissingMarks,
  safeCreatureColor,
  type PixiRuntime,
} from "./runtime";
import { actionFamily } from "./visual-grammar";
import { deriveTrafficTrails, trafficTrailStyle } from "./traffic-trails";
import { drawResourceMark, drawStructureMark } from "./world-marks";

const terrainColor = (tile: TileView): number => {
  if (/WATER/i.test(tile.terrain)) return PALETTE.shallowWater;
  if (tile.blocked || /ROCK|BARRIER/i.test(tile.terrain)) return PALETTE.rock;
  return (tile.x + tile.y) % 2 === 0 ? PALETTE.ground : PALETTE.groundAlternate;
};

const drawRoute = (graphics: Graphics, creature: CreatureView): void => {
  const samples = creature.route;
  if (samples.length === 0) return;
  const first = samples[0];
  if (!first) return;

  graphics.moveTo(first.x, first.y);
  for (let index = 1; index < samples.length; index += 1) {
    const sample = samples[index];
    if (sample) graphics.lineTo(sample.x, sample.y);
  }
  graphics.lineTo(creature.x, creature.y).stroke({
    color: PALETTE.selected,
    width: 0.095,
    alpha: 0.72,
  });

  const sampleStep = Math.max(1, Math.ceil(samples.length / 6));
  for (let index = 0; index < samples.length; index += sampleStep) {
    const sample = samples[index];
    if (sample)
      graphics
        .circle(sample.x, sample.y, 0.065)
        .fill({ color: PALETTE.paper, alpha: 0.72 });
  }
};

const drawDestination = (graphics: Graphics, point: Point): void => {
  graphics
    .circle(point.x, point.y, 0.31)
    .stroke({ color: PALETTE.selected, width: 0.085, alpha: 0.95 })
    .moveTo(point.x - 0.43, point.y)
    .lineTo(point.x - 0.18, point.y)
    .moveTo(point.x + 0.18, point.y)
    .lineTo(point.x + 0.43, point.y)
    .moveTo(point.x, point.y - 0.43)
    .lineTo(point.x, point.y - 0.18)
    .moveTo(point.x, point.y + 0.18)
    .lineTo(point.x, point.y + 0.43)
    .stroke({ color: PALETTE.selected, width: 0.065, alpha: 0.88 });
};

const drawInteractionSlot = (graphics: Graphics, point: Point): void => {
  graphics
    .rect(point.x - 0.25, point.y - 0.25, 0.5, 0.5)
    .stroke({ color: PALETTE.action, width: 0.07, alpha: 0.98 })
    .moveTo(point.x - 0.34, point.y - 0.34)
    .lineTo(point.x - 0.18, point.y - 0.34)
    .moveTo(point.x - 0.34, point.y - 0.34)
    .lineTo(point.x - 0.34, point.y - 0.18)
    .moveTo(point.x + 0.34, point.y + 0.34)
    .lineTo(point.x + 0.18, point.y + 0.34)
    .moveTo(point.x + 0.34, point.y + 0.34)
    .lineTo(point.x + 0.34, point.y + 0.18)
    .stroke({ color: PALETTE.action, width: 0.055, alpha: 0.82 });
};

export function drawInterventionPreview(
  runtime: PixiRuntime,
  tile: TileView | null,
  tool: InterventionTool,
  disabled: boolean,
): void {
  const graphics = runtime.layers.interventionPreview;
  graphics.clear();
  if (!tile || tool === "inspect") return;
  const removing = tool === "remove-food" || tool === "drain-water";
  const color =
    disabled || removing || (tool === "obstacle" && !tile.blocked)
      ? PALETTE.danger
      : tool === "replenish-water"
        ? PALETTE.water
        : PALETTE.action;
  graphics
    .rect(tile.x + 0.08, tile.y + 0.08, 0.84, 0.84)
    .fill({ color, alpha: disabled ? 0.08 : 0.2 })
    .stroke({ color, width: 0.1, alpha: 1 });
  if (tool === "obstacle") {
    graphics
      .moveTo(tile.x + 0.24, tile.y + 0.24)
      .lineTo(tile.x + 0.76, tile.y + 0.76)
      .moveTo(tile.x + 0.76, tile.y + 0.24)
      .lineTo(tile.x + 0.24, tile.y + 0.76)
      .stroke({ color, width: 0.09, alpha: 1 });
  }
  if (tool === "replenish-water" || tool === "drain-water") {
    graphics
      .moveTo(tile.x + 0.5, tile.y + 0.24)
      .lineTo(tile.x + 0.68, tile.y + 0.54)
      .lineTo(tile.x + 0.5, tile.y + 0.74)
      .lineTo(tile.x + 0.32, tile.y + 0.54)
      .closePath()
      .stroke({ color, width: 0.075, alpha: 1 });
  }
}

const drawGuardPost = (graphics: Graphics, point: Point): void => {
  graphics
    .circle(point.x, point.y, 0.43)
    .stroke({ color: PALETTE.action, width: 0.055, alpha: 0.52 })
    .moveTo(point.x, point.y - 0.2)
    .lineTo(point.x + 0.15, point.y - 0.11)
    .lineTo(point.x + 0.11, point.y + 0.11)
    .lineTo(point.x, point.y + 0.21)
    .lineTo(point.x - 0.11, point.y + 0.11)
    .lineTo(point.x - 0.15, point.y - 0.11)
    .closePath()
    .stroke({ color: PALETTE.paper, width: 0.05, alpha: 0.72 });
};

export const drawWorld = (
  runtime: PixiRuntime,
  selectedId: EntityId | null,
  followedId: EntityId | null,
  focusedId: EntityId | null,
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

  layers.traffic.clear();
  if (overlays.traffic) {
    for (const trail of deriveTrafficTrails(view)) {
      const style = trafficTrailStyle(trail, view.tick);
      layers.traffic
        .moveTo(trail.from.x, trail.from.y)
        .lineTo(trail.to.x, trail.to.y)
        .stroke({ color: PALETTE.traffic, width: style.width, alpha: style.alpha });
    }
  }

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
    drawResourceMark(mark, resource, overlays.resources);
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
    drawStructureMark(mark, structure);
  }
  removeMissingMarks(runtime.structureMarks, structureIds);

  layers.intentions.clear();
  for (const creature of view.creatures) {
    if (!creature.alive) continue;
    const selected = creature.id === selectedId;
    const focused = creature.id === focusedId;

    if (selected) drawRoute(layers.intentions, creature);
    if (!creature.goalTarget || (!overlays.intentions && !selected)) continue;
    layers.intentions
      .moveTo(creature.x, creature.y)
      .lineTo(creature.goalTarget.x, creature.goalTarget.y)
      .stroke({
        color:
          selected || focused
            ? PALETTE.selected
            : safeCreatureColor(creature.color, creature.groupId),
        width: selected ? 0.12 : focused ? 0.09 : 0.055,
        alpha: selected ? 0.86 : focused ? 0.68 : 0.28,
      });
  }

  layers.interaction.clear();
  for (const creature of view.creatures) {
    if (
      creature.alive &&
      creature.interactionSlot &&
      actionFamily(creature.action, creature.actionPhase) === "guard"
    ) {
      drawGuardPost(layers.interaction, creature.interactionSlot);
    }
  }
  const selectedCreature = view.creatures.find(
    (creature) => creature.id === selectedId && creature.alive,
  );
  if (selectedCreature?.goalTarget) {
    drawDestination(layers.interaction, selectedCreature.goalTarget);
  }
  if (selectedCreature?.interactionSlot) {
    drawInteractionSlot(layers.interaction, selectedCreature.interactionSlot);
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
    drawCreatureMark(mark, creature, {
      selected: creature.id === selectedId,
      focused: creature.id === focusedId,
      followed: creature.id === followedId,
    });
  }
  removeMissingMarks(runtime.creatureMarks, creatureIds);
};
