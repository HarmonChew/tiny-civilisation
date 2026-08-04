# Phase 3 portable smoke evidence v1

Captured: **4 August 2026**  
Status: **diagnostic PR evidence; not calibration, holdout, or release evidence**

## Contract

- Scenarios: `petri-world`, `split-banks`, `scattered-plenty`, `unequal-table`
- Seeds: calibration seeds 1–8 for every scenario
- Horizon: 2,000 ticks per run
- Executions: 32 primary runs plus one exact repeat of every run
- Ordering: catalog, then ascending seed
- Behavior/state/activity schemas: 3 / 3 / 3
- Command: `npm run headless -- matrix --corpus smoke`

The command retains all 32 primary per-seed profiles in its machine-readable
output. Repeat profiles are compared exactly and then discarded so only one
simulation and streaming collector need to be live at a time.

## Result

- 32/32 repeat comparisons matched exactly.
- Every scenario passed the inherited per-run hard invariants and the seven
  locked contract safety bands.
- Quiet-stalemate classification was correctly `NOT_EVALUATED`: the smoke
  horizon cannot contain the required final 1,000-tick window of a 10,000-tick
  run.
- The report emitted all six paired scenario comparisons and 24
  social/storage/conflict/spatial convergence diagnostics. These comparisons
  are explicitly descriptive and non-causal.

### Factual multi-label incidence

Labels are nonexclusive. Counts below are occurrences among eight eligible
runs; quiet stalemate has zero eligible runs at this horizon.

| Scenario           | Cooperative shared storage | Fragmented social structure | Persistent private reserves | Recurring conflict |
| ------------------ | -------------------------: | --------------------------: | --------------------------: | -----------------: |
| `petri-world`      |                        8/8 |                         0/8 |                         0/8 |                3/8 |
| `split-banks`      |                        2/8 |                         0/8 |                         6/8 |                0/8 |
| `scattered-plenty` |                        2/8 |                         1/8 |                         6/8 |                0/8 |
| `unequal-table`    |                        7/8 |                         0/8 |                         1/8 |                7/8 |

The machine report also publishes Wilson 95% intervals for each incidence.
The table is evidence that the classifier can describe different retained
facts in the smoke subset; it is not a locked expected range.

### Canonical 2,000-tick readout

One canonical seed is a browser fixture, not an independent corpus result.
These facts explain the developed-state visual baselines without standing in
for the matrix:

| Scenario / seed           | Groups | Completed stores | Wild food | Shared units | Thefts | Attacks |
| ------------------------- | -----: | ---------------: | --------: | -----------: | -----: | ------: |
| `petri-world` / 4182      |      1 |                1 |       112 |           12 |      1 |       6 |
| `split-banks` / 7319      |      1 |                1 |       105 |            4 |      3 |      18 |
| `scattered-plenty` / 1203 |      0 |                0 |       320 |            2 |      0 |       0 |
| `unequal-table` / 921     |      1 |                1 |       133 |            2 |      2 |      14 |

## Release boundary

Scenario-specific social, resource/storage, conflict/cooperation, spatial,
time-to-event, and label-incidence bands remain pending by design. They may be
set only after reviewing the complete 64-seed/10,000-tick calibration output,
then must be applied unchanged to the untouched 64-seed holdout corpus. No
value in this smoke report is a Phase 3 release claim.
