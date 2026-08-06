# Phase 4.2 calibration freeze review v1

Reviewed: **6 August 2026**  
Decision: **freeze the reviewed Phase 4.2 data definitions; post-freeze rerun
required**

phase42ReviewType: FREEZE
artifact: docs/baselines/phase-4.2-calibration-v1.json.gz
artifactSha256: 296239c70c1e13de577e5a5b19b5871584acb37d22ce21349782de4b3a6c1e78
classifierVersion: 3
candidateDefinitionFingerprint: d541624e55c2e2ef0757c13b2a68da4f81489a23903aa3e27956b10fc33a9922
frozenDefinitionFingerprint: 3f46b03b570de25c321c595f2bdc4b5df6081e52cd564680b0f1d0613c9606c6
candidateDisposition: SUPERSEDED_FOR_V2
bandFreezeStatus: FROZEN
decisionStatus: REVIEWED

This review freezes the data-only Phase 4.2 classifier, incidence-band policy,
incidence, dominance-rationale, and settlement-macro definitions selected from
the discovery calibration. It is not post-freeze verification, holdout
evidence, human evidence, or a release claim.

## Discovery evidence

The discovery matrix covered all four scenarios, seeds `1..64`, and exactly
10,000 ticks per run: 4 scenarios x 64 seeds x 10,000 ticks, for 256 primary
runs. All per-run hard invariants passed, and each scenario's corpus hard
invariant status passed. The candidate artifact correctly left Phase 4.2
incidence and paired-macro gates not evaluated because the definitions had not
yet been frozen.

The candidate and frozen contracts have the same non-reviewable static
projection. The compatibility projection normalizes exactly five reviewable
Phase 4.2 data fields: classifier rules become `{}`, the frozen-only
incidence-band policy is omitted, and the incidence, dominance-rationale, and
settlement-macro definition arrays become `[]`. Both projections then have this
SHA-256:

`d56d7bf2684f1d36738feaf5d17a943ad75a63a432b751d912b521b45219303f`

The changed definition fingerprint therefore records the reviewed data-only
supersession for v2; it does not authorize a change to the fingerprinted
classifier, paired-metric readers, evaluator implementation, inherited Phase
4.1 tables, or other static semantics.

## Classifier decision

All six candidate classifier-rule values are accepted unchanged:

| Classifier rule                                 | Frozen value | Meaning                                                             |
| ----------------------------------------------- | -----------: | ------------------------------------------------------------------- |
| `establishedSettlementMinimumActiveShelters`    |            1 | At least one active shelter at the horizon                          |
| `chronicNeglectMinimumActiveShelterTicks`       |        1,000 | At least 1,000 observed active-shelter ticks                        |
| `chronicNeglectMinimumLowConditionExposureRate` |          0.5 | Low condition during at least half of eligible active-shelter ticks |
| `shelterCrowdingMinimumEvents`                  |            1 | At least one capacity-crowding event                                |
| `guestShelteringMinimumEvents`                  |            1 | At least one trusted-guest shelter-use event                        |
| `settlementRelocationMinimumCount`              |            1 | At least one completed relocation                                   |

These remain factual, non-exclusive labels. They do not name a winner and do
not establish causality.

## Established-settlement incidence bands

`ESTABLISHED_SETTLEMENT` is the only new shelter label frozen as a required
scenario-incidence band. For each scenario, let `n = 64`, `k` be its observed
occurrences, `p = k / n`, and `z = 1.95996398454`. The two-sided 95% Wilson
lower bound is

```text
L = (p + z^2/(2n) - z*sqrt(p*(1-p)/n + z^2/(4n^2))) / (1 + z^2/n)
```

The frozen whole-run floor is `max(1, floor(L * 64))` when the factual label
was observed. The calculation and selected literals are:

| Scenario           | Observed count | Wilson lower x 64 | Frozen floor |
| ------------------ | -------------: | ----------------: | -----------: |
| `petri-world`      |        30 / 64 |           22.5126 |           22 |
| `split-banks`      |        13 / 64 |            7.8550 |            7 |
| `scattered-plenty` |         6 / 64 |            2.7954 |            2 |
| `unequal-table`    |         3 / 64 |            1.0284 |            1 |

The legacy `gates.minimumOutcomeOccurrences = 8` remains unchanged for the
inherited Phase 4.1 bands and candidate-v1 definitions. The reviewed
frozen-only policy applies specifically to `ESTABLISHED_SETTLEMENT` and
authorizes the per-scenario literals `22 / 7 / 2 / 1` derived above.

The policy records the derivation, while the values themselves are stored as
literal, fingerprinted band data; the evaluator does not recalculate Wilson
bounds. They are conservative recurrence floors, not 95% prediction limits for
a future 64-run sample. In particular, the
`unequal-table` floor of one means only that the rare outcome must recur at
least once. It must not be described as evidence of high or stable settlement
prevalence. Requiring stronger rare-outcome evidence would require a new
pre-holdout mechanics decision and discovery corpus, not a stronger claim from
these observations.

The discovery incidences for the other shelter labels were zero in all
scenarios except `GUEST_SHELTERING`, which occurred once in `petri-world`.
They are retained as factual classifier outputs but are not frozen as required
incidence bands.

## Dominance-rationale decision

Nine scenario-label incidences exceeded the strict 85% dominance threshold.
Each is retained with Phase 4.2 provenance and a rationale grounded in declared
mechanics and scenario facts:

| Scenario and incidence      | Label                         | Phase 4.2 rationale ID                           | Mechanics and scenario basis                                                                                                                                                |
| --------------------------- | ----------------------------- | ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `petri-world`, 64 / 64      | `SOURCE_BOTTLENECK`           | `PHASE_4_2_PETRI_SINGLE_EASTERN_SOURCE`          | Eight creatures share one eastern potable source starting at 24/40, renewing one unit every 180 ticks, with three gather slots.                                             |
| `petri-world`, 64 / 64      | `PERSISTENT_DEHYDRATION`      | `PHASE_4_2_PETRI_THIRST_AND_TRAVEL_PRESSURE`     | Thirst rises every tick and faster while moving; severe thirst begins at 8,000, and all eight creatures travel to the single eastern source.                                |
| `split-banks`, 64 / 64      | `SOURCE_BOTTLENECK`           | `PHASE_4_2_SPLIT_BANKS_PASSAGE_SOURCE`           | Both four-creature banks share one passage source starting at 18/30, renewing one unit every 240 ticks, with three gather slots.                                            |
| `split-banks`, 64 / 64      | `PERSISTENT_DEHYDRATION`      | `PHASE_4_2_SPLIT_BANKS_SLOW_RENEWAL`             | All eight creatures begin near 3,200 thirst and rely on the single slowly renewing passage source while movement adds thirst.                                               |
| `scattered-plenty`, 58 / 64 | `PERSISTENT_PRIVATE_RESERVES` | `PHASE_4_2_SCATTERED_LOCAL_PLENTY`               | Four separated pairs begin beside abundant local food while building material is central, so contact and group formation may arrive late.                                   |
| `scattered-plenty`, 61 / 64 | `SOURCE_BOTTLENECK`           | `PHASE_4_2_SCATTERED_FINITE_DISTRIBUTED_SOURCES` | Four distributed sources start at 18/24, renew one unit every 140 ticks, and each expose three slots; the classifier also records prolonged depletion.                      |
| `unequal-table`, 61 / 64    | `PERSISTENT_PRIVATE_RESERVES` | `PHASE_4_2_UNEQUAL_CROSS_BANK_SOCIAL_CONTRAST`   | Five western and three eastern starters begin across the passage with contrasting social traits and access, making cross-bank joining and storage contingent.               |
| `unequal-table`, 64 / 64    | `SHARED_HYDRATION`            | `PHASE_4_2_UNEQUAL_NEED_AND_DONOR_CONTRAST`      | Western starters begin near 4,500 thirst while eastern starters begin near 2,200 beside two sources; the declared recipient and donor thresholds enable sharing.            |
| `unequal-table`, 64 / 64    | `SOURCE_BOTTLENECK`           | `PHASE_4_2_UNEQUAL_EASTERN_FINITE_SOURCES`       | Eight creatures rely on two eastern sources starting at 16/28, renewing one unit every 220 ticks, with three slots each while thirstier western starters cross the passage. |

These rationales explain calibration prevalence; they do not prescribe or
script outcomes. No shelter label exceeded 85% in any scenario, so no
shelter-label dominance rationale is frozen.

## Settlement macro decision

The frozen `SETTLEMENT` macro band is the all-seed paired comparison
`petri-world -> unequal-table` on
`profile.settlement.horizon.activeShelterCount`:

| Field                              | Frozen or observed value                 |
| ---------------------------------- | ---------------------------------------- |
| Metric                             | `ACTIVE_SHELTER_COUNT`                   |
| Paired seeds                       | 64                                       |
| Missing-value policy               | `ZERO_IS_OBSERVED`                       |
| Eligible-pair policy               | `ALL_LOCKED_SEEDS`                       |
| Delta statistic                    | absolute paired mean of right minus left |
| Observed signed mean delta         | -0.421875                                |
| Frozen minimum absolute mean delta | 0.25                                     |
| Observed paired Cohen dz           | -0.756174                                |
| Frozen minimum absolute Cohen dz   | 0.5                                      |

The gate evaluates magnitudes, so the observed negative direction is
descriptive only; it does not freeze a claim that one named scenario must
always exceed the other. `ACTIVE_SHELTER_COUNT` was selected after reviewing
all six scenario comparisons and is correlated with the
`ESTABLISHED_SETTLEMENT` horizon label. That post-selection and correlation
limit any claim of independent confirmation. The v2 rerun uses the same seeds
and can verify exact frozen evaluation, but it is not an independent sample;
only the still-sealed holdout can provide that test.

Nullable `MEAN_SHELTER_CONDITION` was not selected. Its Petri-to-Unequal
comparison retained only one eligible pair, so its apparent difference cannot
support a stable all-corpus settlement gate. The chosen active-shelter count is
defined for all 64 pairs and truthfully treats zero shelters as an observed
zero.

## Evidence boundary and next actions

The reserved Phase 4.2 holdout seeds `2001..2064` were not run, inspected, or
used in this decision. They remain sealed. The next automated step is the
same-seed post-freeze v2 calibration using the frozen definition fingerprint;
that result and its separate verification review must pass before holdout
authorization.

The three-browser suite, final NVDA workflow, accessibility and visual review,
performance evidence, five-person formative round, and five-new-person
confirmatory comprehension round remain pending or separately gated. No human
or release gate is satisfied by this review, and Phase 4.2 is not
release-complete.
