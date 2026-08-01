# Phase 2.5 activity profile schema v2

Schema v2 keeps every sampling and calculation rule from [schema v1](phase-2.5-metrics-v1.md), and replaces its two explicit interaction-claim authority gaps with deterministic counters retained by `sim-core`.

## Interaction-claim observations

- `contentionCount` increments once for a required claim attempt when at least one candidate footprint slot is already owned by a retained claim or occupied at its exact fixed-point endpoint by another living creature. The attempt may still succeed at a different slot.
- `failedClaimCount` increments once when a required claim attempt cannot obtain any reachable candidate slot. A failure may result from occupancy, blocked footprint geometry, or route reachability, so it is not relabelled as contention unless the independent contention condition also held.
- Both counters are monotonic authoritative `SimulationMetrics` fields. A profile reports the positive delta between the initial and final sampled state, so activity before the requested window is excluded.
- Slot saturation remains a sampled-state measure. It is not treated as proof that a claim was attempted.

The fixed corpora, one-tick cadence, completed-action, movement, occupancy, overlap, slot-utilisation, interaction, significant-event, intervention-response, percentile, and warning definitions remain unchanged from schema v1. The same commands apply:

```sh
npm run --silent profile -- --ticks 10000
npm run --silent profile -- --seeds 1..20 --ticks 10000
```

## Final behavior-v2 reference

The checked-in [schema-v2 final reference artifact](phase-2.5-final-reference-v2.json) was captured over seeds 4182, 921, and 23 at 10,000 ticks each.

| Seed | Final hash         | `KEEP` share | Occupied p10 / median | Exact overlap / longest streak | Slot utilisation | Contention / failed claims | Interactions | Significant / trailing silence |
| ---: | ------------------ | -----------: | --------------------: | -----------------------------: | ---------------: | -------------------------: | -----------: | -----------------------------: |
| 4182 | `fefd92b9e909d944` |       16.62% |                 8 / 8 |                     0.038% / 1 |           50.01% |              1,126 / 2,791 |          543 |                       44 / 827 |
|  921 | `610754c0a701f190` |       14.19% |                 8 / 8 |                     0.033% / 1 |           50.04% |                943 / 2,034 |          451 |                      6 / 8,800 |
|   23 | `a00076aa05f2bb3b` |       13.73% |                 8 / 8 |                     0.018% / 1 |           48.30% |                961 / 2,032 |          535 |                        48 / 77 |

Across the corpus there are 3,030 contended attempts and 6,857 failed required claims. These are attempt counters, not rates or unique-creature counts; they make slot pressure reviewable without parsing prose or inferring an attempt from saturation.
