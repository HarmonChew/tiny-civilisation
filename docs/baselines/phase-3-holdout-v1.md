# Tiny Civilisations Phase 3 holdout evidence

Status: **historical behavior-v3 automated evidence; human gates remain separate**

- Artifact: `phase-3-holdout-v1.json.gz`
- SHA-256: `ee982dc12955b37afca273176864b57a438cf1b4a27272135d954408f2d78419`
- Activity-profile schema: 3
- Scenarios: `petri-world`, `split-banks`, `scattered-plenty`, `unequal-table`
- Seeds: 1001..1064 (64 seeds)
- Horizon: 10000 ticks per run
- Primary runs: 256

| Scenario | Hard invariants | Contract bands |
| --- | --- | --- |
| `petri-world` | PASS | PASS |
| `split-banks` | PASS | PASS |
| `scattered-plenty` | PASS | PASS |
| `unequal-table` | PASS | PASS |

| Scenario | Label | Occurrences / eligible runs |
| --- | --- | ---: |
| `petri-world` | Cooperative shared storage | 51 / 64 |
| `petri-world` | Fragmented social structure | 0 / 64 |
| `petri-world` | Persistent private reserves | 13 / 64 |
| `petri-world` | Recurring conflict | 24 / 64 |
| `petri-world` | Quiet stalemate | 0 / 64 |
| `split-banks` | Cooperative shared storage | 23 / 64 |
| `split-banks` | Fragmented social structure | 0 / 64 |
| `split-banks` | Persistent private reserves | 41 / 64 |
| `split-banks` | Recurring conflict | 11 / 64 |
| `split-banks` | Quiet stalemate | 0 / 64 |
| `scattered-plenty` | Cooperative shared storage | 10 / 64 |
| `scattered-plenty` | Fragmented social structure | 0 / 64 |
| `scattered-plenty` | Persistent private reserves | 54 / 64 |
| `scattered-plenty` | Recurring conflict | 10 / 64 |
| `scattered-plenty` | Quiet stalemate | 0 / 64 |
| `unequal-table` | Cooperative shared storage | 48 / 64 |
| `unequal-table` | Fragmented social structure | 0 / 64 |
| `unequal-table` | Persistent private reserves | 16 / 64 |
| `unequal-table` | Recurring conflict | 46 / 64 |
| `unequal-table` | Quiet stalemate | 0 / 64 |

This evidence was reconstructed from immutable commit `4ff604e` after Phase 4 work began. It does not replace the manual NVDA or usability gates.
