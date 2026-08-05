# Phase 4.1 water and mobility contract

Phase 4.1 adds hydration pressure without changing the eight-creature, 48 × 32
world scale. Potable water is a finite renewable resource node; shallow-water
terrain remains non-potable terrain with a higher movement cost. Travel choices
use deterministic weighted path cost, while recent traffic trails remain a
derived observation and never alter authoritative pathfinding.

This document records the implemented contract. It does not claim that the
Phase 3 or Phase 4 manual accessibility, cross-browser, corpus, performance, or
usability release gates have passed.

## Authoritative mechanics

- Creatures have `thirst` on the existing `0..10,000` need scale and may carry
  `water` inside the existing six-unit inventory capacity.

- The hydration action family is `GATHER_WATER`, `DRINK`, and `SHARE_WATER`,
  selected through `RELIEVE_THIRST` and the corresponding fetch, carried-drink,
  and share plans.

- Thirst rises by 5 per tick plus 2 while moving. Severe thirst begins at 8,000,
  emergency hydration begins at 9,000, and health falls by 3 per tick from
  9,400 thirst to a nonlethal floor of 1,200.

- Drinking consumes one unit over three ticks, reduces thirst by 6,500, and
  restores 150 health. Gathering takes ten ticks and receives at most two units,
  subject to source stock, shared carrying capacity, and source interaction
  slots. Sharing takes four ticks and transfers one unit to a creature at or
  above 6,000 thirst when the giver remains below 7,000.

- Inventory repair removes overflow in the stable order material, water, then
  food. Structures must retain `water: 0`; communal storage is outside this
  slice.

- `REPLENISH_WATER` and `DRAIN_WATER` target an existing source. Applied amounts
  are clamped by source capacity or stock and rejection uses
  `NO_WATER_SOURCE`, `SOURCE_FULL`, or `SOURCE_EMPTY`.

## Scenario definition 2

Scenario IDs, dimensions, population, and terrain topology are unchanged.
Scenario-definition version 2 adds the following water nodes and keyed initial
thirst. Map-generation version remains 1 because no terrain tiles changed.

| Scenario           | Water nodes `(x,y): stock/max; regeneration`                           | Initial thirst                       |
| ------------------ | ---------------------------------------------------------------------- | ------------------------------------ |
| `petri-world`      | `(34,20): 24/40; +1/180 ticks`                                         | `2,500 ±700`                         |
| `split-banks`      | `(22,16): 18/30; +1/240 ticks`                                         | `3,200 ±700`                         |
| `scattered-plenty` | `(20,12)`, `(27,12)`, `(20,19)`, `(27,19)`: each `18/24; +1/140 ticks` | `1,800 ±700`                         |
| `unequal-table`    | `(34,18)`, `(34,22)`: each `16/28; +1/220 ticks`                       | west `4,500 ±700`; east `2,200 ±700` |

Thirst jitter uses the keyed `creature-thirst` channel, so it does not consume
or shift the saved sequential random stream. Structural validation requires
every water node to occupy shallow-water terrain, have valid stock and
regeneration bounds, expose an interaction footprint, and be reachable from
every starting creature.

## Compatibility versions

| Contract                                        | Phase 4.1 version |
| ----------------------------------------------- | ----------------: |
| behavior / authoritative state                  |             4 / 4 |
| command / snapshot                              |             2 / 4 |
| replay / save                                   |             3 / 3 |
| scenario envelope / definition / map generation |         2 / 2 / 1 |
| experiment / outcome / causal evidence          |         4 / 3 / 4 |
| intervention response / activity profile        |             2 / 4 |
| browser workspace / Worker protocol             |             3 / 3 |

Compatibility checks match explicit historical tuples rather than comparing
legacy values with mutable current constants.

- A behavior-3/state-3 save is cloned, upgraded, and fully validated before it
  can replace the active run. The migration keeps the scenario ID, seed,
  topology, existing actions, decisions, and genuine events; adds definition-2
  sources in declaration order; initializes thirst to 2,500 and water counters
  to zero; and records at the current tick that hydration rules began after the
  upgrade. It does not synthesize earlier water evidence.
- Behavior-3 replays retain scenario identity, ordered commands, and their
  declared final-tick horizon, but discard final hashes and checkpoints. They
  rerun from tick zero under Phase 4 and remain unverified until that rerun
  completes.
- Behavior-3 experiments retain branch topology, commands, labels, and
  bookmarks. Outcomes, response traces, target hashes, and checkpoints are
  cleared while each declared target-tick horizon is retained. A version-2
  browser workspace follows the same rule and reports
  `Upgraded; prior verification unavailable.` after its save is atomically
  loaded.
- Version-1 and version-2 artifacts continue through their existing migration
  steps before receiving the Phase 4 upgrade. Unknown tuples, malformed nested
  data, invalid references, and failed post-migration validation are rejected.

## Evidence boundary

Automated contracts cover deterministic scenario compilation, keyed thirst,
source placement, water/state bounds, overflow order, save/replay/experiment
migration, input immutability, Worker/direct compatibility, and the version-4
golden corpus. Headless hydration profiles and classifiers are versioned
separately from authoritative state.

### Headless hydration evidence

Activity-profile schema 4 records the hydration evidence needed for calibration
and holdout review without treating any single measure as a scripted ending. It
includes:

- thirst unit-ticks, mean thirst, severe and critical exposure, severe-spell
  counts and duration, and observed recovery latency;
- water gathered, drunk, shared, and carried, including distinct donor and
  recipient IDs;
- source stock/capacity exposure, depletion, utilisation, replenishment and
  drainage, gather attempts, source-selection concentration, slot occupancy,
  saturation, contended attempts, and the fully blocked subset;
- deterministic weighted access cost for every living-creature/source pair,
  nearest-source cost, and unreachable-pair counts;
- undirected water-trip route edges with dominant-edge share and HHI; and
- first factual hydration-decision response latency for linked applied water
  interventions inside the existing 120-tick response window.

Contention is authoritative rather than inferred: a gather activation counts
when its claim attempt encounters at least one already occupied legal slot at
the selected source. The profile separately retains the stricter subset where
every legal slot was occupied and the gather could not start. Source stock,
thirst, carrying, and slot exposure are sampled from each post-tick state. These
definitions are part of the schema-4 evidence contract and are reported as
limitations in the profile rather than replaced with inferred proxy data.

Outcome-classifier version 2 adds these factual, non-exclusive labels. The
thresholds are fixed before any Phase 4 holdout is opened:

| Label                       | Version-2 rule                                                                       |
| --------------------------- | ------------------------------------------------------------------------------------ |
| `SHARED_HYDRATION`          | at least 4 units shared and at least 3 distinct recipients                           |
| `SOURCE_BOTTLENECK`         | at least 500 depleted source-ticks, or contention on at least 10% of gather attempts |
| `PERSISTENT_DEHYDRATION`    | severe-thirst exposure at least 10%, or any severe spell at least 1,000 ticks        |
| `CONCENTRATED_WATER_ROUTES` | dominant water-route edge at least 35% and route HHI at least 0.15                   |

The matrix comparison adds a `HYDRATION` dimension for severe exposure,
depleted source-ticks, shared units, and water-route concentration. Calibration
may change mechanics values, but changing any classifier rule requires a new
classifier version and invalidates previously unopened holdout status.

The full calibration and untouched holdout runs, three-browser release record,
manual NVDA pass, performance release measurements, visual review, and fresh
formative/confirmatory usability sessions remain required before Phase 4.1 is
called release-complete.
