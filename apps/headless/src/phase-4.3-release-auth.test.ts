import { createHash } from "node:crypto";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { authenticatePhase43ReleaseEvidenceArtifact } from "./phase-4.3-release-auth.js";

const commit = "b".repeat(40);
const fingerprint = "c".repeat(64);
const packageSha256 = "d".repeat(64);

function evidence(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schemaVersion: 1,
    kind: "tiny-civilisation/phase-4.3-automated-release-check",
    status: "PASS",
    releaseCandidateCommit: commit,
    definitionFingerprint: fingerprint,
    packageSha256,
    ...overrides,
  };
}

function writeEvidence(value: unknown): { path: string; sha256: string } {
  const directory = mkdtempSync(join(tmpdir(), "tiny-civ-phase43-release-auth-"));
  const path = join(directory, "evidence.json");
  const bytes = Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
  writeFileSync(path, bytes);
  return { path, sha256: createHash("sha256").update(bytes).digest("hex") };
}

describe("Phase 4.3 release evidence authentication", () => {
  it("binds a passing evidence record to commit, definition, and package", () => {
    const artifact = writeEvidence(evidence());
    expect(
      authenticatePhase43ReleaseEvidenceArtifact(
        artifact.path,
        artifact.sha256,
        "tiny-civilisation/phase-4.3-automated-release-check",
        commit,
        fingerprint,
      ),
    ).toEqual({ packageSha256 });
  });

  it.each([
    ["status", "FAIL"],
    ["releaseCandidateCommit", "e".repeat(40)],
    ["definitionFingerprint", "e".repeat(64)],
    ["packageSha256", "not-a-hash"],
  ] as const)("rejects mismatched %s evidence", (field, value) => {
    const artifact = writeEvidence(evidence({ [field]: value }));
    expect(() =>
      authenticatePhase43ReleaseEvidenceArtifact(
        artifact.path,
        artifact.sha256,
        "tiny-civilisation/phase-4.3-automated-release-check",
        commit,
        fingerprint,
        packageSha256,
      ),
    ).toThrow();
  });

  it("rejects bytes that do not match reviewed provenance", () => {
    const artifact = writeEvidence(evidence());
    expect(() =>
      authenticatePhase43ReleaseEvidenceArtifact(
        artifact.path,
        "0".repeat(64),
        "tiny-civilisation/phase-4.3-automated-release-check",
        commit,
        fingerprint,
      ),
    ).toThrow("SHA-256 mismatch");
  });
});
