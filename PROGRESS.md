# Tiny Civilisation — Progress and Expansion Plan

Last updated: 1 August 2026

## Current position

Phase 0 (baseline protection), Phase 1 (behavior-preserving architecture), and Phase 2 (the repeatable experiment loop) are complete. The deterministic simulation is divided into focused systems behind typed, versioned contracts; the browser delegates authoritative work to a Web Worker; and players can preserve, reconstruct, compare, and explain controlled interventions.

The project is ready to begin Phase 3: increasing variation with the existing mechanics. Major simulation systems remain deferred until deterministic scenarios demonstrate several meaningful, explainable outcomes instead of repeatedly converging on the tuned reference story.

### Verification coverage

- `npm run check` covers formatting, linting, type-checking, coverage, production-browser journeys, and builds across the workspaces.
- The checked-in golden replay corpus remains protected from accidental snapshot updates during ordinary verification.
- Runtime tests exercise the direct and Worker engines, queued operations, replay progress and cancellation, stale responses, and crash recovery.
- Contract and persistence tests cover experiment round trips, branching, deep validation, browser-storage fallback behavior, size limits, and malformed data.
- Browser journeys cover paused setup, the real Pixi renderer, interventions, local save/load, replay hash verification, outcome comparison, import/export, causal navigation, malformed-file recovery, and narrow, medium, and wide screenshot baselines.
- Commands, snapshots, replays, saves, scenarios, experiments, outcomes, causal evidence, behavior, and authoritative state have explicit version contracts.

### Main engineering risks

- The render projection is rebuilt frequently. Measure and optimize it against representative Phase 3 scenarios before increasing population or world complexity.
- Browser persistence currently centers on one active local save. A named experiment library, cross-device sync, and long-term archival policy remain product decisions rather than Phase 2 requirements.
- Worker execution keeps authoritative work off the UI thread, but population, world-size, replay-time, and message-volume budgets still need representative scale targets.
- Pixi rendering has real browser coverage, but its camera and layer modules remain costly to unit-test in jsdom; the screenshot gate is the present regression boundary.

### Main product risks

- Seed 4182 is intentionally tuned to demonstrate the complete social-storage-theft-conflict story. In an audit of seeds 1–20 at 10,000 ticks, every run formed exactly one group and completed one storage. Conflict varied, but the macro outcome did not.
- The current scenario choices are seed-led presets over the same world contract. Phase 3 must introduce structural differences in terrain, resources, traits, and starting proximity.
- Causal navigation is available, but its usefulness should be evaluated across a wider range of important outcomes and long runs with bounded history.
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

Status: **Complete (1 August 2026).**

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

The delivered browser workflow opens paused at tick 0, records accepted and rejected interventions, branches from bookmarks, and saves locally with a resilient storage fallback. It imports and exports versioned experiment files, reconstructs branches through the simulation runtime, checks replay hashes, and compares equal horizons. The timeline and intervention record open the corresponding causal evidence. Authoritative ticking and replay run through the Worker engine where the platform supports it.

### Phase 3 — Increase variation with existing mechanics

Status: **Next full phase.**

Goal: broaden emergence before adding many new nouns and rules.

- Turn the seed-led presets into structurally distinct deterministic scenarios with varied terrain, chokepoints, food distribution, starting traits, and social proximity.
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
- Maintain comfortable touch targets as new compact controls and filters are introduced.
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

Phase 2 is complete. Implement Phase 3 in this dependency order:

1. Define a versioned deterministic scenario contract for terrain, resources, starting traits, social proximity, and seed behavior.
2. Implement a small scenario matrix that changes those starting conditions while reusing the existing mechanics and experiment workflow.
3. Extend headless batch reports with distributions, percentiles, time-to-event, group composition, relationship-network structure, and stalemate signals.
4. Add scenario-specific expected ranges and automated checks for unreachable, dominant, repetitive, or irrelevant actions.
5. Tune existing mechanics from the batch evidence, preserving the reference scenario and recording any intentional golden-corpus changes.
6. Set Worker message-volume, replay-time, population, world-size, and rendering budgets against the new matrix before increasing scale.

Phase 3 should finish with a deterministic scenario matrix that produces several meaningful macro outcomes, remains reproducible through save and replay, and keeps each difference inspectable through comparison and causal evidence.
