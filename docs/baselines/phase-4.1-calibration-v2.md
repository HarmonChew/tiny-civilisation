# Tiny Civilisations calibration matrix evidence

Status: **machine-generated automated evidence; not a release claim**

## Contract

- Artifact: `phase-4.1-calibration-v2.json.gz`
- SHA-256: `a4adf627068cf56c64f670ce10c022098e5c16852540be070a1e6ef1025d4a3d`
- Activity-profile schema: 4
- Scenarios: `petri-world`, `split-banks`, `scattered-plenty`, `unequal-table`
- Seeds: 1..64 (64 seeds)
- Horizon: 10000 ticks per run
- Primary runs: 256
- Ordering: catalog-then-seed
- Internal exact repeats: Not evaluated by this corpus
- Paired descriptive comparisons: 6
- Convergence diagnostics: DIFFERENCE_OBSERVED: 30

## Automated scenario results

| Scenario | Hard invariants | Contract bands | Outcome bands | Calibration provenance | Holdout provenance |
| --- | --- | --- | --- | --- | --- |
| `petri-world` | PASS | PASS | PASS | FULL_CALIBRATION_PRESENT | NOT_PRESENT |
| `split-banks` | PASS | PASS | PASS | FULL_CALIBRATION_PRESENT | NOT_PRESENT |
| `scattered-plenty` | PASS | PASS | PASS | FULL_CALIBRATION_PRESENT | NOT_PRESENT |
| `unequal-table` | PASS | PASS | PASS | FULL_CALIBRATION_PRESENT | NOT_PRESENT |

### Frozen outcome-incidence bands

Classifier version: 2. Calibration SHA-256: `18f23505a7454bbc2787832ea12b349d2bb5b7e19c797e1d2a38c0d2ca5b3828`. Thresholds are evaluated only on a complete locked 64-seed, 10,000-tick calibration or holdout corpus.

| Scenario | Required label | Status | Occurrences / eligible runs | Frozen minimum |
| --- | --- | --- | ---: | ---: |
| `petri-world` | COOPERATIVE_SHARED_STORAGE | PASS | 30 / 64 | 8 |
| `petri-world` | SHARED_HYDRATION | PASS | 44 / 64 | 8 |
| `split-banks` | PERSISTENT_PRIVATE_RESERVES | PASS | 52 / 64 | 8 |
| `split-banks` | SHARED_HYDRATION | PASS | 16 / 64 | 8 |
| `scattered-plenty` | PERSISTENT_PRIVATE_RESERVES | PASS | 58 / 64 | 8 |
| `scattered-plenty` | SOURCE_BOTTLENECK | PASS | 59 / 64 | 8 |
| `unequal-table` | PERSISTENT_PRIVATE_RESERVES | PASS | 61 / 64 | 8 |
| `unequal-table` | SHARED_HYDRATION | PASS | 63 / 64 | 8 |

#### Dominance-rationale review

Any label above 85% incidence requires a checked-in rationale grounded in declared mechanics and scenario facts. A rationale explains prevalence in the evidence; it does not make the outcome scripted.

| Scenario | Label | Status | Incidence | Checked-in rationale |
| --- | --- | --- | ---: | --- |
| `petri-world` | SOURCE_BOTTLENECK | PASS | 100.0% | PETRI_SINGLE_EASTERN_SOURCE |
| `petri-world` | PERSISTENT_DEHYDRATION | PASS | 100.0% | PETRI_THIRST_AND_TRAVEL_PRESSURE |
| `split-banks` | SOURCE_BOTTLENECK | PASS | 100.0% | SPLIT_BANKS_PASSAGE_SOURCE |
| `split-banks` | PERSISTENT_DEHYDRATION | PASS | 100.0% | SPLIT_BANKS_SLOW_RENEWAL |
| `scattered-plenty` | PERSISTENT_PRIVATE_RESERVES | PASS | 90.6% | SCATTERED_LOCAL_PLENTY |
| `scattered-plenty` | SOURCE_BOTTLENECK | PASS | 92.2% | SCATTERED_FINITE_DISTRIBUTED_SOURCES |
| `unequal-table` | PERSISTENT_PRIVATE_RESERVES | PASS | 95.3% | UNEQUAL_CROSS_BANK_SOCIAL_CONTRAST |
| `unequal-table` | SHARED_HYDRATION | PASS | 98.4% | UNEQUAL_NEED_AND_DONOR_CONTRAST |
| `unequal-table` | SOURCE_BOTTLENECK | PASS | 100.0% | UNEQUAL_EASTERN_FINITE_SOURCES |

- Rationale failures: none

### Factual multi-label incidence

Labels are nonexclusive and descriptive. They do not identify a winning scenario or prove causality.

| Scenario | Label | Occurrences / eligible runs |
| --- | --- | ---: |
| `petri-world` | Cooperative shared storage | 30 / 64 |
| `petri-world` | Fragmented social structure | 0 / 64 |
| `petri-world` | Persistent private reserves | 34 / 64 |
| `petri-world` | Recurring conflict | 14 / 64 |
| `petri-world` | Shared hydration | 44 / 64 |
| `petri-world` | Source bottleneck | 64 / 64 |
| `petri-world` | Persistent dehydration | 64 / 64 |
| `petri-world` | Concentrated water routes | 0 / 64 |
| `petri-world` | Quiet stalemate | 0 / 64 |
| `split-banks` | Cooperative shared storage | 12 / 64 |
| `split-banks` | Fragmented social structure | 0 / 64 |
| `split-banks` | Persistent private reserves | 52 / 64 |
| `split-banks` | Recurring conflict | 3 / 64 |
| `split-banks` | Shared hydration | 16 / 64 |
| `split-banks` | Source bottleneck | 64 / 64 |
| `split-banks` | Persistent dehydration | 64 / 64 |
| `split-banks` | Concentrated water routes | 0 / 64 |
| `split-banks` | Quiet stalemate | 0 / 64 |
| `scattered-plenty` | Cooperative shared storage | 6 / 64 |
| `scattered-plenty` | Fragmented social structure | 0 / 64 |
| `scattered-plenty` | Persistent private reserves | 58 / 64 |
| `scattered-plenty` | Recurring conflict | 0 / 64 |
| `scattered-plenty` | Shared hydration | 0 / 64 |
| `scattered-plenty` | Source bottleneck | 59 / 64 |
| `scattered-plenty` | Persistent dehydration | 0 / 64 |
| `scattered-plenty` | Concentrated water routes | 0 / 64 |
| `scattered-plenty` | Quiet stalemate | 0 / 64 |
| `unequal-table` | Cooperative shared storage | 3 / 64 |
| `unequal-table` | Fragmented social structure | 0 / 64 |
| `unequal-table` | Persistent private reserves | 61 / 64 |
| `unequal-table` | Recurring conflict | 1 / 64 |
| `unequal-table` | Shared hydration | 63 / 64 |
| `unequal-table` | Source bottleneck | 64 / 64 |
| `unequal-table` | Persistent dehydration | 54 / 64 |
| `unequal-table` | Concentrated water routes | 0 / 64 |
| `unequal-table` | Quiet stalemate | 0 / 64 |

## Frozen paired macro bands

- Table version: 1
- Corpus validation: FULL_CALIBRATION
- Band evaluation status: PASS
- Distinct Phase 3 dimensions: PASS (4 observed; 3 required)
- Calibration SHA-256: `18f23505a7454bbc2787832ea12b349d2bb5b7e19c797e1d2a38c0d2ca5b3828`
- Artifact release claim: false

| Dimension | Scenario pair | Metric | Status | |mean delta| / minimum | |dz| / minimum | Paired seeds |
| --- | --- | --- | --- | ---: | ---: | ---: |
| SOCIAL | `petri-world -> unequal-table` | GROUP_COUNT | PASS | 0.421875 / 0.25 | 0.756174 / 0.5 | 64 |
| STORAGE | `petri-world -> unequal-table` | STORED_RESOURCE_UNITS | PASS | 33.734375 / 20 | 0.7561 / 0.5 | 64 |
| CONFLICT | `petri-world -> scattered-plenty` | ATTACK_EVENT_COUNT | PASS | 3.09375 / 2 | 0.471407 / 0.3 | 64 |
| SPATIAL | `scattered-plenty -> unequal-table` | CREATURE_PAIR_DISTANCE_MEDIAN | PASS | 5.15625 / 2 | 2.35335 / 0.5 | 64 |

## Release boundary

This artifact records only the deterministic matrix result. It does not satisfy or replace the separate cross-browser execution record, manual assistive-technology pass, performance record, visual review, or usability sessions. Those gates must remain marked pending until observations from the actual sessions or runs are attached.

Each individual calibration or holdout artifact intentionally keeps `releaseClaim: false`. The release ledger may combine reviewed calibration provenance with an untouched holdout result; generating either artifact alone does not make a release claim.
