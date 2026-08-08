# Phase 4.3 finish-to-test execution plan

Status: **lifecycle engineering present; release-candidate and human evidence pending**  
Updated: **8 August 2026**

The next phase is closure, not another feature expansion: finish the lifecycle
build, make one candidate stable, and move through testing in a fixed order.
The semantic details and corpus lock are in
[`phase-4.3-contract.md`](phase-4.3-contract.md).

## Current evidence boundary

Lifecycle implementation, observability, prospective analysis, corpus guards,
release tooling, and the candidate definition contract are present. The
checked-in Phase 4.3 calibration status is `NOT_RUN`, bands are `NOT_FROZEN`,
and the holdout is `SEALED` with execution disabled and null evidence hashes.
No Phase 4.3 calibration, protected holdout, manual NVDA, deployment smoke, or
participant pass is claimed by this plan.

## Sequencing decision — 8 August 2026

Lifecycle engineering started while inherited and Phase 4.2 human gates were
still open. This is a second recorded sequencing deviation, following the
earlier Phase 4.2 decision to proceed before inherited manual evidence was
complete. The unified-alpha protocol prospectively supersedes the unexecuted
manual workflows so the finished lifecycle candidate is assessed once as a
whole. It does not pass, waive, backfill, or retroactively close any earlier
gate, and all historical artifacts remain unchanged.

## Ordered phases

### 1. Finish and stabilize the build

- Complete lifecycle mechanics, migrations, validation, projections, retained
  events, browser presentation, interaction, comparison, and explanation.
- Cover birth and lineage, dependent youth and care, aging, critical and
  natural death, mourning, memorials, estate transfer, and group extinction.
- Verify the 24-living and 256-identity caps without scenario-ID branches or
  special release-seed behavior.
- Resolve all blocker and high-severity implementation findings before starting
  formative sessions.
- Pass cross-platform formatting, lint, type-check, coverage, build/bundle,
  v6 golden replay, direct/Worker/chunk/replay parity, routine Chromium
  journeys, and the warmed three-run median benchmark at the inherited 25,905
  ticks/second floor.
- Retain a designated deterministic 10,000-tick story covering birth, care,
  adulthood, death, mourning, inheritance, and lineage, plus forced 24-living
  and zero-living bootstrap/hot-frame/save budget checks.

Exit: the complete gate above passes, persistence round trips without losing
lifecycle facts, and the complete user journeys exist in the tagged release
suite. New mechanics then freeze; only blocker/high-severity validation fixes
may change runtime behavior before closure.

### 2. Run the formative round and fix findings

Run one observed round with five unfamiliar participants using the complete
rubric in
[`unified-alpha-human-protocol-v1.md`](unified-alpha-human-protocol-v1.md).
This round may change the interface, terminology, or ordering and may require a
blocker/high-severity mechanics fix, but it does not reopen net-new features.
Record each route, failure, vocabulary problem, false causal claim, and input or
accessibility issue.

Exit: every blocker and high-severity pattern is fixed; affected automated tests
are rerun. The five later confirmatory participants must be entirely different.

### 3. Review calibration and freeze one candidate definition

1. Run the exact four-scenario, seeds `1..64`, 10,000-tick discovery corpus to
   the canonical v1 path. Do not overwrite an existing target.
2. Review lifecycle distributions, hard invariants, label incidence, dominance,
   population behavior, and macro materiality. Record accepted or changed
   rules in the discovery review.
3. Freeze classifier 4 rules, all incidence/dominance/population/macro bands,
   the exact candidate contract, and its SHA-256 fingerprint in a reviewed
   change.
4. Authenticate v1, then rerun the same 256 cases to the distinct v2 path.
   Review v2 separately and require the complete frozen definition to pass.

Discovery is exploratory evidence. Frozen verification is candidate evidence.
Neither authorizes the holdout or supplies a release claim.

### 4. Create and automate the release candidate

Use one clean reviewed commit. The release command is:

```sh
npm run check:release
```

It runs, serially:

1. formatting check, lint, and all workspace type-checks;
2. source-only coverage and golden replay verification;
3. production build plus bundle and persistence budgets;
4. benchmarks for `petri-world`, `split-banks`, `scattered-plenty`, and
   `unequal-table`;
5. the routine Chromium E2E suite;
6. all `@release` journeys in Chromium, Firefox, and WebKit; and
7. deterministic no-clobber packaging with a manifest and SHA-256 sidecar.

The command intentionally does not execute Phase 4.3 calibration or holdout
corpora and does not claim NVDA or participant evidence. Packaging requires a
clean tracked worktree; `--allow-dirty` is diagnostic only and cannot produce
release evidence.

Record the clean commit, immutable Git source-tree object ID, command
environment, complete results, archive SHA-256, manifest web-tree SHA-256, and
any runner-specific limitation. Then deploy that exact package to the candidate
environment and record a smoke covering load,
scenario setup, play/pause/step, selection, lifecycle inspection, intervention,
save/load, replay, comparison, and focus restoration.

Exit: automated release check and deployment smoke both pass on the same commit
and package.

### 5. Run final NVDA on the candidate

After formative fixes, automation, and deployment smoke, run the complete
manual NVDA workflow on the exact candidate build. Record NVDA, browser, OS,
commit, package hash, deployment identifier, observer, keyboard route,
announcements, focus behavior, and each rubric outcome.

Exit: no blocker or high-severity screen-reader defect remains. A change needed
to fix one invalidates the candidate evidence it affects and returns the work
to the appropriate earlier stage.

### 6. Review and open the holdout once

The holdout remains disabled until a reviewed policy edit records:

- discovery, freeze-review, verification, and verification-review hashes;
- the frozen definition fingerprint;
- release-candidate commit;
- automated release-check, deployment-smoke, and final-NVDA artifact hashes;
- status `REVIEWED / FROZEN / READY`; and
- an explicit `executionEnabled: true` authorization.

File presence never auto-enables execution. After independent review, run the
exact four-scenario corpus at seeds `3001..3064` for 10,000 ticks. The protected
path must create its durable consumed-attempt marker before the first tick and
write only the canonical no-clobber output set. Immediately record success or
failure and reseal execution.

Exit: one immutable holdout result is attached. Failure consumes the corpus;
there is no retry or tuning against it.

### 7. Run confirmatory participants on the same build

After the holdout, run five participants who took no part in the formative
round. Do not change the candidate between holdout and confirmatory sessions.
At least four of five must independently pass every rubric row. Aggregate pass
counts cannot hide a row where fewer than four participants passed.

Exit: the confirmatory record contains row-level results, raw observation
notes, participant-separation attestation, build provenance, and a reviewed
decision.

### 8. Make the release decision

Update
[`phase-4.3-release-status-v1.md`](baselines/phase-4.3-release-status-v1.md)
only from attached evidence. A pending, failed, missing, mismatched-build, or
superseded row keeps the alpha release incomplete. Preserve all earlier phase
artifacts as historical evidence.

## Complete acceptance matrix

| Area                 | Required evidence                                                                                                                           |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Core lifecycle       | Deterministic stage, fertility, pregnancy, birth, care, critical/natural death, memory, estate, extinction, and cap tests                   |
| Compatibility        | Deep rejection, migrations, continuation, replay, experiment, response trace, direct/Worker, chunked/one-shot parity                        |
| Explanation          | Selected desire/plan/action/reason/current moment; lifecycle facts and historical records; no unsupported causal winner                     |
| Product              | Lineage, dependent care, birth/death moments, memorial, estate goods, population trend/cap/extinction, hydration and settlement coexistence |
| Accessibility        | Keyboard, touch, axe, reduced motion, forced colors, 200% text, 400% reflow, and final manual NVDA                                          |
| Browser              | Routine Chromium suite plus every tagged release journey in Chromium, Firefox, and WebKit                                                   |
| Performance          | Existing bundle, payload, save, frame, and throughput floors pass for the lifecycle-integrated build                                        |
| Statistical          | Reviewed discovery, frozen verification, and one-shot holdout with complete per-run profiles and invariant diagnostics                      |
| Human comprehension  | Five formative; five entirely different confirmatory; at least four of five pass every rubric row                                           |
| Packaging/deployment | Clean deterministic archive, manifest and checksum; same-package deployment smoke; provenance retained                                      |

## Failure and change control

- A blocker or high-severity finding is fixed before proceeding; affected
  automated evidence is rerun.
- A semantic change after freeze creates a new definition fingerprint and
  returns the process to calibration review.
- A candidate change after automated release evidence requires a new package
  and affected automation, smoke, and NVDA evidence.
- Any authoritative or measurement change invalidates Phase 4.3 statistical
  evidence. Any runtime UI change invalidates NVDA and confirmatory evidence
  for that web artifact even when the simulation fingerprint is unchanged.
- A failed confirmatory round becomes formative evidence: fix the finding,
  mint a new release candidate, repeat affected automation and full final NVDA,
  and recruit five entirely new confirmatory participants.
- A holdout failure, crash, or partial output consumes seeds `3001..3064`.
  Replacement seeds `4001..4064` require a new versioned definition and audit;
  no original holdout artifact or marker is deleted or overwritten.
- Automated, statistical, screenshot, or code-review evidence never substitutes
  for human comprehension or NVDA observation.
