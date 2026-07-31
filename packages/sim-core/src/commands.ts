import { addHistory, emitDomainEvent } from "./events.js";
import { findNearestWalkable, isWalkableTile } from "./navigation.js";
import { tileIndexAt } from "./pathfinding.js";
import type { PlayerCommand, ScheduledPlayerCommand, SimulationState } from "./types.js";

function resolveCommandTile(state: SimulationState, command: PlayerCommand): number {
  if (typeof command.tileIndex === "number") return command.tileIndex;
  if (typeof command.x === "number" && typeof command.y === "number") {
    return tileIndexAt(state.world, Math.floor(command.x), Math.floor(command.y));
  }
  if (command.type === "ADD_FOOD" || command.type === "REMOVE_FOOD") {
    return tileIndexAt(state.world, 10, 7);
  }
  return tileIndexAt(state.world, 24, 15);
}

export function queuePlayerCommand(
  state: SimulationState,
  command: PlayerCommand,
): ScheduledPlayerCommand {
  let tileIndex = resolveCommandTile(state, command);
  if (tileIndex < 0 || tileIndex >= state.world.tiles.length) {
    throw new RangeError(`Player command targets invalid tile ${tileIndex}.`);
  }
  if (command.type === "ADD_FOOD" && !isWalkableTile(state, tileIndex)) {
    tileIndex = findNearestWalkable(state, tileIndex);
  }
  const applyAtTick = Math.max(state.tick, Math.floor(command.applyAtTick ?? state.tick));
  const scheduled: ScheduledPlayerCommand = {
    commandId: state.nextCommandId++,
    applyAtTick,
    type: command.type,
    tileIndex,
    amount:
      command.type === "ADD_FOOD" || command.type === "REMOVE_FOOD"
        ? Math.max(1, Math.floor(command.amount ?? 12))
        : 0,
    blocked:
      command.type === "TOGGLE_OBSTACLE" && typeof command.blocked === "boolean"
        ? command.blocked
        : null,
  };
  state.commandQueue.push(scheduled);
  state.commandQueue.sort(
    (left, right) =>
      left.applyAtTick - right.applyAtTick || left.commandId - right.commandId,
  );
  return scheduled;
}

export function applyScheduledCommands(state: SimulationState): void {
  const ready = state.commandQueue.filter((command) => command.applyAtTick === state.tick);
  state.commandQueue = state.commandQueue.filter(
    (command) => command.applyAtTick > state.tick,
  );
  for (const command of ready) {
    state.metrics.playerInterventions += 1;
    if (command.type === "ADD_FOOD") {
      let node =
        state.resourceNodes.find(
          (candidate) =>
            candidate.kind === "FOOD" && candidate.tileIndex === command.tileIndex,
        ) ?? null;
      if (!node) {
        node = {
          id: state.nextEntityId++,
          kind: "FOOD",
          tileIndex: command.tileIndex,
          currentStock: 0,
          maximumStock: Math.max(40, command.amount),
          regenerationEveryTicks: 40,
          regenerationAmount: 1,
        };
        state.resourceNodes.push(node);
      }
      node.maximumStock = Math.max(node.maximumStock, node.currentStock + command.amount);
      node.currentStock += command.amount;
      const event = emitDomainEvent(state, {
        type: "PLAYER_ADDED_FOOD",
        targetIds: [node.id],
        locationTileIndex: command.tileIndex,
        resourceKind: "FOOD",
        quantity: command.amount,
        importance: 55,
        summary: `The observer added ${command.amount} food units.`,
      });
      addHistory(
        state,
        "INTERVENTION",
        "Food appeared",
        event.summary,
        [event.id],
        [],
        [],
        55,
      );
    } else if (command.type === "REMOVE_FOOD") {
      let remaining = command.amount;
      let removed = 0;
      for (const node of state.resourceNodes) {
        if (
          node.kind !== "FOOD" ||
          node.tileIndex !== command.tileIndex ||
          remaining <= 0
        ) {
          continue;
        }
        const quantity = Math.min(remaining, node.currentStock);
        node.currentStock -= quantity;
        remaining -= quantity;
        removed += quantity;
      }
      const event = emitDomainEvent(state, {
        type: "PLAYER_REMOVED_FOOD",
        locationTileIndex: command.tileIndex,
        resourceKind: "FOOD",
        quantity: removed,
        importance: 55,
        summary: `The observer removed ${removed} food units.`,
      });
      addHistory(
        state,
        "INTERVENTION",
        "Food vanished",
        event.summary,
        [event.id],
        [],
        [],
        55,
      );
    } else {
      const tile = state.world.tiles[command.tileIndex];
      if (!tile) continue;
      const nextBlocked = command.blocked ?? !tile.blocked;
      const occupied =
        state.creatures.some(
          (creature) => creature.alive && creature.tileIndex === command.tileIndex,
        ) ||
        state.resourceNodes.some((node) => node.tileIndex === command.tileIndex) ||
        state.structures.some((structure) => structure.tileIndex === command.tileIndex);
      if (nextBlocked && occupied) {
        const event = emitDomainEvent(state, {
          type: "PLAYER_TOGGLED_OBSTACLE",
          locationTileIndex: command.tileIndex,
          quantity: 0,
          importance: 20,
          summary:
            "A barrier could not form on a tile occupied by a creature, resource, or structure.",
        });
        addHistory(
          state,
          "INTERVENTION",
          "A barrier placement was obstructed",
          event.summary,
          [event.id],
          [],
          [],
          20,
        );
        continue;
      }
      tile.blocked = nextBlocked;
      tile.terrain = nextBlocked ? "ROCK" : "GROUND";
      tile.walkCost = 10;
      state.world.navigationRevision += 1;
      tile.navigationRevision = state.world.navigationRevision;
      const event = emitDomainEvent(state, {
        type: "PLAYER_TOGGLED_OBSTACLE",
        locationTileIndex: command.tileIndex,
        quantity: nextBlocked ? 1 : 0,
        importance: 60,
        summary: `The observer ${nextBlocked ? "closed" : "opened"} a passage.`,
      });
      addHistory(
        state,
        "INTERVENTION",
        nextBlocked ? "A passage closed" : "A passage opened",
        event.summary,
        [event.id],
        [],
        [],
        60,
      );
    }
  }
}
