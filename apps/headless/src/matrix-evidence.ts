import { createHash } from "node:crypto";
import {
  existsSync,
  linkSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { gzipSync } from "node:zlib";

export interface MatrixOutcomeIncidence {
  readonly labelId: string;
  readonly title: string;
  readonly occurrences: number;
  readonly eligibleRuns: number;
}

export interface MatrixPairedComparison {
  readonly leftScenarioId: string;
  readonly rightScenarioId: string;
  readonly metrics: readonly {
    readonly metricId: string;
    readonly dimension: string;
    readonly missingValuePolicy: string;
    readonly summary: {
      readonly pairedSeedCount: number;
      readonly meanDelta: number | null;
    };
    readonly effect: { readonly value: number | null };
  }[];
}

export interface MatrixScenarioEvidence {
  readonly scenario: { readonly scenarioId: string };
  readonly activity?: {
    readonly settlement?: {
      readonly seedDistributions: Readonly<
        Record<
          | "activeShelterCount"
          | "shelteredRestShare"
          | "meanShelterCondition"
          | "reservationUtilization"
          | "guestUseEvents"
          | "deniedClaims",
          { readonly samples: number; readonly median: number | null }
        >
      >;
    };
  };
  readonly analysis: {
    readonly outcomes: {
      readonly incidence: readonly MatrixOutcomeIncidence[];
    };
    readonly hardInvariants: { readonly status: string };
    readonly expectedBands: {
      readonly status: string;
      readonly provenance: {
        readonly releaseOutcomeClaim: false;
        readonly calibrationEvidence: string;
        readonly holdoutEvidence: string;
      };
      readonly scenarioOutcomeBands: {
        readonly tableVersion: number;
        readonly status: string;
        readonly releaseClaim: false;
        readonly provenance: {
          readonly artifactSha256: string | null;
          readonly classifierVersion: number;
          readonly basis?: string;
        };
        readonly evaluations: readonly {
          readonly labelId: string;
          readonly status: string;
          readonly observed: number | null;
          readonly eligibleRuns: number;
          readonly threshold: number;
        }[];
        readonly dominance: {
          readonly status: string;
          readonly rationaleFailures: readonly string[];
          readonly evaluations: readonly {
            readonly labelId: string;
            readonly status: string;
            readonly incidence: number | null;
            readonly rationaleRequired: boolean;
            readonly rationale: {
              readonly rationaleId: string;
              readonly mechanicsAndScenarioBasis: string;
            } | null;
          }[];
        };
      };
    };
  };
}

export interface MatrixEvidenceReport {
  readonly schemaVersion: number;
  readonly command: "matrix";
  readonly configuration: {
    readonly [key: string]: unknown;
    readonly corpus: string;
    readonly scenarios: readonly string[];
    readonly seeds: readonly number[];
    readonly ticksPerRun: number;
    readonly sampleEveryTicks: number;
    readonly ordering: string;
    readonly repeatCount: number;
    readonly executionsPerCase: number;
    readonly scenarioAnalysisSchemaVersion?: number;
    readonly outcomeClassifierVersion?: number;
    readonly phase42DefinitionContractSchemaVersion?: number;
    readonly phase42DefinitionFingerprintAlgorithm?: string;
    readonly phase42DefinitionStatus?: "CANDIDATE" | "FROZEN";
    readonly phase42DefinitionFingerprint?: string;
  };
  readonly runs: readonly unknown[];
  readonly aggregate: {
    readonly [key: string]: unknown;
    readonly byScenario: readonly MatrixScenarioEvidence[];
  };
  readonly analysis: {
    readonly [key: string]: unknown;
    readonly determinism: {
      readonly [key: string]: unknown;
      readonly comparisonCount: number;
      readonly allExactMatches: boolean | null;
      readonly hardInvariant: {
        readonly [key: string]: unknown;
        readonly status: string;
      };
    };
    readonly pairedComparisons: readonly MatrixPairedComparison[];
    readonly frozenPairedMacroBands: {
      readonly tableVersion: number;
      readonly status: string;
      readonly bandEvaluationStatus: string;
      readonly releaseClaim: false;
      readonly provenance: {
        readonly artifactSha256: string | null;
        readonly basis?: string;
      };
      readonly corpusValidation: { readonly status: string };
      readonly evaluations: readonly {
        readonly dimension: string;
        readonly leftScenarioId: string;
        readonly rightScenarioId: string;
        readonly metricId: string;
        readonly status: string;
        readonly pairedSeedCount: number;
        readonly requiredPairedSeeds: number;
        readonly missingValuePolicy: string;
        readonly eligiblePairPolicy: string;
        readonly absoluteMeanDelta: number | null;
        readonly minimumAbsoluteMeanDelta: number;
        readonly absoluteCohenDz: number | null;
        readonly minimumAbsoluteCohenDz: number;
      }[];
      readonly dimensionRequirement: {
        readonly status: string;
        readonly observed: number | null;
        readonly threshold: number;
        readonly passingDimensions: readonly string[];
      };
      readonly settlementRequirement: {
        readonly status: string;
        readonly observed: number | null;
        readonly threshold: number;
      };
    };
    readonly convergence: readonly { readonly status: string }[];
  };
}

export interface MatrixEvidenceArtifacts {
  readonly json: string;
  readonly gzip: Buffer;
  readonly sha256: string;
  readonly checksum: string;
  readonly markdown: string;
}

export interface MatrixEvidencePaths {
  readonly gzipPath: string;
  readonly checksumPath: string;
  readonly summaryPath: string;
}

const JSON_GZIP_SUFFIX = ".json.gz";

function markdownCell(value: string): string {
  return value.replaceAll("|", "\\|").replaceAll("\n", " ");
}

function seedDescription(seeds: readonly number[]): string {
  if (seeds.length === 0) return "none";
  const first = seeds[0];
  const last = seeds.at(-1);
  if (first === undefined || last === undefined) return "none";
  const isContiguous = seeds.every((seed, index) => seed === first + index);
  return isContiguous && seeds.length > 1
    ? `${first.toString()}..${last.toString()} (${seeds.length.toString()} seeds)`
    : `${seeds.join(", ")} (${seeds.length.toString()} seeds)`;
}

function repeatResult(report: MatrixEvidenceReport): string {
  if (report.analysis.determinism.allExactMatches === null) {
    return "Not evaluated by this corpus";
  }
  return report.analysis.determinism.allExactMatches
    ? `${report.analysis.determinism.comparisonCount.toString()} of ${report.analysis.determinism.comparisonCount.toString()} exact repeats matched`
    : "One or more exact repeats differed";
}

function distributionMedian(
  item: MatrixScenarioEvidence,
  metric:
    | "activeShelterCount"
    | "shelteredRestShare"
    | "meanShelterCondition"
    | "reservationUtilization"
    | "guestUseEvents"
    | "deniedClaims",
): string {
  const distribution = item.activity?.settlement?.seedDistributions[metric];
  return distribution?.median === null || distribution?.median === undefined
    ? "n/a"
    : `${distribution.median.toString()} (${distribution.samples.toString()} seeds)`;
}

export function serializeMatrixEvidence(report: MatrixEvidenceReport): string {
  return `${JSON.stringify(report, null, 2)}\n`;
}

export function serializeMatrixEvidenceArtifact(report: MatrixEvidenceReport): string {
  return `${JSON.stringify(report)}\n`;
}

function indentPrettyJson(value: unknown, spaces: number): string {
  const serialized = JSON.stringify(value, null, 2);
  if (serialized === undefined) return "null";
  const indentation = " ".repeat(spaces);
  return serialized.replaceAll("\n", `\n${indentation}`);
}

/**
 * Emits the byte-for-byte historical pretty stdout representation without
 * constructing one report-sized string. Full 256-run corpora exceed V8's
 * maximum string length when pretty printed, while each retained run remains
 * safely bounded.
 */
export function* matrixEvidenceStdoutChunks(
  report: MatrixEvidenceReport,
): Generator<string> {
  const entries = Object.entries(report).filter(([, value]) => value !== undefined);
  yield "{\n";
  for (const [entryIndex, [key, value]] of entries.entries()) {
    yield `  ${JSON.stringify(key)}: `;
    if (key === "runs" && Array.isArray(value)) {
      if (value.length === 0) {
        yield "[]";
      } else {
        yield "[\n";
        for (const [runIndex, run] of value.entries()) {
          yield `    ${indentPrettyJson(run, 4)}`;
          yield runIndex === value.length - 1 ? "\n" : ",\n";
        }
        yield "  ]";
      }
    } else {
      yield indentPrettyJson(value, 2);
    }
    yield entryIndex === entries.length - 1 ? "\n" : ",\n";
  }
  yield "}\n";
}

export function renderMatrixEvidenceSummary(
  report: MatrixEvidenceReport,
  sha256: string,
  gzipFilename: string,
): string {
  const convergenceCounts = new Map<string, number>();
  for (const diagnostic of report.analysis.convergence) {
    convergenceCounts.set(
      diagnostic.status,
      (convergenceCounts.get(diagnostic.status) ?? 0) + 1,
    );
  }
  const convergenceText = [...convergenceCounts.entries()]
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([status, count]) => `${status}: ${count.toString()}`)
    .join(", ");
  const rationaleFailures = report.aggregate.byScenario.flatMap((item) =>
    item.analysis.expectedBands.scenarioOutcomeBands.dominance.rationaleFailures.map(
      (labelId) => `${item.scenario.scenarioId}:${labelId}`,
    ),
  );
  const dominanceRows = report.aggregate.byScenario.flatMap((item) =>
    item.analysis.expectedBands.scenarioOutcomeBands.dominance.evaluations
      .filter((evaluation) => evaluation.rationaleRequired || evaluation.status === "FAIL")
      .map((evaluation) => {
        const incidence =
          evaluation.incidence === null
            ? "n/a"
            : `${(evaluation.incidence * 100).toFixed(1)}%`;
        return `| \`${markdownCell(item.scenario.scenarioId)}\` | ${markdownCell(evaluation.labelId)} | ${markdownCell(evaluation.status)} | ${incidence} | ${markdownCell(evaluation.rationale?.rationaleId ?? (evaluation.rationaleRequired ? "MISSING" : "not required"))} |`;
      }),
  );
  const pairedBands = report.analysis.frozenPairedMacroBands;
  const outcomeProvenance =
    report.aggregate.byScenario[0]?.analysis.expectedBands.scenarioOutcomeBands.provenance;
  const phase42Corpus =
    report.configuration.corpus === "phase-4.2-calibration" ||
    report.configuration.corpus === "phase-4.2-holdout";
  const phase42Frozen =
    phase42Corpus && outcomeProvenance?.basis === "LOCKED_PHASE_4_2_CALIBRATION";
  const outcomeBandHeading =
    phase42Corpus && !phase42Frozen
      ? "### Candidate Phase 4.2 outcome-incidence review (not frozen)"
      : "### Frozen outcome-incidence bands";
  const pairedBandHeading =
    phase42Corpus && !phase42Frozen
      ? "## Candidate Phase 4.2 paired macro review (not frozen)"
      : "## Frozen paired macro bands";
  const settlementSection =
    report.configuration.corpus === "phase-4.2-holdout"
      ? {
          heading: "## Phase 4.2 settlement holdout distributions",
          explanation:
            "Medians and paired effects are descriptive holdout observations evaluated with the unchanged frozen definitions. `n/a` means no eligible shelter observation; this automated artifact is not by itself a release claim.",
          pairHeading: "### Holdout SETTLEMENT pair effects",
        }
      : phase42Frozen
        ? {
            heading: "## Phase 4.2 post-freeze settlement verification distributions",
            explanation:
              "Medians and paired effects are descriptive verification observations under the frozen definitions. `n/a` means no eligible shelter observation; this automated artifact is not by itself a release claim.",
            pairHeading: "### Frozen SETTLEMENT pair effects",
          }
        : {
            heading: "## Phase 4.2 settlement discovery distributions",
            explanation:
              "Medians and paired effects are descriptive candidate evidence only. No Phase 4.2 threshold is frozen or passing. `n/a` means no eligible shelter observation.",
            pairHeading: "### Candidate SETTLEMENT pair effects",
          };
  const settlementDistributionRows = report.aggregate.byScenario.map(
    (item) =>
      `| \`${markdownCell(item.scenario.scenarioId)}\` | ${distributionMedian(item, "activeShelterCount")} | ${distributionMedian(item, "shelteredRestShare")} | ${distributionMedian(item, "meanShelterCondition")} | ${distributionMedian(item, "reservationUtilization")} | ${distributionMedian(item, "guestUseEvents")} | ${distributionMedian(item, "deniedClaims")} |`,
  );
  const settlementPairRows = report.analysis.pairedComparisons.flatMap((comparison) =>
    comparison.metrics
      .filter((metric) => metric.dimension === "SETTLEMENT")
      .map(
        (metric) =>
          `| \`${markdownCell(comparison.leftScenarioId)} -> ${markdownCell(comparison.rightScenarioId)}\` | ${markdownCell(metric.metricId)} | ${markdownCell(metric.missingValuePolicy)} | ${metric.summary.pairedSeedCount.toString()} | ${metric.summary.meanDelta?.toString() ?? "n/a"} | ${metric.effect.value?.toString() ?? "n/a"} |`,
      ),
  );

  const lines = [
    `# Tiny Civilisations ${report.configuration.corpus} matrix evidence`,
    "",
    "Status: **machine-generated automated evidence; not a release claim**",
    "",
    "## Contract",
    "",
    `- Artifact: \`${gzipFilename}\``,
    `- SHA-256: \`${sha256}\``,
    `- Activity-profile schema: ${report.schemaVersion.toString()}`,
    `- Scenario-analysis schema: ${report.configuration.scenarioAnalysisSchemaVersion?.toString() ?? "n/a"}`,
    `- Outcome classifier: ${report.configuration.outcomeClassifierVersion?.toString() ?? outcomeProvenance?.classifierVersion.toString() ?? "n/a"}`,
    ...(phase42Corpus
      ? [
          `- Phase 4.2 definition status: ${report.configuration.phase42DefinitionStatus ?? "n/a"}`,
          `- Phase 4.2 definition contract: schema ${report.configuration.phase42DefinitionContractSchemaVersion?.toString() ?? "n/a"}, ${report.configuration.phase42DefinitionFingerprintAlgorithm ?? "n/a"}`,
          `- Phase 4.2 definition fingerprint: \`${report.configuration.phase42DefinitionFingerprint ?? "n/a"}\``,
        ]
      : []),
    `- Scenarios: ${report.configuration.scenarios.map((value) => `\`${value}\``).join(", ")}`,
    `- Seeds: ${seedDescription(report.configuration.seeds)}`,
    `- Horizon: ${report.configuration.ticksPerRun.toString()} ticks per run`,
    `- Primary runs: ${report.runs.length.toString()}`,
    `- Ordering: ${report.configuration.ordering}`,
    `- Internal exact repeats: ${repeatResult(report)}`,
    `- Paired descriptive comparisons: ${report.analysis.pairedComparisons.length.toString()}`,
    `- Convergence diagnostics: ${convergenceText || "none"}`,
    "",
    "## Automated scenario results",
    "",
    "| Scenario | Hard invariants | Contract bands | Outcome bands | Calibration provenance | Holdout provenance |",
    "| --- | --- | --- | --- | --- | --- |",
    ...report.aggregate.byScenario.map((item) =>
      [
        `\`${markdownCell(item.scenario.scenarioId)}\``,
        markdownCell(item.analysis.hardInvariants.status),
        markdownCell(item.analysis.expectedBands.status),
        markdownCell(item.analysis.expectedBands.scenarioOutcomeBands.status),
        markdownCell(item.analysis.expectedBands.provenance.calibrationEvidence),
        markdownCell(item.analysis.expectedBands.provenance.holdoutEvidence),
      ]
        .join(" | ")
        .replace(/^/u, "| ")
        .replace(/$/u, " |"),
    ),
    "",
    outcomeBandHeading,
    "",
    `Classifier version: ${outcomeProvenance?.classifierVersion.toString() ?? "n/a"}. Calibration SHA-256: \`${outcomeProvenance?.artifactSha256 ?? "n/a"}\`. ${phase42Corpus && !phase42Frozen ? "Candidate incidences are discovery evidence only; no Phase 4.2 threshold is frozen or passing." : "Thresholds are evaluated only on a complete locked 64-seed, 10,000-tick calibration or holdout corpus."}`,
    "",
    "| Scenario | Required label | Status | Occurrences / eligible runs | Frozen minimum |",
    "| --- | --- | --- | ---: | ---: |",
    ...report.aggregate.byScenario.flatMap((item) =>
      item.analysis.expectedBands.scenarioOutcomeBands.evaluations.map(
        (evaluation) =>
          `| \`${markdownCell(item.scenario.scenarioId)}\` | ${markdownCell(evaluation.labelId)} | ${markdownCell(evaluation.status)} | ${evaluation.observed?.toString() ?? "n/a"} / ${evaluation.eligibleRuns.toString()} | ${evaluation.threshold.toString()} |`,
      ),
    ),
    "",
    "#### Dominance-rationale review",
    "",
    "Any label above 85% incidence requires a checked-in rationale grounded in declared mechanics and scenario facts. A rationale explains prevalence in the evidence; it does not make the outcome scripted.",
    "",
    "| Scenario | Label | Status | Incidence | Checked-in rationale |",
    "| --- | --- | --- | ---: | --- |",
    ...(dominanceRows.length > 0
      ? dominanceRows
      : ["| none | none | NOT_EVALUATED | n/a | none required |"]),
    "",
    `- Rationale failures: ${rationaleFailures.length === 0 ? "none" : rationaleFailures.map((value) => `\`${value}\``).join(", ")}`,
    "",
    "### Factual multi-label incidence",
    "",
    "Labels are nonexclusive and descriptive. They do not identify a winning scenario or prove causality.",
    "",
    "| Scenario | Label | Occurrences / eligible runs |",
    "| --- | --- | ---: |",
    ...report.aggregate.byScenario.flatMap((item) =>
      item.analysis.outcomes.incidence.map(
        (incidence) =>
          `| \`${markdownCell(item.scenario.scenarioId)}\` | ${markdownCell(incidence.title)} | ${incidence.occurrences.toString()} / ${incidence.eligibleRuns.toString()} |`,
      ),
    ),
    "",
    pairedBandHeading,
    "",
    `- Table version: ${pairedBands.tableVersion.toString()}`,
    `- Corpus validation: ${pairedBands.corpusValidation.status}`,
    `- Band evaluation status: ${pairedBands.bandEvaluationStatus}`,
    `- Distinct Phase 3 dimensions: ${pairedBands.dimensionRequirement.status} (${pairedBands.dimensionRequirement.observed?.toString() ?? "n/a"} observed; ${pairedBands.dimensionRequirement.threshold.toString()} required)`,
    ...(phase42Corpus
      ? [
          `- Passing SETTLEMENT bands: ${pairedBands.settlementRequirement.status} (${pairedBands.settlementRequirement.observed?.toString() ?? "n/a"} observed; ${pairedBands.settlementRequirement.threshold.toString()} required)`,
        ]
      : []),
    `- Calibration SHA-256: \`${pairedBands.provenance.artifactSha256 ?? "n/a"}\``,
    "- Artifact release claim: false",
    "",
    "| Dimension | Scenario pair | Metric | Status | |mean delta| / minimum | |dz| / minimum | Eligible-pair policy | Paired seeds / required |",
    "| --- | --- | --- | --- | ---: | ---: | --- | ---: |",
    ...pairedBands.evaluations.map(
      (evaluation) =>
        `| ${markdownCell(evaluation.dimension)} | \`${markdownCell(evaluation.leftScenarioId)} -> ${markdownCell(evaluation.rightScenarioId)}\` | ${markdownCell(evaluation.metricId)} | ${markdownCell(evaluation.status)} | ${evaluation.absoluteMeanDelta?.toString() ?? "n/a"} / ${evaluation.minimumAbsoluteMeanDelta.toString()} | ${evaluation.absoluteCohenDz?.toString() ?? "n/a"} / ${evaluation.minimumAbsoluteCohenDz.toString()} | ${markdownCell(evaluation.eligiblePairPolicy)}; ${markdownCell(evaluation.missingValuePolicy)} | ${evaluation.pairedSeedCount.toString()} / ${evaluation.requiredPairedSeeds.toString()} |`,
    ),
    ...(phase42Corpus
      ? [
          "",
          settlementSection.heading,
          "",
          settlementSection.explanation,
          "",
          "| Scenario | Active shelters | Sheltered-rest share | Mean condition | Reservation utilization | Guest uses | Denied claims |",
          "| --- | ---: | ---: | ---: | ---: | ---: | ---: |",
          ...settlementDistributionRows,
          "",
          settlementSection.pairHeading,
          "",
          "Effects are descriptive right-minus-left comparisons. The missing-value policy and eligible paired-seed count are shown so absent shelters cannot silently become zero-condition observations.",
          "",
          "| Scenario pair | Metric | Missing-value policy | Paired seeds | Mean delta | Cohen dz |",
          "| --- | --- | --- | ---: | ---: | ---: |",
          ...(settlementPairRows.length > 0
            ? settlementPairRows
            : ["| none | none | n/a | 0 | n/a | n/a |"]),
        ]
      : []),
    "",
    "## Release boundary",
    "",
    "This artifact records only the deterministic matrix result. It does not satisfy or replace the separate cross-browser execution record, manual assistive-technology pass, performance record, visual review, or usability sessions. Those gates must remain marked pending until observations from the actual sessions or runs are attached.",
    "",
    "Each individual calibration or holdout artifact intentionally keeps `releaseClaim: false`. The release ledger may combine reviewed calibration provenance with an untouched holdout result; generating either artifact alone does not make a release claim.",
    "",
  ];

  return lines.join("\n");
}

export function createMatrixEvidenceArtifacts(
  report: MatrixEvidenceReport,
  gzipFilename: string,
): MatrixEvidenceArtifacts {
  const json = serializeMatrixEvidenceArtifact(report);
  const gzip = gzipSync(Buffer.from(json, "utf8"), { level: 9 });

  // Normalize the optional gzip header metadata so wall-clock time and host OS do
  // not affect repeated evidence exports.
  gzip.fill(0, 4, 8);
  gzip[9] = 255;

  const sha256 = createHash("sha256").update(gzip).digest("hex");
  return {
    json,
    gzip,
    sha256,
    checksum: `${sha256}  ${gzipFilename}\n`,
    markdown: renderMatrixEvidenceSummary(report, sha256, gzipFilename),
  };
}

export function matrixEvidencePaths(
  outputPath: string,
  invocationDirectory = process.cwd(),
): MatrixEvidencePaths {
  if (!outputPath.toLowerCase().endsWith(JSON_GZIP_SUFFIX)) {
    throw new Error(`Matrix evidence output must end with ${JSON_GZIP_SUFFIX}.`);
  }

  const gzipPath = resolve(invocationDirectory, outputPath);
  const stem = gzipPath.slice(0, -JSON_GZIP_SUFFIX.length);
  return {
    gzipPath,
    checksumPath: `${stem}.sha256`,
    summaryPath: `${stem}.md`,
  };
}

export function assertMatrixEvidenceTargetsAbsent(
  outputPath: string,
  invocationDirectory = process.cwd(),
): MatrixEvidencePaths {
  const paths = matrixEvidencePaths(outputPath, invocationDirectory);
  const existing = [paths.gzipPath, paths.checksumPath, paths.summaryPath].filter(
    existsSync,
  );
  if (existing.length > 0) {
    throw new Error(
      `Matrix evidence is immutable; refusing to overwrite existing artifact${existing.length === 1 ? "" : "s"}: ${existing.join(", ")}.`,
    );
  }
  return paths;
}

export function writeMatrixEvidence(
  report: MatrixEvidenceReport,
  outputPath: string,
  invocationDirectory = process.cwd(),
): MatrixEvidenceArtifacts {
  const paths = assertMatrixEvidenceTargetsAbsent(outputPath, invocationDirectory);
  const artifacts = createMatrixEvidenceArtifacts(report, basename(paths.gzipPath));
  mkdirSync(dirname(paths.gzipPath), { recursive: true });
  const stagingDirectory = mkdtempSync(
    join(dirname(paths.gzipPath), ".matrix-evidence-staging-"),
  );
  const staged = {
    gzipPath: join(stagingDirectory, basename(paths.gzipPath)),
    checksumPath: join(stagingDirectory, basename(paths.checksumPath)),
    summaryPath: join(stagingDirectory, basename(paths.summaryPath)),
  };
  const installed: string[] = [];
  try {
    writeFileSync(staged.gzipPath, artifacts.gzip);
    writeFileSync(staged.checksumPath, artifacts.checksum, "utf8");
    writeFileSync(staged.summaryPath, artifacts.markdown, "utf8");
    for (const [source, target] of [
      [staged.gzipPath, paths.gzipPath],
      [staged.checksumPath, paths.checksumPath],
      [staged.summaryPath, paths.summaryPath],
    ] as const) {
      linkSync(source, target);
      installed.push(target);
    }
    return artifacts;
  } catch (error) {
    for (const installedPath of installed.reverse()) {
      if (existsSync(installedPath)) unlinkSync(installedPath);
    }
    throw error;
  } finally {
    rmSync(stagingDirectory, { recursive: true, force: true });
  }
}
