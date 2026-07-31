import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const port = Number.parseInt(process.env.PLAYWRIGHT_PORT ?? "43173", 10);
const baseURL = `http://127.0.0.1:${port}`;

if (!Number.isInteger(port) || port < 1 || port > 65_535) {
  throw new Error(`Invalid PLAYWRIGHT_PORT: ${process.env.PLAYWRIGHT_PORT}`);
}

function waitForExit(child) {
  return new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => resolve({ code, signal }));
  });
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

const serverOutput = [];
const vite = spawn(
  process.execPath,
  [
    path.join(root, "node_modules/vite/bin/vite.js"),
    "apps/web",
    "--host",
    "127.0.0.1",
    "--port",
    String(port),
    "--strictPort",
  ],
  {
    cwd: root,
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  },
);

for (const stream of [vite.stdout, vite.stderr]) {
  stream.setEncoding("utf8");
  stream.on("data", (chunk) => {
    serverOutput.push(chunk);
    if (process.env.DEBUG_E2E_SERVER) process.stderr.write(chunk);
  });
}

async function waitForVite() {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (vite.exitCode !== null) {
      throw new Error(`Vite exited before startup.\n${serverOutput.join("")}`);
    }

    if (serverOutput.join("").includes("ready in")) {
      try {
        const response = await fetch(baseURL);
        const html = await response.text();
        if (response.ok && html.includes("Tiny Civilisation")) return;
      } catch {
        // Vite can announce its URL just before its listener accepts requests.
      }
    }
    await delay(100);
  }
  throw new Error(`Vite did not become ready at ${baseURL}.\n${serverOutput.join("")}`);
}

async function stopVite() {
  if (vite.exitCode !== null) return;
  const exit = waitForExit(vite);
  vite.kill();
  await Promise.race([exit, delay(5_000)]);
  if (vite.exitCode === null) {
    vite.kill("SIGKILL");
    await exit;
  }
}

let testProcess;
const stopOnSignal = (signal) => {
  if (testProcess?.exitCode === null) testProcess.kill(signal);
};
const onSigint = () => stopOnSignal("SIGINT");
const onSigterm = () => stopOnSignal("SIGTERM");

try {
  await waitForVite();
  testProcess = spawn(
    process.execPath,
    [
      path.join(root, "node_modules/@playwright/test/cli.js"),
      "test",
      ...process.argv.slice(2),
    ],
    {
      cwd: root,
      env: { ...process.env, PLAYWRIGHT_PORT: String(port) },
      stdio: "inherit",
      windowsHide: true,
    },
  );

  process.once("SIGINT", onSigint);
  process.once("SIGTERM", onSigterm);
  const { code } = await waitForExit(testProcess);
  process.exitCode = code ?? 1;
} finally {
  process.removeListener("SIGINT", onSigint);
  process.removeListener("SIGTERM", onSigterm);
  await stopVite();
}
