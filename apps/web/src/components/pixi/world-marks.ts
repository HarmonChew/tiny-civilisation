import type { Graphics } from "pixi.js";
import type { ResourceView, StructureView } from "../../model";
import { PALETTE } from "./runtime";

const boundedRatio = (value: number, capacity: number): number =>
  capacity > 0 ? Math.max(0, Math.min(1, value / capacity)) : 0;

export type ResourceDepletionLevel = "depleted" | "low" | "available" | "full";

export function resourceDepletionLevel(
  stock: number,
  capacity: number,
): ResourceDepletionLevel {
  const ratio = boundedRatio(stock, capacity);
  if (stock <= 0 || ratio <= 0) return "depleted";
  if (ratio <= 0.25) return "low";
  if (ratio >= 1) return "full";
  return "available";
}

export function drawResourceMark(
  mark: Graphics,
  resource: ResourceView,
  emphasized: boolean,
): void {
  const ratio = boundedRatio(resource.stock, resource.capacity);
  const alpha = emphasized ? 0.98 : 0.7;
  mark.clear();

  const waterSource = /WATER/i.test(resource.kind);
  if (/FOOD/i.test(resource.kind)) {
    mark
      .circle(-0.13, 0.03, 0.13)
      .fill({ color: PALETTE.food, alpha })
      .circle(0.11, 0.05, 0.14)
      .fill({ color: PALETTE.food, alpha })
      .circle(0, -0.13, 0.12)
      .fill({ color: PALETTE.food, alpha })
      .moveTo(0, -0.23)
      .lineTo(0.1, -0.35)
      .lineTo(0.19, -0.3)
      .stroke({ color: PALETTE.paper, width: 0.045, alpha });
  } else if (waterSource) {
    const filledSegments = Math.ceil(ratio * 4);
    mark
      .moveTo(0, -0.36)
      .bezierCurveTo(0.08, -0.21, 0.25, -0.05, 0.25, 0.1)
      .bezierCurveTo(0.25, 0.27, 0.14, 0.37, 0, 0.37)
      .bezierCurveTo(-0.14, 0.37, -0.25, 0.27, -0.25, 0.1)
      .bezierCurveTo(-0.25, -0.05, -0.08, -0.21, 0, -0.36)
      .closePath()
      .fill({ color: PALETTE.water, alpha: 0.18 + ratio * 0.72 })
      .stroke({ color: PALETTE.paper, width: 0.055, alpha });

    for (let index = 0; index < 4; index += 1) {
      const x = -0.25 + index * 0.13;
      mark.rect(x, 0.43, 0.1, 0.075).stroke({
        color: PALETTE.paper,
        width: 0.025,
        alpha: 0.78,
      });
      if (index < filledSegments) {
        mark.rect(x + 0.018, 0.448, 0.064, 0.039).fill({
          color: PALETTE.water,
          alpha: 0.95,
        });
      }
    }

    if (ratio === 0) {
      mark
        .moveTo(-0.24, -0.24)
        .lineTo(0.24, 0.28)
        .stroke({ color: PALETTE.danger, width: 0.075, alpha: 0.95 });
    }
  } else {
    mark
      .moveTo(-0.29, 0.16)
      .lineTo(-0.15, -0.23)
      .lineTo(0.01, 0.16)
      .closePath()
      .fill({ color: PALETTE.material, alpha })
      .stroke({ color: PALETTE.ink, width: 0.045 })
      .moveTo(-0.02, 0.18)
      .lineTo(0.15, -0.31)
      .lineTo(0.3, 0.18)
      .closePath()
      .fill({ color: PALETTE.material, alpha })
      .stroke({ color: PALETTE.ink, width: 0.045 });
  }

  mark.arc(0, 0, 0.39, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * ratio).stroke({
    color: emphasized ? PALETTE.selected : PALETTE.paper,
    width: emphasized ? 0.07 : 0.045,
    alpha: emphasized ? 0.9 : 0.58,
  });
  mark.position.set(resource.x + 0.5, resource.y + 0.5);
  mark.visible = waterSource || resource.stock > 0;
}

export function drawStructureMark(mark: Graphics, structure: StructureView): void {
  const progress = boundedRatio(structure.progress, 100);
  const completed = progress >= 0.99;
  const storage = boundedRatio(structure.stored, structure.capacity);
  mark.clear();

  if (completed) {
    mark
      .rect(-0.43, -0.31, 0.86, 0.7)
      .fill({ color: PALETTE.storage, alpha: 0.96 })
      .stroke({ color: PALETTE.ink, width: 0.085 })
      .moveTo(-0.49, -0.31)
      .lineTo(0, -0.65)
      .lineTo(0.49, -0.31)
      .closePath()
      .fill({ color: PALETTE.material, alpha: 0.96 })
      .stroke({ color: PALETTE.ink, width: 0.085 })
      .rect(-0.1, 0.08, 0.2, 0.31)
      .fill({ color: PALETTE.ink, alpha: 0.76 });

    if (storage > 0) {
      mark
        .rect(-0.32, -0.18, 0.64 * storage, 0.1)
        .fill({ color: PALETTE.paper, alpha: 0.72 });
    }
  } else {
    mark
      .rect(-0.43, 0.2, 0.86, 0.15)
      .fill({ color: PALETTE.material, alpha: 0.92 })
      .stroke({ color: PALETTE.ink, width: 0.06 })
      .moveTo(-0.37, -0.38)
      .lineTo(-0.37, 0.34)
      .moveTo(0.37, -0.38)
      .lineTo(0.37, 0.34)
      .moveTo(-0.48, -0.28)
      .lineTo(0.48, -0.28)
      .moveTo(-0.37, -0.25)
      .lineTo(0.37, 0.18)
      .stroke({ color: PALETTE.paper, width: 0.065, alpha: 0.84 })
      .rect(-0.43, 0.45, 0.86, 0.08)
      .fill({ color: PALETTE.ink, alpha: 0.6 })
      .rect(-0.43, 0.45, 0.86 * progress, 0.08)
      .fill({ color: PALETTE.selected, alpha: 0.95 });
  }

  mark.position.set(structure.x + 0.5, structure.y + 0.5);
}
