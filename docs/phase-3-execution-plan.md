# Phase 3 execution plan

Status: **feature implementation present; release evidence incomplete**  
Updated: **4 August 2026**

## 1. Outcome

Phase 3 turns the current seed-led presets into a small, versioned matrix of structurally different deterministic scenarios. Each scenario uses the mechanics that already exist—hunger, fatigue, gathering, carrying, sharing, private reserves, group formation, storage, theft, guarding, conflict, flight, relationships, and environmental intervention—but begins from meaningfully different terrain, access, pressure, and social proximity.

The phase is successful when a player can see and explain how different starting conditions produce different developing tensions and outcomes without being promised a scripted ending. The headless tools must show the same variation statistically across locked seed corpora, and every run must remain reproducible through saves, replays, experiments, and causal evidence.

Phase 3 does **not** add water as a need or resource, shelter, lifecycle, culture, migration, territory, trade, seasons, disease, predators, technology, larger populations, or LLM narration. Those remain Phase 4 systems.

Implementation note: the catalog, compiler, end-to-end identity contracts, four scenario definitions, scenario-aware headless analysis, and browser workflow described below are now present. W0's remaining manual evidence and W4/W8's full calibration, untouched holdout, cross-browser, assistive-technology, and usability artifacts are still open. This document therefore records implemented feature scope without making a complete Phase 3 release claim.

## 2. Entry boundary

The plan may be reviewed and its contracts may be prepared now. Scenario feature code begins only after Phase 2.5 has the release evidence listed in [`phase-2.5-implementation.md`](phase-2.5-implementation.md):

1. A manual NVDA or VoiceOver pass through navigator → selected summary → world object → moment → evidence, including focus return and announcements.
2. The formative and confirmatory usability rounds with unfamiliar participants, with failures and resulting decisions recorded.
3. Firefox and WebKit release runs in addition to the checked-in Chromium evidence.
4. A green `npm run check`, protected golden replay run, reference activity profile, and separately recorded benchmark on the release candidate.

The Phase 2.5 reference world remains a supported Phase 3 scenario. Phase 3 is not allowed to hide a Phase 2.5 comprehension failure by replacing the scenario or adding more content.

## 3. Why this phase starts with contracts

The current product presents three scenario names, but they are not authoritative scenarios yet:

- `apps/web/src/experiment/scenario-presets.ts` associates a display name and question with a seed.
- `packages/sim-core/src/experiment-contracts.ts` accepts only the fixed `petri-world` scenario ID.
- `createSimulation(seed)` always builds the same 48 × 32 map, eight prototypes, and three resource nodes from `world.ts`.
- runtime creation, Worker messages, replays, and headless commands identify a run by seed rather than by scenario plus seed;
- the browser stores a UI preset ID separately and guesses it from the seed during import.

Adding more preset labels on top of this design would make saves and replays ambiguous: the same seed could refer to several different worlds. The first Phase 3 vertical slice therefore makes scenario identity authoritative from creation through reconstruction before it adds variation.

## 4. Scope and non-goals

### In scope

- A code-owned, versioned scenario catalog shared by `sim-core`, headless, and web.
- A deterministic scenario compiler that produces validated terrain, resources, creature starts, starting pressures, trait envelopes, and interaction geometry.
- An authoritative scenario identity carried by state, snapshots, saves, replays, experiments, runtime operations, and headless results.
- Three contrasting scenarios in addition to the preserved Petri reference, all with eight creatures on a 48 × 32 world.
- A concise dramatic question, declared starting facts, and observable tensions for every scenario.
- Scenario-aware batch and activity reports with distributions, time-to-event, group composition, relationship-network, spatial, action-transition, dominance, convergence, and stalemate measures.
- Scenario-specific expected ranges derived from locked calibration and holdout corpora.
- A browser scenario chooser that separates scenario from seed and truthfully restores scenario identity on restart, save, load, import, export, and replay.
- Readable starting-condition summaries and developed-outcome evidence in the dish, navigator, roster, chronicle, inspector, and experiment surfaces.
- Compatibility migrations, deterministic fixtures, browser coverage, performance evidence, accessibility evidence, and usability evidence.

### Not in scope

- New resource kinds, needs, actions, event families, social systems, or construction types.
- Procedurally unbounded maps, arbitrary user-authored scenarios, a map editor, mod loading, or remote scenario downloads.
- More than eight creatures or a world larger than 48 × 32.
- Victory conditions, quests, factions chosen by the player, direct creature orders, or outcome prediction.
- Scripted event chains or a scenario-specific action-scoring branch such as `if (scenarioId === ...)`.
- A universal balance target that forces every scenario toward the same action mix or ending.
- Cross-scenario causal deltas presented as if changing the entire starting world were one controlled intervention.
- A broad visual redesign.

## 5. Product shape and initial scenario matrix

The exact coordinates and numeric envelopes are locked in W1 after baseline review. The initial catalog should contain these four roles:

| Authoritative ID   | Display role                         | Structural difference                                                                                                                                                                             | Dramatic question                                                                      | Evidence that should be visible                                                                                                |
| ------------------ | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `petri-world`      | Common Store reference               | Preserve the current map, starts, prototypes, and resources                                                                                                                                       | Can scarcity turn sharing into a durable common reserve before theft hardens rivalry?  | Current sharing → group → storage → theft/conflict loop remains a useful reference, not a required ending                      |
| `split-banks`      | Topology and proximity contrast      | Keep the same total resources and trait multiset, start two spatial clusters of four on opposite sides, place moderate food on both sides, and make shared material draw attention to the passage | Will two clusters become separate communities, or will the passage draw them into one? | Crossings, relationship components, group composition, and one-versus-two-storage paths are spatially legible                  |
| `scattered-plenty` | Dependence contrast                  | Distribute abundant food, separate creatures into pairs or individual starts, keep the trait multiset, and place material centrally                                                               | If nobody needs anyone immediately, will familiarity and sharing become a community?   | Dispersion, private-reserve and foraging routines, delayed contact, and delayed or absent group/storage paths remain readable  |
| `unequal-table`    | Need and trait-distribution contrast | Retain the reference terrain, resources, and aggregate trait multiset, but place the hungriest, least-social, and more aggressive starts across the passage from the more cooperative cluster     | Will outsiders receive help before the common store becomes a target?                  | Named share/join attempts, private reserves, theft, witnessing, fear, rivalry, guarding, confrontation, and flight are visible |

These are scenario hypotheses, not story specifications. A run is valid when it remains causally coherent even if it does not produce the scenario name’s implied outcome.

Scenario variation should compile into existing authoritative nouns. Initial needs and trait ranges may make different desires likely, but definitions do not inject an unsupported desire, plan, action, memory, or relationship. If Phase 3 needs intents at tick 0, they must be created by the ordinary deterministic decision and reason-fact pipeline.

Interaction capacity should first vary through walkable topology, anchor placement, and footprint reachability. A numeric scenario-specific capacity override is added only if measurement shows topology cannot express the required contrast; it must then be a typed authoritative configuration, not a scenario-ID conditional.

## 6. Decisions to lock before feature code

### D1. Scenario and seed are separate identity dimensions

A run is identified by at least:

```ts
interface ScenarioReference {
  scenarioId: string;
  scenarioVersion: number;
  mapGenerationVersion: number;
  seed: number;
}
```

Transport envelopes also retain their schema and simulation compatibility tags. The seed controls declared random choices inside one scenario definition; it does not choose the definition.

The browser must never infer a scenario from a seed. `petri-world@1 / 4182` and `split-banks@1 / 4182` are different, valid runs.

### D2. The catalog is code-owned and immutable by version

Scenario references point to definitions in a `sim-core` registry. They do not carry arbitrary serialized terrain or executable rules. A supported `(scenarioId, scenarioVersion, mapGenerationVersion)` must continue to resolve to the same compiled starting state.

Changing terrain, placements, starting pressures, trait ranges, ordering, or generation channels increments the scenario or map-generation version. Old definitions remain available while supported artifacts depend on them; unsupported versions fail before replacing an active run.

### D3. Generation is deterministic, namespaced, and validated

The compiler uses stable declaration order and keyed random channels separated by concern, for example map choice, spawn placement, starting need jitter, and trait jitter. Map generation must not consume the sequential runtime RNG before current creature initialization and silently shift later behavior.

Compilation validates:

- dimensions, rectangular tile indexing, terrain and walk-cost bounds;
- stable, unique entity IDs and creature names;
- in-bounds, walkable, non-overlapping creature starts;
- valid resource capacity, stock, regeneration, and placement;
- reachable food, rest, and legal interaction footprints for every living creature unless an intentional disconnected condition is declared;
- declared chokepoints and regions against the compiled navigation graph;
- stable initial-state and map hashes for canonical references.

### D4. The existing Petri world is extracted before it is changed

The first compiler definition reproduces the current Petri terrain, entity order, prototypes, resource nodes, and runtime random stream. Extraction tests compare the compiled world and a long-run action/event trace with the pre-extraction reference.

Adding scenario identity to hashed state will intentionally change canonical state hashes even if behavior is unchanged. That is a state/contract migration, not evidence that creature outcomes changed.

### D5. Scenario data changes starts, not generic decision rules

A definition may control existing facts: terrain, walk cost, resource placement and stock, creature positions, initial hunger/fatigue, and bounded trait/skill envelopes. Generic desire selection, candidate scoring, action execution, relationship updates, group behavior, attention, and causal evidence remain shared.

Any generic behavior tuning discovered during scenario testing is delivered in a separate pull request with its own behavior-version decision and before/after corpus. It cannot be hidden inside one scenario definition.

### D6. Scenario identity is authoritative end to end

The resolved scenario reference is retained with simulation state and projected to clients. Creation/restart, Worker protocol, direct runtime, replay, save/load, experiment branches, checkpoints, export/import, moment replay, headless run, batch, profile, and benchmark all receive or report the same identity.

The compatibility overload `createSimulation(seed)` may remain temporarily as an explicit alias for `petri-world@1`, but new code uses a scenario reference.

### D7. Version changes do not make false replay claims

The implementation records an explicit version matrix before migrations are written. Expected direction:

- authoritative state changes version when scenario identity is added;
- scenario and replay schemas change because they can no longer be seed-only;
- snapshot, save, experiment, workspace, and Worker protocol versions change wherever their nested identity contract changes;
- behavior version changes only if the same supported scenario reference, seed, and command log intentionally produce different creature behavior—not merely because new scenario IDs are added;
- existing seed-only artifacts migrate to `petri-world@1` when safe;
- verification hashes are cleared whenever the migrated state shape or behavior cannot honestly verify the old hash;
- malformed, unknown, or removed definitions fail without replacing the active run.

### D8. Statistical ranges describe scenarios; they do not script them

Each scenario declares hypotheses and expected ranges over a seed corpus, not one required golden story. A seed is the independent observation; ticks, creatures, actions, and events within that run are not treated as independent samples. The measurement protocol is frozen before tuning:

- **canonical story seeds:** one per scenario for deterministic browser journeys and visual review;
- **calibration corpus:** the same 64 declared seeds for every scenario at 10,000 ticks;
- **holdout corpus:** 64 different declared seeds, unseen during tuning, at the same horizon;
- **portable PR smoke:** the first eight calibration seeds per scenario at 2,000 ticks, repeated for determinism;
- **nightly matrix:** the first 32 calibration seeds per scenario at 10,000 ticks;
- **release matrix:** all 64 calibration and 64 holdout seeds, sharded by scenario.

Reports retain raw per-seed records and use deterministic counts plus p10, median, p90, interquartile range, minimum, maximum, and mean where appropriate. Binary outcomes include incidence and Wilson 95% intervals. Absent milestones are right-censored: reports show incidence and a survival-style time-to-event summary rather than converting `null` to zero or to the horizon. Scenario comparisons use paired seeds and report paired deltas/effect sizes. Machine-sensitive latency is not mixed into outcome statistics.

### D9. Outcome descriptions are factual and multi-label

Phase 3 may add a versioned, derived classifier for descriptions such as cooperative storage, fragmented groups, persistent private reserves, recurring conflict, or quiet stalemate. Labels must be computed from retained facts at a declared horizon, may coexist, link back to their measures, and remain downstream of authoritative history.

There is no “winner,” ideal ending, or probability forecast in the browser.

### D10. Branch comparison and scenario comparison remain distinct

Experiment branches compare controlled interventions only when scenario identity, seed, behavior version, and horizon match. Runs from different scenarios may be summarized side by side, but the UI does not label their differences as intervention-caused deltas.

## 7. Measurement contract

### Measures retained from Phase 2.5

- completed action count/share by kind and creature;
- action transitions and dwell time;
- movement and occupied-tile distributions;
- exact overlap, tile crowding, interaction-anchor crowding, slot utilisation, contention, and failed claims;
- interaction and significant-event cadence;
- time to group, storage site, completed storage, theft, conflict, recovery, intervention, and intervention response;
- intervention response changes and responding creatures.

### Phase 3 additions

- scenario identity and compiled-map hash in every run and aggregate;
- group count, membership partitions, size distribution, leader stability, and time spent grouped;
- relationship graph components, density, reciprocity, trust/rivalry/fear distributions, and concentration around individual creatures;
- spatial dispersion by creature and group, region occupancy, chokepoint crossings, route concentration, and resource-access distance;
- resource control and storage location/composition at declared horizons;
- milestone occurrence rates and time-to-event distributions across seeds;
- per-scenario unreachable action/desire/location warnings;
- generic action, desire, target, location, or group dominance warnings;
- repeated transition/low-change warnings;
- a declared stalemate window combining low movement, low action-transition variety, no structural social change, and no significant event rather than treating silence alone as failure;
- convergence checks that flag scenarios whose distributions collapse toward the same macro state.

### Range policy

W1 records provisional thresholds before scenario tuning. W4 replaces them with reviewed scenario-specific ranges using the calibration corpus, then verifies them unchanged against the holdout corpus. A failing range is an investigation signal unless the range protects a hard invariant; it is never fixed by regenerating seeds until the warning disappears.

The inherited Phase 2.5 safety floors remain in force unless a scenario-specific fact is documented and reviewed: occupied tiles p10 ≥ 3 and median ≥ 4, exact overlap < 1%, corpus `KEEP` share < 35%, per-seed `KEEP` share < 50%, and at least six physical action families plus four desire families in the declared observation window. These are legibility floors, not the Phase 3 outcome bands.

Phase 3 variety is credible when:

1. Every scenario preserves hard invariants and exposes at least six existing physical action families and four desire families across its calibration corpus unless its declared starting facts explain otherwise.
2. No scenario replaces the old universal `KEEP` problem with another universal action, target, location, or group result.
3. At least three macro dimensions—social structure, resource/storage pattern, conflict/cooperation cadence, spatial pattern, or time-to-event—show predeclared material differences between at least two scenarios on both calibration and holdout corpora.
4. Every scenario produces at least two coherent macro labels that each occur in at least 8 of 64 holdout seeds; the full matrix produces at least three labels, and no label exceeds 85% of a scenario without an explicit rationale.
5. The original one-group/one-storage result remains observable but is neither required nor universal.

Exact numeric bands are evidence artifacts, not guesses in this plan.

## 8. Work packages

### W0 — Close Phase 2.5 and freeze the handoff baseline

**Goal:** establish a trustworthy entry point.

1. Attach the remaining screen-reader, usability, Firefox, and WebKit evidence.
2. Resolve any blocker/high-severity Phase 2.5 comprehension failures.
3. Run the final automated gate, golden corpus, activity profile, and benchmark.
4. Record the current Petri initial state, map hash, long-run hashes, action/event trace, payload/save sizes, screenshots, and version matrix.
5. Reconcile Phase 2.5 status and behavior-v3 baseline references across `README.md`, `PROGRESS.md`, implementation, baseline, and performance documents.

Exit gate: Phase 2.5 has complete release evidence and a protected handoff artifact that can detect accidental drift during scenario extraction.

### W1 — Lock the catalog, hypotheses, and measurement protocol

**Goal:** decide what a scenario means before implementing one.

1. Record D1–D10 as ADRs or one reviewed contract document.
2. Lock the four scenario IDs, names, questions, starting facts, observable tensions, and excluded outcomes.
3. Define scenario-reference, definition, compiler-output, and registry types.
4. Lock seed namespaces, canonical seeds, calibration corpus, holdout corpus, horizon, percentile and censoring methods, stalemate window, dominance warnings, and range-review procedure.
5. Decide whether interaction capacity is expressed only by geometry for this phase.
6. Define the complete version/migration matrix and user-facing compatibility language.

Exit gate: later work can cite stable identity, generation, measurement, and compatibility rules.

### W2 — Extract the reference scenario and implement authoritative identity

**Goal:** make one real scenario work end to end without changing its behavior.

1. Introduce a focused `sim-core` scenario module/registry and extract `petri-world@1` from `world.ts`.
2. Add deterministic compilation and structural/topological validation.
3. Retain scenario identity in state and observation projections.
4. Propagate the reference through creation, restart, direct runtime, Worker protocol/server, replay, isolated moment replay, save/load, experiment, checkpoint, and outcome operations.
5. Add `--scenario` to headless run, batch, profile, and benchmark; include scenario identity in JSON results.
6. Migrate safe seed-only artifacts to `petri-world@1`, reject incompatible inputs atomically, and update protected fixtures deliberately.
7. Replace hard-coded command fallback coordinates and empty-view assumptions with scenario/world-derived values.

Exit gate: the extracted reference reproduces the protected behavior trace; every artifact reconstructs the exact scenario; no browser code guesses identity from seed.

### W3 — Add the scenario matrix one vertical slice at a time

**Goal:** create structural contrasts before global tuning.

For each of `split-banks`, `scattered-plenty`, and `unequal-table`:

1. Add the definition, keyed generation channels, and catalog metadata.
2. Add canonical initial-map/state hashes and structural invariant tests.
3. Verify resource and interaction reachability, route/chokepoint facts, spawn separation, and deterministic entity ordering.
4. Run the untuned calibration corpus and record results before changing numeric inputs.
5. Check that the declared starting facts are visible in snapshot, Pixi, and textual projections.
6. Adjust only scenario inputs, one declared variable at a time, with before/after corpus evidence.

Exit gate: all four definitions compile and run deterministically across the calibration corpus and produce recognisably different starting worlds without scenario-specific behavior branches.

### W4 — Extend headless analysis and establish ranges

**Goal:** distinguish meaningful variety from renamed randomness.

1. Version the activity-profile schema and add the Phase 3 measures in section 7.
2. Support a scenario × seed matrix command with deterministic output ordering and streaming memory bounds.
3. Add machine-readable scenario bands, hard invariant failures, and diagnostic warnings.
4. Add multi-label derived outcome summaries with evidence measures if D9 is approved.
5. Run the calibration corpus, investigate dominance/reachability/stalemate warnings through retained decisions and causal facts, and lock ranges.
6. Run the untouched holdout corpus and record failures without changing its seeds.
7. Retain raw calibration and holdout records; treat any corpus beyond the locked 128 seeds as diagnostic rather than silently folding it into the release gate.

Exit gate: the checked-in report explains what differs, how much it differs, and where scenarios still converge; no scenario is approved from a canonical seed alone.

### W5 — Replace seed presets with truthful scenario setup

**Goal:** let players intentionally choose a starting structure and then vary its seed.

1. Project the authoritative catalog into the web app instead of duplicating it in UI-only presets.
2. Present scenario name, dramatic question, two to four starting facts, and seed as separate controls.
3. Start the engine with the selected scenario reference and open paused at tick 0.
4. Preserve exact identity through restart, save/load, import/export, branch replay, moment replay, and download naming.
5. Show clear compatibility errors for missing or unsupported definitions without losing the active run.
6. Keep branch comparisons restricted to matching scenario/seed/version/horizon; present any cross-scenario summary as descriptive context.

Exit gate: changing the scenario changes the authoritative world, changing only the seed keeps the definition, and both facts survive every persistence/replay path.

### W6 — Make scenario differences readable while they unfold

**Goal:** carry Phase 2.5 comprehension standards across structural variation.

1. Include scenario identity and starting facts in the setup, experiment record, and textual world summary.
2. Ensure terrain, resource distribution, starting clusters, travel routes, chokepoints, and storage/group locations remain clear in the dish at every supported viewport.
3. Let starting-fact summaries link to relevant world regions or entities without inventing causal claims.
4. Ensure the chronicle, moment queue, inspector, and intervention traces continue to explain actual decisions rather than the scenario’s dramatic prompt.
5. Add factual developed-outcome summaries at declared horizons with routes to the supporting group, relationship, storage, spatial, and event evidence.

Exit gate: a player can distinguish two scenarios from starting conditions and later describe one visible behavioral consequence without relying on raw metrics or the scenario name.

### W7 — Compatibility, accessibility, browser, and performance hardening

**Goal:** preserve the existing quality boundary across the matrix.

1. Test direct/Worker parity, save continuation, replay hashes, experiment migration, malformed imports, cancellation, crash recovery, and isolated moment replay for every scenario identity.
2. Keep the existing 65,536-byte dynamic-frame ceiling, 2.5 MB reference save ceiling, bundle budgets, bounded collections, and calibrated headless throughput floor unless measured evidence justifies a reviewed change.
3. Measure bootstrap/static scenario payloads separately from hot frames and set a budget after all four definitions exist.
4. Keep the six-state × three-viewport Petri visual regression matrix. Add tick-0 narrow/medium/wide coverage for every new scenario and at least one developed canonical state per new scenario.
5. Run Chromium on every PR and Firefox/WebKit release smoke across all canonical scenarios.
6. Verify keyboard, touch, reduced motion, forced colors, 200% text, 400% reflow, screen-reader summaries, focus return, and status announcements through scenario setup and the primary experiment flow.

Exit gate: no scenario weakens determinism, compatibility, accessibility, readability, or performance below the Phase 2.5 boundary.

### W8 — Usability evidence, release baseline, and Phase 4 handoff

**Goal:** prove that scenario variation is understandable, not merely measurable.

1. Run a formative round with at least five participants unfamiliar with the implementation.
2. Ask participants to choose a scenario for a stated hypothesis, distinguish scenario from seed, name two starting-condition differences, observe two scenarios, and explain one behavior or outcome using visible factual evidence.
3. Record answer accuracy, time, route, missed cue, vocabulary confusion, false causal inference, and accessibility/input failures.
4. Resolve blocker/high-severity patterns and rerun relevant deterministic/browser fixtures.
5. Run a confirmatory round with at least five new participants. At least four of five must distinguish two scenarios’ starting conditions and accurately connect one observed difference to factual in-product evidence without claiming a scripted ending.
6. Treat the small sample as formative product evidence, not statistical proof.
7. Attach final tuning/holdout reports, screenshots, browser/accessibility results, performance results, compatibility matrix, intentional golden changes, and usability notes.
8. Update roadmap, architecture, controls, baseline, and version documentation, then define the Phase 4 water-and-mobility entry baseline.

Exit gate: every Phase 3 completion gate has an attached deterministic test, corpus artifact, browser result, accessibility check, or usability observation.

## 9. Proposed pull-request slices

| PR  | Scope                                                                                                 | Depends on | Relative size |
| --- | ----------------------------------------------------------------------------------------------------- | ---------- | ------------- |
| 1   | ADRs, scenario catalog, hypotheses, seed corpora, measurement definitions                             | W0         | S             |
| 2   | Extract `petri-world@1`, deterministic compiler, structural validation, no behavior change            | PR 1       | M             |
| 3   | Authoritative scenario identity, state/contract versions, migrations, replay/save/experiment fixtures | PR 2       | L             |
| 4   | Runtime/Worker/headless scenario plumbing and removal of hard-coded fallback assumptions              | PR 3       | M             |
| 5   | Phase 3 activity schema, matrix runner, network/group/spatial/stalemate measures                      | PR 4       | L             |
| 6   | `split-banks` vertical slice plus untuned/calibrated corpus evidence                                  | PR 5       | M             |
| 7   | `scattered-plenty` vertical slice plus untuned/calibrated corpus evidence                             | PR 6       | M             |
| 8   | `unequal-table` vertical slice plus untuned/calibrated corpus evidence                                | PR 7       | M             |
| 9   | Authoritative browser scenario setup, persistence/import/replay identity, comparison constraints      | PR 4       | L             |
| 10  | Scenario readability, textual starting facts, developed-outcome evidence                              | PRs 8–9    | M             |
| 11  | Locked ranges, holdout report, targeted behavior fixes in separate versioned commits                  | PRs 8, 10  | L             |
| 12  | Cross-browser/accessibility/performance hardening, usability evidence, release docs                   | PR 11      | L             |

PRs 6–8 may be reordered after the untuned matrix, but each scenario remains a complete reviewable slice. Any generic scoring change is isolated from definition changes even if it is discovered during the same slice.

## 10. Verification strategy

### Core and contracts

- Same scenario reference + seed produces identical initial state, long-run state, events, decisions, and hashes.
- Different scenario IDs with the same seed produce the declared structural differences.
- Changing only a seed cannot change catalog metadata or map-generation version.
- Registry lookup, definition ordering, keyed random channels, compiled maps, entity IDs, and navigation facts are deterministic.
- Invalid geometry, unreachable critical resources, invalid footprints, duplicate IDs, malformed references, and unknown versions are rejected.
- Petri extraction preserves the protected behavior trace.
- Save/load continuation equals uninterrupted execution for every canonical scenario.
- Replay and experiment reconstruction require and verify exact scenario identity.
- Legacy artifacts migrate only to `petri-world@1` and never retain a verification claim they can no longer prove.

### Statistical and headless

- Every PR repeats every scenario × the first eight calibration seeds × 2,000 ticks; nightly runs use 32 seeds × 10,000 ticks; release/baseline changes run all 64 calibration and 64 holdout seeds.
- Aggregates are stable under input ordering and report scenario and seed ordering explicitly.
- Range definitions and warning thresholds are versioned and tested from synthetic profiles.
- Canonical hashes protect reconstruction; distribution gates protect variety. Neither substitutes for the other.
- Holdout seeds are never replaced to make a gate pass.

### Browser and product

- Setup selection changes authoritative terrain/starts, not only labels.
- Paused tick 0 exposes scenario name, dramatic question, starting facts, seed, and reachable semantic world objects.
- Restart/load/import/export/replay preserve the exact scenario version.
- Unsupported imports preserve the active run and explain the compatibility problem.
- Scenario summaries do not assert an ending or causal fact absent from state.
- Branch comparison rejects mismatched identities; descriptive cross-scenario summaries are labelled clearly.
- Existing observe → select → inspect → intervene → explain journeys remain intact.

### Performance

- Profile and benchmark the slowest scenario as well as the Petri reference.
- Keep population and dimensions fixed so Phase 3 measures scenario complexity rather than scale.
- Track compiler time, initial/static payload, dynamic frame, save size, replay reconstruction, pathfinding pressure, Worker message volume, browser long tasks, bundle size, and headless throughput.
- Machine-sensitive results remain diagnostic until distributions support a portable threshold.

## 11. File and ownership map

| Area                                | Primary files/modules                                                                                                          |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Scenario identity and registry      | `packages/sim-core/src/creation.ts`, new `packages/sim-core/src/scenarios/`, `versions.ts`, `types.ts`                         |
| Reference extraction and generation | `packages/sim-core/src/world.ts`, new scenario definitions/compiler/validation                                                 |
| Contracts and migration             | `contracts.ts`, `experiment-contracts.ts`, `state-validation.ts`, `state-migrations.ts`, golden fixtures                       |
| Runtime and Worker                  | `apps/web/src/runtime/`, `apps/web/src/workers/`, `useSimulationController.ts`                                                 |
| Headless matrix and metrics         | `apps/headless/src/index.ts`, `activity-collector.ts`, `metrics.ts`, benchmark/profile tests                                   |
| Browser scenario workflow           | `apps/web/src/experiment/scenario-presets.ts` (replace), `useExperimentWorkspace.ts`, `ExperimentWorkspace.tsx`, storage tests |
| Readability and evidence            | `sim-core` projections/outcomes/causal evidence, `WorldNavigator`, `PixiWorld`, `Chronicle`, `InspectorPanel`                  |
| Release evidence                    | `e2e/workspace.spec.ts`, screenshot fixtures, `docs/baselines/`, `performance-baseline.md`, roadmap docs                       |

The catalog metadata consumed by the browser is projected from `sim-core`; the web app does not maintain a second authoritative list.

## 12. Main risks and mitigations

| Risk                                                                   | Mitigation                                                                                                       |
| ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| UI presets still differ only by seed                                   | Make scenario identity part of state and require it at every creation/reconstruction boundary                    |
| Extraction shifts sequential RNG or entity ordering                    | Preserve declaration order, namespace generation randomness, and compare long-run traces before adding scenarios |
| Generated maps strand creatures or remove legal interaction footprints | Compile-time topology/reachability validation plus multi-seed long-run invariants                                |
| Seed-only replay reconstructs the wrong world                          | Bump replay contract and require the full scenario reference                                                     |
| Adding identity changes hashes without changing behavior               | Distinguish state/schema version changes from behavior changes and clear incompatible verification metadata      |
| Starting desires invent causal history                                 | Express pressure through initial facts and use the normal decision/reason pipeline                               |
| Scenario definitions fork generic AI behavior                          | Ban scenario-ID branches in desires, scoring, actions, social updates, and attention policy                      |
| Tuning overfits named seeds                                            | Freeze calibration and holdout corpora before tuning; report both unchanged                                      |
| Every scenario converges on one new dominant strategy                  | Generic dominance/convergence warnings and scenario-specific range review                                        |
| “Quiet” is incorrectly treated as broken                               | Use a multi-signal stalemate definition and allow coherent low-conflict runs                                     |
| Different starts are visible only in metrics                           | Starting-fact projections, semantic region links, canonical browser journeys, and comprehension testing          |
| Cross-scenario differences are mistaken for intervention causality     | Keep causal branch comparison identity-strict and label cross-scenario views as descriptive                      |
| Test matrix grows without bound                                        | Fixed four-scenario/eight-creature/48 × 32 scope, tiered canonical/PR/release corpora, risk-based screenshots    |
| Phase 4 systems leak into scenario work                                | Reject new nouns and actions; compile only existing facts and mechanics                                          |

## 13. Completion checklist

- [ ] Remaining Phase 2.5 release evidence is attached and the handoff baseline is frozen.
- [x] Decisions D1–D10 and the version/migration matrix are recorded.
- [x] `petri-world@1` is extracted behind the scenario compiler without behavior drift.
- [x] Scenario identity survives state, snapshot, save/load, replay, experiment, Worker, headless, import/export, and moment replay.
- [x] Legacy seed-only artifacts migrate safely to `petri-world@1` or fail atomically with a clear explanation.
- [x] Four catalog scenarios compile deterministically and pass structural, reachability, and long-run invariants.
- [x] No scenario-specific branch exists in generic desire, scoring, action, social, event, or attention logic.
- [x] The Phase 3 activity schema and scenario × seed matrix report all section 7 measures.
- [ ] Calibration and holdout corpora use frozen seeds, horizons, percentile/censoring rules, warnings, and range definitions.
- [ ] Several macro outcomes and several readable paths occur across the matrix; no universal dominant replacement appears.
- [x] Scenario choice and seed choice are distinct, accessible, and authoritative in the browser.
- [ ] Players can identify starting differences and connect an observed difference to factual evidence.
- [x] Branch comparison stays scenario/seed/version/horizon compatible; cross-scenario summaries are not presented as causal deltas.
- [ ] Determinism, golden replays, save/load, migration, browser, screenshot, accessibility, bundle, persistence, and performance gates pass.
- [ ] Formative and confirmatory usability evidence is attached and high-severity failures are resolved.
- [ ] `README.md`, `PROGRESS.md`, architecture, controls, baselines, performance, and version documentation agree.

Phase 3 ends with a small set of worlds that begin differently, remain understandable while they unfold, and produce variety that is visible both to a player and in the evidence—before Phase 4 adds the first new system.
