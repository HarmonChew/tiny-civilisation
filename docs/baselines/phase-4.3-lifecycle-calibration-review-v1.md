# Phase 4.3 lifecycle discovery review v1

Status: **NOT RUN — template only, not unlock evidence**  
Created: **8 August 2026**

This document is a prospective review form for the discovery artifact at
`docs/baselines/phase-4.3-lifecycle-calibration-v1.json.gz`. It contains no
artifact observation, checksum, frozen definition, or approval. The checked-in
holdout remains sealed and disabled.

## Evidence identity

| Field                                     | Recorded value                                    |
| ----------------------------------------- | ------------------------------------------------- |
| Discovery execution                       | `[NOT RUN]`                                       |
| Artifact installed                        | `[NOT RECORDED]`                                  |
| Compressed artifact SHA-256               | `[NOT RECORDED]`                                  |
| Readable companion SHA-256                | `[NOT RECORDED]`                                  |
| Execution commit                          | `[NOT RECORDED]`                                  |
| Candidate definition fingerprint          | `[NOT RECORDED]`                                  |
| Scenarios                                 | Expected: four catalog scenarios in catalog order |
| Seeds                                     | Expected: `1..64`                                 |
| Ticks per run                             | Expected: `10,000`                                |
| Expected cases                            | 256                                               |
| Activity / analysis / classifier versions | Expected: `6 / 5 / 4`                             |
| Reviewer and review date                  | `[NOT RECORDED]`                                  |

Placeholders are deliberately not parseable evidence values and must not be
used to authorize verification or holdout execution.

## Authenticity and completeness review

| Check                                                | Observation      | Decision       |
| ---------------------------------------------------- | ---------------- | -------------- |
| Artifact and sidecar agree                           | `[NOT OBSERVED]` | `NOT RECORDED` |
| Exact corpus identity and 256 unique cases           | `[NOT OBSERVED]` | `NOT RECORDED` |
| Every run reached 10,000 ticks                       | `[NOT OBSERVED]` | `NOT RECORDED` |
| Embedded contract matches official candidate command | `[NOT OBSERVED]` | `NOT RECORDED` |
| Complete per-run activity profiles retained          | `[NOT OBSERVED]` | `NOT RECORDED` |
| Aggregate report re-derives from retained profiles   | `[NOT OBSERVED]` | `NOT RECORDED` |
| No release claim in artifact                         | `[NOT OBSERVED]` | `NOT RECORDED` |

## Lifecycle invariant review

Record counts and inspect examples for every failure; do not reduce this review
to a single aggregate pass string.

| Invariant                                               |     Failure runs | Notes |
| ------------------------------------------------------- | ---------------: | ----- |
| Living population never exceeds 24                      | `[NOT OBSERVED]` |       |
| Every birth has two known parents                       | `[NOT OBSERVED]` |       |
| Recorded mother/father sexes match the contract         | `[NOT OBSERVED]` |       |
| No duplicate identity across creatures and life records | `[NOT OBSERVED]` |       |
| Living/dead flags agree with death state                | `[NOT OBSERVED]` |       |
| Every observed death has a life record                  | `[NOT OBSERVED]` |       |
| No lineage cycle                                        | `[NOT OBSERVED]` |       |
| Metric deltas match lifecycle event counts              | `[NOT OBSERVED]` |       |

## Distribution review

For each scenario, record sample count, minimum, p10, median, IQR, p90, maximum,
and mean where available. Explain missing values rather than substituting zero.

| Measure                    | Petri world      | Split banks      | Scattered plenty | Unequal table    | Review note |
| -------------------------- | ---------------- | ---------------- | ---------------- | ---------------- | ----------- |
| Living at horizon          | `[NOT OBSERVED]` | `[NOT OBSERVED]` | `[NOT OBSERVED]` | `[NOT OBSERVED]` |             |
| Population net change      | `[NOT OBSERVED]` | `[NOT OBSERVED]` | `[NOT OBSERVED]` | `[NOT OBSERVED]` |             |
| Births                     | `[NOT OBSERVED]` | `[NOT OBSERVED]` | `[NOT OBSERVED]` | `[NOT OBSERVED]` |             |
| Deaths and cause mix       | `[NOT OBSERVED]` | `[NOT OBSERVED]` | `[NOT OBSERVED]` | `[NOT OBSERVED]` |             |
| Pregnancies lost           | `[NOT OBSERVED]` | `[NOT OBSERVED]` | `[NOT OBSERVED]` | `[NOT OBSERVED]` |             |
| Dependent youth at horizon | `[NOT OBSERVED]` | `[NOT OBSERVED]` | `[NOT OBSERVED]` | `[NOT OBSERVED]` |             |
| Maximum lineage depth      | `[NOT OBSERVED]` | `[NOT OBSERVED]` | `[NOT OBSERVED]` | `[NOT OBSERVED]` |             |
| Care actions               | `[NOT OBSERVED]` | `[NOT OBSERVED]` | `[NOT OBSERVED]` | `[NOT OBSERVED]` |             |
| Life records and memorials | `[NOT OBSERVED]` | `[NOT OBSERVED]` | `[NOT OBSERVED]` | `[NOT OBSERVED]` |             |
| Mourning and estates       | `[NOT OBSERVED]` | `[NOT OBSERVED]` | `[NOT OBSERVED]` | `[NOT OBSERVED]` |             |
| Group extinctions          | `[NOT OBSERVED]` | `[NOT OBSERVED]` | `[NOT OBSERVED]` | `[NOT OBSERVED]` |             |

## Candidate classifier and band decisions

Record incidence for all inherited and classifier-4 labels. For every proposed
scenario band, dominance rationale, population band, or lifecycle macro band,
state the observed distribution, selected threshold, edge inclusivity, missing-
value policy, minimum eligible cases, and why the rule is descriptive rather
than causal.

| Decision area               | Candidate observation | Reviewed frozen rule | Disposition    |
| --------------------------- | --------------------- | -------------------- | -------------- |
| Classifier 4 factual rules  | `[NOT OBSERVED]`      | `[NOT FROZEN]`       | `NOT RECORDED` |
| Scenario label incidence    | `[NOT OBSERVED]`      | `[NOT FROZEN]`       | `NOT RECORDED` |
| Dominance rationales        | `[NOT OBSERVED]`      | `[NOT FROZEN]`       | `NOT RECORDED` |
| Population bands            | `[NOT OBSERVED]`      | `[NOT FROZEN]`       | `NOT RECORDED` |
| Preserved inherited macros  | `[NOT OBSERVED]`      | `[NOT FROZEN]`       | `NOT RECORDED` |
| Lifecycle macro materiality | `[NOT OBSERVED]`      | `[NOT FROZEN]`       | `NOT RECORDED` |

## Review disposition

Current disposition: **NOT RECORDED**.

A future reviewed revision must choose `ACCEPTED_UNCHANGED` or
`SUPERSEDED_FOR_V2`, identify every changed semantic input, record the frozen
definition fingerprint, and link focused tests. Discovery review alone does
not authorize the holdout. Frozen same-seed verification and its distinct
review are still required.
