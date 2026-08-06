import type { Graphics } from "pixi.js";
import type { CreatureView } from "../../model";
import { GROUP_COLORS, PALETTE, safeCreatureColor } from "./runtime";
import {
  actionFamily,
  carriedAmounts,
  directionForCreature,
  identityVariant,
  type CreatureActionFamily,
} from "./visual-grammar";

interface CreatureMarkState {
  selected: boolean;
  focused: boolean;
  followed: boolean;
}

const drawIdentityPattern = (mark: Graphics, variant: number): void => {
  const color = PALETTE.paper;
  const stroke = { color, width: 0.055, alpha: 0.95 };

  switch (variant) {
    case 0:
      mark.circle(0, 0, 0.075).fill({ color, alpha: 0.95 });
      break;
    case 1:
      mark
        .moveTo(0, -0.17)
        .lineTo(0.14, 0.11)
        .lineTo(-0.14, 0.11)
        .closePath()
        .stroke(stroke);
      break;
    case 2:
      mark.rect(-0.105, -0.105, 0.21, 0.21).stroke(stroke);
      break;
    case 3:
      mark
        .moveTo(0, -0.16)
        .lineTo(0.14, 0)
        .lineTo(0, 0.16)
        .lineTo(-0.14, 0)
        .closePath()
        .stroke(stroke);
      break;
    case 4:
      mark.moveTo(-0.15, 0).lineTo(0.15, 0).moveTo(0, -0.15).lineTo(0, 0.15).stroke(stroke);
      break;
    case 5:
      mark
        .moveTo(-0.13, -0.13)
        .lineTo(0.13, 0.13)
        .moveTo(0.13, -0.13)
        .lineTo(-0.13, 0.13)
        .stroke(stroke);
      break;
    case 6:
      mark
        .circle(-0.095, 0, 0.045)
        .fill({ color, alpha: 0.95 })
        .circle(0.095, 0, 0.045)
        .fill({ color, alpha: 0.95 });
      break;
    default:
      mark
        .moveTo(-0.13, -0.065)
        .lineTo(0.13, -0.065)
        .moveTo(-0.13, 0.065)
        .lineTo(0.13, 0.065)
        .stroke(stroke);
  }
};

const drawDirectionCue = (mark: Graphics, creature: CreatureView): void => {
  const direction = directionForCreature(creature);
  if (!direction) return;

  const tailX = direction.x * 0.37;
  const tailY = direction.y * 0.37;
  const tipX = direction.x * 0.66;
  const tipY = direction.y * 0.66;
  const perpendicularX = -direction.y;
  const perpendicularY = direction.x;
  mark
    .moveTo(tailX, tailY)
    .lineTo(tipX, tipY)
    .lineTo(
      tipX - direction.x * 0.14 + perpendicularX * 0.1,
      tipY - direction.y * 0.14 + perpendicularY * 0.1,
    )
    .moveTo(tipX, tipY)
    .lineTo(
      tipX - direction.x * 0.14 - perpendicularX * 0.1,
      tipY - direction.y * 0.14 - perpendicularY * 0.1,
    )
    .stroke({ color: PALETTE.paper, width: 0.065, alpha: 0.92 });
};

const drawActionCue = (mark: Graphics, family: CreatureActionFamily): void => {
  const x = -0.49;
  const y = 0.43;
  const color = PALETTE.action;
  const stroke = { color, width: 0.055, alpha: 0.98 };

  switch (family) {
    case "travel":
      mark
        .circle(x - 0.09, y + 0.06, 0.035)
        .fill({ color })
        .circle(x, y, 0.045)
        .fill({ color })
        .circle(x + 0.11, y - 0.07, 0.055)
        .fill({ color });
      break;
    case "gather":
      mark
        .circle(x, y, 0.045)
        .fill({ color })
        .circle(x - 0.1, y - 0.06, 0.035)
        .fill({ color })
        .circle(x + 0.1, y - 0.06, 0.035)
        .fill({ color })
        .moveTo(x - 0.11, y + 0.11)
        .lineTo(x, y + 0.02)
        .lineTo(x + 0.11, y + 0.11)
        .stroke(stroke);
      break;
    case "eat":
      mark
        .arc(x, y, 0.13, 0.22 * Math.PI, 1.78 * Math.PI)
        .stroke(stroke)
        .circle(x + 0.11, y, 0.025)
        .fill({ color });
      break;
    case "drink":
      mark
        .moveTo(x, y - 0.14)
        .lineTo(x + 0.11, y + 0.02)
        .lineTo(x, y + 0.14)
        .lineTo(x - 0.11, y + 0.02)
        .closePath()
        .stroke(stroke)
        .circle(x, y + 0.035, 0.025)
        .fill({ color });
      break;
    case "build":
      mark
        .rect(x - 0.13, y - 0.1, 0.12, 0.08)
        .stroke(stroke)
        .rect(x + 0.01, y - 0.1, 0.12, 0.08)
        .stroke(stroke)
        .rect(x - 0.06, y, 0.12, 0.08)
        .stroke(stroke);
      break;
    case "maintenance":
      mark
        .arc(x, y, 0.12, -0.2 * Math.PI, 1.25 * Math.PI)
        .stroke(stroke)
        .moveTo(x - 0.13, y - 0.08)
        .lineTo(x - 0.13, y - 0.17)
        .lineTo(x - 0.04, y - 0.16)
        .moveTo(x + 0.02, y + 0.02)
        .lineTo(x + 0.13, y + 0.13)
        .stroke(stroke);
      break;
    case "share":
      mark
        .circle(x - 0.08, y, 0.055)
        .stroke(stroke)
        .circle(x + 0.08, y, 0.055)
        .stroke(stroke)
        .moveTo(x - 0.025, y)
        .lineTo(x + 0.025, y)
        .stroke(stroke);
      break;
    case "guard":
      mark
        .moveTo(x, y - 0.13)
        .lineTo(x + 0.11, y - 0.06)
        .lineTo(x + 0.08, y + 0.08)
        .lineTo(x, y + 0.14)
        .lineTo(x - 0.08, y + 0.08)
        .lineTo(x - 0.11, y - 0.06)
        .closePath()
        .stroke(stroke);
      break;
    case "conflict":
      mark
        .moveTo(x - 0.11, y - 0.11)
        .lineTo(x + 0.11, y + 0.11)
        .moveTo(x + 0.11, y - 0.11)
        .lineTo(x - 0.11, y + 0.11)
        .stroke({ ...stroke, width: 0.075 });
      break;
    case "flee":
      mark
        .moveTo(x - 0.12, y - 0.09)
        .lineTo(x - 0.03, y)
        .lineTo(x - 0.12, y + 0.09)
        .moveTo(x, y - 0.09)
        .lineTo(x + 0.09, y)
        .lineTo(x, y + 0.09)
        .stroke(stroke);
      break;
    case "rest":
      mark
        .moveTo(x - 0.11, y - 0.1)
        .lineTo(x + 0.09, y - 0.1)
        .lineTo(x - 0.09, y + 0.1)
        .lineTo(x + 0.11, y + 0.1)
        .stroke(stroke);
      break;
    case "storage":
      mark
        .rect(x - 0.12, y - 0.08, 0.24, 0.16)
        .stroke(stroke)
        .moveTo(x, y - 0.15)
        .lineTo(x, y + 0.02)
        .moveTo(x - 0.06, y - 0.04)
        .lineTo(x, y + 0.02)
        .lineTo(x + 0.06, y - 0.04)
        .stroke(stroke);
      break;
    default:
      mark
        .moveTo(x - 0.13, y)
        .arc(x, y, 0.13, Math.PI, 0)
        .moveTo(x - 0.13, y)
        .arc(x, y, 0.13, -Math.PI, 0)
        .stroke(stroke)
        .circle(x, y, 0.04)
        .fill({ color });
  }
};

const drawCarryingCues = (mark: Graphics, creature: CreatureView): void => {
  const carried = carriedAmounts(creature);
  if (carried.food > 0) {
    mark
      .circle(0.42, -0.38, 0.095)
      .fill({ color: PALETTE.food })
      .stroke({ color: PALETTE.ink, width: 0.04 })
      .moveTo(0.42, -0.48)
      .lineTo(0.48, -0.54)
      .stroke({ color: PALETTE.paper, width: 0.035 });
  }
  if (carried.material > 0) {
    mark
      .moveTo(0.51, -0.2)
      .lineTo(0.61, -0.1)
      .lineTo(0.51, 0)
      .lineTo(0.41, -0.1)
      .closePath()
      .fill({ color: PALETTE.material })
      .stroke({ color: PALETTE.ink, width: 0.04 });
  }
  if (carried.water > 0) {
    mark
      .moveTo(0.5, 0.03)
      .lineTo(0.6, 0.18)
      .lineTo(0.5, 0.3)
      .lineTo(0.4, 0.18)
      .closePath()
      .fill({ color: PALETTE.water })
      .stroke({ color: PALETTE.ink, width: 0.04 });
  }
};

export function drawCreatureMark(
  mark: Graphics,
  creature: CreatureView,
  state: CreatureMarkState,
): void {
  const color = safeCreatureColor(creature.color, creature.groupId);
  const health = Math.max(0, Math.min(1, creature.health / 100));
  mark.clear();

  if (state.followed) {
    mark
      .circle(0, 0, 0.72)
      .stroke({ color: PALETTE.selected, width: 0.055, alpha: 0.6 })
      .circle(0, 0, 0.64)
      .stroke({ color: PALETTE.selected, width: 0.035, alpha: 0.4 });
  }
  if (state.selected) {
    mark
      .circle(0, 0, 0.55)
      .fill({ color: PALETTE.selected, alpha: 0.15 })
      .stroke({ color: PALETTE.selected, width: 0.11 });
  }
  if (state.focused && !state.selected) {
    mark
      .moveTo(0, -0.56)
      .lineTo(0.56, 0)
      .lineTo(0, 0.56)
      .lineTo(-0.56, 0)
      .closePath()
      .stroke({ color: PALETTE.selected, width: 0.085, alpha: 0.95 });
  }

  drawDirectionCue(mark, creature);
  mark
    .circle(0, 0, 0.33)
    .fill({ color, alpha: creature.alive ? 1 : 0.35 })
    .stroke({ color: PALETTE.ink, width: 0.085 })
    .arc(0, 0, 0.405, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * health)
    .stroke({
      color: health < 0.35 ? PALETTE.danger : PALETTE.paper,
      width: 0.065,
      alpha: 0.9,
    });
  drawIdentityPattern(mark, identityVariant(creature.id));

  if (creature.groupId !== undefined) {
    const groupColor =
      GROUP_COLORS[creature.groupId % GROUP_COLORS.length] ?? GROUP_COLORS[0]!;
    mark
      .circle(0.27, -0.27, 0.105)
      .fill({ color: groupColor })
      .stroke({ color: PALETTE.paper, width: 0.035 });
  }
  drawCarryingCues(mark, creature);
  drawActionCue(mark, actionFamily(creature.action, creature.actionPhase));

  mark.position.set(creature.x, creature.y);
  mark.visible = creature.alive;
}
