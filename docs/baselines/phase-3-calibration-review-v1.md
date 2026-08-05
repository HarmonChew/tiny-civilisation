# Tiny Civilisations Phase 3 calibration review v1

Status: **accepted calibration; holdout unopened at freeze time**

This review freezes the Phase 3 automated evidence expectations before the untouched holdout corpus is opened. It does not complete the separate NVDA or usability gates and does not, by itself, mark Phase 3 released.

## Immutable evidence basis

- Historical behavior source: immutable commit `4ff604e`.
- Calibration artifact: `phase-3-calibration-v1.json.gz`.
- SHA-256: `f97017f36c4f2cf46948d4dbf8b33af40fe4f4a04736121ae6232cfb34517a57`.
- Corpus: four scenarios, seeds `1..64`, and `10,000` ticks per run (`256` primary runs).
- Outcome classifier: version `1`.
- Calibration result: all four scenarios passed the hard invariants and contract bands, with no corpus or per-run hard failure.

## Frozen holdout label expectations

Each required label must occur in at least `8/64` eligible holdout runs for its scenario. Labels observed during calibration but not listed as required below do not become holdout requirements.

| Scenario           | Required labels                                             |
| ------------------ | ----------------------------------------------------------- |
| `petri-world`      | `COOPERATIVE_SHARED_STORAGE`, `RECURRING_CONFLICT`          |
| `split-banks`      | `COOPERATIVE_SHARED_STORAGE`, `PERSISTENT_PRIVATE_RESERVES` |
| `scattered-plenty` | `COOPERATIVE_SHARED_STORAGE`, `PERSISTENT_PRIVATE_RESERVES` |
| `unequal-table`    | `COOPERATIVE_SHARED_STORAGE`, `PERSISTENT_PRIVATE_RESERVES` |

`RECURRING_CONFLICT` occurred in `50/64` unequal-table calibration runs, but it is recorded as an additional observation rather than a required holdout label.

## Frozen dominant-label rationale

The only calibration label above `85%` was `COOPERATIVE_SHARED_STORAGE` in `petri-world`, at `57/64` runs (`89.0625%`). Its factual classifier requires all four of the following in the observed run: at least one completed storage structure, at least one retained food or material unit, at least two grouped creatures, and at least one observed food-sharing event. The `57/64` incidence coincides with the calibration incidence of a completed group store. This accounts for the high label incidence without treating it as a scripted ending or a causal claim.

## Frozen cross-scenario macro dimensions

These are descriptive, paired, non-causal calibration comparisons. Delta direction is right scenario minus left scenario; `dz` is the paired standardized mean delta. The strongest observed calibration comparison is frozen for each existing convergence dimension.

| Dimension | Scenario pair                         | Metric                        |   Mean delta |        `dz` |
| --------- | ------------------------------------- | ----------------------------- | -----------: | ----------: |
| Social    | `petri-world` vs `scattered-plenty`   | Group count                   |   `-0.71875` | `-1.586074` |
| Storage   | `petri-world` vs `scattered-plenty`   | Stored resource units         | `-57.515625` | `-1.587597` |
| Conflict  | `scattered-plenty` vs `unequal-table` | Attack event count            |   `26.03125` |   `1.14092` |
| Spatial   | `petri-world` vs `scattered-plenty`   | Median creature-pair distance |   `9.546875` |  `1.991445` |

## Freeze rule

No authoritative behavior, classifier rule, threshold, required label, dominant-label rationale, or macro-dimension expectation may be tuned after this freeze in response to holdout results. If behavior changes after the holdout is opened, this holdout evidence must be reclassified as calibration and a new untouched holdout must use seeds `2001..2064`.
