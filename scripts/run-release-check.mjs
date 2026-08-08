import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const npmCli = [
  process.env.npm_execpath,
  resolve(dirname(process.execPath), "node_modules/npm/bin/npm-cli.js"),
  resolve(dirname(process.execPath), "../lib/node_modules/npm/bin/npm-cli.js"),
].find((path) => path !== undefined && existsSync(path));
if (npmCli === undefined) throw new Error("Could not locate npm-cli.js.");
const npmRun = (...args) => ({ command: process.execPath, args: [npmCli, ...args] });

const args = process.argv.slice(2);
const skipPackage = args.includes("--skip-package");
if (args.some((argument) => argument !== "--skip-package")) {
  throw new Error(`Unknown release-check option: ${args.join(" ")}`);
}

const commands = [
  { id: "format", ...npmRun("run", "format:check") },
  { id: "lint", ...npmRun("run", "lint") },
  { id: "typecheck", ...npmRun("run", "typecheck") },
  { id: "coverage", ...npmRun("run", "test:coverage") },
  { id: "golden", ...npmRun("run", "test:golden") },
  { id: "build", ...npmRun("run", "build") },
  ...["petri-world", "split-banks", "scattered-plenty", "unequal-table"].map(
    (scenario) => ({
      id: `benchmark:${scenario}`,
      ...npmRun("run", "benchmark", "--", "--scenario", scenario),
    }),
  ),
  {
    id: "e2e:chromium",
    command: process.execPath,
    args: ["scripts/run-e2e.mjs"],
  },
  {
    id: "e2e:release-matrix",
    command: process.execPath,
    args: ["scripts/run-e2e.mjs", "--config", "playwright.release.config.ts"],
  },
];

process.stdout.write(
  "Release-candidate automation only: this command does not execute the protected Phase 4.3 holdout and does not claim NVDA or participant evidence.\n",
);

const passedCommands = [];
for (const item of commands) {
  process.stdout.write(`\n> ${item.command} ${item.args.join(" ")}\n`);
  const result = spawnSync(item.command, item.args, {
    cwd: root,
    env: process.env,
    stdio: "inherit",
    windowsHide: true,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
  passedCommands.push({ id: item.id, status: "PASS" });
}

if (skipPackage) {
  process.stdout.write(
    "Release package intentionally skipped; all pre-package release checks passed.\n",
  );
} else {
  const temporaryDirectory = mkdtempSync(join(tmpdir(), "tiny-civ-release-check-"));
  const automationManifestPath = join(temporaryDirectory, "automated-test-manifest.json");
  try {
    writeFileSync(
      automationManifestPath,
      `${JSON.stringify(
        {
          schemaVersion: 1,
          kind: "tiny-civilisation/phase-4.3-automated-test-manifest",
          status: "PASS",
          protectedPhase43HoldoutExecuted: false,
          commands: passedCommands,
        },
        null,
        2,
      )}\n`,
      { encoding: "utf8", flag: "wx" },
    );
    const packageArgs = [
      "scripts/package-release.mjs",
      "--automation-manifest",
      automationManifestPath,
    ];
    process.stdout.write(`\n> ${process.execPath} ${packageArgs.join(" ")}\n`);
    const result = spawnSync(process.execPath, packageArgs, {
      cwd: root,
      env: process.env,
      stdio: "inherit",
      windowsHide: true,
    });
    if (result.error) throw result.error;
    if (result.status !== 0) {
      throw new Error(`Release packaging failed with status ${String(result.status)}.`);
    }
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
}
