# Tiny Civilisations phase-4.2-calibration matrix evidence

Status: **machine-generated automated evidence; not a release claim**

## Contract

- Artifact: `phase-4.2-calibration-v1.json.gz`
- SHA-256: `296239c70c1e13de577e5a5b19b5871584acb37d22ce21349782de4b3a6c1e78`
- Activity-profile schema: 5
- Scenario-analysis schema: 4
- Outcome classifier: 3
- Phase 4.2 definition status: CANDIDATE
- Phase 4.2 definition contract: schema 1, SHA256_CANONICAL_JSON_V1
- Phase 4.2 definition fingerprint: `d541624e55c2e2ef0757c13b2a68da4f81489a23903aa3e27956b10fc33a9922`
- Scenarios: `petri-world`, `split-banks`, `scattered-plenty`, `unequal-table`
- Seeds: 1..64 (64 seeds)
- Horizon: 10000 ticks per run
- Primary runs: 256
- Ordering: catalog-then-seed
- Internal exact repeats: Not evaluated by this corpus
- Paired descriptive comparisons: 6
- Convergence diagnostics: DIFFERENCE_OBSERVED: 36

## Automated scenario results

| Scenario | Hard invariants | Contract bands | Outcome bands | Calibration provenance | Holdout provenance |
| --- | --- | --- | --- | --- | --- |
| `petri-world` | PASS | PARTIAL | NOT_EVALUATED | PHASE_4_2_CANDIDATE_CALIBRATION_PRESENT | NOT_PRESENT |
| `split-banks` | PASS | PARTIAL | NOT_EVALUATED | PHASE_4_2_CANDIDATE_CALIBRATION_PRESENT | NOT_PRESENT |
| `scattered-plenty` | PASS | PARTIAL | NOT_EVALUATED | PHASE_4_2_CANDIDATE_CALIBRATION_PRESENT | NOT_PRESENT |
| `unequal-table` | PASS | PARTIAL | NOT_EVALUATED | PHASE_4_2_CANDIDATE_CALIBRATION_PRESENT | NOT_PRESENT |

### Candidate Phase 4.2 outcome-incidence review (not frozen)

Classifier version: 3. Calibration SHA-256: `n/a`. Candidate incidences are discovery evidence only; no Phase 4.2 threshold is frozen or passing.

| Scenario | Required label | Status | Occurrences / eligible runs | Frozen minimum |
| --- | --- | --- | ---: | ---: |

#### Dominance-rationale review

Any label above 85% incidence requires a checked-in rationale grounded in declared mechanics and scenario facts. A rationale explains prevalence in the evidence; it does not make the outcome scripted.

| Scenario | Label | Status | Incidence | Checked-in rationale |
| --- | --- | --- | ---: | --- |
| `petri-world` | SOURCE_BOTTLENECK | NOT_EVALUATED | 100.0% | MISSING |
| `petri-world` | PERSISTENT_DEHYDRATION | NOT_EVALUATED | 100.0% | MISSING |
| `split-banks` | SOURCE_BOTTLENECK | NOT_EVALUATED | 100.0% | MISSING |
| `split-banks` | PERSISTENT_DEHYDRATION | NOT_EVALUATED | 100.0% | MISSING |
| `scattered-plenty` | PERSISTENT_PRIVATE_RESERVES | NOT_EVALUATED | 90.6% | MISSING |
| `scattered-plenty` | SOURCE_BOTTLENECK | NOT_EVALUATED | 95.3% | MISSING |
| `unequal-table` | PERSISTENT_PRIVATE_RESERVES | NOT_EVALUATED | 95.3% | MISSING |
| `unequal-table` | SHARED_HYDRATION | NOT_EVALUATED | 100.0% | MISSING |
| `unequal-table` | SOURCE_BOTTLENECK | NOT_EVALUATED | 100.0% | MISSING |

- Rationale failures: none

### Factual multi-label incidence

Labels are nonexclusive and descriptive. They do not identify a winning scenario or prove causality.

| Scenario | Label | Occurrences / eligible runs |
| --- | --- | ---: |
| `petri-world` | Cooperative shared storage | 30 / 64 |
| `petri-world` | Fragmented social structure | 0 / 64 |
| `petri-world` | Persistent private reserves | 34 / 64 |
| `petri-world` | Recurring conflict | 12 / 64 |
| `petri-world` | Shared hydration | 40 / 64 |
| `petri-world` | Source bottleneck | 64 / 64 |
| `petri-world` | Persistent dehydration | 64 / 64 |
| `petri-world` | Concentrated water routes | 0 / 64 |
| `petri-world` | Established settlement | 30 / 64 |
| `petri-world` | Chronic shelter neglect | 0 / 64 |
| `petri-world` | Shelter crowding | 0 / 64 |
| `petri-world` | Guest sheltering | 1 / 64 |
| `petri-world` | Settlement relocation | 0 / 64 |
| `petri-world` | Quiet stalemate | 0 / 64 |
| `split-banks` | Cooperative shared storage | 13 / 64 |
| `split-banks` | Fragmented social structure | 0 / 64 |
| `split-banks` | Persistent private reserves | 51 / 64 |
| `split-banks` | Recurring conflict | 4 / 64 |
| `split-banks` | Shared hydration | 21 / 64 |
| `split-banks` | Source bottleneck | 64 / 64 |
| `split-banks` | Persistent dehydration | 64 / 64 |
| `split-banks` | Concentrated water routes | 0 / 64 |
| `split-banks` | Established settlement | 13 / 64 |
| `split-banks` | Chronic shelter neglect | 0 / 64 |
| `split-banks` | Shelter crowding | 0 / 64 |
| `split-banks` | Guest sheltering | 0 / 64 |
| `split-banks` | Settlement relocation | 0 / 64 |
| `split-banks` | Quiet stalemate | 0 / 64 |
| `scattered-plenty` | Cooperative shared storage | 6 / 64 |
| `scattered-plenty` | Fragmented social structure | 0 / 64 |
| `scattered-plenty` | Persistent private reserves | 58 / 64 |
| `scattered-plenty` | Recurring conflict | 0 / 64 |
| `scattered-plenty` | Shared hydration | 0 / 64 |
| `scattered-plenty` | Source bottleneck | 61 / 64 |
| `scattered-plenty` | Persistent dehydration | 0 / 64 |
| `scattered-plenty` | Concentrated water routes | 0 / 64 |
| `scattered-plenty` | Established settlement | 6 / 64 |
| `scattered-plenty` | Chronic shelter neglect | 0 / 64 |
| `scattered-plenty` | Shelter crowding | 0 / 64 |
| `scattered-plenty` | Guest sheltering | 0 / 64 |
| `scattered-plenty` | Settlement relocation | 0 / 64 |
| `scattered-plenty` | Quiet stalemate | 0 / 64 |
| `unequal-table` | Cooperative shared storage | 3 / 64 |
| `unequal-table` | Fragmented social structure | 0 / 64 |
| `unequal-table` | Persistent private reserves | 61 / 64 |
| `unequal-table` | Recurring conflict | 1 / 64 |
| `unequal-table` | Shared hydration | 64 / 64 |
| `unequal-table` | Source bottleneck | 64 / 64 |
| `unequal-table` | Persistent dehydration | 54 / 64 |
| `unequal-table` | Concentrated water routes | 0 / 64 |
| `unequal-table` | Established settlement | 3 / 64 |
| `unequal-table` | Chronic shelter neglect | 0 / 64 |
| `unequal-table` | Shelter crowding | 0 / 64 |
| `unequal-table` | Guest sheltering | 0 / 64 |
| `unequal-table` | Settlement relocation | 0 / 64 |
| `unequal-table` | Quiet stalemate | 0 / 64 |

## Candidate Phase 4.2 paired macro review (not frozen)

- Table version: 1
- Corpus validation: PHASE_4_2_CALIBRATION_CANDIDATE
- Band evaluation status: NOT_EVALUATED
- Distinct Phase 3 dimensions: NOT_EVALUATED (n/a observed; 3 required)
- Passing SETTLEMENT bands: NOT_EVALUATED (n/a observed; 1 required)
- Calibration SHA-256: `n/a`
- Artifact release claim: false

| Dimension | Scenario pair | Metric | Status | |mean delta| / minimum | |dz| / minimum | Eligible-pair policy | Paired seeds / required |
| --- | --- | --- | --- | ---: | ---: | --- | ---: |
| SOCIAL | `petri-world -> unequal-table` | GROUP_COUNT | NOT_EVALUATED | 0.421875 / 0.25 | 0.756174 / 0.5 | ALL_LOCKED_SEEDS; ZERO_IS_OBSERVED | 64 / 64 |
| STORAGE | `petri-world -> unequal-table` | STORED_RESOURCE_UNITS | NOT_EVALUATED | 33.75 / 20 | 0.756175 / 0.5 | ALL_LOCKED_SEEDS; ZERO_IS_OBSERVED | 64 / 64 |
| CONFLICT | `petri-world -> scattered-plenty` | ATTACK_EVENT_COUNT | NOT_EVALUATED | 2.828125 / 2 | 0.44548 / 0.3 | ALL_LOCKED_SEEDS; ZERO_IS_OBSERVED | 64 / 64 |
| SPATIAL | `scattered-plenty -> unequal-table` | CREATURE_PAIR_DISTANCE_MEDIAN | NOT_EVALUATED | 5.1875 / 2 | 2.324537 / 0.5 | ALL_LOCKED_SEEDS; ZERO_IS_OBSERVED | 64 / 64 |

## Phase 4.2 settlement discovery distributions

Medians and paired effects are descriptive candidate evidence only. No Phase 4.2 threshold is frozen or passing. `n/a` means no eligible shelter observation.

| Scenario | Active shelters | Sheltered-rest share | Mean condition | Reservation utilization | Guest uses | Denied claims |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `petri-world` | 0 (64 seeds) | 0 (64 seeds) | 8316.772148 (30 seeds) | 0.14408 (30 seeds) | 0 (64 seeds) | 0 (64 seeds) |
| `split-banks` | 0 (64 seeds) | 0 (64 seeds) | 8315.742132 (13 seeds) | 0.121273 (13 seeds) | 0 (64 seeds) | 0 (64 seeds) |
| `scattered-plenty` | 0 (64 seeds) | 0 (64 seeds) | 8371.624038 (6 seeds) | 0.09219 (6 seeds) | 0 (64 seeds) | 0 (64 seeds) |
| `unequal-table` | 0 (64 seeds) | 0 (64 seeds) | 8346.764712 (3 seeds) | 0.114555 (3 seeds) | 0 (64 seeds) | 0 (64 seeds) |

### Candidate SETTLEMENT pair effects

Effects are descriptive right-minus-left comparisons. The missing-value policy and eligible paired-seed count are shown so absent shelters cannot silently become zero-condition observations.

| Scenario pair | Metric | Missing-value policy | Paired seeds | Mean delta | Cohen dz |
| --- | --- | --- | ---: | ---: | ---: |
| `petri-world -> split-banks` | ACTIVE_SHELTER_COUNT | ZERO_IS_OBSERVED | 64 | -0.265625 | -0.5967 |
| `petri-world -> split-banks` | SHELTERED_REST_SHARE | ZERO_IS_OBSERVED | 64 | -0.230968 | -0.574825 |
| `petri-world -> split-banks` | MEAN_SHELTER_CONDITION | EXCLUDE_PAIR_IF_EITHER_VALUE_MISSING | 13 | 17.53091 | 0.13454 |
| `petri-world -> split-banks` | SHELTER_GUEST_USE_EVENTS | ZERO_IS_OBSERVED | 64 | -0.015625 | -0.125 |
| `petri-world -> split-banks` | SETTLEMENT_RELOCATION_COUNT | ZERO_IS_OBSERVED | 64 | 0 | n/a |
| `petri-world -> scattered-plenty` | ACTIVE_SHELTER_COUNT | ZERO_IS_OBSERVED | 64 | -0.375 | -0.721901 |
| `petri-world -> scattered-plenty` | SHELTERED_REST_SHARE | ZERO_IS_OBSERVED | 64 | -0.326187 | -0.716103 |
| `petri-world -> scattered-plenty` | MEAN_SHELTER_CONDITION | EXCLUDE_PAIR_IF_EITHER_VALUE_MISSING | 5 | 40.024534 | 0.684286 |
| `petri-world -> scattered-plenty` | SHELTER_GUEST_USE_EVENTS | ZERO_IS_OBSERVED | 64 | -0.015625 | -0.125 |
| `petri-world -> scattered-plenty` | SETTLEMENT_RELOCATION_COUNT | ZERO_IS_OBSERVED | 64 | 0 | n/a |
| `petri-world -> unequal-table` | ACTIVE_SHELTER_COUNT | ZERO_IS_OBSERVED | 64 | -0.421875 | -0.756174 |
| `petri-world -> unequal-table` | SHELTERED_REST_SHARE | ZERO_IS_OBSERVED | 64 | -0.370606 | -0.747969 |
| `petri-world -> unequal-table` | MEAN_SHELTER_CONDITION | EXCLUDE_PAIR_IF_EITHER_VALUE_MISSING | 1 | 12.601366 | n/a |
| `petri-world -> unequal-table` | SHELTER_GUEST_USE_EVENTS | ZERO_IS_OBSERVED | 64 | -0.015625 | -0.125 |
| `petri-world -> unequal-table` | SETTLEMENT_RELOCATION_COUNT | ZERO_IS_OBSERVED | 64 | 0 | n/a |
| `split-banks -> scattered-plenty` | ACTIVE_SHELTER_COUNT | ZERO_IS_OBSERVED | 64 | -0.109375 | -0.248198 |
| `split-banks -> scattered-plenty` | SHELTERED_REST_SHARE | ZERO_IS_OBSERVED | 64 | -0.095219 | -0.241727 |
| `split-banks -> scattered-plenty` | MEAN_SHELTER_CONDITION | EXCLUDE_PAIR_IF_EITHER_VALUE_MISSING | 3 | 54.043394 | 10.256363 |
| `split-banks -> scattered-plenty` | SHELTER_GUEST_USE_EVENTS | ZERO_IS_OBSERVED | 64 | 0 | n/a |
| `split-banks -> scattered-plenty` | SETTLEMENT_RELOCATION_COUNT | ZERO_IS_OBSERVED | 64 | 0 | n/a |
| `split-banks -> unequal-table` | ACTIVE_SHELTER_COUNT | ZERO_IS_OBSERVED | 64 | -0.15625 | -0.326395 |
| `split-banks -> unequal-table` | SHELTERED_REST_SHARE | ZERO_IS_OBSERVED | 64 | -0.139638 | -0.321133 |
| `split-banks -> unequal-table` | MEAN_SHELTER_CONDITION | EXCLUDE_PAIR_IF_EITHER_VALUE_MISSING | 0 | n/a | n/a |
| `split-banks -> unequal-table` | SHELTER_GUEST_USE_EVENTS | ZERO_IS_OBSERVED | 64 | 0 | n/a |
| `split-banks -> unequal-table` | SETTLEMENT_RELOCATION_COUNT | ZERO_IS_OBSERVED | 64 | 0 | n/a |
| `scattered-plenty -> unequal-table` | ACTIVE_SHELTER_COUNT | ZERO_IS_OBSERVED | 64 | -0.046875 | -0.142059 |
| `scattered-plenty -> unequal-table` | SHELTERED_REST_SHARE | ZERO_IS_OBSERVED | 64 | -0.044419 | -0.144597 |
| `scattered-plenty -> unequal-table` | MEAN_SHELTER_CONDITION | EXCLUDE_PAIR_IF_EITHER_VALUE_MISSING | 1 | -271.688127 | n/a |
| `scattered-plenty -> unequal-table` | SHELTER_GUEST_USE_EVENTS | ZERO_IS_OBSERVED | 64 | 0 | n/a |
| `scattered-plenty -> unequal-table` | SETTLEMENT_RELOCATION_COUNT | ZERO_IS_OBSERVED | 64 | 0 | n/a |

## Release boundary

This artifact records only the deterministic matrix result. It does not satisfy or replace the separate cross-browser execution record, manual assistive-technology pass, performance record, visual review, or usability sessions. Those gates must remain marked pending until observations from the actual sessions or runs are attached.

Each individual calibration or holdout artifact intentionally keeps `releaseClaim: false`. The release ledger may combine reviewed calibration provenance with an untouched holdout result; generating either artifact alone does not make a release claim.
