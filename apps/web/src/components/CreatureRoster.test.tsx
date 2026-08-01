import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { CreatureView, GroupView } from "../model";
import { CreatureRoster } from "./CreatureRoster";

const names = ["Aro", "Bela", "Coro", "Dara", "Eren", "Fia", "Goro", "Hana"];

const creatures: CreatureView[] = names.map((name, index) => ({
  id: index + 1,
  name,
  color: 0x6f8a58 + index * 100,
  x: index,
  y: 1,
  alive: true,
  ...(index < 4 ? { groupId: 20 } : {}),
  role: index === 0 ? "Guard" : "Forager",
  desire: index === 0 ? "PROTECT_PERSON_OR_GROUP" : "SECURE_PROVISIONS",
  plan: index === 0 ? "GUARD_SHARED_ASSET" : "FORAGE_FOR_FOOD",
  goal: index === 0 ? "PROTECT_GROUP" : "GATHER_FOOD",
  action: index === 0 ? "GUARD" : "MOVING",
  actionPhase: index === 0 ? "WORKING" : "MOVING",
  reason: index === 0 ? "Protect shared storage" : "Known stock",
  summary: {
    desire: `${name} wants to secure provisions.`,
    plan: `${name} plans to forage for food.`,
    action: `${name} is moving.`,
    reason: `${name} is doing this because food is available.`,
  },
  route: [],
  health: 90,
  hunger: index === 1 ? 82 : 35,
  fatigue: 20,
  traits: [],
  inventory: index === 0 ? [{ kind: "FOOD", quantity: 2 }] : [],
  candidates: [],
  memories: [],
  relationships: [],
}));

const groups: GroupView[] = [
  {
    id: 20,
    name: "Fernhollow",
    memberIds: [1, 2, 3, 4],
    leaderId: 1,
    cohesion: 70,
    sharingNorm: 0.4,
    conflictNorm: 0,
    storageIds: [],
  },
];

describe("CreatureRoster", () => {
  it("keeps every creature and its readable state in one native list", () => {
    render(
      <CreatureRoster
        creatures={creatures}
        groups={groups}
        selectedId={1}
        keyboardFocusedId={null}
        onSelect={vi.fn()}
        onKeyboardFocus={vi.fn()}
        onHover={vi.fn()}
      />,
    );

    expect(screen.getAllByRole("listitem")).toHaveLength(8);
    expect(screen.getAllByText("Fernhollow")).toHaveLength(4);
    expect(screen.getByText("2 food")).toBeTruthy();
    expect(screen.getByText("Very hungry")).toBeTruthy();
    expect(screen.getByRole("button", { name: /^Aro,/ }).getAttribute("aria-pressed")).toBe(
      "true",
    );
  });

  it("uses a wrapping arrow-key roving focus and native button selection", () => {
    const onSelect = vi.fn();
    const onKeyboardFocus = vi.fn();
    const onHover = vi.fn();
    render(
      <CreatureRoster
        creatures={creatures}
        groups={groups}
        selectedId={null}
        keyboardFocusedId={null}
        onSelect={onSelect}
        onKeyboardFocus={onKeyboardFocus}
        onHover={onHover}
      />,
    );

    const aro = screen.getByRole("button", { name: /^Aro,/ });
    const bela = screen.getByRole("button", { name: /^Bela,/ });
    const hana = screen.getByRole("button", { name: /^Hana,/ });
    expect(aro.tabIndex).toBe(0);
    expect(bela.tabIndex).toBe(-1);

    aro.focus();
    fireEvent.keyDown(aro, { key: "ArrowDown" });
    expect(document.activeElement).toBe(bela);
    expect(bela.tabIndex).toBe(0);

    fireEvent.keyDown(bela, { key: "End" });
    expect(document.activeElement).toBe(hana);
    fireEvent.keyDown(hana, { key: "ArrowRight" });
    expect(document.activeElement).toBe(aro);

    fireEvent.click(aro);
    expect(onSelect).toHaveBeenCalledWith(1);
    fireEvent.pointerEnter(bela);
    expect(onHover).toHaveBeenCalledWith(2);
    expect(onKeyboardFocus).toHaveBeenCalledWith(2);
  });
});
