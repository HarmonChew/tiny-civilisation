# Tiny Civilisation — Progress and Expansion Plan

Last updated: 1 August 2026

## Current position

Phase 0 (baseline protection) and Phase 1 (behavior-preserving architecture) are complete. The deterministic simulation is now divided into focused systems behind typed, versioned contracts; the browser is split into controller, feature, rendering, and style modules; and CI can detect behavior, coverage, visual, build, and throughput regressions.

The project is ready to begin Phase 2: completing the player’s repeatable experiment loop. Major simulation systems remain deferred until experiments can be saved, replayed, compared, and explained.

### Verified baseline

- TypeScript type-checking, formatting, linting, and production builds pass across all workspaces.
- All 29 unit and integration tests pass: 24 simulation-core tests and 5 web tests.
- Four Playwright journeys pass against the real Pixi renderer, including narrow, medium, and wide screenshot baselines.
- The unchanged golden replay fixture has SHA-256 `8D343349EBE11F6113FDCD145391602FC74C8FA34BB5F05CE35098F78BAB299C`.
- Measured coverage is 88.68% statements in `sim-core` and 44.03% across the full web surface, with enforced regression floors.
- The post-refactor 200,000-tick benchmark reaches 23,704.9 ticks per second against a 12,874-tick minimum.
- CI exercises Node.js 22.12 and the primary Node.js 24 runtime.
- Commands, snapshots, replays, saves, behavior, and authoritative state have explicit version contracts.

### Main engineering risks

- The simulation still runs on the browser’s main thread. Move it into a Web Worker during Phase 2 before increasing population or world complexity.
- The render projection is rebuilt frequently. Measure and optimize this only after representative larger scenarios exist.
- Versioned save and replay contracts exist in the core, but the product has no save, load, replay, comparison, or import/export workflow yet.
- Pixi rendering has real browser coverage, but its camera and layer modules remain costly to unit-test in jsdom; the screenshot gate is the present regression boundary.

### Main product risks

- The current slice explains individual decisions well, but it does not yet help players preserve, replay, and compare experiments.
- The default run begins immediately, so a new player can miss the opening causal chain.
- Seed 4182 is intentionally tuned to demonstrate the complete social-storage-theft-conflict story. In an audit of seeds 1–20 at 10,000 ticks, every run formed exactly one group and completed one storage. Conflict varied, but the macro outcome did not.
- Several compact mobile controls measured between 28 and 36 pixels high, below a comfortable touch target.
- The canvas supports keyboard panning and zooming, but it lacks an equivalent keyboard-accessible way to browse creatures and world objects.

## Product principles

Future work should preserve these rules:

- Players change environmental conditions; they do not issue orders to creatures.
- Important outcomes can be traced backward through decisions, memories, relationships, and factual events.
- Comparison and discovery matter more than accumulation.
- Complexity is disclosed progressively so the living world remains the dominant surface.
- New systems must create several credible outcomes instead of extending one predetermined sequence.

The core product loop should become:

> Observe → form a hypothesis → change one condition → inspect the response → compare against a baseline → preserve or share the result.

## Expansion roadmap

The phases below are ordered by dependency. Calendar estimates should be set after team capacity and the intended population scale are confirmed.

### Phase 0 — Protect the baseline

Status: **Complete (1 August 2026).**

Goal: make refactoring safe before changing simulation behavior.

- Capture golden state hashes for a representative seed corpus and intervention logs.
- Record headless throughput and browser responsiveness as regression baselines.
- Document the authoritative tick pipeline, stable system order, and package dependency direction.
- Add one `npm run check` command covering formatting, linting, type-checking, tests, and build.
- Add coverage reporting and ratchet thresholds upward from the measured baseline.
- Test the minimum supported Node version as well as the primary CI version.
- Introduce explicit simulation-behavior and serialized-state version numbers.

The baseline is protected when:

- The baseline corpus can prove whether a refactor changed authoritative outcomes.
- CI runs the complete engineering check.
- Performance regressions are visible.

### Phase 1 — Refactor without behavior changes

Status: **Complete (1 August 2026).** The checked-in replay corpus is byte-for-byte unchanged.

Goal: make new systems cheaper and safer to add.

#### Simulation core

- Reduce `simulation.ts` to an explicit tick coordinator.
- Split commands, needs and resources, relationships and memories, groups, decisions, actions, events and history, invariants, projections, and persistence into focused modules.
- Co-locate each action’s eligibility, utility factors, target resolution, execution, and emitted facts.
- Preserve a declared stable order for systems, entities, candidates, and tie-breaking.
- Build ephemeral typed lookup indexes during a tick instead of repeatedly searching authoritative arrays.
- Keep authoritative state serializable. Do not introduce an ECS or framework rewrite unless later evidence justifies it.

#### Shared contracts

- Replace the defensive `unknown` adapter with a direct typed projection.
- Establish versioned command, snapshot, replay, and save contracts shared by the browser and headless applications.
- Fail clearly on incompatible development data instead of silently accepting alternate field names.
- Type headless metrics against the same simulation contracts.

#### Frontend

- Extract a simulation controller hook for play, pause, stepping, speed, restart, interventions, and errors.
- Move Chronicle, Dish, Inspector, transport controls, and evidence components into feature-focused modules.
- Separate Pixi camera and input handling from terrain, resource, structure, creature, intention, and group render layers.
- Divide CSS into tokens, base rules, workspace layout, feature components, and responsive/accessibility rules without adding a new styling framework.

#### Tests and tooling

- Add focused tests for each action and system.
- Add serialization, migration, and invalid-data tests.
- Add sampled multi-seed invariant tests.
- Add real browser smoke tests for controls, selection, interventions, timeline navigation, keyboard operation, mobile regions, and recovery.
- Add representative narrow, medium, and wide screenshot checks.

The architecture phase is complete when:

- The golden hash and command-log corpus remains unchanged.
- Internal workspace boundaries no longer depend on runtime shape probing.
- New actions can be implemented without editing several monolithic switches.
- Core browser journeys run against the real renderer in CI.

### Phase 2 — Complete the experiment loop

Status: **Next full phase.**

Goal: turn the current simulation viewer into a repeatable experimental sandbox.

- Start the first session paused and provide a short, skippable orientation.
- Add seed and scenario selection with concise descriptions.
- Add versioned save and load.
- Record every intervention automatically.
- Allow players to bookmark meaningful moments.
- Replay a run deterministically from its seed and command log.
- Add baseline-versus-intervention comparison.
- Show deltas for population, resources, groups, trust, theft, conflict, and construction.
- Provide a navigable causal trail from an event to its decision factors, relevant memories and relationships, and later consequences.
- Export and import compact experiment files.
- Move authoritative simulation work into a Web Worker before increasing scale.

The experiment-loop phase is complete when:

- A player can create a baseline, make one intervention, replay both runs, and compare their outcomes.
- Reloading a saved experiment preserves its authoritative result.
- Important events have an inspectable causal explanation.

### Phase 3 — Increase variation with existing mechanics

Goal: broaden emergence before adding many new nouns and rules.

- Add deterministic scenario presets with varied terrain, chokepoints, food distribution, starting traits, and social proximity.
- Establish a deterministic map-generation contract.
- Extend batch reporting with distributions, percentiles, time-to-event, group composition, relationship-network structure, stalemate detection, and dominant-strategy warnings.
- Define scenario-specific expected ranges instead of requiring one scripted outcome.
- Identify actions that are unreachable, dominant, repetitive, or irrelevant across seed batches.

The variation phase is complete when:

- The scenario matrix produces several meaningful macro outcomes.
- Balance changes are evaluated statistically and remain explainable through recorded facts.
- The original one-group, one-storage story remains a useful scenario rather than the universal result.

### Phase 4 — Add systemic depth vertically

Goal: add one complete causal system at a time.

Recommended order:

- **Water and mobility:** thirst, gathering, carrying, sharing, spatial competition, and wet or dry scenarios.
- **Shelter and settlement:** fatigue recovery, communal construction, maintenance, and settlement choice.
- **Lifecycle:** ageing, death, birth, lineage, mourning, inheritance, and population stability.
- **Collective difference:** group norms, culture, territory, migration, trade, and diplomacy.
- **External pressure:** seasons, disease, predators, and environmental shocks.
- **Technology:** only after knowledge transmission and cultural difference have meaningful mechanics.

Every system must include:

- Authoritative data and invariants.
- Decision candidates, utility factors, targeting, and action execution.
- Domain events and causal links.
- Memory, relationship, group, or environmental consequences.
- Timeline and inspector explanations.
- Headless metrics and multi-seed tests.
- Save migration.
- Accessible UI states and performance measurements.

LLM narration, if added later, should remain optional and downstream of factual events. It must not create authoritative history or explain facts the simulation did not record.

### Phase 5 — Product quality and scale

Goal: make the expanded simulation understandable and dependable across devices and input methods.

- Add a keyboard-accessible creature and world-object navigator.
- Provide a textual summary of important world state as an alternative to canvas-only discovery.
- Increase compact mobile controls and filters to comfortable touch sizes.
- Add intervention previews, clear rejection reasons, and replay-backed undo.
- Cluster repetitive events while preserving significant causal turns.
- Add optional ambient sound and clearer world feedback without obscuring evidence.
- Establish population, world-size, tick-rate, rendering, and bundle budgets before increasing scale.
- Run short usability sessions around three questions: What happened? Why did it happen? What changed because of the intervention?

## Definition of a successful expanded alpha

The project is ready for broad feature expansion when:

- The same seed and command log replay identically.
- Saves are versioned and migration-tested.
- Internal package boundaries are typed.
- New actions fit a stable extension pattern.
- A player can conduct and compare an experiment without external instructions.
- Important events have navigable causal explanations.
- Scenario runs produce several meaningful macro outcomes.
- The browser remains responsive at the chosen population and speed targets.
- Core interaction is usable by keyboard and at narrow mobile widths.

## Recommended next work

Phase 1 is complete. Implement Phase 2 in this dependency order:

1. Start new sessions paused; add a skippable orientation plus seed and scenario selection.
2. Expose the versioned save contract through save, load, export, import, and clear incompatibility recovery UI.
3. Record interventions automatically and let players bookmark meaningful ticks.
4. Build deterministic replay from seed plus command log, then add baseline-versus-intervention comparison and outcome deltas.
5. Connect events, decisions, memories, relationships, and consequences into a navigable causal trail.
6. Move authoritative ticking and replay into a Web Worker, retaining the existing typed command and snapshot boundary.

Phase 2 should finish with one browser-level acceptance journey: create a baseline, branch with one intervention, save and reload both runs, replay them to identical hashes, and compare the explained outcome.
