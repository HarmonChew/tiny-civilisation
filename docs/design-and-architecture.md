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
                                            read-only RenderSnapshot v2 frames
                                                              │
                                          ┌───────────────────┴──────────────┐
                                          ▼                                  ▼
                                    Pixi world                         React evidence UI

On-demand hash/checkpoint/evidence/detail/outcomes ──────────▶ Worker engine

Experiment verification/moment replay ──▶ fresh disposable engine
```

React and Pixi never mutate authoritative entities. A world-edit click becomes a command scheduled for a simulation tick. Full state, canonical hash, checkpoint, evidence, detail, outcome, comparison, save/load, and replay work are explicit engine operations; the live web view is built from a typed observation snapshot. Ordinary frames carry a nullable hash rather than recomputing the canonical state hash. The footer identifies the tick of the latest explicitly verified hash. The headless runner imports the same core and reaches the same state hash for the same behavior version, seed, tick, and command log.

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
- Phase 2.5 uses behavior version 2 and authoritative state version 2. Snapshot, causal-evidence, and experiment envelopes are version 2. The nested intervention-response trace is version 1; command, replay, save, scenario, and outcome envelopes remain version 1 and carry behavior/state compatibility tags where applicable.
- Save, replay, and experiment parsing/migration happens only at `sim-core` contract boundaries; applications do not probe or silently alias incompatible fields.
- V1 saves derive the v2 observation/intent shape deterministically. V1 replays keep seed/commands but lose their old target/hash. A behavior/state-v2 experiment schema 1 keeps its outcomes and verification metadata while gaining `responseTrace: null`; a behavior/state-v1 experiment also retains branches, commands, labels, and bookmarks, but resets command outcomes and clears branch hashes/checkpoints before v2 replay establishes new evidence.
- Unknown versions, malformed nested shapes, extra fields, invalid references, and oversized persisted JSON are rejected before replacing the active run.

See the [version matrix and migration table](phase-2.5-implementation.md#version-matrix) for the current constants and exact effects.

## Vertical-slice boundary

Implemented now:

- a 48 × 32 seeded map with a chokepoint, two food patches, material, and obstacles;
- eight autonomous creatures with needs, traits, skills, inventory, persistent desires/plans, actions, and retained factual reasons;
- deterministic A* movement and resource gathering;
- authoritative interaction slots, readable endpoints/routes, and deterministic claim validation/repair;
- sharing, theft, memories, directed relationships, group formation, leadership, communal storage, guarding, confrontation, and flight;
- pause, tick, speed, restart, typed shared focus, following, and environmental interventions;
- a semantic world navigator, attention/moment queue, progressive creature inspector, relationship evidence, and top-alternative decision breakdown;
- typed intervention outcomes and bounded response traces;
- state hashing, compatibility migrations, isolated replay, JSON snapshot continuity, deterministic scenario tests, and streaming headless activity metrics.

Intentionally deferred:

- water, shelter, birth, ageing, death, culture, migration, territory, trade, seasons, disease, predators, technology, and LLM narration.

The deferred systems should extend the same event and utility contracts only after the social feedback loop remains compelling across multi-seed runs.

The Phase 2.5 implementation has automated deterministic, contract, runtime, and component evidence. The Chromium project includes real-Worker/Pixi journeys, touch input, reduced motion, forced colors, 200% text, 400% effective-zoom reflow, and an 18-image matrix covering six story states at narrow, medium, and wide viewports. The stable final build, bundle gate, and whole-file Chromium run pass 26/26; the targeted touch/text/reflow checks pass 3/3 and all 18 matrix cases pass. Manual NVDA or VoiceOver coverage and the planned formative/confirmatory usability sessions are still required release evidence. Firefox and WebKit have not been run and are not implied by the Chromium results.
