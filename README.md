# Tiny Civilisation

Tiny Civilisation is an observable social simulation in a Petri dish. The player changes resources and terrain; the creatures decide how to respond. There are no movement orders, build orders, or buttons that force a relationship or group outcome.

This repository implements an experiment-ready vertical slice of the larger design: a small deterministic world where food pressure can lead to sharing, trust, group formation, communal storage, theft, confrontation, and a factual history the player can preserve, replay, compare, and explain.

## What is implemented

- A fixed-tick, seeded simulation with four versioned 48 × 32 scenarios: the preserved Petri reference plus topology, abundance, and unequal-start contrasts.
- Eight autonomous creatures with hunger, fatigue, health, inventories, traits, and skills.
- Food and material nodes, blocked terrain, a chokepoint, grid pathfinding, and fixed-point movement.
- Rule-gated Utility AI with separate persistent desires, plans, physical actions, structured reason facts, deterministic tie-breaking, and factor-by-factor decision records.
- Gathering, eating, resting, sharing, keeping, stealing, depositing, withdrawing, storage construction, guarding, fighting, fleeing, and joining a group.
- Authoritative interaction slots and fixed-point endpoints that keep gathering, construction, storage, social, guard, and conflict participants spatially legible.
- Directed trust, fear, familiarity, and rivalry; bounded memories for help, theft, harm, resources, and group formation.
- Emergent groups, leadership, descriptive roles, shared storage, witness-based theft detection, and nonlethal-biased conflict.
- A PixiJS world view with identity/direction marks, routes, destinations, carrying and action feedback, plus React inspectors for intentions, relationships, groups, decisions, and history.
- A keyboard-operable semantic world navigator with spatial ordering, textual dish/subject summaries, shared typed focus, and debounced significant-event announcements.
- Deterministic event attention tiers, clustering, a bounded recoverable moment queue, and optional speed-aware pacing that restores the player's previous playback state.
- Player commands for adding or removing food and toggling obstacles. Commands enter the simulation at an authoritative tick.
- Typed command outcomes, rejection recovery, and bounded factual response traces linked by command/event IDs rather than summary text.
- A paused-first experiment setup that chooses an authoritative scenario and seed independently, then shows its dramatic question, starting facts, observable tensions, and named regions.
- An experiment notebook that records interventions, creates baseline and intervention branches, and bookmarks meaningful ticks.
- Versioned browser saves with IndexedDB and local-storage fallback, plus compact experiment import and export.
- Deterministic branch and moment replay in disposable engines, with progress, cancellation, final-hash evidence, captured dish frames, event-aware camera framing, and exact restoration of the live session.
- Equal-horizon baseline-versus-intervention comparison for population, resources, groups, trust, sharing, theft, confrontation, and construction.
- A navigable causal explorer connecting events to decisions, utility factors, relevant social evidence, immediate causes, and later consequences.
- Worker-backed browser execution with projection-only live frames and typed on-demand hash, checkpoint, evidence, detail, intervention-outcome, and comparison queries; the direct runtime retains the same boundary for unsupported environments and tests.
- A Node.js headless runner for deterministic single-seed, multi-seed, activity-profile, benchmark, and locked scenario-matrix runs.
- Versioned command, snapshot, replay, save, scenario, experiment, outcome, causal-evidence, behavior, and authoritative-state contracts with migration and invalid-data rejection.
- A declared tick pipeline, focused simulation systems, typed lookup indexes, and an exhaustive action resolver registry.
- Real-browser Chromium coverage for the Worker, Pixi renderer, touch, reduced motion, forced colors, 200% text, 400% effective zoom, the 18-image Petri story matrix, tick-zero narrow/medium/wide views of every additional scenario, and one developed-state view per new scenario, plus enforced coverage and production-bundle budgets.

The current product slice deliberately excludes water, shelters, birth and ageing, culture, migration, trade, territory, seasons, disease, predators, technology, large-world scaling, and LLM narration. Those belong to later milestones after the existing mechanics produce a broader range of explainable outcomes.

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

`npm run check` is the complete automated local and CI gate: formatting, linting, type-checking, coverage, real-browser journeys, production builds, and the post-build JavaScript/CSS budget check. `npm test` starts the interactive Vitest watchers; use `npm run test:run` for a single non-interactive pass. Manual screen-reader, Firefox/WebKit, and usability sessions remain separate release evidence; automated checks do not claim to replace them.

`npm run test:golden` verifies the checked-in deterministic replay baseline without updating it. Use `npm run test:golden:update` only for an intentional simulation behavior change, then review the fixture diff and record the rationale in the commit or pull request. Ordinary `npm run test:run` verification also disables snapshot updates.

## Browser controls

| Control           | Result                                                   |
| ----------------- | -------------------------------------------------------- |
| Space             | Play or pause                                            |
| `.`               | Advance one authoritative tick while paused              |
| `1`, `2`, `4`     | Set simulation speed                                     |
| Click a creature  | Select and inspect it                                    |
| `F`               | Follow the selected creature                             |
| Escape            | Return to the inspect tool                               |
| Add food tool     | Add food at the chosen tile through the command queue    |
| Remove food tool  | Remove food at the chosen tile through the command queue |
| Obstacle tool     | Toggle a tile between open and blocked                   |
| Restart same seed | Recreate the initial world for a controlled comparison   |
| Experiment button | Open the record, replay, compare, and explain notebook   |
| New experiment    | Return to paused scenario and seed setup                 |

The interface also provides a semantic world navigator, resource/intention/group overlays, event-timeline filters, recoverable moment cards and pacing preferences, automatic intervention records, bookmarks, local save/load, import/export, deterministic replay, outcome comparison, and causal navigation.

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

`matrix` also accepts the locked `nightly`, `calibration`, and `holdout` corpora. Its JSON retains every primary per-seed profile and reports scenario identity, compiled-map hashes, hard invariants, expected-band checks, multi-label factual outcomes, Wilson intervals, paired descriptive deltas, and convergence diagnostics.

Use `npm run headless -- --help` for the complete CLI reference. A run prints structured JSON containing the final tick and state hash, surviving population, current group count, sharing, theft, conflict, and completed-storage counters. Batch output includes every run and aggregate counts.

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

The locked Phase 3 identity, generation, corpus, and compatibility decisions are in [`docs/phase-3-contract.md`](docs/phase-3-contract.md); its work packages and remaining release-evidence gates are in [`docs/phase-3-execution-plan.md`](docs/phase-3-execution-plan.md). The broader product and authority rules remain in [`docs/design-and-architecture.md`](docs/design-and-architecture.md).

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
  → theft and witnessing
  → confrontation
  → relationship and historical consequences
```

Phases 0, 1, and 2 are complete. The Phase 2.5 architecture and implementation are also present: v2 intent and spatial contracts, readable dish and semantic navigation, shared focus, attention/moment policy, progressive factual explanation, typed intervention traces, compatibility migrations, and isolated replay. Automated deterministic, component, runtime, and Chromium evidence is checked in, including the narrow/medium/wide story matrix and Chromium coverage for touch, reduced motion, forced colors, text resize, and high-zoom reflow. Manual NVDA/VoiceOver, formative/confirmatory usability sessions, and browser-specific Firefox/WebKit evidence remain required before the project claims complete Phase 2.5 release evidence.

Phase 3 feature implementation is present: four structural scenarios, authoritative end-to-end identity, a scenario-aware statistical matrix, truthful browser setup, factual scenario context, compatibility migrations, and cross-scenario deterministic/performance gates. It is not yet a complete release-evidence claim: the full locked calibration/holdout artifacts, manual NVDA or VoiceOver pass, Firefox/WebKit release runs, and formative/confirmatory usability sessions still need to be attached. Water and shelter, lifecycle, culture, and migration remain Phase 4 work. See [`docs/phase-3-execution-plan.md`](docs/phase-3-execution-plan.md) for the evidence checklist and `PROGRESS.md` for the wider roadmap.
