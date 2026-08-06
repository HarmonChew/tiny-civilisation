# Phase 4.2 post-freeze calibration verification review v1

Reviewed: **6 August 2026**  
Decision: **accept the post-freeze automated verification; authorize the
one-shot holdout only after this review checksum is recorded**

phase42ReviewType: VERIFICATION
artifact: docs/baselines/phase-4.2-calibration-v2.json.gz
artifactSha256: 1b7fd1e4cedcde43a4601d42109dfa7dc2c7a17e1cbce27031a31e9ee41ac52a
frozenDefinitionFingerprint: 3f46b03b570de25c321c595f2bdc4b5df6081e52cd564680b0f1d0613c9606c6
verificationStatus: PASS
hardInvariantsStatus: PASS
outcomeBandsStatus: PASS
dominanceStatus: PASS
legacyMacroBandsStatus: PASS
settlementMacroBandsStatus: PASS

This review accepts the deterministic post-freeze calibration result under the
exact definition frozen by the Phase 4.2 discovery review. It records automated
verification evidence only. It is not holdout evidence, human evidence, or a
release claim.

## Authentication and corpus

Before the first v2 simulation tick, the workflow authenticated the immutable
v1 discovery artifact and checksum, its embedded candidate definition
fingerprint, and the freeze-review binding to the frozen definition. All 256
retained v1 primary runs were deterministically regenerated, and their raw and
derived evidence matched the authenticated artifact.

The v2 matrix then used the frozen definition fingerprint for all four
scenarios, seeds `1..64`, and exactly 10,000 ticks per run. The matrix contains
256 unique scenario-and-seed primary runs in catalog-then-seed order. It used
activity-profile schema 5, scenario-analysis schema 4, and outcome classifier
3.

## Scenario verification

Every primary run passed its per-run hard invariants. Each of the four scenario
aggregates passed the corpus hard invariants, contract bands, frozen outcome
bands, and dominance-rationale checks.

The frozen `ESTABLISHED_SETTLEMENT` recurrence floors all passed on the
complete 64-run scenario corpora:

| Scenario           | Observed occurrences | Frozen minimum | Result |
| ------------------ | -------------------: | -------------: | ------ |
| `petri-world`      |              30 / 64 |             22 | Pass   |
| `split-banks`      |              13 / 64 |              7 | Pass   |
| `scattered-plenty` |               6 / 64 |              2 | Pass   |
| `unequal-table`    |               3 / 64 |              1 | Pass   |

All nine incidences above the strict 85% dominance threshold had their frozen
Phase 4.2 rationale and passed:

- `petri-world`: `SOURCE_BOTTLENECK` and `PERSISTENT_DEHYDRATION`;
- `split-banks`: `SOURCE_BOTTLENECK` and `PERSISTENT_DEHYDRATION`;
- `scattered-plenty`: `PERSISTENT_PRIVATE_RESERVES` and
  `SOURCE_BOTTLENECK`; and
- `unequal-table`: `PERSISTENT_PRIVATE_RESERVES`, `SHARED_HYDRATION`, and
  `SOURCE_BOTTLENECK`.

No required rationale was missing. These rationales explain observed
prevalence from declared mechanics and scenario facts; they do not make an
outcome scripted.

## Paired macro verification

All four inherited macro dimensions passed, exceeding the requirement for at
least three passing inherited dimensions:

- `SOCIAL`: horizon group count;
- `STORAGE`: stored resource units;
- `CONFLICT`: creature-attack events; and
- `SPATIAL`: median creature-pair distance.

The frozen `SETTLEMENT` band also passed. Across all 64 locked
`petri-world -> unequal-table` seed pairs, `ACTIVE_SHELTER_COUNT` had an
absolute paired mean delta of `0.421875`, above the frozen minimum `0.25`, and
an absolute paired Cohen dz of `0.756174`, above the frozen minimum `0.5`.
Every seed pair was retained under `ALL_LOCKED_SEEDS`, with
`ZERO_IS_OBSERVED` as the missing-value policy.

The signed right-minus-left observations remain descriptive. The frozen gate
tests absolute materiality and does not claim that one named scenario must
always have the larger value.

## Evidence boundary

This v2 corpus reruns the same calibration seeds as v1. It verifies that the
frozen definitions evaluate the authenticated behavior and evidence exactly,
but it is not an independent statistical confirmation. The reserved Phase 4.2
holdout seeds `2001..2064` remained sealed throughout this review and were not
inspected or used. Recording this review's checksum may advance the process
lock to the one-shot `READY` state; it does not itself execute or inspect the
holdout.

The artifact retains `releaseClaim: false`. This automated verification does
not satisfy or alter the separate three-browser, NVDA, accessibility, visual,
performance, formative-usability, or new-participant confirmatory gates. Phase
4.2 remains short of a release-complete claim until the untouched holdout and
all required browser and human evidence pass.
