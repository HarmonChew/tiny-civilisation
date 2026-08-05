import type { Graphics } from "pixi.js";
import { describe, expect, it, vi } from "vitest";
import type { ResourceView } from "../../model";
import { drawResourceMark, resourceDepletionLevel } from "./world-marks";

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
