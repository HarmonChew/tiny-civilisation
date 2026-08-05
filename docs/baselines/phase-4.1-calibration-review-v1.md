# Phase 4.1 calibration review v1

Reviewed: **5 August 2026**  
Decision: **freeze classifier v2 and the selected scenario bands; rerun required**

This review records the decision made from the first complete Phase 4.1
calibration corpus. It is not holdout evidence and does not make a release
claim.

## Discovery evidence

- Artifact: [`phase-4.1-calibration-v1.json.gz`](phase-4.1-calibration-v1.json.gz)
- Readable summary: [`phase-4.1-calibration-v1.md`](phase-4.1-calibration-v1.md)
- SHA-256: `18f23505a7454bbc2787832ea12b349d2bb5b7e19c797e1d2a38c0d2ca5b3828`
- Corpus: four scenarios × seeds `1..64` × 10,000 ticks, for 256 primary runs
- Activity-profile schema: 4

All 256 primary runs passed the per-run hard invariants. Every scenario passed
the corpus hard-invariant and contract-band checks:

| Scenario           | Occupied tiles p10 / median | Exact overlap | Corpus `KEEP` / maximum seed `KEEP` | Action / desire families |
| ------------------ | --------------------------: | ------------: | ----------------------------------: | -----------------------: |
| `petri-world`      |                       7 / 8 |       0.0225% |                 23.6178% / 29.4523% |                   17 / 5 |
| `split-banks`      |                       7 / 8 |       0.0275% |                 24.3385% / 28.1829% |                   17 / 5 |
| `scattered-plenty` |                       7 / 8 |       0.0350% |                 21.8709% / 23.9284% |                   14 / 5 |
| `unequal-table`    |                       7 / 8 |       0.0275% |                 27.1852% / 29.0056% |                   17 / 5 |

The acceptance floors are occupied-tiles p10 at least 3 and median at least 4,
exact overlap below 1%, corpus `KEEP` below 35%, every seed below 50%, at least
six physical-action families, and at least four desire families.

## Freeze decision

No authoritative mechanics value was changed after reviewing this discovery
corpus. The numeric mechanics entering the frozen rerun are therefore the same
values that produced the artifact above.

Outcome-classifier version 2 is frozen with these non-exclusive factual rules:

| Label                       | Frozen rule                                                                          |
| --------------------------- | ------------------------------------------------------------------------------------ |
| `SHARED_HYDRATION`          | At least 4 water units shared and at least 3 distinct recipients                     |
| `SOURCE_BOTTLENECK`         | At least 500 depleted source-ticks, or contention on at least 10% of gather attempts |
| `PERSISTENT_DEHYDRATION`    | Severe-thirst exposure at least 10%, or any severe spell at least 1,000 ticks        |
| `CONCENTRATED_WATER_ROUTES` | Dominant water-route edge at least 35% and route HHI at least 0.15                   |

The following scenario-label bands were selected before opening the holdout.
Each listed label must occur in at least 8 of 64 runs:

| Scenario           | Frozen minimum-incidence labels                    | Discovery incidence |
| ------------------ | -------------------------------------------------- | ------------------- |
| `petri-world`      | `COOPERATIVE_SHARED_STORAGE`; `SHARED_HYDRATION`   | 30/64; 44/64        |
| `split-banks`      | `PERSISTENT_PRIVATE_RESERVES`; `SHARED_HYDRATION`  | 52/64; 16/64        |
| `scattered-plenty` | `PERSISTENT_PRIVATE_RESERVES`; `SOURCE_BOTTLENECK` | 58/64; 59/64        |
| `unequal-table`    | `PERSISTENT_PRIVATE_RESERVES`; `SHARED_HYDRATION`  | 61/64; 63/64        |

Labels above 85% incidence are permitted only with the following explicit
scenario explanations; an unlisted label above 85% fails the band:

- `petri-world`: `SOURCE_BOTTLENECK`, `PERSISTENT_DEHYDRATION`
- `split-banks`: `SOURCE_BOTTLENECK`, `PERSISTENT_DEHYDRATION`
- `scattered-plenty`: `PERSISTENT_PRIVATE_RESERVES`, `SOURCE_BOTTLENECK`
- `unequal-table`: `PERSISTENT_PRIVATE_RESERVES`, `SHARED_HYDRATION`,
  `SOURCE_BOTTLENECK`

The macro check requires at least three materially different original macro
dimensions. These four paired bands were selected:

| Dimension and comparison                      | Metric                        |                              Frozen minimum |   Discovery result |
| --------------------------------------------- | ----------------------------- | ------------------------------------------: | -----------------: |
| Social, `petri-world` ↔ `unequal-table`       | Horizon group count           | absolute mean 0.25; absolute paired dz 0.50 | 0.421875; 0.756174 |
| Storage, `petri-world` ↔ `unequal-table`      | Stored resource units         |   absolute mean 20; absolute paired dz 0.50 |  33.734375; 0.7561 |
| Conflict, `petri-world` ↔ `scattered-plenty`  | Creature-attack events        |    absolute mean 2; absolute paired dz 0.30 |  3.09375; 0.471407 |
| Spatial, `scattered-plenty` ↔ `unequal-table` | Median creature-pair distance |    absolute mean 2; absolute paired dz 0.50 |   5.15625; 2.35335 |

## Evidence boundary and next action

The discovery artifact still reports provisional outcome-band status because it
was generated before the reviewed bands were frozen in the evaluator. Run the
unchanged calibration corpus again and attach it as the frozen-band result.
Only after that result passes may seeds `1001..1064` be opened as the untouched
holdout.

The holdout remains unopened at this review. If authoritative behavior changes
after it is opened, that evidence must be reclassified as calibration and
seeds `2001..2064` must become the new frozen holdout.
