# Phase 4.1 release-evidence status v1

Last reviewed: **5 August 2026**  
Status: **automated release gates pass; human evidence incomplete**

Phase 4.1 is implemented across the authoritative simulation, browser,
headless runner, persistence contracts, and tests. This ledger distinguishes
completed automated observations from the human records that remain
outstanding. Phase 4.1 is not release-complete while either human gate remains
pending.

## Implemented scope

- Finite renewable potable-water nodes, thirst, severe-thirst exposure,
  nonlethal dehydration damage, shared inventory capacity, gathering,
  drinking, sharing, regeneration, and source interventions.
- Deterministic weighted A* target scoring to reachable interaction slots,
  decision-tick/navigation-revision caching, and factual `MOVE_COST` reasons.
- Client-derived observational traffic trails, source stock/depletion marks,
  hydration state and source access in the roster, inspector, navigator,
  moments, response traces, and equal-horizon comparisons.
- Version-4 behavior/state/snapshot and related Phase 4.1 contract advances,
  explicit historical tuple matching, atomic migration, cleared legacy
  verification, and no fabricated historical water evidence.
- Activity-profile schema 4 hydration metrics, outcome-classifier version 2,
  a version-4 golden fixture, direct/Worker/save/replay/chunk determinism
  coverage, and four new water screenshot baselines.

## Automated evidence ledger

| Gate                                  | Evidence collected                                                                                                                                                                                                                                                                                                             | Status             |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------ |
| Formatting, lint, and type-check      | All three final commands pass.                                                                                                                                                                                                                                                                                                 | **Pass**           |
| Unit and integration suites           | The final complete run passes 438 tests.                                                                                                                                                                                                                                                                                       | **Pass**           |
| Coverage                              | All workspace coverage suites pass: sim-core 87.93%, headless 90.88%, and web 71.73% statement coverage.                                                                                                                                                                                                                       | **Pass**           |
| Golden and runtime determinism        | Golden verification passes with the Phase 1–3 fixtures retained and the Phase 4 fixture checked in. Direct, Worker, save/load, replay, chunked, and one-shot paths are covered for every scenario.                                                                                                                             | **Pass**           |
| Production build and bundle           | Build passes. Largest JavaScript is 357,476 bytes raw and 108,384 bytes gzip; total JavaScript is 357,249 bytes gzip; CSS is 14,377 bytes gzip.                                                                                                                                                                                | **Pass**           |
| Portable matrix export                | Deterministic compressed JSON, SHA-256, and Markdown companions are attached under `docs/baselines/`; stdout remains streamed in its compatible pretty form.                                                                                                                                                                   | **Pass**           |
| Discovery calibration review          | The [256-run discovery artifact](phase-4.1-calibration-v1.md), SHA-256 `18f23505a7454bbc2787832ea12b349d2bb5b7e19c797e1d2a38c0d2ca5b3828`, and [pre-holdout review](phase-4.1-calibration-review-v1.md) froze classifier v2, scenario labels, dominance rationales, and macro bands without changing mechanics.                | **Pass**           |
| Frozen calibration                    | Four scenarios × seeds `1..64` × 10,000 ticks: all hard invariants, contract bands, outcome bands, dominance rationales, and four paired macro bands pass. [Summary](phase-4.1-calibration-v2.md), [artifact](phase-4.1-calibration-v2.json.gz), SHA-256 `a4adf627068cf56c64f670ce10c022098e5c16852540be070a1e6ef1025d4a3d`.   | **Pass**           |
| Untouched holdout                     | Four scenarios × seeds `1001..1064` × 10,000 ticks: the frozen classifier, required labels, rationales, and four macro bands pass without post-open behavior tuning. [Summary](phase-4.1-holdout-v2.md), [artifact](phase-4.1-holdout-v2.json.gz), SHA-256 `65b13db8200ff1f7ccdf7672ba9931e4a4160e8e5342390e6ad394ca1c42355d`. | **Pass**           |
| Payload and persistence budgets       | All four measured scenario rows pass the 128 KiB bootstrap, 65,536-byte hot-frame, and 2,500,000-byte save limits. See [the performance baseline](../performance-baseline.md).                                                                                                                                                 | **Pass**           |
| Throughput                            | Final uncontended results range from 35,996.5 to 40,007.8 ticks/second; all exceed the 25,905 floor.                                                                                                                                                                                                                           | **Pass**           |
| Chromium routine journeys             | The complete production suite passes 44/44.                                                                                                                                                                                                                                                                                    | **Pass**           |
| Visual baselines                      | All 34 baselines pass, including contention, sharing, depletion, and aftermath at medium width.                                                                                                                                                                                                                                | **Pass**           |
| Chromium/Firefox/WebKit release suite | The release matrix passes 12/12 in 2.6 minutes: 4/4 in each browser.                                                                                                                                                                                                                                                           | **Pass**           |
| Manual NVDA                           | No manual observation record is attached.                                                                                                                                                                                                                                                                                      | Pending human gate |
| Fresh usability check                 | No five-person session record is attached.                                                                                                                                                                                                                                                                                     | Pending human gate |

## Automated release result

The frozen calibration and untouched holdout both pass the reviewed classifier
and macro expectations. Each individual corpus artifact correctly retains
`releaseClaim: false`; this ledger combines their provenance without treating
either file alone as a release declaration. Formatting, lint, type-checking,
tests, coverage, golden verification, build, payload, bundle, performance,
Chromium, visual, and three-browser gates all pass on the final implementation.

Future behavior or projection changes must continue to keep bootstrap payloads
below 128 KiB, hot frames below 65,536 bytes, saves at or below 2.5 MB, bundles
within the checked ceilings, and throughput at or above 25,905 ticks/second.

## Human evidence still required

The NVDA pass must exercise the navigator, selection, water sources and other
world objects, moments, interventions, evidence navigation, focus restoration,
and announcements. Automated axe, keyboard, zoom, reduced-motion, forced-color,
touch, and screenshot checks do not replace this observation.

A fresh five-person usability check must establish that at least four people
can identify who is thirsty, what that creature is doing and why, where
source/route pressure exists, and the factual effect of a water intervention.
Record failures and resolve blocking or high-severity findings before calling
the slice release-complete.
