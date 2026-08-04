# Phase 3 scenario contract

Status: **implemented; calibration, holdout, and manual release evidence pending**  
Updated: **4 August 2026**

This document records the decisions that remain stable across the Phase 3
implementation. The rationale, scope, work packages, and release gates remain in
[`phase-3-execution-plan.md`](phase-3-execution-plan.md).

## Authoritative identity

A run is reconstructed from all four values below. A seed never selects or
implies a scenario.

```ts
interface ScenarioIdentity {
  scenarioId: "petri-world" | "split-banks" | "scattered-plenty" | "unequal-table";
  scenarioVersion: 1;
  mapGenerationVersion: 1;
  seed: number;
}
```

Definitions are code-owned and immutable by version. Unknown IDs or versions
fail before an active run is replaced. Browser code may display catalog data,
but it does not own or infer scenario identity.

## Catalog and hypotheses

| ID                 | Role                                 | Canonical story seed | Question                                                                               |
| ------------------ | ------------------------------------ | -------------------: | -------------------------------------------------------------------------------------- |
| `petri-world`      | Common Store reference               |                 4182 | Can scarcity turn sharing into a durable common reserve before theft hardens rivalry?  |
| `split-banks`      | Topology and proximity contrast      |                 7319 | Will two clusters become separate communities, or will the passage draw them into one? |
| `scattered-plenty` | Dependence contrast                  |                 1203 | If nobody needs anyone immediately, will familiarity and sharing become a community?   |
| `unequal-table`    | Need and trait-distribution contrast |                  921 | Will outsiders receive help before the common store becomes a target?                  |

These are questions, not promised endings. Scenario definitions may set only
terrain, walk costs, resources, creature starts, initial needs, and bounded
trait or skill inputs. They never inject desires, plans, actions, memories,
relationships, groups, or events. Generic decision and action code must not
branch on a scenario ID.

Interaction capacity is expressed through walkable topology, anchors, and
reachable interaction footprints in Phase 3. There is no numeric
scenario-specific capacity override.

## Deterministic generation

Definition order, entity order, creature names, and random-channel names are
part of the versioned contract. Phase 3 definitions are static: the seed does
not select terrain, spawns, or catalog metadata. Initial creature jitter keeps
the preserved sequential initialization stream, while runtime action outcomes
keep their existing keyed channels. The extracted `petri-world@1` retains its
terrain, declaration order, initial random consumption, and runtime behavior
stream. Adding identity and the Phase 3 retention configuration to
authoritative state intentionally changes state hashes without changing the
behavior version.

Compilation rejects invalid dimensions or indexing, duplicate IDs or names,
blocked or overlapping starts, invalid resources, unreachable critical
resources or interaction footprints, and invalid declared regions or
chokepoints. Each result publishes a stable compiled-map hash.

## Seed corpora and horizons

- Calibration seeds: integers 1 through 64.
- Holdout seeds: integers 1001 through 1064. These are not used for tuning.
- Portable PR smoke: calibration seeds 1 through 8, 2,000 ticks, repeated once
  for determinism.
- Nightly matrix: calibration seeds 1 through 32, 10,000 ticks.
- Release matrix: all 64 calibration and all 64 holdout seeds, 10,000 ticks,
  sharded by scenario.

One seed is the independent observation. Reports retain raw per-seed records,
sort by scenario then seed, and publish count, minimum, p10, median, p90,
maximum, mean, and interquartile range where meaningful. Binary outcomes use
incidence and Wilson 95% intervals. Missing milestones remain `null` and are
reported as right-censored observations. Paired scenario comparisons use the
same seeds and report paired deltas; they are descriptive and never presented
as intervention-caused effects.

The stalemate window is the final 1,000 ticks of a 10,000-tick run. A run is
flagged only when that window combines low movement, fewer than three action
transitions, no group or relationship structural change, and no significant
event. Silence alone is not a failure.

## Compatibility and versions

| Contract                | Phase 2.5 | Phase 3 | Reason                                            |
| ----------------------- | --------: | ------: | ------------------------------------------------- |
| behavior                |         3 |       3 | Petri decision outcomes are preserved             |
| authoritative state     |         2 |       3 | full scenario identity and compiled-map hash      |
| snapshot                |         2 |       3 | projected identity and starting facts             |
| replay                  |         1 |       2 | reconstruction requires a scenario reference      |
| save                    |         1 |       2 | nested authoritative state changed                |
| scenario                |         1 |       2 | map-generation version and multiple IDs           |
| experiment              |         2 |       3 | nested scenario reference changed                 |
| outcome                 |         1 |       2 | comparisons require matching identity             |
| causal evidence         |         2 |       3 | evidence identifies its source run                |
| browser workspace       |         1 |       2 | the experiment owns one nested scenario reference |
| Worker runtime protocol |         1 |       2 | every request/response carries a protocol tag     |

Safe legacy seed-only artifacts migrate to `petri-world@1`. Verification hashes
and checkpoints are cleared when the authoritative shape makes the old hash
unverifiable. Malformed data, unknown definitions, and removed versions are
rejected atomically.

## Product language

The setup names a scenario, its question, two to four starting facts, and the
seed as separate information. Restart, save/load, import/export, branch replay,
and moment replay preserve the exact reference. Branch deltas are available
only for matching scenario, seed, behavior, and horizon. Cross-scenario views
are labelled descriptive comparisons.

## Implemented evidence boundary

The portable smoke matrix runs all four scenarios over calibration seeds 1–8
for 2,000 ticks and repeats every case. Its 32 primary profiles and 32 repeats
match exactly; inherited hard invariants and contract safety bands pass. Hot
frames and canonical 10,000-tick saves remain below 65,536 and 2,500,000 UTF-8
JSON bytes respectively. Browser projections retain the three strongest
factors per candidate; authoritative state and saves retain up to 352 complete
decision records. Counts and the evidence boundary are recorded in the
[portable smoke report](baselines/phase-3-smoke-v1.md).

Scenario-specific outcome bands deliberately remain marked pending. They may
be locked only from the full 64-seed calibration run and then assessed without
changes against the 64-seed holdout run. Automated Chromium evidence does not
stand in for the pending Firefox/WebKit, screen-reader, or usability gates.
