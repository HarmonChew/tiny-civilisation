# Performance baseline

Phase 1 and Phase 2.5 measurements were captured on 1 August 2026. Phase 3
measurements were captured on 4 August 2026, and Phase 4.1 measurements on 5
August 2026, with Node.js 24.11.1 on the same local Windows development
machine. Machine-sensitive latency remains diagnostic; deterministic sizes,
bounds, ratios, and generous ceilings are automated gates.

## Headless simulation

- Corpus: seeds 1–20, 10,000 ticks per seed, 200,000 total ticks after a 2,000-tick warm-up.
- Pre-Phase-2.5 reference: 23,408.7 ticks per second.
- Final Phase 2.5 runs: 47,572.6, 47,100.3, and 45,191.9 ticks per second; median 47,100.3.
- Protected Phase 2.5 reference: 47,100 ticks per second.
- Regression floor: 25,905 ticks per second (55% of the protected reference, intentionally tolerant of CI hardware variance).

The historical Phase 3 benchmark keeps the same 20-seed/10,000-tick corpus and
runs it separately for every scenario:

| Scenario           | Compiled-map hash  | Ticks/second | Result |
| ------------------ | ------------------ | -----------: | ------ |
| `petri-world`      | `838df3795ee9e8e0` |     40,450.4 | pass   |
| `split-banks`      | `e989021f3827f7a9` |     40,936.1 | pass   |
| `scattered-plenty` | `88e1e124f15c3910` |     44,518.1 | pass   |
| `unequal-table`    | `a3c914ef494ffaff` |     35,986.6 | pass   |

Phase 4.1 retains that corpus and inherited floor. Its final uncontended
measurements are:

| Scenario           | Compiled-map hash  | Ticks/second | Margin over floor | Result |
| ------------------ | ------------------ | -----------: | ----------------: | ------ |
| `petri-world`      | `f21ecdb935f2bc8e` |     37,629.6 |             45.3% | pass   |
| `split-banks`      | `06541eb2e89525ca` |     38,149.1 |             47.3% | pass   |
| `scattered-plenty` | `1626166bcf24ce83` |     35,996.5 |             39.0% | pass   |
| `unequal-table`    | `6f16475a03ba40dc` |     40,007.8 |             54.4% | pass   |

`scattered-plenty` is the slowest Phase 4.1 measurement and remains 39.0%
above the inherited floor. Machine speed may change the observed values; the
25,905-tick floor remains the portable gate.

Run `npm run benchmark -- --scenario <id>` separately from the portable
`npm run check` gate. Override the corpus or floor with
`TINY_CIV_BENCHMARK_SEEDS`, `TINY_CIV_BENCHMARK_TICKS`, or
`TINY_CIV_MIN_TICKS_PER_SECOND`. A slower machine can supply a calibrated
floor, but a pull request must not silently lower the checked-in reference.
Phase 4.1 activity-profile schema v4 is implemented in
`apps/headless/src/activity-collector.ts`; the Phase 2.5 schema remains a
historical baseline in [its metric definitions](baselines/phase-2.5-metrics-v2.md).

## Projection, hashing, replay, and persistence

The browser streams projection-only observation frames. Static tiles and
named-region/chokepoint geometry are sent only at bootstrap/load and navigation
revisions; canonical hashes, detached checkpoints, causal evidence, entity
detail, intervention outcomes, current outcomes, and comparison outcomes are
explicit typed runtime queries. Ordinary frames carry `hash: null`; the UI
retains the latest explicitly verified hash and its tick. Phase 4.1 adds water,
source-access, and bounded route data without moving authoritative state into
hot frames.

The historical Phase 3 runtime envelopes and saves measured as follows:

| Scenario           | Bootstrap bytes | Tick-5,000 hot-frame bytes | Tick-10,000 save bytes |
| ------------------ | --------------: | -------------------------: | ---------------------: |
| `petri-world`      |         110,965 |                     58,527 |              1,861,845 |
| `split-banks`      |         110,904 |                     62,594 |              2,445,750 |
| `scattered-plenty` |         111,385 |                     45,226 |              1,719,152 |
| `unequal-table`    |         111,023 |                     60,480 |              2,033,694 |

The final Phase 4.1 measurements, using each scenario's canonical seed, are:

| Scenario           | Bootstrap bytes | Tick-5,000 hot-frame bytes | Tick-10,000 save bytes |
| ------------------ | --------------: | -------------------------: | ---------------------: |
| `petri-world`      |         113,089 |                     46,863 |              1,830,671 |
| `split-banks`      |         113,038 |                     52,432 |              1,915,545 |
| `scattered-plenty` |         114,300 |                     49,450 |              1,812,563 |
| `unequal-table`    |         113,443 |                     47,644 |              1,798,310 |

Tests gate every bootstrap below 128 KiB, every dynamic frame below 65,536
bytes, and every canonical 10,000-tick save at or below 2,500,000 bytes. The
Phase 4.1 worst cases retain 16,772, 13,104, and 584,455 bytes of headroom
respectively. Event, history, decision, memory, intent, and route collections
remain bounded.

A 200-sample Node diagnostic at seed 4182/tick 5,000 measured:

| Operation                   |     Median |        p95 |    Maximum |
| --------------------------- | ---------: | ---------: | ---------: |
| `createRenderSnapshot`      |   0.064 ms |   0.104 ms |   0.716 ms |
| Snapshot JSON serialization |   0.228 ms |   0.278 ms |   2.250 ms |
| Explicit canonical hash     | 132.383 ms | 152.680 ms | 172.774 ms |

The explicit hash cost is why live visual refreshes reuse the latest verified checkpoint hash instead of recomputing one per frame. A fresh in-process 5,000-tick reconstruction took 200.108 ms in the same diagnostic. These latency values are observations, not portable CI ceilings.

The older Phase 2.5 single-reference payload and save measurements are
superseded by the historical Phase 3 and current Phase 4.1 tables above. The
operation-latency diagnostic remains useful context but has not been recaptured
as a Phase 4.1 release artifact.

## Production bundle

The root `npm run build` runs `scripts/check-web-bundle.mjs` after Vite and enforces:

- no JavaScript chunk above 400 KiB raw or 120 KiB gzip;
- no more than 360 KiB gzip across all emitted JavaScript, including optional Pixi renderer chunks and the Worker;
- no more than 24 KiB gzip across emitted CSS.

The experiment workspace and moment replay controls are lazy chunks. The exact content-hashed filenames and measured sizes are printed by the build gate, so the budget remains reviewable without documenting unstable asset names here.

The final Phase 4.1 build measured 357,476 raw / 108,384 gzip bytes for the
largest JavaScript chunk, 357,249 gzip bytes across all JavaScript, and 14,377
gzip bytes across all CSS. All bundle ceilings pass.

## Browser responsiveness

The Chromium suite covers real Worker/Pixi flows, experiment persistence and
replay, causal navigation, automated accessibility scanning, reduced motion,
forced colors, true touch input, 200% text, and 400% effective-zoom reflow. Its
34 visual baselines retain the 30 Phase 3 scenes and add four medium-width water
moments: depletion, contention, sharing, and aftermath. The stable production
build, bundle gate, and whole-file Chromium run pass 44/44.

The separate release matrix passes 12/12 in 2.6 minutes: four critical journeys
each in Chromium, Firefox, and WebKit. Browser runs treat console/page errors,
interaction timeouts, accessibility violations, responsive-flow failures, and
screenshot diffs as portable regressions. Long-task and heap numbers vary
substantially across virtualized runners; they remain diagnostic until Windows
and Linux distributions support a defensible ratchet.

The final automated verification also passes all 438 unit/integration tests,
golden replays, formatting, lint, type-checking, build, and coverage. Statement
coverage is 87.93% in sim-core, 90.88% in headless, and 71.73% in web. Manual
NVDA and usability evidence remains separate and is not inferred from these
results.
