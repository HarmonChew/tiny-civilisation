# Tiny Civilisations calibration matrix evidence

Status: **machine-generated automated evidence; not a release claim**

## Contract

- Artifact: `phase-4.1-calibration-v1.json.gz`
- SHA-256: `18f23505a7454bbc2787832ea12b349d2bb5b7e19c797e1d2a38c0d2ca5b3828`
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
| `petri-world` | PASS | PASS | PENDING_FULL_CALIBRATION_AND_HOLDOUT | FULL_CALIBRATION_PRESENT | NOT_PRESENT |
| `split-banks` | PASS | PASS | PENDING_FULL_CALIBRATION_AND_HOLDOUT | FULL_CALIBRATION_PRESENT | NOT_PRESENT |
| `scattered-plenty` | PASS | PASS | PENDING_FULL_CALIBRATION_AND_HOLDOUT | FULL_CALIBRATION_PRESENT | NOT_PRESENT |
| `unequal-table` | PASS | PASS | PENDING_FULL_CALIBRATION_AND_HOLDOUT | FULL_CALIBRATION_PRESENT | NOT_PRESENT |

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

## Release boundary

This artifact records only the deterministic matrix result. It does not satisfy or replace the separate cross-browser execution record, manual assistive-technology pass, performance record, visual review, or usability sessions. Those gates must remain marked pending until observations from the actual sessions or runs are attached.

Scenario outcome bands remain a release claim only when the checked report explicitly records reviewed calibration provenance, unchanged holdout provenance, and `releaseOutcomeClaim: true`. Generating this file does not change that status.
