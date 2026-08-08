import { describe, expect, it } from "vitest";

import {
  acquirePhase43HoldoutAfterReleaseAuthentication,
  runAfterPhase43CalibrationAuthentication,
} from "./phase-4.3-execution-order.js";

describe("Phase 4.3 protected execution ordering", () => {
  it("authenticates calibration provenance before executing", () => {
    const order: string[] = [];
    expect(
      runAfterPhase43CalibrationAuthentication(
        () => order.push("authenticate"),
        () => {
          order.push("execute");
          return 7;
        },
      ),
    ).toBe(7);
    expect(order).toEqual(["authenticate", "execute"]);
  });

  it("authenticates calibration and release-candidate gates before consuming the holdout", () => {
    const order: string[] = [];
    acquirePhase43HoldoutAfterReleaseAuthentication(
      () => order.push("discovery"),
      () => order.push("verification"),
      () => order.push("release-check"),
      () => order.push("deployment-smoke"),
      () => order.push("nvda"),
      () => order.push("attempt"),
    );
    expect(order).toEqual([
      "discovery",
      "verification",
      "release-check",
      "deployment-smoke",
      "nvda",
      "attempt",
    ]);
  });

  it.each([
    "discovery",
    "verification",
    "release-check",
    "deployment-smoke",
    "nvda",
  ] as const)("never acquires the marker when %s authentication fails", (failure) => {
    let acquired = false;
    const step = (name: typeof failure) => () => {
      if (failure === name) throw new Error(`${name} failed`);
    };
    expect(() =>
      acquirePhase43HoldoutAfterReleaseAuthentication(
        step("discovery"),
        step("verification"),
        step("release-check"),
        step("deployment-smoke"),
        step("nvda"),
        () => {
          acquired = true;
        },
      ),
    ).toThrow(`${failure} failed`);
    expect(acquired).toBe(false);
  });
});
