# Tiny Civilisations smoke matrix evidence

Status: **machine-generated automated evidence; not a release claim**

## Contract

- Artifact: `phase-4.1-smoke-v1.json.gz`
- SHA-256: `fdd70a6b59ce8aad7bf3da5818d392fb49dfe4589fbd5801b7ab897ca206c4c3`
- Activity-profile schema: 4
- Scenarios: `petri-world`, `split-banks`, `scattered-plenty`, `unequal-table`
- Seeds: 1..8 (8 seeds)
- Horizon: 2000 ticks per run
- Primary runs: 32
- Ordering: catalog-then-seed
- Internal exact repeats: 32 of 32 exact repeats matched
- Paired descriptive comparisons: 6
- Convergence diagnostics: DIFFERENCE_OBSERVED: 26, EXACT_CONVERGENCE: 4

## Automated scenario results

| Scenario           | Hard invariants | Contract bands | Outcome bands                        | Calibration provenance | Holdout provenance |
| ------------------ | --------------- | -------------- | ------------------------------------ | ---------------------- | ------------------ |
| `petri-world`      | PASS            | PASS           | PENDING_FULL_CALIBRATION_AND_HOLDOUT | SMOKE_SUBSET_ONLY      | NOT_PRESENT        |
| `split-banks`      | FAIL            | FAIL           | PENDING_FULL_CALIBRATION_AND_HOLDOUT | SMOKE_SUBSET_ONLY      | NOT_PRESENT        |
| `scattered-plenty` | PASS            | PASS           | PENDING_FULL_CALIBRATION_AND_HOLDOUT | SMOKE_SUBSET_ONLY      | NOT_PRESENT        |
| `unequal-table`    | FAIL            | FAIL           | PENDING_FULL_CALIBRATION_AND_HOLDOUT | SMOKE_SUBSET_ONLY      | NOT_PRESENT        |

### Factual multi-label incidence

Labels are nonexclusive and descriptive. They do not identify a winning scenario or prove causality.

| Scenario           | Label                       | Occurrences / eligible runs |
| ------------------ | --------------------------- | --------------------------: |
| `petri-world`      | Cooperative shared storage  |                       3 / 8 |
| `petri-world`      | Fragmented social structure |                       0 / 8 |
| `petri-world`      | Persistent private reserves |                       5 / 8 |
| `petri-world`      | Recurring conflict          |                       1 / 8 |
| `petri-world`      | Shared hydration            |                       0 / 8 |
| `petri-world`      | Source bottleneck           |                       8 / 8 |
| `petri-world`      | Persistent dehydration      |                       0 / 8 |
| `petri-world`      | Concentrated water routes   |                       0 / 8 |
| `petri-world`      | Quiet stalemate             |                       0 / 0 |
| `split-banks`      | Cooperative shared storage  |                       0 / 8 |
| `split-banks`      | Fragmented social structure |                       0 / 8 |
| `split-banks`      | Persistent private reserves |                       8 / 8 |
| `split-banks`      | Recurring conflict          |                       0 / 8 |
| `split-banks`      | Shared hydration            |                       0 / 8 |
| `split-banks`      | Source bottleneck           |                       8 / 8 |
| `split-banks`      | Persistent dehydration      |                       0 / 8 |
| `split-banks`      | Concentrated water routes   |                       0 / 8 |
| `split-banks`      | Quiet stalemate             |                       0 / 0 |
| `scattered-plenty` | Cooperative shared storage  |                       1 / 8 |
| `scattered-plenty` | Fragmented social structure |                       0 / 8 |
| `scattered-plenty` | Persistent private reserves |                       7 / 8 |
| `scattered-plenty` | Recurring conflict          |                       0 / 8 |
| `scattered-plenty` | Shared hydration            |                       0 / 8 |
| `scattered-plenty` | Source bottleneck           |                       8 / 8 |
| `scattered-plenty` | Persistent dehydration      |                       0 / 8 |
| `scattered-plenty` | Concentrated water routes   |                       0 / 8 |
| `scattered-plenty` | Quiet stalemate             |                       0 / 0 |
| `unequal-table`    | Cooperative shared storage  |                       1 / 8 |
| `unequal-table`    | Fragmented social structure |                       0 / 8 |
| `unequal-table`    | Persistent private reserves |                       7 / 8 |
| `unequal-table`    | Recurring conflict          |                       0 / 8 |
| `unequal-table`    | Shared hydration            |                       0 / 8 |
| `unequal-table`    | Source bottleneck           |                       8 / 8 |
| `unequal-table`    | Persistent dehydration      |                       0 / 8 |
| `unequal-table`    | Concentrated water routes   |                       0 / 8 |
| `unequal-table`    | Quiet stalemate             |                       0 / 0 |

## Release boundary

This artifact records only the deterministic matrix result. It does not satisfy or replace the separate cross-browser execution record, manual assistive-technology pass, performance record, visual review, or usability sessions. Those gates must remain marked pending until observations from the actual sessions or runs are attached.

Scenario outcome bands remain a release claim only when the checked report explicitly records reviewed calibration provenance, unchanged holdout provenance, and `releaseOutcomeClaim: true`. Generating this file does not change that status.
