# Performance baseline

Baseline captured on 1 August 2026 before the Phase 1 refactor.

## Headless simulation

- Corpus: seeds 1–20, 10,000 ticks per seed, 200,000 total ticks.
- Runtime: Node.js 24 on the local Windows development machine.
- Observed aggregate throughput: 23,408.7 ticks per second.
- Regression floor: 12,874 ticks per second (55% of the reference, intentionally tolerant of CI hardware variance).
- Phase 1 verification: 23,704.9 ticks per second on the same corpus and machine (1.3% above the protected reference).

Run `npm run benchmark` to execute the same in-process workload after a short warm-up. Override the corpus or floor with `TINY_CIV_BENCHMARK_SEEDS`, `TINY_CIV_BENCHMARK_TICKS`, or `TINY_CIV_MIN_TICKS_PER_SECOND`.

## Browser responsiveness

The Phase 1 Playwright suite records navigation and interaction timing for the real Pixi renderer. CI treats functional timeouts as the portable regression gate; local timing is reported as diagnostic output because animation and canvas timing varies substantially across virtualized runners.
