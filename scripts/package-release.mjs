import { Buffer } from "node:buffer";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { deflateRawSync, gzipSync } from "node:zlib";

const repositoryRoot = resolve(import.meta.dirname, "..");
const webDist = resolve(repositoryRoot, "apps/web/dist");
const packageLock = resolve(repositoryRoot, "package-lock.json");
const npmCli = [
  process.env.npm_execpath,
  resolve(dirname(process.execPath), "node_modules/npm/bin/npm-cli.js"),
  resolve(dirname(process.execPath), "../lib/node_modules/npm/bin/npm-cli.js"),
].find((path) => path !== undefined && existsSync(path));
if (npmCli === undefined) throw new Error("Could not locate npm-cli.js.");
const rootPackage = JSON.parse(
  readFileSync(resolve(repositoryRoot, "package.json"), "utf8"),
);

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function git(...args) {
  return execFileSync("git", args, {
    cwd: repositoryRoot,
    encoding: "utf8",
    windowsHide: true,
  }).trim();
}

function releaseArguments(args) {
  let outputDirectory = resolve(repositoryRoot, "release");
  let allowDirty = false;
  let automationManifestPath;
  for (let index = 0; index < args.length; index++) {
    const argument = args[index];
    if (argument === "--allow-dirty") {
      allowDirty = true;
      continue;
    }
    if (argument === "--output") {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error("--output requires a directory.");
      }
      outputDirectory = resolve(repositoryRoot, value);
      index++;
      continue;
    }
    if (argument === "--automation-manifest") {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error("--automation-manifest requires a JSON file.");
      }
      automationManifestPath = resolve(value);
      index++;
      continue;
    }
    throw new Error(`Unknown release-package option: ${String(argument)}`);
  }
  return { outputDirectory, allowDirty, automationManifestPath };
}

function readJson(path, label) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new Error(`${label} is not valid JSON: ${error.message}`, { cause: error });
  }
}

function readAutomationManifest(path) {
  if (path === undefined) {
    return {
      schemaVersion: 1,
      kind: "tiny-civilisation/phase-4.3-automated-test-manifest",
      status: "NOT_ATTESTED",
      protectedPhase43HoldoutExecuted: false,
      commands: [],
    };
  }
  const manifest = readJson(path, "Automated test manifest");
  if (
    manifest.schemaVersion !== 1 ||
    manifest.kind !== "tiny-civilisation/phase-4.3-automated-test-manifest" ||
    manifest.status !== "PASS" ||
    manifest.protectedPhase43HoldoutExecuted !== false ||
    !Array.isArray(manifest.commands) ||
    manifest.commands.length === 0 ||
    manifest.commands.some(
      (command) =>
        typeof command !== "object" ||
        command === null ||
        typeof command.id !== "string" ||
        command.status !== "PASS",
    )
  ) {
    throw new Error(
      "Automated test manifest must be schema 1, PASS every named command, and state that the protected Phase 4.3 holdout was not executed.",
    );
  }
  return manifest;
}

function phase43DefinitionRecord() {
  const output = execFileSync(
    process.execPath,
    [npmCli, "run", "--silent", "headless", "--", "phase-4.3-definition-contract"],
    {
      cwd: repositoryRoot,
      encoding: "utf8",
      windowsHide: true,
    },
  ).trim();
  const record = JSON.parse(output);
  if (
    record.schemaVersion !== 1 ||
    record.fingerprintAlgorithm !== "SHA256_CANONICAL_JSON_V1" ||
    !/^[0-9a-f]{64}$/u.test(record.fingerprint) ||
    typeof record.contract !== "object" ||
    record.contract === null ||
    typeof record.contract.versions !== "object" ||
    record.contract.versions === null
  ) {
    throw new Error("Official Phase 4.3 definition command returned an invalid record.");
  }
  return record;
}

function browserManifest() {
  const playwrightPackage = readJson(
    resolve(repositoryRoot, "node_modules/@playwright/test/package.json"),
    "Playwright package metadata",
  );
  const registry = readJson(
    resolve(repositoryRoot, "node_modules/playwright-core/browsers.json"),
    "Playwright browser registry",
  );
  const requested = new Set(["chromium", "firefox", "webkit"]);
  const browsers = registry.browsers
    .filter((browser) => requested.has(browser.name))
    .map(({ name, browserVersion, revision, title }) => ({
      name,
      title,
      browserVersion,
      revision,
    }));
  if (browsers.length !== requested.size) {
    throw new Error("Playwright registry did not contain all three release browsers.");
  }
  return { playwright: playwrightPackage.version, browsers };
}

function collectFiles(directory) {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...collectFiles(path));
    else if (entry.isFile()) files.push(path);
  }
  return files.sort((left, right) => left.localeCompare(right));
}

function crc32(bytes) {
  let crc = 0xffff_ffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb8_8320 : 0);
    }
  }
  return (crc ^ 0xffff_ffff) >>> 0;
}

function dosDateTime(date) {
  const year = Math.max(1980, Math.min(2107, date.getUTCFullYear()));
  const month = date.getUTCMonth() + 1;
  const day = date.getUTCDate();
  const hours = date.getUTCHours();
  const minutes = date.getUTCMinutes();
  const seconds = Math.floor(date.getUTCSeconds() / 2);
  return {
    date: ((year - 1980) << 9) | (month << 5) | day,
    time: (hours << 11) | (minutes << 5) | seconds,
  };
}

function zip(entries, modifiedAt) {
  const localParts = [];
  const centralParts = [];
  let localOffset = 0;
  const timestamp = dosDateTime(modifiedAt);

  for (const entry of entries) {
    const name = Buffer.from(entry.path, "utf8");
    const compressed = deflateRawSync(entry.contents, { level: 9 });
    const checksum = crc32(entry.contents);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x0403_4b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(8, 8);
    local.writeUInt16LE(timestamp.time, 10);
    local.writeUInt16LE(timestamp.date, 12);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(entry.contents.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    localParts.push(local, name, compressed);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x0201_4b50, 0);
    central.writeUInt16LE(0x0314, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(timestamp.time, 12);
    central.writeUInt16LE(timestamp.date, 14);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(entry.contents.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(localOffset, 42);
    centralParts.push(central, name);
    localOffset += local.length + name.length + compressed.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x0605_4b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(localOffset, 16);
  end.writeUInt16LE(0, 20);
  return Buffer.concat([...localParts, centralDirectory, end]);
}

function main() {
  const { outputDirectory, allowDirty, automationManifestPath } = releaseArguments(
    process.argv.slice(2),
  );
  if (!existsSync(webDist)) {
    throw new Error("The production web build is absent; run npm run build first.");
  }
  const dirty = git("status", "--porcelain");
  if (dirty && !allowDirty) {
    throw new Error(
      "Release packaging requires a clean tracked worktree. Use --allow-dirty only for local packaging diagnostics.",
    );
  }

  const commit = git("rev-parse", "HEAD");
  const sourceTreeGitObjectId = git("rev-parse", `${commit}^{tree}`);
  const commitTimestamp = Number(git("show", "-s", "--format=%ct", commit));
  const modifiedAt = new Date(commitTimestamp * 1_000);
  const rootName = `tiny-civilisation-web-${commit.slice(0, 12)}`;
  const automationManifest = readAutomationManifest(automationManifestPath);
  const phase43Definition = phase43DefinitionRecord();
  const releaseBrowsers = browserManifest();
  const npmVersion = execFileSync(process.execPath, [npmCli, "--version"], {
    cwd: repositoryRoot,
    encoding: "utf8",
    windowsHide: true,
  }).trim();
  const files = collectFiles(webDist).map((path) => {
    const contents = readFileSync(path);
    return {
      path: relative(webDist, path).split(sep).join("/"),
      contents,
      bytes: contents.length,
      gzipBytes: gzipSync(contents, { level: 9 }).length,
      sha256: sha256(contents),
    };
  });
  if (!files.some((file) => file.path === "index.html")) {
    throw new Error("The production web build does not contain index.html.");
  }
  const treeHash = createHash("sha256");
  for (const file of files) {
    treeHash.update(file.path, "utf8");
    treeHash.update("\0", "utf8");
    treeHash.update(file.sha256, "utf8");
    treeHash.update("\0", "utf8");
    treeHash.update(file.bytes.toString(), "utf8");
    treeHash.update("\n", "utf8");
  }
  const bundleFiles = files.map(({ path, bytes, gzipBytes, sha256: fileSha256 }) => ({
    path,
    bytes,
    gzipBytes,
    sha256: fileSha256,
  }));
  const bundleTotals = bundleFiles.reduce(
    (total, file) => ({
      bytes: total.bytes + file.bytes,
      gzipBytes: total.gzipBytes + file.gzipBytes,
    }),
    { bytes: 0, gzipBytes: 0 },
  );
  const manifest = {
    schemaVersion: 1,
    kind: "tiny-civilisation/web-release-candidate",
    evidenceBoundary:
      "AUTOMATED_CANDIDATE_ONLY_PHASE_4_3_HOLDOUT_NVDA_AND_HUMAN_EVIDENCE_NOT_INCLUDED",
    version: rootPackage.version,
    commit,
    sourceTreeGitObjectId,
    commitTime: modifiedAt.toISOString(),
    sourceDirty: Boolean(dirty),
    runtime: {
      node: process.version,
      npm: npmVersion,
      platform: process.platform,
      architecture: process.arch,
    },
    browserMatrix: releaseBrowsers,
    phase43Definition: {
      status: phase43Definition.status,
      fingerprintAlgorithm: phase43Definition.fingerprintAlgorithm,
      fingerprint: phase43Definition.fingerprint,
      versions: phase43Definition.contract.versions,
    },
    automatedTestManifest: automationManifest,
    packageLockSha256: sha256(readFileSync(packageLock)),
    webTreeSha256: treeHash.digest("hex"),
    bundle: { totals: bundleTotals, files: bundleFiles },
    files: bundleFiles,
  };
  const manifestContents = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  const archive = zip(
    [
      ...files.map((file) => ({
        path: `${rootName}/${file.path}`,
        contents: file.contents,
      })),
      { path: `${rootName}/release-manifest.json`, contents: manifestContents },
    ],
    modifiedAt,
  );
  const archiveName = `${rootName}.zip`;
  const archivePath = resolve(outputDirectory, archiveName);
  const checksumPath = `${archivePath}.sha256`;
  const automatedEvidenceName = `${rootName}-automated-release-check-v1.json`;
  const automatedEvidencePath = resolve(outputDirectory, automatedEvidenceName);
  const automatedEvidenceChecksumPath = `${automatedEvidencePath}.sha256`;
  const expectedTargets = [archivePath, checksumPath];
  if (automationManifest.status === "PASS") {
    expectedTargets.push(automatedEvidencePath, automatedEvidenceChecksumPath);
  }
  if (expectedTargets.some(existsSync)) {
    throw new Error(
      `Release target for ${basename(archivePath)} already exists; immutable packages and evidence are never overwritten.`,
    );
  }
  mkdirSync(outputDirectory, { recursive: true });
  writeFileSync(archivePath, archive, { flag: "wx" });
  const archiveSha256 = sha256(archive);
  writeFileSync(checksumPath, `${archiveSha256}  ${archiveName}\n`, {
    encoding: "utf8",
    flag: "wx",
  });
  let automatedEvidenceSha256;
  if (automationManifest.status === "PASS") {
    const automatedEvidence = Buffer.from(
      `${JSON.stringify(
        {
          schemaVersion: 1,
          kind: "tiny-civilisation/phase-4.3-automated-release-check",
          status: "PASS",
          releaseCandidateCommit: commit,
          sourceTreeGitObjectId,
          definitionFingerprint: phase43Definition.fingerprint,
          packageSha256: archiveSha256,
          package: archiveName,
          releaseManifestSha256: sha256(manifestContents),
          commitTime: modifiedAt.toISOString(),
          runtime: manifest.runtime,
          browserMatrix: releaseBrowsers,
          phase43Versions: phase43Definition.contract.versions,
          bundle: manifest.bundle,
          automatedTestManifest: automationManifest,
          evidenceBoundary: manifest.evidenceBoundary,
        },
        null,
        2,
      )}\n`,
      "utf8",
    );
    automatedEvidenceSha256 = sha256(automatedEvidence);
    writeFileSync(automatedEvidencePath, automatedEvidence, { flag: "wx" });
    writeFileSync(
      automatedEvidenceChecksumPath,
      `${automatedEvidenceSha256}  ${automatedEvidenceName}\n`,
      { encoding: "utf8", flag: "wx" },
    );
  }
  process.stdout.write(
    `${JSON.stringify(
      {
        archivePath: relative(repositoryRoot, archivePath).split(sep).join("/"),
        checksumPath: relative(repositoryRoot, checksumPath).split(sep).join("/"),
        archiveBytes: archive.length,
        archiveSha256,
        sourceTreeGitObjectId,
        webTreeSha256: manifest.webTreeSha256,
        definitionFingerprint: phase43Definition.fingerprint,
        automatedEvidencePath:
          automationManifest.status === "PASS"
            ? relative(repositoryRoot, automatedEvidencePath).split(sep).join("/")
            : null,
        automatedEvidenceChecksumPath:
          automationManifest.status === "PASS"
            ? relative(repositoryRoot, automatedEvidenceChecksumPath).split(sep).join("/")
            : null,
        automatedEvidenceSha256: automatedEvidenceSha256 ?? null,
        evidenceBoundary: manifest.evidenceBoundary,
      },
      null,
      2,
    )}\n`,
  );
}

main();
