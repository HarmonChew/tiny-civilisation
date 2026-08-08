import type {
  ActionKind,
  CreatureState,
  DesireKind,
  EntityId,
  PlanKind,
  SimulationState,
} from "./types.js";

export const DESIRE_KINDS = [
  "RELIEVE_HUNGER",
  "RELIEVE_THIRST",
  "RECOVER_ENERGY",
  "SECURE_PROVISIONS",
  "PRESERVE_PRIVATE_RESERVE",
  "BELONG",
  "RECIPROCATE_OR_REPAIR",
  "PROTECT_PERSON_OR_GROUP",
  "AVOID_THREAT",
  "COMPLETE_SHARED_WORK",
  "RAISE_FAMILY",
  "HONOUR_THE_DEAD",
  "SETTLE_ESTATE",
] as const satisfies readonly DesireKind[];

export const PLAN_KINDS = [
  "EAT_CARRIED_FOOD",
  "DRINK_CARRIED_WATER",
  "FORAGE_FOR_FOOD",
  "FETCH_WATER",
  "WITHDRAW_SHARED_FOOD",
  "REST_SAFELY",
  "ESTABLISH_SHELTER",
  "BUILD_COMMUNAL_SHELTER",
  "REST_IN_SHELTER",
  "MAINTAIN_COMMUNAL_SHELTER",
  "BUILD_PRIVATE_RESERVE",
  "SHARE_WITH_OTHER",
  "SHARE_WATER_WITH_OTHER",
  "CONTRIBUTE_TO_STORAGE",
  "JOIN_COMMUNITY",
  "GUARD_SHARED_ASSET",
  "CONFRONT_THREAT",
  "ESCAPE_THREAT",
  "COMPLETE_STORAGE",
  "EXPLORE_SURROUNDINGS",
  "TAKE_FOOD",
  "FORM_A_FAMILY",
  "CARE_FOR_CHILD",
  "MOURN_A_LIFE",
  "CLAIM_AN_ESTATE",
] as const satisfies readonly PlanKind[];

const PLAN_BY_ACTION = {
  EXPLORE: "EXPLORE_SURROUNDINGS",
  GATHER_FOOD: "FORAGE_FOR_FOOD",
  GATHER_MATERIAL: "COMPLETE_STORAGE",
  GATHER_WATER: "FETCH_WATER",
  EAT: "EAT_CARRIED_FOOD",
  DRINK: "DRINK_CARRIED_WATER",
  REST: "REST_SAFELY",
  ESTABLISH_SHELTER_SITE: "ESTABLISH_SHELTER",
  BUILD_SHELTER: "BUILD_COMMUNAL_SHELTER",
  REST_SHELTERED: "REST_IN_SHELTER",
  MAINTAIN_SHELTER: "MAINTAIN_COMMUNAL_SHELTER",
  SHARE: "SHARE_WITH_OTHER",
  SHARE_WATER: "SHARE_WATER_WITH_OTHER",
  KEEP: "BUILD_PRIVATE_RESERVE",
  STEAL: "TAKE_FOOD",
  DEPOSIT: "CONTRIBUTE_TO_STORAGE",
  WITHDRAW: "WITHDRAW_SHARED_FOOD",
  BUILD_STORAGE: "COMPLETE_STORAGE",
  GUARD: "GUARD_SHARED_ASSET",
  ATTACK: "CONFRONT_THREAT",
  FLEE: "ESCAPE_THREAT",
  JOIN_GROUP: "JOIN_COMMUNITY",
  FORM_FAMILY: "FORM_A_FAMILY",
  CARE_FOR_YOUNG: "CARE_FOR_CHILD",
  MOURN: "MOURN_A_LIFE",
  CLAIM_ESTATE: "CLAIM_AN_ESTATE",
} as const satisfies Record<ActionKind, PlanKind>;

const ACTIONS_BY_DESIRE: Record<DesireKind, readonly ActionKind[]> = {
  RELIEVE_HUNGER: ["EAT", "GATHER_FOOD", "WITHDRAW", "STEAL"],
  RELIEVE_THIRST: ["DRINK", "GATHER_WATER"],
  RECOVER_ENERGY: ["REST", "REST_SHELTERED"],
  SECURE_PROVISIONS: ["GATHER_FOOD", "DEPOSIT", "EXPLORE"],
  PRESERVE_PRIVATE_RESERVE: ["KEEP", "GATHER_FOOD", "EAT", "EXPLORE"],
  BELONG: ["JOIN_GROUP", "SHARE", "SHARE_WATER", "BUILD_STORAGE", "GATHER_MATERIAL"],
  RECIPROCATE_OR_REPAIR: ["SHARE", "SHARE_WATER", "JOIN_GROUP"],
  PROTECT_PERSON_OR_GROUP: ["GUARD", "ATTACK"],
  AVOID_THREAT: ["FLEE", "REST"],
  COMPLETE_SHARED_WORK: [
    "GATHER_MATERIAL",
    "BUILD_STORAGE",
    "DEPOSIT",
    "ESTABLISH_SHELTER_SITE",
    "BUILD_SHELTER",
    "MAINTAIN_SHELTER",
  ],
  RAISE_FAMILY: ["FORM_FAMILY", "CARE_FOR_YOUNG"],
  HONOUR_THE_DEAD: ["MOURN"],
  SETTLE_ESTATE: ["CLAIM_ESTATE"],
};

export function planForAction(action: ActionKind): PlanKind {
  return PLAN_BY_ACTION[action];
}

export function desireSupportsAction(desire: DesireKind, action: ActionKind): boolean {
  return ACTIONS_BY_DESIRE[desire].includes(action);
}

export function desireForAction(
  state: SimulationState,
  creature: CreatureState,
  action: ActionKind,
  targetEntityId: EntityId | null = creature.activeAction?.targetEntityId ?? null,
): DesireKind {
  const retained = creature.activeDesire?.kind;
  if (retained && desireSupportsAction(retained, action)) return retained;

  switch (action) {
    case "EAT":
    case "WITHDRAW":
    case "STEAL":
      return "RELIEVE_HUNGER";
    case "DRINK":
    case "GATHER_WATER":
      return "RELIEVE_THIRST";
    case "GATHER_FOOD":
      return creature.needs.hunger >= 5_500
        ? "RELIEVE_HUNGER"
        : creature.inventory.food > 0
          ? "PRESERVE_PRIVATE_RESERVE"
          : "SECURE_PROVISIONS";
    case "REST":
    case "REST_SHELTERED":
      return "RECOVER_ENERGY";
    case "KEEP":
      return "PRESERVE_PRIVATE_RESERVE";
    case "SHARE":
    case "SHARE_WATER": {
      const helpedBefore = state.memories.some(
        (memory) =>
          memory.ownerId === creature.id &&
          memory.subjectEntityId === targetEntityId &&
          (memory.kind === "HELP_RECEIVED" || memory.kind === "HARM_RECEIVED"),
      );
      return helpedBefore ? "RECIPROCATE_OR_REPAIR" : "BELONG";
    }
    case "JOIN_GROUP":
      return "BELONG";
    case "FORM_FAMILY":
    case "CARE_FOR_YOUNG":
      return "RAISE_FAMILY";
    case "MOURN":
      return "HONOUR_THE_DEAD";
    case "CLAIM_ESTATE":
      return "SETTLE_ESTATE";
    case "DEPOSIT":
      return "SECURE_PROVISIONS";
    case "GATHER_MATERIAL":
    case "BUILD_STORAGE":
    case "ESTABLISH_SHELTER_SITE":
    case "BUILD_SHELTER":
    case "MAINTAIN_SHELTER":
      return "COMPLETE_SHARED_WORK";
    case "GUARD":
    case "ATTACK":
      return "PROTECT_PERSON_OR_GROUP";
    case "FLEE":
      return "AVOID_THREAT";
    case "EXPLORE":
      return creature.groupId === null ? "BELONG" : "SECURE_PROVISIONS";
  }
}

export function desireStrength(creature: CreatureState, desire: DesireKind): number {
  switch (desire) {
    case "RELIEVE_HUNGER":
      return creature.needs.hunger;
    case "RELIEVE_THIRST":
      return creature.needs.thirst;
    case "RECOVER_ENERGY":
      return creature.needs.fatigue;
    case "SECURE_PROVISIONS":
      return Math.max(0, 7_000 - creature.inventory.food * 1_000);
    case "PRESERVE_PRIVATE_RESERVE":
      return Math.max(1_000, 10_000 - creature.traits.generosity);
    case "BELONG":
      return creature.traits.sociability;
    case "RECIPROCATE_OR_REPAIR":
      return creature.traits.generosity;
    case "PROTECT_PERSON_OR_GROUP":
      return Math.max(creature.traits.loyalty, creature.traits.aggression);
    case "AVOID_THREAT":
      return 10_000 - creature.health;
    case "COMPLETE_SHARED_WORK":
      return Math.max(creature.traits.loyalty, creature.inventory.material * 2_000);
    case "RAISE_FAMILY":
      return Math.max(creature.traits.sociability, creature.traits.loyalty);
    case "HONOUR_THE_DEAD":
      return creature.traits.loyalty;
    case "SETTLE_ESTATE":
      return 6_000;
  }
}

export const DESIRE_LABELS: Record<DesireKind, string> = {
  RELIEVE_HUNGER: "find relief from hunger",
  RELIEVE_THIRST: "find safe water",
  RECOVER_ENERGY: "recover energy",
  SECURE_PROVISIONS: "secure provisions",
  PRESERVE_PRIVATE_RESERVE: "keep a private reserve",
  BELONG: "belong with others",
  RECIPROCATE_OR_REPAIR: "reciprocate or repair a bond",
  PROTECT_PERSON_OR_GROUP: "keep their people safe",
  AVOID_THREAT: "get clear of danger",
  COMPLETE_SHARED_WORK: "finish shared work",
  RAISE_FAMILY: "raise a family",
  HONOUR_THE_DEAD: "honour the dead",
  SETTLE_ESTATE: "settle an estate",
};

export const PLAN_LABELS: Record<PlanKind, string> = {
  EAT_CARRIED_FOOD: "eat carried food",
  DRINK_CARRIED_WATER: "drink carried water",
  FORAGE_FOR_FOOD: "forage for food",
  FETCH_WATER: "fetch potable water",
  WITHDRAW_SHARED_FOOD: "draw from the shared store",
  REST_SAFELY: "rest somewhere safe",
  ESTABLISH_SHELTER: "establish a communal shelter site",
  BUILD_COMMUNAL_SHELTER: "build the communal shelter",
  REST_IN_SHELTER: "rest in the communal shelter",
  MAINTAIN_COMMUNAL_SHELTER: "maintain the communal shelter",
  BUILD_PRIVATE_RESERVE: "hold a small reserve",
  SHARE_WITH_OTHER: "share with another creature",
  SHARE_WATER_WITH_OTHER: "share water with another creature",
  CONTRIBUTE_TO_STORAGE: "add to the shared reserve",
  JOIN_COMMUNITY: "approach a community",
  GUARD_SHARED_ASSET: "guard a shared asset",
  CONFRONT_THREAT: "confront a threat",
  ESCAPE_THREAT: "move away from danger",
  COMPLETE_STORAGE: "continue the shared store",
  EXPLORE_SURROUNDINGS: "look for an opportunity",
  TAKE_FOOD: "take food under pressure",
  FORM_A_FAMILY: "form a family",
  CARE_FOR_CHILD: "care for a child",
  MOURN_A_LIFE: "mourn a life",
  CLAIM_AN_ESTATE: "claim an estate",
};
