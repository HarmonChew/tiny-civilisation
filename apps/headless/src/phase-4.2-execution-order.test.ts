import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  PHASE_4_2_HOLDOUT_ATTEMPT_PATH,
  acquirePhase42HoldoutAttempt,
} from "./phase-4.2-corpora.js";
import {
  acquirePhase42HoldoutAfterCalibrationAuthentication,
  runAfterPhase42CalibrationAuthentication,
} from "./phase-4.2-execution-order.js";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("Phase 4.2 execution ordering", () => {
  it("authenticates discovery evidence before the first post-freeze run", () => {
    const order: string[] = [];

    const result = runAfterPhase42CalibrationAuthentication(
      () => order.push("authenticate-v1"),
      () => {
        order.push("first-v2-tick");
        return "complete";
      },
    );

    expect(result).toBe("complete");
    expect(order).toEqual(["authenticate-v1", "first-v2-tick"]);
  });

  it("authenticates v1 and v2 before acquiring the durable holdout marker", () => {
    const order: string[] = [];

    acquirePhase42HoldoutAfterCalibrationAuthentication(
      () => order.push("authenticate-v1"),
      () => order.push("authenticate-v2"),
      () => order.push("acquire-marker"),
    );

    expect(order).toEqual(["authenticate-v1", "authenticate-v2", "acquire-marker"]);
  });

  it.each(["discovery", "verification"] as const)(
    "leaves the holdout attempt marker absent when %s authentication fails",
    (failure) => {
      const directory = mkdtempSync(join(tmpdir(), "tiny-civ-auth-order-"));
      temporaryDirectories.push(directory);
      const markerPath = resolve(directory, PHASE_4_2_HOLDOUT_ATTEMPT_PATH);

      expect(() =>
        acquirePhase42HoldoutAfterCalibrationAuthentication(
          () => {
            if (failure === "discovery") throw new Error("v1 authentication failed");
          },
          () => {
            if (failure === "verification") throw new Error("v2 authentication failed");
          },
          () =>
            acquirePhase42HoldoutAttempt(
              {
                scenarios: [
                  "petri-world",
                  "split-banks",
                  "scattered-plenty",
                  "unequal-table",
                ],
                seeds: Array.from({ length: 64 }, (_, index) => index + 2_001),
                ticks: 10_000,
                outputPath: "docs/baselines/phase-4.2-holdout-v1.json.gz",
                frozenDefinitionsReady: true,
                definitionFingerprint: "a".repeat(64),
              },
              directory,
            ),
        ),
      ).toThrow(`v${failure === "discovery" ? "1" : "2"} authentication failed`);
      expect(existsSync(markerPath)).toBe(false);
    },
  );
});
