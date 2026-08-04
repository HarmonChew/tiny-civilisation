# Tiny Civilisation — design and architecture

## Product read

For curious players running a small living experiment, Tiny Civilisation helps them understand how scarcity, opportunity, and social memory shape autonomous creatures, so they can form a hypothesis, alter one condition, and compare the consequences. It should feel observant, alive, and evidence-led — not managerial, random, or omniscient.

This first implementation is a browser-based immersive monitoring workspace. Its primary loop is:

1. Observe a surprising action in the dish.
2. Select the creature or timeline event.
3. Inspect needs, relationships, memories, alternatives, and utility factors.
4. Change one environmental condition.
5. Let the creatures decide how to respond.
6. Compare later facts with the earlier causal chain.

## Design direction

The interface uses the visual language of a field notebook laid over a living specimen:

- the Pixi world is the dominant surface;
- warm paper, dark ink, moss, water, and coral carry semantic roles;
- ruled lines, clipped labels, and compact evidence lists suggest observation rather than command;
- saturated color is reserved for life, danger, selection, and interventions;
- controls use familiar browser semantics and are visually separated from creature state;
- motion communicates simulation state and creature movement, and reduces with the user’s motion preference.

The signature interaction is evidence-to-world selection: choosing an event or relationship returns attention to the involved creature, while the inspector retains the factual “why” record captured at decision time.

## Authority boundary

```text
React controls ── PlayerCommand ──▶ Worker engine ──▶ deterministic sim-core
                                                              │
                                            read-only RenderSnapshot v3 frames
                                                              │
                                          ┌───────────────────┴──────────────┐
                                          ▼                                  ▼
                                    Pixi world                         React evidence UI

On-demand hash/checkpoint/evidence/detail/outcomes ──────────▶ Worker engine

Experiment verification/moment replay ──▶ fresh disposable engine
```

React and Pixi never mutate authoritative entities. A world-edit click becomes a command scheduled for a simulation tick. Full state, canonical hash, checkpoint, evidence, detail, outcome, comparison, save/load, and replay work are explicit engine operations; the live web view is built from a typed observation snapshot. Ordinary frames carry a nullable hash rather than recomputing the canonical state hash. The footer identifies the tick of the latest explicitly verified hash. The headless runner imports the same core and reaches the same state hash for the same supported scenario reference, behavior version, seed, tick, and command log.

## Simulation invariants

- Ten fixed authoritative ticks equal one simulated second.
- Authoritative needs, traits, skills, resources, positions, and utility contributions are integers.
- Creature and event IDs are stable and monotonically allocated.
- System and entity iteration uses stable ordering.
- Action outcomes use keyed randomness so unrelated random calls do not contaminate later outcomes.
- Inventory quantities never become negative and never exceed capacity.
- Desires receive commitment time; plans receive continuity; physical actions remain interruptible by declared emergencies and invalid targets.
- Memories, relationships, decisions, and recent events have explicit bounds.
- Timeline and intent prose is assembled only from emitted facts, stored decision factors, and typed observation summaries.

## Authoritative tick pipeline

`advanceSimulation` executes the following systems once per authoritative tick, in this declared order:

1. Apply scheduled player commands in `(applyAtTick, commandId)` order.
2. Update creature needs.
3. Regenerate resource nodes.
4. Update proximity familiarity.
5. Move creatures and finish active actions.
6. Reconcile groups, roles, leaders, homes, and storage ownership.
7. Reconsider and begin scheduled creature decisions in stable creature-ID order.
8. Decay and bound memories, relationships, decisions, and event collections.
9. Repair and validate authoritative invariants.
10. Increment the authoritative tick.

The order is part of `SIMULATION_BEHAVIOR_VERSION`. A refactor must retain the checked-in golden hashes. A deliberate order or balance change increments that version and requires an explicitly reviewed fixture update.

Ephemeral lookup maps may be rebuilt for a tick, but they are never serialized or hashed. Authoritative entities remain ordered arrays and all candidate ties retain their declared action/target ordering.

## Package dependency direction

```text
apps/web ───────┐
                ├──▶ packages/sim-core
apps/headless ──┘
```

- `sim-core` contains deterministic state, contracts, systems, projections, persistence, and no browser or Node runtime dependencies.
- `web` consumes typed commands and read-only snapshots. React and Pixi never mutate entities directly.
- `headless` consumes the same typed state, metrics, replay, and hashing contracts without importing web code.
- Dependencies never point from `sim-core` back into an application or between applications.

## Phase 1 module boundaries

- `simulation.ts` is the public facade; `tick.ts` declares and coordinates the authoritative pipeline.
- `commands.ts`, `events.ts`, `social.ts`, and `groups.ts` own their respective state transitions.
- `systems/` contains ordered needs, resource, cleanup, and invariant maintenance passes.
- `actions/registry.ts` declares every action, while candidate scoring and exhaustive execution resolvers are separated under `actions/`.
- `tick-context.ts` builds ephemeral typed indexes without entering serialized or hashed state.
- `contracts.ts`, `versions.ts`, `projection.ts`, and `state-hash.ts` own external boundaries and canonical output.
- The browser controller hook owns playback and interventions; feature components consume typed projections; Pixi runtime, camera, and layers only render snapshots.

## Phase 2.5 decisions and module boundaries

The implemented decisions are summarized here; [`phase-2.5-implementation.md`](phase-2.5-implementation.md) records their exact compatibility and verification behavior.

| Decision                                | Implemented boundary                                                                                                                                                                                                                |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1 — intent hierarchy                   | `desires.ts` and `plans.ts` separate persistent desire and plan from the physical action; authoritative state and projections retain each layer.                                                                                    |
| D2 — factual reasons                    | `reason-facts.ts` captures typed fact snapshots and deterministically selects the strongest supported reason; `observation-summary.ts` returns clauses with fact references.                                                        |
| D3 — spatial interaction                | `interaction-slots.ts` assigns reachable authoritative fixed-point claims, validates uniqueness/walkability/capacity, and repairs invalid claims through blocked-plan reconsideration.                                              |
| D4 — attention versus presentation      | `event-attention.ts` owns deterministic tier/cluster facts; `moments/event-presentation.ts` owns speed/preference-aware browser cues, pacing, queue bounds, and coalescing.                                                         |
| D5 — observation frames                 | `projection.ts` emits snapshot v2; the Worker owns mutable state, static tiles are omitted between navigation revisions, ordinary frame hashes are `null`, and typed hash/checkpoint/evidence/detail/outcome queries run on demand. |
| D6 — compatibility without false hashes | `versions.ts`, `state-migrations.ts`, `contracts.ts`, and `experiment-contracts.ts` migrate supported v1 artifacts while clearing v1 verification claims.                                                                           |
| D7 — shared focus                       | `focus/` owns typed transient/persistent focus shared by the dish, navigator, chronicle, inspector, evidence, and moments.                                                                                                          |
| D8 — isolated replay                    | A disposable engine captures the four 20/1/20 replay beats for the dish. Event-aware framing is temporary; exit/failure restores the exact live viewport, world focus, play, follow, region, and DOM focus.                         |

## Phase 3 scenario boundaries

- `sim-core/scenarios/` owns the immutable four-entry catalog, executable definitions, deterministic compiler, structural/topological validation, seed corpora, and stable compiled-map hashes.
- A scenario reference contains scenario ID, definition version, map-generation version, and seed. It is authoritative in state and is copied through snapshot, save, replay, experiment, outcome, causal-evidence, browser workspace, and Worker protocol boundaries.
- Scenario definitions compile only existing starting facts: terrain/walk cost, resources, creature positions, initial hunger/fatigue, and bounded trait/skill inputs. They cannot inject desires, plans, actions, memories, relationships, groups, or events.
- Generic desire selection, candidate scoring, action execution, social updates, event attention, and causal evidence never branch on scenario ID. The Petri-specific startup sentence is presentation-compatible initialization, not a behavior branch.
- Static snapshot frames include catalog facts and compiled regions/chokepoints. Hot frames omit static tiles and landmark geometry. The browser retains the static scenario projection across hot updates.
- `headless matrix` runs catalog × locked seed corpora in catalog-then-seed order with one live simulation/collector at a time. It retains bounded raw primary profiles and derives hard invariants, contract bands, factual multi-label outcomes, Wilson incidence, paired descriptive effects, and convergence diagnostics.
- Cross-scenario analysis is descriptive and non-causal. Controlled experiment deltas remain restricted to the same scenario reference, seed, behavior version, and horizon.

Additional Phase 2.5 presentation modules remain downstream of these contracts:

- Pixi visual grammar/mark modules render identity, direction, destination/route, inventory, work, construction, guard, social, conflict, flight, rest, and intervention-preview facts.
- The semantic world navigator provides stable spatial ordering, text equivalents, roving keyboard focus, and debounced important-event announcements.
- The moment queue applies the pure attention policy and restores the prior playback state after automatic pacing.
- Moment replay renders captured approach, decision, action, and aftermath projections in the dish, locks live camera input, and frames the focal subject, event participants, and retained event location together.
- Intervention reconciliation and response tracing use typed command/event IDs and bounded evidence windows; they do not infer causality from summary prose.

## Version policy

- `SIMULATION_BEHAVIOR_VERSION` changes when the same seed and command log intentionally produces a different result.
- `SIMULATION_STATE_VERSION` changes when authoritative serialized state changes shape.
- Command, snapshot, replay, save, scenario, experiment, outcome, and causal-evidence schema versions change independently at their transport boundaries.
- Phase 3 retains behavior version 3 and advances authoritative state to 3. Snapshot, replay, save, scenario, experiment, outcome, and causal-evidence schemas are 3, 2, 2, 2, 3, 2, and 3 respectively. Browser workspace and Worker runtime protocol are both version 2. The nested intervention-response trace remains version 1 and command remains version 1.
- Save, replay, and experiment parsing/migration happens only at `sim-core` contract boundaries; applications do not probe or silently alias incompatible fields.
- Supported seed-only artifacts migrate to `petri-world@1`. Legacy verification hashes/checkpoints are cleared when the added authoritative identity makes the old claim unverifiable. Candidate state and scenario identity are fully validated before an active browser run is replaced.
- Unknown versions, malformed nested shapes, extra fields, invalid references, and oversized persisted JSON are rejected before replacing the active run.

See the [Phase 3 contract](phase-3-contract.md#compatibility-and-versions) for the current matrix and [Phase 2.5 implementation record](phase-2.5-implementation.md#version-matrix) for the historical migration source.

## Vertical-slice boundary

Implemented now:

- four versioned 48 × 32 starting worlds with distinct topology, resource access, proximity, and need/trait distributions;
- eight autonomous creatures with needs, traits, skills, inventory, persistent desires/plans, actions, and retained factual reasons;
- deterministic A* movement and resource gathering;
- authoritative interaction slots, readable endpoints/routes, and deterministic claim validation/repair;
- sharing, theft, memories, directed relationships, group formation, leadership, communal storage, guarding, confrontation, and flight;
- pause, tick, speed, restart, typed shared focus, following, and environmental interventions;
- a semantic world navigator, attention/moment queue, progressive creature inspector, relationship evidence, and top-alternative decision breakdown;
- typed intervention outcomes and bounded response traces;
- state hashing, compatibility migrations, isolated replay, JSON snapshot continuity, deterministic scenario tests, and a scenario-aware streaming headless matrix.

Intentionally deferred:

- water, shelter, birth, ageing, death, culture, migration, territory, trade, seasons, disease, predators, technology, and LLM narration.

The deferred systems should extend the same event and utility contracts only after the social feedback loop remains compelling across multi-seed runs.

Phase 3 adds automated deterministic, contract, runtime, component, and portable 32-run smoke evidence across all four identities. The Chromium project retains the 18-image Petri story matrix, adds tick-zero narrow/medium/wide coverage for every additional scenario, and captures one 2,000-tick developed state per new scenario. The production suite passes 38/38 with 30 visual baselines. Manual NVDA or VoiceOver coverage, Firefox/WebKit release runs, full calibration/holdout evidence, and the planned formative/confirmatory usability sessions remain release gates until their artifacts are attached.
