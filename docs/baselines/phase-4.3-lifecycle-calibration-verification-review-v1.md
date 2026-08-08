# Phase 4.3 lifecycle frozen-verification review v1

Status: **NOT RUN — template only, not unlock evidence**  
Created: **8 August 2026**

This form is reserved for the post-freeze same-seed artifact at
`docs/baselines/phase-4.3-lifecycle-calibration-v2.json.gz`. No v2 execution,
artifact, checksum, review, or approval is recorded here. The holdout remains
sealed and disabled.

## Required provenance

| Field | Recorded value |
| --- | --- |
| Discovery artifact SHA-256 | `[NOT RECORDED]` |
| Discovery review SHA-256 | `[NOT RECORDED]` |
| Frozen verification execution | `[NOT RUN]` |
| Verification artifact SHA-256 | `[NOT RECORDED]` |
| Verification readable companion SHA-256 | `[NOT RECORDED]` |
| Execution commit | `[NOT RECORDED]` |
| Frozen definition fingerprint | `[NOT RECORDED]` |
| Artifact definition fingerprint | `[NOT RECORDED]` |
| Runtime definition fingerprint | `[NOT RECORDED]` |
| Scenarios / seeds / ticks | Expected: four catalog scenarios / `1..64` / `10,000` |
| Expected cases | 256 |
| Reviewer and review date | `[NOT RECORDED]` |

## Authentication before execution

| Check | Observation | Decision |
| --- | --- | --- |
| Discovery compressed bytes match sidecar | `[NOT OBSERVED]` | `NOT RECORDED` |
| Discovery review hash and reviewed disposition match policy | `[NOT OBSERVED]` | `NOT RECORDED` |
| Full discovery matrix regenerates exactly | `[NOT OBSERVED]` | `NOT RECORDED` |
| Runtime contract equals reviewed frozen fingerprint | `[NOT OBSERVED]` | `NOT RECORDED` |
| Canonical v2 targets were absent before execution | `[NOT OBSERVED]` | `NOT RECORDED` |

## Frozen verification results

| Gate | Required observation | Recorded result |
| --- | --- | --- |
| Corpus identity | Exact 256 cases; no missing or duplicate case | `[NOT OBSERVED]` |
| Hard invariants | Every run and scenario passes, including lifecycle invariants | `[NOT OBSERVED]` |
| Outcome bands | Every reviewed classifier-4 scenario band passes | `[NOT OBSERVED]` |
| Dominance | Every reviewed rationale passes | `[NOT OBSERVED]` |
| Population bands | Every reviewed population rule passes | `[NOT OBSERVED]` |
| Inherited macro bands | Required historical dimensions pass under the frozen interpretation | `[NOT OBSERVED]` |
| Lifecycle macro bands | Required lifecycle materiality rules pass | `[NOT OBSERVED]` |
| Profiles and derivation | Full profiles, aggregates, outcomes, comparisons, and definitions retained and re-derived | `[NOT OBSERVED]` |
| Evidence boundary | Artifact explicitly disclaims a release claim | `[NOT OBSERVED]` |

## Review disposition

Current disposition: **NOT RECORDED**.

A future reviewed revision must record a `PASS` or `FAIL` for each gate, attach
the exact artifact and review hashes, and show that discovery, frozen v2, the
checked-in policy, and runtime share one frozen definition fingerprint. A
matching free-form sentence or placeholder is not authorization.

Even a passing v2 review does not open the holdout by itself. The explicit
policy edit must additionally bind a clean release-candidate commit and valid
automated-release-check, deployment-smoke, and final-NVDA evidence hashes.
