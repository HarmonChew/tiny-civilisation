# Tiny Civilisations Phase 3 calibration evidence

Status: **historical behavior-v3 automated evidence; human gates remain separate**

- Artifact: `phase-3-calibration-v1.json.gz`
- SHA-256: `f97017f36c4f2cf46948d4dbf8b33af40fe4f4a04736121ae6232cfb34517a57`
- Activity-profile schema: 3
- Scenarios: `petri-world`, `split-banks`, `scattered-plenty`, `unequal-table`
- Seeds: 1..64 (64 seeds)
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
| `petri-world` | Cooperative shared storage | 57 / 64 |
| `petri-world` | Fragmented social structure | 0 / 64 |
| `petri-world` | Persistent private reserves | 7 / 64 |
| `petri-world` | Recurring conflict | 23 / 64 |
| `petri-world` | Quiet stalemate | 0 / 64 |
| `split-banks` | Cooperative shared storage | 20 / 64 |
| `split-banks` | Fragmented social structure | 0 / 64 |
| `split-banks` | Persistent private reserves | 44 / 64 |
| `split-banks` | Recurring conflict | 7 / 64 |
| `split-banks` | Quiet stalemate | 0 / 64 |
| `scattered-plenty` | Cooperative shared storage | 11 / 64 |
| `scattered-plenty` | Fragmented social structure | 0 / 64 |
| `scattered-plenty` | Persistent private reserves | 53 / 64 |
| `scattered-plenty` | Recurring conflict | 6 / 64 |
| `scattered-plenty` | Quiet stalemate | 0 / 64 |
| `unequal-table` | Cooperative shared storage | 51 / 64 |
| `unequal-table` | Fragmented social structure | 0 / 64 |
| `unequal-table` | Persistent private reserves | 13 / 64 |
| `unequal-table` | Recurring conflict | 50 / 64 |
| `unequal-table` | Quiet stalemate | 0 / 64 |

This evidence was reconstructed from immutable commit `4ff604e` after Phase 4 work began. It does not replace the manual NVDA or usability gates.
