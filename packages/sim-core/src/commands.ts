import { addHistory, emitDomainEvent } from "./events.js";
import { findNearestWalkable, isWalkableTile } from "./navigation.js";
import { tileCoordinates, tileIndexAt } from "./pathfinding.js";
import { isProtectedShelterTile } from "./shelters.js";
import {
  MAX_PLAYER_COMMAND_AMOUNT,
  type PlayerCommand,
  type ScheduledPlayerCommand,
  type SimulationState,
} from "./types.js";

function resolveCommandTile(state: SimulationState, command: PlayerCommand): number {
  if (typeof command.tileIndex === "number") return command.tileIndex;
  if (typeof command.x === "number" && typeof command.y === "number") {
    return tileIndexAt(state.world, Math.floor(command.x), Math.floor(command.y));
  }
  if (
    command.type === "ADD_FOOD" ||
    command.type === "REMOVE_FOOD" ||
    command.type === "ADD_MATERIAL" ||
    command.type === "REMOVE_MATERIAL"
  ) {
    const kind =
      command.type === "ADD_MATERIAL" || command.type === "REMOVE_MATERIAL"
        ? "MATERIAL"
        : "FOOD";
    const foodNode = state.resourceNodes
      .filter((node) => node.kind === kind)
      .sort((left, right) => left.id - right.id)[0];
    if (foodNode) return foodNode.tileIndex;
  }
  if (command.type === "REPLENISH_WATER" || command.type === "DRAIN_WATER") {
    const waterNode = state.resourceNodes
      .filter((node) => node.kind === "WATER")
      .sort((left, right) => left.id - right.id)[0];
    if (waterNode) return waterNode.tileIndex;
  }
  const center = tileIndexAt(
    state.world,
    Math.floor(state.world.width / 2),
    Math.floor(state.world.height / 2),
  );
  return findNearestWalkable(state, center);
}

function nearestResourcePlacementTile(
  state: SimulationState,
  requestedTileIndex: number,
): number {
  const origin = tileCoordinates(state.world, requestedTileIndex);
  return (
    state.world.tiles
      .filter(
        (tile) =>
          isWalkableTile(state, tile.index) && !isProtectedShelterTile(state, tile.index),
      )
      .sort(
        (left, right) =>
          Math.abs(left.x - origin.x) +
            Math.abs(left.y - origin.y) -
            (Math.abs(right.x - origin.x) + Math.abs(right.y - origin.y)) ||
          left.index - right.index,
      )[0]?.index ?? findNearestWalkable(state, requestedTileIndex)
  );
}

export function queuePlayerCommand(
  state: SimulationState,
  command: PlayerCommand,
): ScheduledPlayerCommand {
  let tileIndex = resolveCommandTile(state, command);
  if (
    !Number.isSafeInteger(tileIndex) ||
    tileIndex < 0 ||
    tileIndex >= state.world.tiles.length
  ) {
    throw new RangeError(`Player command targets invalid tile ${tileIndex}.`);
  }
  if (
    (command.type === "ADD_FOOD" || command.type === "ADD_MATERIAL") &&
    (!isWalkableTile(state, tileIndex) || isProtectedShelterTile(state, tileIndex))
  ) {
    tileIndex = nearestResourcePlacementTile(state, tileIndex);
  }
  const isQuantityCommand =
    command.type === "ADD_FOOD" ||
    command.type === "REMOVE_FOOD" ||
    command.type === "ADD_MATERIAL" ||
    command.type === "REMOVE_MATERIAL" ||
    command.type === "REPLENISH_WATER" ||
    command.type === "DRAIN_WATER";
  const requestedAmount = isQuantityCommand ? (command.amount ?? 12) : 0;
  if (
    isQuantityCommand &&
    (!Number.isSafeInteger(requestedAmount) ||
      requestedAmount < 1 ||
      requestedAmount > MAX_PLAYER_COMMAND_AMOUNT)
  ) {
    throw new RangeError(
      `Resource command amount must be a whole number from 1 to ${MAX_PLAYER_COMMAND_AMOUNT.toString()}.`,
    );
  }
  const requestedTick = command.applyAtTick ?? state.tick;
  if (!Number.isSafeInteger(requestedTick) || requestedTick < 0) {
    throw new RangeError("Player command tick must be a nonnegative whole number.");
  }
  const applyAtTick = Math.max(state.tick, requestedTick);
  const scheduled: ScheduledPlayerCommand = {
    commandId: state.nextCommandId++,
    applyAtTick,
    type: command.type,
    tileIndex,
    amount: isQuantityCommand ? requestedAmount : 0,
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
      if (
        !isWalkableTile(state, command.tileIndex) ||
        isProtectedShelterTile(state, command.tileIndex)
      ) {
        const event = emitDomainEvent(state, {
          type: "PLAYER_ADDED_FOOD",
          locationTileIndex: command.tileIndex,
          resourceKind: "FOOD",
          quantity: 0,
          importance: 20,
          commandId: command.commandId,
          commandOutcome: "REJECTED",
          commandRejectionReason: "OCCUPIED_TILE",
          summary:
            "Food could not appear because the scheduled tile became blocked or part of a communal shelter footprint.",
        });
        addHistory(
          state,
          "INTERVENTION",
          "Food placement was obstructed",
          event.summary,
          [event.id],
          [],
          [],
          20,
        );
        continue;
      }
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
        commandId: command.commandId,
        commandOutcome: "APPLIED",
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
      const affectedNodeIds: number[] = [];
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
        if (quantity > 0) affectedNodeIds.push(node.id);
      }
      const event = emitDomainEvent(state, {
        type: "PLAYER_REMOVED_FOOD",
        targetIds: affectedNodeIds,
        locationTileIndex: command.tileIndex,
        resourceKind: "FOOD",
        quantity: removed,
        importance: 55,
        commandId: command.commandId,
        commandOutcome: "APPLIED",
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
    } else if (command.type === "ADD_MATERIAL") {
      if (
        !isWalkableTile(state, command.tileIndex) ||
        isProtectedShelterTile(state, command.tileIndex)
      ) {
        const event = emitDomainEvent(state, {
          type: "PLAYER_ADDED_MATERIAL",
          locationTileIndex: command.tileIndex,
          resourceKind: "MATERIAL",
          quantity: 0,
          importance: 20,
          commandId: command.commandId,
          commandOutcome: "REJECTED",
          commandRejectionReason: "OCCUPIED_TILE",
          summary:
            "Material could not appear because the scheduled tile became blocked or part of a communal shelter footprint.",
        });
        addHistory(
          state,
          "INTERVENTION",
          "Material placement was obstructed",
          event.summary,
          [event.id],
          [],
          [],
          20,
        );
        continue;
      }
      let node =
        state.resourceNodes.find(
          (candidate) =>
            candidate.kind === "MATERIAL" && candidate.tileIndex === command.tileIndex,
        ) ?? null;
      if (!node) {
        node = {
          id: state.nextEntityId++,
          kind: "MATERIAL",
          tileIndex: command.tileIndex,
          currentStock: 0,
          maximumStock: Math.max(40, command.amount),
          regenerationEveryTicks: 60,
          regenerationAmount: 1,
        };
        state.resourceNodes.push(node);
      }
      node.maximumStock = Math.max(node.maximumStock, node.currentStock + command.amount);
      node.currentStock += command.amount;
      const event = emitDomainEvent(state, {
        type: "PLAYER_ADDED_MATERIAL",
        targetIds: [node.id],
        locationTileIndex: command.tileIndex,
        resourceKind: "MATERIAL",
        quantity: command.amount,
        importance: 55,
        commandId: command.commandId,
        commandOutcome: "APPLIED",
        summary: `The observer added ${command.amount} material units.`,
      });
      addHistory(
        state,
        "INTERVENTION",
        "Material appeared",
        event.summary,
        [event.id],
        [],
        [],
        55,
      );
    } else if (command.type === "REMOVE_MATERIAL") {
      let remaining = command.amount;
      let removed = 0;
      const affectedNodeIds: number[] = [];
      for (const node of state.resourceNodes) {
        if (
          node.kind !== "MATERIAL" ||
          node.tileIndex !== command.tileIndex ||
          remaining <= 0
        ) {
          continue;
        }
        const quantity = Math.min(remaining, node.currentStock);
        node.currentStock -= quantity;
        remaining -= quantity;
        removed += quantity;
        if (quantity > 0) affectedNodeIds.push(node.id);
      }
      const event = emitDomainEvent(state, {
        type: "PLAYER_REMOVED_MATERIAL",
        targetIds: affectedNodeIds,
        locationTileIndex: command.tileIndex,
        resourceKind: "MATERIAL",
        quantity: removed,
        importance: 55,
        commandId: command.commandId,
        commandOutcome: "APPLIED",
        summary: `The observer removed ${removed} material units.`,
      });
      addHistory(
        state,
        "INTERVENTION",
        "Material vanished",
        event.summary,
        [event.id],
        [],
        [],
        55,
      );
    } else if (command.type === "REPLENISH_WATER") {
      const node =
        state.resourceNodes.find(
          (candidate) =>
            candidate.kind === "WATER" && candidate.tileIndex === command.tileIndex,
        ) ?? null;
      const rejection = !node
        ? "NO_WATER_SOURCE"
        : node.currentStock >= node.maximumStock
          ? "SOURCE_FULL"
          : null;
      const quantity =
        node && rejection === null
          ? Math.min(command.amount, node.maximumStock - node.currentStock)
          : 0;
      if (node) node.currentStock += quantity;
      const event = emitDomainEvent(state, {
        type: "PLAYER_REPLENISHED_WATER",
        targetIds: node ? [node.id] : [],
        locationTileIndex: command.tileIndex,
        resourceKind: "WATER",
        quantity,
        importance: rejection === null ? 55 : 20,
        commandId: command.commandId,
        commandOutcome: rejection === null ? "APPLIED" : "REJECTED",
        commandRejectionReason: rejection,
        summary:
          rejection === "NO_WATER_SOURCE"
            ? "Water could not be replenished because no potable source exists on that tile."
            : rejection === "SOURCE_FULL"
              ? "The potable water source was already full."
              : `The observer replenished ${quantity} water units.`,
      });
      addHistory(
        state,
        "INTERVENTION",
        rejection === null
          ? "A water source was replenished"
          : "Water replenishment failed",
        event.summary,
        [event.id],
        [],
        [],
        rejection === null ? 55 : 20,
      );
    } else if (command.type === "DRAIN_WATER") {
      const node =
        state.resourceNodes.find(
          (candidate) =>
            candidate.kind === "WATER" && candidate.tileIndex === command.tileIndex,
        ) ?? null;
      const rejection = !node
        ? "NO_WATER_SOURCE"
        : node.currentStock <= 0
          ? "SOURCE_EMPTY"
          : null;
      const quantity =
        node && rejection === null ? Math.min(command.amount, node.currentStock) : 0;
      if (node) node.currentStock -= quantity;
      const event = emitDomainEvent(state, {
        type: "PLAYER_DRAINED_WATER",
        targetIds: node ? [node.id] : [],
        locationTileIndex: command.tileIndex,
        resourceKind: "WATER",
        quantity,
        importance: rejection === null ? 55 : 20,
        commandId: command.commandId,
        commandOutcome: rejection === null ? "APPLIED" : "REJECTED",
        commandRejectionReason: rejection,
        summary:
          rejection === "NO_WATER_SOURCE"
            ? "Water could not be drained because no potable source exists on that tile."
            : rejection === "SOURCE_EMPTY"
              ? "The potable water source was already empty."
              : `The observer drained ${quantity} water units.`,
      });
      addHistory(
        state,
        "INTERVENTION",
        rejection === null ? "A water source was drained" : "Water drainage failed",
        event.summary,
        [event.id],
        [],
        [],
        rejection === null ? 55 : 20,
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
        state.structures.some((structure) => structure.tileIndex === command.tileIndex) ||
        isProtectedShelterTile(state, command.tileIndex);
      if (nextBlocked && occupied) {
        const event = emitDomainEvent(state, {
          type: "PLAYER_TOGGLED_OBSTACLE",
          locationTileIndex: command.tileIndex,
          quantity: 0,
          importance: 20,
          commandId: command.commandId,
          commandOutcome: "REJECTED",
          commandRejectionReason: "OCCUPIED_TILE",
          summary:
            "A barrier could not form on a tile occupied by a creature, resource, structure, or usable shelter place.",
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
        commandId: command.commandId,
        commandOutcome: "APPLIED",
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
