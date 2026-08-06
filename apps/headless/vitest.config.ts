import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // The TypeScript build emits test modules into dist/. Keep both ordinary
    // and coverage runs bound to authoritative source tests after a build.
    include: ["src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary"],
      reportsDirectory: "coverage",
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts"],
      thresholds: {
        statements: 85,
        branches: 75,
        functions: 90,
        lines: 85,
      },
    },
  },
});
