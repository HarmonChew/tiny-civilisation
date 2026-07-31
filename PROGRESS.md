# Tiny Civilisation — Progress and Expansion Plan

Last updated: 30 July 2026

## Current position

Tiny Civilisation has a sound vertical-slice foundation. The deterministic simulation, scheduled player commands, state hashing, headless runner, and separation between simulation authority and rendering are the right long-term boundaries. The browser experience also has a distinct field-notebook identity that supports the observational premise.

The next milestone should focus on maintainability and the player’s experiment loop before adding major simulation systems.

### Verified baseline

- TypeScript type-checking passes across all workspaces.
- All 20 existing tests pass.
- The production build succeeds.
- The desktop and mobile interfaces render without observed console errors or horizontal overflow.
- The repository is divided into a simulation core, browser application, and headless runner.
- Deterministic replay, state hashing, command scheduling, bounded collections, pathfinding, and core social outcomes have automated coverage.

### Main engineering risks

- `packages/sim-core/src/simulation.ts` is approximately 2,800 lines and combines commands, needs, relationships, groups, Utility AI, action execution, events, invariants, snapshots, and hashing.
- `apps/web/src/App.tsx`, `apps/web/src/sim-adapter.ts`, `apps/web/src/components/PixiWorld.tsx`, and `apps/web/src/styles.css` have also accumulated several responsibilities.
- The web adapter casts the typed simulation package to `unknown` and reconstructs view data through runtime field probing. This weakens the monorepo’s compile-time contracts and makes every new simulation field more expensive to integrate.
- UI tests mock the Pixi renderer. There are no browser end-to-end, visual regression, accessibility, coverage, or performance gates.
- Serialized state already survives a JSON round trip, but there is no versioned save schema or migration policy.
- The simulation currently runs on the browser’s main thread and rebuilds the projected view frequently. This is acceptable for eight creatures but should be addressed before increasing population or world complexity.

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

Start with Phase 0 and the typed-boundary portion of Phase 1:

- Add golden seed and intervention replay fixtures.
- Replace the `unknown` simulation adapter with a typed projection.
- Extract action definitions and the tick pipeline from `simulation.ts` while preserving hashes.
- Add formatting, linting, coverage, and a real browser smoke test to CI.

Do not add major simulation systems until these four tasks are complete.
