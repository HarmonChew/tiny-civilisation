# Phase 3 release-evidence status v1

Last reviewed: **5 August 2026**  
Status: **historical automated release gates passed at `7df0b22`; human evidence incomplete**

This ledger separates evidence that the repository can produce automatically
from observations that have actually been collected. The repository and
browser snapshot was recorded at immutable Phase 4.1 base commit `7df0b22`;
the Phase 3 statistical corpus remains the immutable `4ff604e` record. A
command or template is not counted as a passing result.

## Evidence ledger

| Gate                                                | Recorded evidence                                                                                                                                                                                                                                                                                                                         | Status                       |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| Portable deterministic smoke                        | The existing 32-run report records exact repeats and inherited safety checks.                                                                                                                                                                                                                                                             | Attached diagnostic evidence |
| Full calibration, seeds 1..64 at 10,000 ticks       | Historical behavior-v3 evidence from immutable commit `4ff604e`: four scenarios × 64 seeds × 10,000 ticks = 256 runs. [Summary](phase-3-calibration-v1.md), [compressed JSON](phase-3-calibration-v1.json.gz), and [checksum](phase-3-calibration-v1.sha256). SHA-256 `f97017f36c4f2cf46948d4dbf8b33af40fe4f4a04736121ae6232cfb34517a57`. | **Pass**                     |
| Untouched holdout, seeds 1001..1064 at 10,000 ticks | Historical behavior-v3 evidence from the same immutable commit: four scenarios × 64 untouched seeds × 10,000 ticks = 256 runs. [Summary](phase-3-holdout-v1.md), [compressed JSON](phase-3-holdout-v1.json.gz), and [checksum](phase-3-holdout-v1.sha256). SHA-256 `ee982dc12955b37afca273176864b57a438cf1b4a27272135d954408f2d78419`.    | **Pass**                     |
| Frozen label and macro review                       | The [pre-holdout review](phase-3-calibration-review-v1.md) froze classifier v1, the required per-scenario labels, the sole calibration label above 85%, and the social, storage, conflict, and spatial convergence dimensions. The untouched holdout met the frozen expectations without behavior tuning.                                 | **Pass**                     |
| Repository snapshot at `7df0b22`                    | Formatting, lint, type-checking, 438 tests, all three coverage suites, golden verification, build, and bundle budgets passed. The complete Chromium suite passed 44/44 with 34 visual baselines.                                                                                                                                          | **Pass**                     |
| Chromium/Firefox/WebKit release smoke               | At `7df0b22`, the final release matrix passed 12/12 in 2.6 minutes: 4/4 in Chromium, 4/4 in Firefox, and 4/4 in WebKit.                                                                                                                                                                                                                   | **Pass**                     |
| Manual NVDA pass                                    | No observation record is attached.                                                                                                                                                                                                                                                                                                        | Pending human gate           |
| Formative usability, five unfamiliar participants   | No session record is attached.                                                                                                                                                                                                                                                                                                            | Pending human gate           |
| Confirmatory usability, five new participants       | No session record is attached.                                                                                                                                                                                                                                                                                                            | Pending human gate           |

Phase 3 is not release-complete while the human rows remain pending.

## Historical deterministic corpus evidence

Both full corpora were reconstructed from the immutable Phase 3 source at
commit `4ff604e`, using behavior version 3, scenario-definition version 1,
map-generation version 1, and outcome-classifier version 1. The four scenarios
were `petri-world`, `split-banks`, `scattered-plenty`, and `unequal-table`.
Every run reached exactly 10,000 ticks.

The deterministic exporter produced three files for each corpus:

- `NAME.json.gz`: deterministic compact UTF-8 JSON compressed with normalized
  gzip timestamp and host-OS header bytes;
- `NAME.sha256`: SHA-256 of the compressed artifact; and
- `NAME.md`: a deterministic readable summary of the report, checksum,
  scenario statuses, and label incidence.

The readable summaries report all four scenarios passing their hard invariants
and contract bands. The raw artifacts additionally confirm zero corpus or
per-run hard failures, at least two frozen labels at `8/64` or more in every
scenario, three labels overall, and four materially different cross-scenario
macro dimensions. No holdout label exceeded 85%.

The [calibration review](phase-3-calibration-review-v1.md) was recorded before
the holdout was opened. No authoritative behavior, classifier rule, threshold,
required label, dominant-label rationale, or macro expectation changed in
response to holdout results. These artifacts therefore remain historical
behavior-v3 evidence and do not claim parity with the Phase 4 simulation.

## Cross-browser release command

```sh
npm run test:e2e:release
```

This release-only suite exercises the critical Worker/renderer/causal journey,
the experiment persistence/replay/comparison journey, and authoritative setup
for every non-reference Phase 3 scenario in Chromium, Firefox, and WebKit. The
ordinary `npm run test:e2e` and `npm run check` paths remain Chromium-only.

The final local Windows run at `7df0b22` on 5 August 2026 passed 12/12 in 2.6
minutes, with all four tagged journeys passing in each browser. Routine `npm run test:e2e`
remains Chromium-only and passed 44/44; the release command is the separate
cross-browser record.

## Human evidence still required

The NVDA pass must cover the world navigator, selected summary, world object,
moment recovery, intervention, causal evidence, focus return, and status
announcements.

The unified formative and confirmatory rounds must use different groups of five
unfamiliar participants. They cover the carried-forward Phase 2.5 core loop,
Phase 3 scenario comprehension, and Phase 4.1 hydration comprehension. Record
task accuracy, time, route, missed cues, vocabulary confusion, false causal
claims, and accessibility/input failures. Resolve blocker and high-severity
patterns before the confirmatory round. At least four of the five confirmatory
participants must satisfy every core comprehension criterion.

Do not replace these records with automated accessibility checks, screenshots,
or claims inferred from implementation.
