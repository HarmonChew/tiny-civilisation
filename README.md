# Tiny Civilisation

Tiny Civilisation is an observable social simulation in a Petri dish. The player changes resources and terrain; the creatures decide how to respond. There are no movement orders, build orders, or buttons that force a relationship or group outcome.

This repository implements an experiment-ready vertical slice of the larger design: a small deterministic world where resource pressure can lead to sharing, trust, group formation, communal storage, shelter building and upkeep, theft, confrontation, and a factual history the player can preserve, replay, compare, and explain.

## What is implemented

- A fixed-tick, seeded simulation with four versioned 48 × 32 scenarios: the preserved Petri reference plus topology, abundance, and unequal-start contrasts.
- Eight autonomous creatures with hunger, thirst, fatigue, health, shared-capacity inventories, traits, and skills.
- Food, material, and finite renewable potable-water nodes, blocked terrain, chokepoints, weighted deterministic A* travel, and fixed-point movement.
- Rule-gated Utility AI with separate persistent desires, plans, physical actions, structured reason facts, deterministic tie-breaking, and factor-by-factor decision records.
- Gathering food, material, and water; eating; drinking; sharing food and water; sheltered and outdoor resting; keeping; stealing; depositing; withdrawing; storage and shelter construction; shelter maintenance; guarding; fighting; fleeing; and joining a group.
- Authoritative interaction slots and fixed-point endpoints that keep gathering, construction, storage, social, guard, and conflict participants spatially legible.
- Directed trust, fear, familiarity, and rivalry; bounded memories for help, theft, harm, resources, and group formation.
- Emergent groups, leadership, descriptive roles, shared storage, one active communal shelter and one-time relocation per persistent group, trusted-guest shelter access, witness-based theft detection, and nonlethal-biased conflict.
- A PixiJS world view with identity/direction marks, selected routes, the 24 strongest observational traffic trails, water-source stock/depletion marks, distinct shelter-site/active/degraded/abandoned treatments, occupancy marks, destinations, carrying and action feedback, plus React inspectors for creatures, groups, structures, decisions, and history.
- A keyboard-operable semantic world navigator with spatial ordering, textual dish/subject summaries, shared typed focus, and debounced significant-event announcements.
- Deterministic event attention tiers, clustering, a bounded recoverable moment queue, and optional speed-aware pacing that restores the player's previous playback state.
- Player commands for adding or removing food and material, replenishing or draining existing water sources, and toggling obstacles. Commands enter the simulation at an authoritative tick and never order a creature to build, repair, rest, or relocate.
- Typed command outcomes, rejection recovery, and bounded factual response traces linked by command/event IDs rather than summary text.
- A paused-first experiment setup that chooses an authoritative scenario and seed independently, then shows its dramatic question, starting facts, observable tensions, and named regions.
- An experiment notebook that records interventions, creates baseline and intervention branches, and bookmarks meaningful ticks.
- Versioned browser saves with IndexedDB and local-storage fallback, plus compact experiment import and export.
- Deterministic branch and moment replay in disposable engines, with progress, cancellation, final-hash evidence, captured dish frames, event-aware camera framing, and exact restoration of the live session.
- Equal-horizon baseline-versus-intervention comparison for population, resources, groups, trust, sharing, theft, confrontation, storage, shelter, rest, condition, occupancy, and relocation.
- A navigable causal explorer connecting events to decisions, utility factors, relevant social evidence, immediate causes, and later consequences.
- Worker-backed browser execution with projection-only live frames and typed on-demand hash, checkpoint, evidence, detail, intervention-outcome, and comparison queries; the direct runtime retains the same boundary for unsupported environments and tests.
- A Node.js headless runner for deterministic single-seed, multi-seed, activity-profile, benchmark, and locked scenario-matrix runs.
- Versioned command, snapshot, replay, save, scenario, experiment, outcome, causal-evidence, behavior, and authoritative-state contracts with migration and invalid-data rejection.
- A declared tick pipeline, focused simulation systems, typed lookup indexes, and an exhaustive action resolver registry.
- Real-browser Chromium coverage for the Worker, Pixi renderer, touch, reduced motion, forced colors, 200% text, 400% effective zoom, the 18-image Petri story matrix, tick-zero narrow/medium/wide views of every additional scenario, and one developed-state view per new scenario, plus enforced coverage and production-bundle budgets.

The current engineering slice includes Phase 4.1 potable-water sources, thirst, hydration choices, weighted travel, and observational traffic trails plus the Phase 4.2 communal shelter loop. It deliberately excludes communal water storage, shelter collapse, multiple outposts, birth and ageing, culture, territory, trade, diplomacy, seasons, disease, predators, technology, large-world scaling, and LLM narration; those remain later milestones. Phase 4.2 calibration, its one-shot untouched holdout, and the automated browser matrix pass and are recorded; manual NVDA and unfamiliar-participant comprehension rounds remain pending, so this is not a release-complete claim.

## Quick start

Requirements:

- Node.js 22.12 or newer
- npm

Install and start the browser app:

```sh
npm install
npm run dev
```

Vite prints the local URL when the development server starts.

Useful verification commands:

```sh
npm run check
npm run typecheck
npm run test:run
npm run test:golden
npm run test:e2e
npm run benchmark
npm run build
```

`npm run check` is the complete automated local and CI gate: formatting, linting, type-checking, coverage, real-browser journeys, production builds, and the post-build JavaScript/CSS budget check. `npm test` starts the interactive Vitest watchers; use `npm run test:run` for a single non-interactive pass. The manual screen-reader and usability sessions, plus the separate three-browser release run, remain distinct release evidence; the routine automated gate does not replace them.

`npm run test:golden` verifies the checked-in deterministic replay baseline without updating it. Use `npm run test:golden:update` only for an intentional simulation behavior change, then review the fixture diff and record the rationale in the commit or pull request. Ordinary `npm run test:run` verification also disables snapshot updates.

## Browser controls

| Control           | Result                                                         |
| ----------------- | -------------------------------------------------------------- |
| Space             | Play or pause                                                  |
| `.`               | Advance one authoritative tick while paused                    |
| `1`, `2`, `4`     | Set simulation speed                                           |
| Click a creature  | Select and inspect it                                          |
| `F`               | Follow the selected creature                                   |
| Escape            | Return to the inspect tool                                     |
| Add food tool     | Add food at the chosen tile through the command queue          |
| Remove food tool  | Remove food at the chosen tile through the command queue       |
| Add material tool | Add material at the chosen tile through the command queue      |
| Remove material   | Remove material from the chosen tile through the command queue |
| Replenish water   | Add up to the selected source's remaining capacity             |
| Drain water       | Remove up to the selected source's current stock               |
| Obstacle tool     | Toggle a tile between open and blocked                         |
| Restart same seed | Recreate the initial world for a controlled comparison         |
| Experiment button | Open the record, replay, compare, and explain notebook         |
| New experiment    | Return to paused scenario and seed setup                       |

The interface also provides a semantic world navigator, resource/intention/group overlays, an independently toggleable traffic-trail layer, event-timeline filters, recoverable moment cards and pacing preferences, automatic intervention records, bookmarks, local save/load, import/export, deterministic replay, outcome comparison, and causal navigation.

## Headless simulation

Run one seed:

```sh
npm run headless -- --scenario petri-world --seed 4182 --ticks 10000
npm run headless -- run --scenario split-banks --seed 7319 --ticks 10000
```

Run a seed range or an explicit list:

```sh
npm run headless -- batch --seeds "1..100" --ticks 10000
npm run headless -- batch --seeds "3,8,21,34" --ticks 25000
```

Run seeds 1 through a count:

```sh
npm run batch -- --count 100 --ticks 10000
```

Run the portable four-scenario matrix (eight locked seeds, 2,000 ticks, with an exact repeat of every run):

```sh
npm run headless -- matrix --corpus smoke
```

`matrix` also accepts the locked `nightly`, legacy Phase 4.1 `calibration`,
and historical Phase 4.1 `holdout` corpora. Those selectors and their checked-in
artifacts are retained as immutable historical evidence. Phase 4.2 uses the
separate `phase-4.2-calibration` discovery selector and the reserved
`phase-4.2-holdout` selector. The holdout resolved exactly four scenarios,
seeds `2001..2064`, and 10,000 ticks after reviewed calibration provenance,
classifier 3, scenario bands, dominance rationales, and `SETTLEMENT` macro
bands were frozen. Its single authorized execution is now recorded, and the
runner rejects any rerun. Matrix JSON
retains every primary per-seed profile and reports scenario identity,
compiled-map hashes, hard invariants, expected-band checks, multi-label
factual outcomes, Wilson intervals, paired descriptive deltas, and convergence
diagnostics.

Phase 4.2 macro verification preserves the historical original-dimension
bands and adds a separate passing `SETTLEMENT` requirement. Nullable mean
shelter condition excludes pairs with no active-shelter observation and uses a
calibration-frozen eligible-pair minimum; absence is never converted to zero.

Generic `run`, `batch`, `profile`, and other matrix CLI paths reject every
reserved seed from `2001..2064`, including zero-tick initialization. Exported
headless simulation/profile APIs enforce the same rule. Direct imports from the
lower-level simulation-core package are outside this release-process guard and
must not be used to inspect or produce reserved-seed evidence.

For an ordinary durable matrix artifact, pass an explicit compressed output
path. The command still prints the same JSON to stdout and also writes
deterministic compact `.json.gz`, `.sha256`, and readable `.md` companions.
Full-corpus stdout is streamed in the same pretty format rather than assembled
as one oversized string:

```sh
npm run headless -- matrix --corpus smoke --output docs/baselines/local-smoke.json.gz
```

Protected Phase 4.2 evidence does not accept a seed or tick override, or a
noncanonical output path.
The discovery calibration writes only to
`docs/baselines/phase-4.2-calibration-v1.json.gz`; after the classifier and
bands are frozen, the post-freeze verification writes only to
`docs/baselines/phase-4.2-calibration-v2.json.gz`. The one-shot holdout writes
only to `docs/baselines/phase-4.2-holdout-v1.json.gz`. Each protected write is
staged and no-clobber: each file is installed without replacement, and a caught
failure rolls back files installed by that attempt. An existing compressed
artifact, checksum, or readable companion makes the command stop. A partial set
left by process or host failure is invalid evidence and requires manual audit;
it is never overwritten or presented as a fresh run. These
paths are selected from reviewed process state. The holdout command is now
permanently disabled by its checked-in `RECORDED` process lock.

Every protected Phase 4.2 matrix records a canonical definition fingerprint.
It binds the complete classifier-v3 implementation, label eligibility/order,
paired-metric readers and missing-value policies, inherited and settlement
band semantics, global gates, versions, scenarios, and horizon. Post-freeze v2
cannot begin until the full discovery artifact and freeze review validate; the
holdout then requires an exact fingerprint match across the checked-in runtime,
policy, freeze review, v2 artifact, and verification review. A checksum-valid
artifact stripped down to PASS strings is rejected.

The fingerprinted payload also carries the six data-only Phase 4.2 classifier
thresholds. A freeze review may supersede those thresholds and the Phase 4.2
band tables, while the evaluator implementation remains fixed. Before v2, the
runner regenerates every discovery scenario/seed for the full 10,000-tick
horizon, exact-compares each retained profile and final hash, then recomputes
and exact-compares the complete derived report under the discovery payload.
Before the holdout marker is created, the same authentication is repeated for
both v1 and v2. Serialized code is never evaluated.

Before the first authorized holdout tick, the runner durably and exclusively
creates `docs/baselines/phase-4.2-holdout-v1.attempt.json`. The marker is never
removed automatically: a crash, failed write, or partial result consumes the
attempt and requires explicit audit rather than a silent retry. Imported
`runMatrix` calls cannot execute the protected corpus because the authorization
is private to the CLI path that binds simulation to the canonical writer.
The marker records its durability model: POSIX flushes the file and parent
directory; Windows flushes the file and explicitly records that Node cannot
fsync a directory handle, rather than overstating a cross-platform power-loss
guarantee.

The separate `npm run test:e2e:release` command runs tagged critical journeys
in Chromium, Firefox, and WebKit. Routine `npm run test:e2e` and `npm run check`
remain Chromium-only. See the
[Phase 3 evidence ledger](docs/baselines/phase-3-release-status-v1.md) and
[Phase 4.1 evidence ledger](docs/baselines/phase-4.1-release-status-v1.md) for
their execution and human-gate status. The
[Phase 4.2 evidence ledger](docs/baselines/phase-4.2-release-status-v1.md)
separately records the current implementation, frozen calibration, recorded
holdout, passing automated gates, and pending human gates. The Phase 4.1 discovery
[review](docs/baselines/phase-4.1-calibration-review-v1.md) froze classifier
v2 and the selected bands. The unchanged
[frozen calibration](docs/baselines/phase-4.1-calibration-v2.md) and
[untouched holdout](docs/baselines/phase-4.1-holdout-v2.md) each cover four
scenarios × 64 seeds × 10,000 ticks and pass their automated hard, contract,
outcome-incidence, dominance-rationale, and paired macro-difference gates.

Use `npm run headless -- --help` for the complete CLI reference. A run prints structured JSON containing the final tick and state hash, surviving population, current group count, sharing, theft, conflict, completed-storage, shelter, rest, maintenance, occupancy-denial, guest-use, and relocation counters. Batch output includes every run and aggregate counts.

Elapsed time and ticks per second are measurements of the current machine and are not deterministic. The seed, requested ticks, final state, counters, and hash are the reproducible part of the result.

## Architecture

```text
Browser input -> controller -> Worker engine -> deterministic sim-core
React + PixiJS <- read-only projection frames and status --------|

Headless runner and tests -> direct engine -> the same sim-core
Replay notebook -> fresh disposable engine -> scenario + seed + branch commands
```

The simulation core owns time, authoritative intent, interaction claims, events, and state. In the browser, a typed engine boundary sends ticking, interventions, persistence operations, replay, and on-demand projections to a Web Worker; PixiJS renders read-only observation snapshots and React owns focus and presentation policy. Static tiles are resent only when navigation changes. Ordinary live frames are not hashed: their nullable hash field is populated only for an explicitly verified boundary, while the UI retains the latest verified hash together with its tick. A direct engine implements the same boundary for unsupported environments and tests. The headless app imports the same core without requiring a DOM, renderer, or Worker.

`sim-core` exposes a small simulation facade, a code-owned immutable scenario catalog/compiler, and an explicit tick coordinator. Desires, plans, reason facts, interaction slots, commands, social state, groups, attention events, projections, persistence, experiment branches, outcomes, causal evidence, actions, and maintenance systems live in focused modules. The web app consumes those contracts through simulation, focus, moment, and experiment controllers; its Pixi camera/runtime/layers remain downstream of read-only snapshots. General and moment replay use isolated engines and reconstruct the full scenario reference. Moment replay supplies captured observation frames to the dish, frames the focal subject, participants, and event location, then restores the exact live viewport, focus, play, follow, region, and DOM-focus state.

The locked Phase 3 identity, generation, corpus, and compatibility decisions are in [`docs/phase-3-contract.md`](docs/phase-3-contract.md); its work packages and remaining release-evidence gates are in [`docs/phase-3-execution-plan.md`](docs/phase-3-execution-plan.md). The Phase 4.1 mechanics, versions, migration, hydration evidence, and explicit exclusions are in [`docs/phase-4.1-contract.md`](docs/phase-4.1-contract.md). The frozen Phase 4.2 shelter mechanics, tuning, measurement definitions, versions, and holdout protocol are in [`docs/phase-4.2-contract.md`](docs/phase-4.2-contract.md), with delivery and evidence sequencing in [`docs/phase-4.2-execution-plan.md`](docs/phase-4.2-execution-plan.md). The broader product and authority rules remain in [`docs/design-and-architecture.md`](docs/design-and-architecture.md).

The repository is organized as npm workspaces:

```text
tiny-civilisation/
├─ apps/
│  ├─ web/                 React interface and PixiJS renderer
│  └─ headless/            Node.js single-run and batch CLI
├─ packages/
│  └─ sim-core/            Deterministic state, systems, AI, events, and tests
├─ package.json            Workspace commands
└─ tsconfig.base.json      Shared strict TypeScript settings
```

## Determinism model

The authoritative simulation advances at a fixed 10 ticks per simulated second. It uses integer or fixed-point values, stable entity IDs, deterministic iteration, a saved sequential RNG for generation, and keyed random values for action outcomes. Player edits are scheduled commands rather than immediate renderer mutations.

`hashSimulationState` produces a canonical state hash. Given the same supported scenario reference, behavior version, seed, tick count, and command log, a run reaches the same hash. Tests cover all four canonical initial/long-run states, repeated multi-scenario smoke runs, command ordering, seeded randomness, pathfinding, bounded social data, persistence contracts, migrations, and social scenario outcomes.

Rendering frame rate, camera state, open panels, elapsed wall-clock time, and CLI throughput are outside the authoritative state.

## Development boundary

The slice is successful when its story emerges from creature decisions rather than a scripted sequence:

```text
food pressure
  → sharing and trust
  → group formation
  → shared storage
  → shelter choice, construction, rest, and upkeep
  → theft and witnessing
  → confrontation
  → relationship and historical consequences
```

Phases 0, 1, and 2 are complete. The Phase 2.5 architecture and implementation are also present: v2 intent and spatial contracts, readable dish and semantic navigation, shared focus, attention/moment policy, progressive factual explanation, typed intervention traces, compatibility migrations, and isolated replay. Automated deterministic, component, runtime, and Chromium evidence is checked in, including the narrow/medium/wide story matrix and Chromium coverage for touch, reduced motion, forced colors, text resize, and high-zoom reflow. The later automated release run at immutable commit `7df0b22` added Firefox/WebKit coverage for the critical Worker/renderer/causal and experiment persistence/replay/comparison journeys. Manual NVDA and the unified five-person formative and five-new-person confirmatory rounds remain required; no human completion is claimed.

Phase 3 feature implementation is present: four structural scenarios, authoritative end-to-end identity, a scenario-aware statistical matrix, truthful browser setup, factual scenario context, compatibility migrations, and cross-scenario deterministic/performance gates. The historical 64-seed calibration and untouched 64-seed holdout from immutable commit `4ff604e` pass their automated hard, label, and macro gates; their compressed artifacts, checksums, and pre-holdout freeze review are linked from the [release-evidence ledger](docs/baselines/phase-3-release-status-v1.md). At immutable Phase 4.1 base commit `7df0b22`, the dated aggregate release suite passed all 12 stories across Chromium, Firefox, and WebKit. Phase 3 is still not release-complete because the manual NVDA pass and formative/confirmatory usability sessions remain pending. See [`docs/phase-3-execution-plan.md`](docs/phase-3-execution-plan.md) and `PROGRESS.md` for the remaining gates and wider roadmap.

Phase 4.1 engineering and automated simulation evidence are complete: water sources and interventions, thirst and nonlethal dehydration, gathering/drinking/sharing, weighted travel and factual move-cost reasons, observational traffic trails, accessible source/access projections, versioned migration, hydration classifiers, and the browser water story are implemented and covered. The unchanged frozen-band calibration and untouched holdout pass, and the Phase 4.1 release-candidate run at immutable commit `7df0b22` passed the deterministic, migration, golden, coverage, visual, payload, bundle, four-scenario throughput, and 12/12 Chromium/Firefox/WebKit gates. Manual NVDA and the unified five-person formative and five-new-person confirmatory rounds remain open, so Phase 4.1 is not release-complete; see the [evidence ledger](docs/baselines/phase-4.1-release-status-v1.md).

Phase 4.2 engineering and automated release-candidate evidence are complete in the current workspace: persistent groups autonomously rank a bounded site set, build and maintain a six-place communal shelter, choose sheltered or outdoor rest, admit trusted guests behind members, and may relocate once after a stable improvement signal. Material interventions, version-5 state and migrations, shelter projections, factual events, the focused settlement activity collector, classifier v3 labels, and the `SETTLEMENT` macro dimension are implemented. Discovery and frozen verification each cover four scenarios × 64 seeds × 10,000 ticks; the separately reserved `2001..2064` holdout ran once, passed its hard, contract, outcome, dominance, inherited-macro, and settlement gates, and was resealed as recorded. Source-only tests, golden replay, budgets, 30,761.8 ticks/s, 46/46 Chromium journeys/visuals, and the 24/24 Chromium/Firefox/WebKit matrix pass. This is not a release-complete claim: the inherited and new Phase 4.2 NVDA, formative, and confirmatory evidence gates remain open in the [Phase 4.2 ledger](docs/baselines/phase-4.2-release-status-v1.md).
