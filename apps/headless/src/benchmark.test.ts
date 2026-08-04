import { describe, expect, it } from "vitest";

import { parseBenchmarkScenario } from "./benchmark.js";

describe("headless benchmark CLI", () => {
  it("keeps the Petri default and accepts a supported scenario", () => {
    expect(parseBenchmarkScenario([])).toBe("petri-world");
    expect(parseBenchmarkScenario(["--scenario", "split-banks"])).toBe("split-banks");
  });

  it("rejects missing and unsupported scenario values", () => {
    expect(() => parseBenchmarkScenario(["--scenario"])).toThrow(
      "--scenario requires a value.",
    );
    expect(() => parseBenchmarkScenario(["--scenario", "missing-world"])).toThrow(
      /--scenario must be one of/u,
    );
  });

  it("recognises help without running the benchmark", () => {
    expect(parseBenchmarkScenario(["--help"])).toBeNull();
  });
});
