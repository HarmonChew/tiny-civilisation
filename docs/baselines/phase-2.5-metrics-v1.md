# Phase 2.5 activity profile schema v1

> Historical schema: [schema v2](phase-2.5-metrics-v2.md) adds authoritative contention and failed-claim counters while preserving the rules below.

This document fixes the measurement rules used by the headless `profile` command. The profile is observational: changing one of these definitions requires a schema-version change, while changing simulation balance does not.

## Run the fixed corpora

```sh
# Reference story seeds (the default)
npm run --silent profile -- --ticks 10000

# Balance sample
npm run --silent profile -- --seeds 1..20 --ticks 10000

# Short focused run
npm run --silent profile -- --seed 4182 --ticks 2000
```

The command writes deterministic JSON to stdout. Wall-clock performance fields are diagnostic and are the only non-deterministic values. The report schema is `1`, the sample cadence is one authoritative tick, and the default reference seeds are `4182`, `921`, and `23`.

## Window and streaming rules

- The collector is created from a starting state and then observes exactly one successive state per tick. Duplicate, skipped, reordered, or seed-switched samples fail explicitly.
- The starting state is included in spatial distributions. A run of `N` ticks therefore reports `N + 1` sampled states and `N` observed tick intervals.
- Existing action counts and retained events at the start of the window are baselines, not activity inside the window.
- The collector retains counters, histograms, previous primitive position/intent/route signatures for each creature, current overlap streaks, bounded applied-intervention evidence, and milestone state. It never retains a `SimulationState` or render snapshot per tick. Applied-intervention evidence expires after the 120-tick response window.
- Arrays and categories use declared stable ordering so two runs with identical authoritative states produce byte-stable profile content apart from measured wall-clock performance.

## Metric definitions

### Completed actions and transitions

`action share = completed actions of a kind / all completed actions`.

Counts come from positive deltas in each creature's authoritative `actionCounts`. Shares are reported for the whole seed and per creature. A transition joins consecutive completed actions for one creature inside the profile window. The first completion has a `null` predecessor. Dwell ticks are the differences between authoritative `lastActionTick` values; the first dwell starts at the profile's start tick. Cancelled or invalidated actions are not reported as completed actions.

### Movement

Movement is the Manhattan distance between consecutive authoritative fixed-point coordinates:

`abs(currentX - previousX) + abs(currentY - previousY)`.

Only creatures alive in both consecutive samples contribute. Reports retain fixed units, convert totals with `256 fixed units = 1 tile`, and normalize rates by the state's configured ticks per second.

### Occupancy, exact overlap, and crowding

- Occupied tiles are the number of distinct `tileIndex` values held by living creatures at each sampled state.
- Crowding is the largest number of living creatures on one tile at each sampled state.
- Interaction-anchor crowding is the largest number of living creatures holding claims for one authoritative anchor kind, anchor ID, and purpose at each sampled state. Different slots at one anchor still contribute to crowding.
- Exact overlap counts every living creature participating in a shared `(x, y)` fixed-point coordinate. Its rate divides those overlapping creature-samples by all living creature-samples.
- Consecutive overlap is tracked per stable creature pair. Distinct overlap groups are counted once per coordinate per sample.
- Version 1 treats every exact-coordinate overlap as overlap. The current slot model assigns separated endpoints; if a later authoritative contract explicitly permits exact co-location, that declared exception requires a schema revision.

### Interaction-slot utilisation

At each sampled state, living creatures' retained claims are grouped by authoritative anchor kind, anchor ID, and purpose. Only anchor-purpose tuples with at least one retained claim enter the denominator; an idle anchor is not treated as unused capacity when no creature selected it.

For each active anchor-purpose sample:

- `claimed` is the number of retained claims in the tuple;
- `available` is the number of additional walkable, non-conflicting slots returned by the authoritative slot generator for that tuple's action; and
- `capacity = claimed + available`.

The report sums these values as claimed-slot ticks, available-slot ticks, and capacity-slot ticks. `utilisation = claimed-slot ticks / capacity-slot ticks`, or zero when capacity is zero. It reports the same formula in stable purpose order and stable `(anchor kind, anchor ID, purpose)` order. An anchor-purpose sample is saturated when `available = 0`; saturation is an observed state and does not prove that another creature attempted a claim.

Version 1 reports `contentionCount` and `failedClaimCount` as `null`. Successful claims are visible only after arbitration, while `PLAN_BLOCKED` currently combines slot exhaustion and path failure without a typed block reason or failed-attempt record. The collector does not relabel saturation as contention and does not parse event summary prose. Exact counts require a new authoritative typed observation contract.

Integer sample distributions use nearest-rank percentiles: sort values and select rank `ceil(p * sample count)`, with a minimum rank of one. Reports include minimum, p10, median, p90, maximum, and arithmetic mean. Empty distributions use `null` statistics.

### Interaction frequency

Interaction counts are new domain events of these types:

`FOOD_SHARED`, `MATERIAL_DEPOSITED`, `STORAGE_SITE_STARTED`, `STORAGE_COMPLETED`, `CREATURE_GUARDED`, `THEFT_COMMITTED`, `THEFT_WITNESSED`, `CREATURE_ATTACKED`, `CREATURE_FLED`, `CREATURE_JOINED_GROUP`, `GROUP_FOUNDED`, and `LEADER_SELECTED`.

The report includes stable zero-valued categories, totals, and rates per 1,000 observed ticks. `ACTION_STARTED` is deliberately excluded because it measures scheduling rather than a completed social, work, group, or conflict interaction.

### Significant-event cadence

Cadence uses authoritative attention tiers, not inferred importance thresholds. `SIGNIFICANT` and `CRITICAL` events qualify. Intervals are differences between successive qualifying event ticks, including zero when several qualifying events occur on one tick. Trailing silence is `window end tick - last qualifying event tick`; when there is no qualifying event, it is the full observed window.

### Intervention-attributed reconsideration and rerouting

An applied command event opens an inclusive 120-tick evidence window. Rejected commands open no response window. A selected decision is linked to an applied intervention only when a selected utility factor cites the command event ID, the event directly cites that command event as a cause, or the selected target ID exactly matches an authoritative target ID on the command event.

Within that evidence window the collector counts these changed dimensions separately:

- `RECONSIDERED_DESIRE`: a linked `DESIRE_CHANGED` event and a non-null prior desire that differs from the retained desire;
- `RECONSIDERED_PLAN`: a linked `PLAN_CHANGED` event and a non-null prior plan signature that differs in plan, desire, target entity, or target tile;
- `CHANGED_ACTION`: a linked `ACTION_STARTED` decision whose action differs from the creature's preceding selected action;
- `CHANGED_DESTINATION`: that linked decision selects a target tile different from the creature's preceding selected target tile; and
- `REROUTED`: the same active-action lineage retains its action and target but changes its exact route after its navigation revision advances on the tick of an applied obstacle command.

One decision can change more than one dimension, so `changes` is the sum of category counts rather than a creature count. `respondingCreatures` is the distinct creature count. `firstResponseTick` and the matching milestone are the earliest qualifying authoritative event tick. Coincidental proximity, route progress, untyped plan blocking, summary prose, and changes outside the bounded window are not treated as intervention responses.

### Milestones

The collector records the first event tick for group formation, storage-site creation, storage completion, theft, conflict, player intervention, and the first qualifying response to an intervention. Recovery is the first sampled tick where a creature's health rises above the lowest health observed after it took positive `CREATURE_ATTACKED` damage. Missed attacks do not start recovery tracking, and the collector does not infer psychological or social recovery.

## Provisional warnings

Aggregate output warns when:

- corpus `KEEP` share exceeds `0.35`;
- one seed's `KEEP` share exceeds `0.50`;
- one seed's occupied-tile median is below `4` or p10 is below `3`; or
- one seed's exact-overlap rate is at least `0.01`.

These warnings expose the Phase 2.5 provisional targets. They are not deterministic state goldens and must not be silently relaxed to make a balance change pass.

## Final behavior-v2 reference

The checked-in [final reference artifact](phase-2.5-final-reference-v1.json) was captured from behavior version 2 with the fixed reference seeds at 10,000 ticks. It retains the aggregate and the review-critical per-seed fields; run the command above when the full per-creature, transition, and per-anchor detail is needed.

| Seed | Final hash         | Completed actions | `KEEP` share | Active action families | Occupied p10 / median | Exact overlap / longest streak | Slot utilisation | Interactions | Significant events / trailing silence |
| ---: | ------------------ | ----------------: | -----------: | ---------------------: | --------------------: | -----------------------------: | ---------------: | -----------: | ------------------------------------: |
| 4182 | `6573a425e063691d` |             3,171 |       16.62% |                     14 |                 8 / 8 |                     0.038% / 1 |           50.01% |          543 |                              44 / 827 |
|  921 | `dbc7e17146900713` |             3,573 |       14.19% |                     11 |                 8 / 8 |                     0.033% / 1 |           50.04% |          451 |                             6 / 8,800 |
|   23 | `1e70197fe9f8e90e` |             3,350 |       13.73% |                     14 |                 8 / 8 |                     0.018% / 1 |           48.30% |          535 |                               48 / 77 |

Across the corpus there are 10,094 completed actions, a 14.80% `KEEP` share, 1,529 typed interactions, 98 significant/critical events, and 103,352 claimed of 209,056 capacity slot-ticks (49.44% utilisation). The aggregate warning list is empty. The exact-overlap streak is one tick for every reference seed, and the separate 2,000-tick policy fixture verifies at least six action families and four persistent desire families per seed.

Contention and failed-claim counts remain explicitly `null` under schema v1 for the authority gap documented above; saturation is not presented as an inferred substitute.
