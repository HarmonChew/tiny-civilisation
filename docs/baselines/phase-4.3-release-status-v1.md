# Phase 4.3 unified-alpha release-evidence status v1

Last reviewed: **8 August 2026**  
Status: **engineering candidate; release automation, statistical, NVDA, and participant gates pending**

Phase 4.3 is the lifecycle-integrated candidate and the only workflow that can
close the final alpha release. This ledger records observed evidence only. It
does not convert implementation, a test definition, an empty template, or a
planned command into a pass.

## Implemented candidate scope

- Version-6 lifecycle state and behavior for life stages, family formation,
  pregnancy and birth, dependent-youth care, critical and natural mortality,
  life records, mourning, memorials, estates, and group extinction.
- Streaming lifecycle activity-profile schema 6 and prospective scenario-
  analysis schema 5/classifier 4.
- Candidate definition fingerprinting, exact calibration/holdout corpus locks,
  generic reserved-seed rejection, and a no-clobber consumed-attempt protocol.
- Release automation and deterministic packaging commands with an explicit
  automated-candidate-only evidence boundary.
- A unified formative, final-NVDA, protected-holdout, and confirmatory protocol.

This scope statement describes repository content. The full release command and
human protocol have not been recorded as passing in this ledger.

## Sequencing-deviation record — 8 August 2026

Lifecycle engineering began before inherited and Phase 4.2 manual-NVDA and
unfamiliar-participant gates were complete. This is the second explicit
sequencing deviation in the project record, after the prior Phase 4.2 decision
to continue engineering while inherited human gates remained open. The
unified-alpha protocol prospectively supersedes those unexecuted workflows; it
does not record a pass, grant a waiver, substitute automation or later humans
for an earlier observation, or make any earlier phase release-complete.

## Evidence ledger

| Gate                                                         | Recorded evidence                                                                                                       | Status                         |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| Focused lifecycle tests                                      | Implementation and focused tests are present; no final clean-candidate command record is attached here.                 | Pending release-candidate gate |
| Formatting, lint, and all workspace type-checks              | No Phase 4.3 clean-candidate record attached.                                                                           | Pending                        |
| Source-only coverage                                         | No Phase 4.3 full workspace coverage record attached.                                                                   | Pending                        |
| Golden replay and deterministic runtime parity               | No final Phase 4.3 golden/release record attached.                                                                      | Pending                        |
| Build, bundle, payload, save, and frame budgets              | No lifecycle-integrated release record attached.                                                                        | Pending                        |
| Four-scenario performance                                    | No final uncontended Phase 4.3 benchmark record attached.                                                               | Pending                        |
| Routine Chromium E2E                                         | No final clean-candidate record attached.                                                                               | Pending                        |
| Chromium/Firefox/WebKit tagged release matrix                | The suite is configured; no final all-browser Phase 4.3 result is attached.                                             | Pending                        |
| Deterministic release package                                | Tooling is present; no clean-commit archive, manifest, or checksum is attached.                                         | Pending                        |
| Deployment smoke                                             | No observation record attached.                                                                                         | Pending                        |
| Discovery calibration, seeds `1..64`                         | No v1 artifact or checksum exists in this ledger; policy status is `NOT_RUN`.                                           | **Not run**                    |
| Discovery freeze review                                      | The checked-in file is an empty prospective template.                                                                   | **Not recorded**               |
| Frozen same-seed verification                                | No v2 artifact or checksum exists in this ledger.                                                                       | **Not run**                    |
| Frozen-verification review                                   | The checked-in file is an empty prospective template.                                                                   | **Not recorded**               |
| Protected holdout, seeds `3001..3064`                        | Policy status is `SEALED`, execution is disabled, and evidence hashes are null. No attempt marker or result is claimed. | **Sealed / not run**           |
| Formative usability, five unfamiliar participants            | No participant record attached.                                                                                         | Pending human gate             |
| Final manual NVDA on release candidate                       | No observation record attached.                                                                                         | Pending human gate             |
| Confirmatory usability, five entirely different participants | No participant record attached; the at-least-four-of-five-per-row criterion is untested.                                | Pending human gate             |

## Required closure attachments

Before any release-complete decision, this ledger must cite the source commit
and source-tree hash; archive, manifest, and checksum; Node/npm/browser/schema,
bundle, and test manifests; every automated result; discovery, freeze,
verification, and protected-holdout artifacts; deterministic fixtures and
answer keys; anonymized row-level score sheets; formative/confirmatory cohort
separation; findings-to-fix commits and affected reruns; the final NVDA record;
and the seven-row confirmatory matrix. Empty templates or paths without the
matching observed artifact remain pending.

## Protected-corpus status

The Phase 4.3 holdout is not executable from the checked-in state. Generic run,
batch, profile, matrix, and raw-simulation paths reject seeds `3001..3064` at
every horizon. The protected validator also rejects the current policy because
it is not reviewed or frozen, is not marked ready, has execution disabled, and
contains no release-candidate, automation, deployment, or NVDA provenance.

Do not create a holdout summary, checksum, attempt marker, or fabricated review
to make this ledger appear complete. The only valid transition is the reviewed
sequence in [`../phase-4.3-execution-plan.md`](../phase-4.3-execution-plan.md).

## Historical evidence boundary

Phase 3, Phase 4.1, and Phase 4.2 automated artifacts remain immutable evidence
for their recorded versions. Their unexecuted manual workflows are
administratively superseded by the integrated protocol, but no old pending row
becomes a pass and no earlier phase becomes retroactively release-complete.

The final alpha can be released only from the lifecycle-integrated candidate
after all Phase 4.3 rows pass on matching provenance. Until then the release
decision is **INCOMPLETE**.
