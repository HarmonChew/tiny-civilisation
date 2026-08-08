import { DESIRE_LABELS, PLAN_LABELS } from "./desires.js";
import { reasonFactText } from "./reason-facts.js";
import type {
  ActionKind,
  CreatureObservationSummary,
  CreatureState,
  ReasonFact,
} from "./types.js";

const ACTION_LABELS: Record<ActionKind, string> = {
  EXPLORE: "exploring",
  GATHER_FOOD: "gathering food",
  GATHER_MATERIAL: "gathering material",
  GATHER_WATER: "gathering water",
  EAT: "eating",
  DRINK: "drinking water",
  REST: "resting",
  ESTABLISH_SHELTER_SITE: "establishing a shelter site",
  BUILD_SHELTER: "building the communal shelter",
  REST_SHELTERED: "resting in shelter",
  MAINTAIN_SHELTER: "maintaining the communal shelter",
  SHARE: "sharing food",
  SHARE_WATER: "sharing water",
  KEEP: "holding a reserve",
  STEAL: "taking food",
  DEPOSIT: "depositing food",
  WITHDRAW: "withdrawing food",
  BUILD_STORAGE: "building the shared store",
  GUARD: "guarding",
  ATTACK: "confronting a threat",
  FLEE: "fleeing",
  JOIN_GROUP: "approaching a group",
  FORM_FAMILY: "forming a family",
  CARE_FOR_YOUNG: "caring for a child",
  MOURN: "mourning",
  CLAIM_ESTATE: "claiming an estate",
};

function cloneFact(fact: ReasonFact): ReasonFact {
  return { ...fact, sourceEventIds: [...fact.sourceEventIds] };
}

function activeStateFact(
  creature: CreatureState,
  key: "active_desire" | "active_plan" | "active_action",
  label: string,
  value: string,
  capturedAtTick: number,
): ReasonFact {
  return {
    kind: "WORLD",
    key,
    label,
    value,
    unit: "LABEL",
    sourceEntityId: creature.id,
    sourceEventIds: [],
    capturedAtTick,
  };
}

export function projectCreatureObservationSummary(
  creature: CreatureState,
): CreatureObservationSummary {
  const reason = creature.activePlan?.strongestReason ?? null;
  const factRefs = reason ? [cloneFact(reason)] : [];
  const desireFact = creature.activeDesire
    ? activeStateFact(
        creature,
        "active_desire",
        "Active desire",
        creature.activeDesire.kind,
        creature.activeDesire.startedAtTick,
      )
    : null;
  const planFact = creature.activePlan
    ? activeStateFact(
        creature,
        "active_plan",
        "Active plan",
        creature.activePlan.kind,
        creature.activePlan.startedAtTick,
      )
    : null;
  const actionFact = creature.activeAction
    ? activeStateFact(
        creature,
        "active_action",
        "Active action",
        creature.activeAction.kind,
        creature.activeAction.startedAtTick,
      )
    : null;
  return {
    desire: {
      text: creature.activeDesire
        ? `${creature.name} wants to ${DESIRE_LABELS[creature.activeDesire.kind]}.`
        : `${creature.name} is deciding what matters next.`,
      factRefs: desireFact ? [desireFact] : [],
    },
    plan: {
      text: creature.activePlan
        ? `${creature.name} plans to ${PLAN_LABELS[creature.activePlan.kind]}.`
        : `${creature.name} has no settled plan yet.`,
      factRefs: planFact ? [planFact, ...factRefs] : factRefs,
    },
    action: {
      text: creature.activeAction
        ? `${creature.name} is ${ACTION_LABELS[creature.activeAction.kind]}.`
        : `${creature.name} is considering the next step.`,
      factRefs: actionFact ? [actionFact] : [],
    },
    reason: {
      text: reason
        ? `${creature.name} is doing this because ${reasonFactText(reason)}.`
        : `No factual reason is retained for ${creature.name}'s current step.`,
      factRefs,
    },
  };
}
