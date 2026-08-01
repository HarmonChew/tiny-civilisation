# Performance baseline

Phase 1 and Phase 2.5 measurements were captured on 1 August 2026 with Node.js 24 on the local Windows development machine. Machine-sensitive latency remains diagnostic; deterministic sizes, bounds, ratios, and generous ceilings are automated gates.

## Headless simulation

- Corpus: seeds 1–20, 10,000 ticks per seed, 200,000 total ticks after a 2,000-tick warm-up.
- Pre-Phase-2.5 reference: 23,408.7 ticks per second.
- Final Phase 2.5 runs: 47,572.6, 47,100.3, and 45,191.9 ticks per second; median 47,100.3.
- Protected Phase 2.5 reference: 47,100 ticks per second.
- Regression floor: 25,905 ticks per second (55% of the protected reference, intentionally tolerant of CI hardware variance).

Run `npm run benchmark` separately from the portable `npm run check` gate. Override the corpus or floor with `TINY_CIV_BENCHMARK_SEEDS`, `TINY_CIV_BENCHMARK_TICKS`, or `TINY_CIV_MIN_TICKS_PER_SECOND`. A slower machine can supply a calibrated floor, but a pull request must not silently lower the checked-in reference. The current interaction-claim counters and profile formulas are defined in the [Phase 2.5 activity-profile schema v2](baselines/phase-2.5-metrics-v2.md).

## Projection, hashing, replay, and persistence

The browser streams projection-only observation frames. Static tiles are sent only at bootstrap/load and navigation revisions; canonical hashes, detached checkpoints, causal evidence, entity detail, intervention outcomes, current outcomes, and comparison outcomes are explicit typed runtime queries. Ordinary frames carry `hash: null`; the UI retains the latest explicitly verified hash and its tick. The seed-4182 tick-5,000 hot frame is exactly 64,759 UTF-8 JSON bytes, 777 bytes below the automated 65,536-byte gate.

A 200-sample Node diagnostic at seed 4182/tick 5,000 measured:

| Operation                   |     Median |        p95 |    Maximum |
| --------------------------- | ---------: | ---------: | ---------: |
| `createRenderSnapshot`      |   0.064 ms |   0.104 ms |   0.716 ms |
| Snapshot JSON serialization |   0.228 ms |   0.278 ms |   2.250 ms |
| Explicit canonical hash     | 132.383 ms | 152.680 ms | 172.774 ms |

The explicit hash cost is why live visual refreshes reuse the latest verified checkpoint hash instead of recomputing one per frame. A fresh in-process 5,000-tick reconstruction took 200.108 ms in the same diagnostic. These latency values are observations, not portable CI ceilings.

The seed-4182 save measured 2,105,426 UTF-8 bytes at tick 5,000 and 2,138,617 bytes at tick 10,000. A deterministic test gates the 10,000-tick reference save at 2,500,000 bytes; retained event, history, decision, memory, intent, and route collections remain bounded.

## Production bundle

The root `npm run build` runs `scripts/check-web-bundle.mjs` after Vite and enforces:

- no JavaScript chunk above 400 KiB raw or 120 KiB gzip;
- no more than 360 KiB gzip across all emitted JavaScript, including optional Pixi renderer chunks and the Worker;
- no more than 24 KiB gzip across emitted CSS.

The experiment workspace and moment replay controls are lazy chunks. The exact content-hashed filenames and measured sizes are printed by the build gate, so the budget remains reviewable without documenting unstable asset names here.

## Browser responsiveness

The Chromium suite covers real Worker/Pixi flows, experiment persistence and replay, causal navigation, automated accessibility scanning, reduced motion, forced colors, true touch input, 200% text, and 400% effective-zoom reflow. Its visual matrix contains six deterministic story states at 390 × 844, 1024 × 768, and 1440 × 960: 18 screenshots total. The targeted touch/text/reflow checks pass 3/3, the matrix passes 18/18, and the stable final build, bundle gate, and whole-file Chromium run pass 26/26.

Chromium runs treat console/page errors, interaction timeouts, accessibility violations, responsive-flow failures, and screenshot diffs as portable regressions. Long-task and heap numbers vary substantially across virtualized runners; they remain diagnostic until Windows and Linux distributions support a defensible ratchet. Manual assistive-technology and usability evidence is tracked separately and is not inferred from timing data. Firefox and WebKit have not been run.
