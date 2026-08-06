import type { Graphics } from "pixi.js";
import { describe, expect, it, vi } from "vitest";
import type { ResourceView, StructureView } from "../../model";
import {
  drawResourceMark,
  drawStructureMark,
  resourceDepletionLevel,
  shelterPresentationState,
} from "./world-marks";

class GraphicsStub {
  visible = true;
  readonly position = { set: vi.fn() };
  readonly calls: string[] = [];

  private call(name: string): this {
    this.calls.push(name);
    return this;
  }

  clear() {
    return this.call("clear");
  }
  circle() {
    return this.call("circle");
  }
  rect() {
    return this.call("rect");
  }
  moveTo() {
    return this.call("moveTo");
  }
  lineTo() {
    return this.call("lineTo");
  }
  bezierCurveTo() {
    return this.call("bezierCurveTo");
  }
  closePath() {
    return this.call("closePath");
  }
  arc() {
    return this.call("arc");
  }
  fill() {
    return this.call("fill");
  }
  stroke() {
    return this.call("stroke");
  }
}

const water = (stock: number): ResourceView => ({
  id: 8,
  kind: "WATER",
  x: 3,
  y: 4,
  stock,
  capacity: 16,
});

describe("resource marks", () => {
  it("keeps depleted water sources visible with a segmented gauge and empty slash", () => {
    const mark = new GraphicsStub();
    drawResourceMark(mark as unknown as Graphics, water(0), false);

    expect(mark.visible).toBe(true);
    expect(mark.calls.filter((call) => call === "rect")).toHaveLength(4);
    expect(mark.calls.filter((call) => call === "lineTo").length).toBeGreaterThan(0);
    expect(mark.position.set).toHaveBeenCalledWith(3.5, 4.5);
  });

  it("classifies depletion using stock geometry rather than presentation color", () => {
    expect(resourceDepletionLevel(0, 16)).toBe("depleted");
    expect(resourceDepletionLevel(4, 16)).toBe("low");
    expect(resourceDepletionLevel(5, 16)).toBe("available");
    expect(resourceDepletionLevel(16, 16)).toBe("full");
  });
});

describe("shelter marks", () => {
  const shelter = (overrides: Partial<StructureView> = {}): StructureView => ({
    id: 72,
    kind: "SHELTER",
    x: 8,
    y: 6,
    groupId: 3,
    progress: 100,
    stored: 0,
    capacity: 6,
    condition: 76,
    baseCapacity: 6,
    effectiveCapacity: 5,
    reservedSpaces: 3,
    restingCreatures: 2,
    memberOccupancy: 1,
    guestOccupancy: 1,
    upkeepNeeded: false,
    ...overrides,
  });

  it("classifies site, active, degraded, and abandoned shapes without relying on color", () => {
    expect(shelterPresentationState(shelter({ kind: "SHELTER_SITE" }))).toBe("site");
    expect(shelterPresentationState(shelter())).toBe("active");
    expect(shelterPresentationState(shelter({ condition: 42 }))).toBe("degraded");
    expect(shelterPresentationState(shelter({ kind: "ABANDONED_SHELTER" }))).toBe(
      "abandoned",
    );
    expect(shelterPresentationState(shelter({ kind: "STORAGE" }))).toBeNull();
  });

  it("draws capacity spaces and distinct resting occupancy marks", () => {
    const mark = new GraphicsStub();
    drawStructureMark(mark as unknown as Graphics, shelter());

    expect(mark.calls.filter((call) => call === "circle")).toHaveLength(2);
    expect(mark.calls.filter((call) => call === "rect").length).toBeGreaterThanOrEqual(8);
    expect(mark.position.set).toHaveBeenCalledWith(8.5, 6.5);
  });
});
