# Phase 4.2 release-evidence status v1

Last reviewed: **6 August 2026**  
Status: **automated release-candidate evidence complete; human gates pending; no Phase 4.2 release claim**

This ledger separates work present in the repository from evidence that has
actually been collected. A configured gate is not a passing gate, and an
automated check cannot substitute for screen-reader or unfamiliar-participant
evidence. The automated results below are from the 6 August 2026 workspace
execution; they are not presented as an immutable-commit run.

## Automated gates — passed

- **Frozen contract.** [`phase-4.2-contract.md`](../phase-4.2-contract.md)
  records the mechanics, versions, migration, measurement definitions,
  classifier rules, bands, and corpus policy. The official frozen definition
  fingerprint remains
  `3f46b03b570de25c321c595f2bdc4b5df6081e52cd564680b0f1d0613c9606c6`.
- **Settlement evidence.** Activity-profile schema 5 delegates fatigue, rest,
  construction, condition, occupancy, access, and relocation evidence to the
  focused collector. Scenario-analysis schema 4 and classifier 3 retain five
  factual, non-exclusive settlement labels. Focused collection, aggregation,
  classifier, and macro tests pass.
- **Source-only coverage.** All 506 tests pass:
  - sim-core: 20 files / 220 tests; 88.09% statements, 79.71% branches, 93.88%
    functions, and 89.81% lines;
  - headless: 12 files / 121 tests; 89.49%, 78.31%, 95.94%, and 90.13%, above
    the explicit 85% / 75% / 90% / 85% floors;
  - web: 25 files / 165 tests; 72.36%, 64.05%, 81.48%, and 74.39%.
- **Static and deterministic checks.** Formatting, lint, type-checking, the
  complete source-only suite, and the final process-lock tests pass. The
  behavior-5 golden replay passes 1/1. Unit and browser coverage exercise
  direct/Worker, save/load, replay, experiment, chunked/one-shot, and
  command-order reconstruction paths.
- **Payload, bundle, and throughput budgets.** Bootstrap, hot-frame, and save
  ceiling assertions pass. Largest JavaScript is 354,517 bytes raw / 106,527
  gzip; total JavaScript is 1,156,628 / 336,732 gzip; CSS is 72,718 / 14,758
  gzip. Final isolated throughput is 30,761.8 ticks/s against the 25,905 floor.
- **Chromium journeys and visuals.** The complete run passes 46/46, including
  shelter site, construction, occupancy, degradation, relocation,
  accessibility, and responsive states.
- **Three-browser release matrix.** The tagged serial matrix passes 24/24:
  eight cases in each of Chromium, Firefox, and WebKit. On this managed Windows
  runner, Firefox required `MOZ_DISABLE_CONTENT_SANDBOX=1` to work around the OS
  refusing the content subprocess; this is runner compatibility evidence, not
  equivalent sandbox or security coverage.

## Calibration and holdout — passed

- **Discovery v1.** [`phase-4.2-calibration-v1.json.gz`](phase-4.2-calibration-v1.json.gz)
  records 256 runs and passing hard invariants, SHA-256
  `296239c70c1e13de577e5a5b19b5871584acb37d22ce21349782de4b3a6c1e78`.
  Its candidate fingerprint was
  `d541624e55c2e2ef0757c13b2a68da4f81489a23903aa3e27956b10fc33a9922`;
  outcome bands were intentionally not evaluated at discovery.
- **Freeze review.** The [`freeze review`](phase-4.2-calibration-review-v1.md),
  SHA-256
  `3fff144ca7c375dd673d1c6a1b4e97c87bb475c81b2dd3d2c4d9a8120a77677e`,
  records `SUPERSEDED_FOR_V2`, `FROZEN`, and `REVIEWED`.
- **Frozen verification v2.** [`phase-4.2-calibration-v2.json.gz`](phase-4.2-calibration-v2.json.gz),
  SHA-256
  `1b7fd1e4cedcde43a4601d42109dfa7dc2c7a17e1cbce27031a31e9ee41ac52a`,
  passes all 256 hard, contract, outcome, dominance, and macro evaluations under
  the frozen fingerprint. The [`verification review`](phase-4.2-calibration-verification-review-v1.md),
  SHA-256
  `c4e33906bff857a93a413dd579dd6c0f69339a3bd98ee14918350456e9b7d1e4`,
  also passes.
- **Untouched holdout.** The one authorized run produced
  [`phase-4.2-holdout-v1.json.gz`](phase-4.2-holdout-v1.json.gz), 19,493,138
  bytes, SHA-256
  `cbd4ab5b8012eb394f7b519d3d9d90a88d6e4524bb0794fe725970f9e0dea666`.
  All 256 unique cases over seeds `2001..2064` pass run and scenario hard,
  contract, outcome, dominance, four inherited macro, and `SETTLEMENT` gates.
  Established-settlement incidence passes at 34/22, 21/7, 8/2, and 9/1 by
  catalog order. The durable [`attempt marker`](phase-4.2-holdout-v1.attempt.json)
  remains `CONSUMED_ATTEMPT`; policy is `REVIEWED / FROZEN / RECORDED` with
  execution disabled.

## Holdout handling

The historical Phase 3 and Phase 4.1 compressed corpora and checksums remain
unchanged. Phase 4.2 reused calibration seeds `1..64` for discovery, review, and
same-seed frozen verification, then opened the distinct holdout seeds
`2001..2064` once under the reviewed frozen definition.

Before its first tick, the protected workflow authenticated both calibration
generations and durably created the consumed-attempt marker. The completed
holdout contains four scenarios by 64 seeds by 10,000 ticks, 256 unique cases in
catalog-then-seed order, and explicitly sets every release-claim field to
`false`. Its checksum sidecar and readable companion agree with the compressed
artifact. The checked-in policy is permanently resealed as `RECORDED` with
execution disabled; it cannot be silently rerun.

If behavior, measurement definitions, classifier rules, or frozen bands change
after this recorded holdout, the result cannot be described as an untouched
holdout. This ledger must record the invalidation and a replacement protocol
explicitly. The inherited Phase 3 safety-band provenance preserved inside the
report remains historical; current Phase 4.2 holdout provenance is recorded
separately and is complete.

## Human gates — pending

- **Inherited entry gate.** No completed unified Phase 2.5/3/4.1 NVDA record,
  five-person formative record, or five-new-person confirmatory record is
  attached. Feature engineering began while this required entry gate was open;
  this is a sequencing deviation, not a pass. The at-least-4/5 confirmatory
  criterion has not been demonstrated across every inherited core criterion.
- **Phase 4.2 NVDA.** No new observation record is attached. It must cover
  semantic navigation, shelter selection, condition and occupancy descriptions,
  moment/evidence traversal, material intervention, replay, announcements, and
  focus restoration.
- **Phase 4.2 formative round.** No new five-person record is attached. This
  round may change the interface.
- **Phase 4.2 confirmatory round.** No five-new-person record is attached. It
  must follow formative changes, and at least four participants must correctly
  explain the selected site, reservation versus physical occupancy, condition
  and upkeep, sheltered versus outdoor rest, and one factual
  material-intervention response.

All automated release-candidate gates above pass, but Phase 4.2 remains
release-incomplete until the inherited and Phase 4.2 human records are complete.
