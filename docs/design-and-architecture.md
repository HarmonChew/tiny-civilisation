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
                                            read-only RenderSnapshot v6 frames
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
2. Advance ages and emit life-stage changes.
3. Update needs and retained damage, then resolve hardship mortality.
4. Resolve deterministic old-age mortality.
5. Regenerate resources, move dependent youth with their caregivers, and update proximity familiarity.
6. Move creatures, finish active actions, resolve injury death, and clear recovered critical states.
7. Process due pregnancies, births, memorials, mourning, and estates.
8. Reconcile group extinction, remove full dead actor state, and update shelters, groups, and succession.
9. Reconsider and begin scheduled creature decisions in stable creature-ID order.
10. Bound memories, relationships, decisions, and events; repair and validate authoritative invariants.
11. Increment the authoritative tick.

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

| Decision                                | Implemented boundary                                                                                                                                                                                                                                                        |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1 — intent hierarchy                   | `desires.ts` and `plans.ts` separate persistent desire and plan from the physical action; authoritative state and projections retain each layer.                                                                                                                            |
| D2 — factual reasons                    | `reason-facts.ts` captures typed fact snapshots and deterministically selects the strongest supported reason; `observation-summary.ts` returns clauses with fact references.                                                                                                |
| D3 — spatial interaction                | `interaction-slots.ts` assigns reachable authoritative fixed-point claims, validates uniqueness/walkability/capacity, and repairs invalid claims through blocked-plan reconsideration.                                                                                      |
| D4 — attention versus presentation      | `event-attention.ts` owns deterministic tier/cluster facts; `moments/event-presentation.ts` owns speed/preference-aware browser cues, pacing, queue bounds, and coalescing.                                                                                                 |
| D5 — observation frames                 | `projection.ts` emits snapshot v6; ordered static tiles transport only terrain/blocking while the web reconstructs derivable index/x/y, hot frames omit static world and life records, and typed hash/checkpoint/evidence/detail/outcome/life-record queries run on demand. |
| D6 — compatibility without false hashes | `versions.ts`, `state-migrations.ts`, `contracts.ts`, and `experiment-contracts.ts` migrate supported v1 artifacts while clearing v1 verification claims.                                                                                                                   |
| D7 — shared focus                       | `focus/` owns typed transient/persistent focus shared by the dish, navigator, chronicle, inspector, evidence, and moments.                                                                                                                                                  |
| D8 — isolated replay                    | A disposable engine captures the four 20/1/20 replay beats for the dish. Event-aware framing is temporary; exit/failure restores the exact live viewport, world focus, play, follow, region, and DOM focus.                                                                 |

## Scenario and Phase 4.3 system boundaries

- `sim-core/scenarios/` owns the immutable four-entry catalog, executable definitions, deterministic compiler, structural/topological validation, seed corpora, and stable compiled-map hashes.
- A scenario reference contains scenario ID, definition version, map-generation version, and seed. It is authoritative in state and is copied through snapshot, save, replay, experiment, outcome, causal-evidence, browser workspace, and Worker protocol boundaries.
- Scenario definitions compile starting facts: terrain/walk cost, resources, creature positions, initial hunger/fatigue/thirst, and bounded trait/skill inputs. They cannot inject desires, plans, actions, memories, relationships, groups, or events.
- Generic desire selection, candidate scoring, action execution, social updates, event attention, and causal evidence never branch on scenario ID. The Petri-specific startup sentence is presentation-compatible initialization, not a behavior branch.
- Static snapshot frames include catalog facts and compiled regions/chokepoints. Hot frames omit static tiles and landmark geometry. The browser retains the static scenario projection across hot updates.
- `headless matrix` runs catalog × locked seed corpora in catalog-then-seed order with one live simulation/collector at a time. It retains bounded raw primary profiles and derives hard invariants, contract bands, factual multi-label outcomes, Wilson incidence, paired descriptive effects, and convergence diagnostics.
- Cross-scenario analysis is descriptive and non-causal. Controlled experiment deltas remain restricted to the same scenario reference, seed, behavior version, and horizon.
- `shelters.ts` owns deterministic site assessment, legal footprints, condition, capacity, occupancy priority, maintenance, and one-time relocation. Shelter actions still enter through the shared desire, plan, candidate, interaction-claim, and resolver boundaries.
- `lifecycle.ts` owns age transitions, fertility and pregnancy, birth and lineage, dependent care, critical and natural mortality, life records, memorials, estates, and lifecycle group extinction. Lifecycle motives and actions still enter through the shared desire, plan, candidate, interaction-claim, and resolver boundaries.
- Living creatures remain authoritative entities; dead identities move to bounded life records and memorial projections. Parentage, caregiver, estate, and memorial references are deep-validated across save, replay, experiment, and Worker boundaries.
- Permanent records use stable-ID direct/Worker pagination with a default page size of 50 and maximum of 100; living creatures and active memorials remain the only lifecycle identities in hot frames.
- `headless` activity-profile schema 6 and scenario-analysis schema 5/classifier 4 add descriptive lifecycle measurements and factual non-exclusive labels. Phase 4.3 calibration and protected holdout corpora remain separate, no-clobber evidence routes; generic commands reject the reserved holdout seeds.

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
- Phase 4.2 uses behavior/state 5/5; command/snapshot 3/5; replay/save 4/4; scenario envelope/definition/map generation 2/2/1; experiment/outcome/causal-evidence 5/4/5; intervention response/activity profile 3/5; browser workspace/Worker protocol 4/4; and scenario analysis/outcome classifier 4/3.
- Phase 4.3 uses behavior/state 6/6; command/snapshot 3/6; replay/save 5/5; scenario envelope/definition/map generation 2/3/1; experiment/outcome/causal-evidence 6/5/6; intervention response/activity profile 4/6; browser workspace/Worker protocol 5/5; and scenario analysis/outcome classifier 5/4.
- Save, replay, and experiment parsing/migration happens only at `sim-core` contract boundaries; applications do not probe or silently alias incompatible fields.
- Supported seed-only artifacts migrate through the historical `petri-world` definition before the Phase 4 upgrade. Phase 3 artifacts are accepted only under explicit behavior-3/state-3 tuples. Their verification hashes, checkpoints, outcomes, and response traces are cleared; candidate state and scenario identity are fully validated before an active browser run is replaced.
- Unknown versions, malformed nested shapes, extra fields, invalid references, and oversized persisted JSON are rejected before replacing the active run.

See the [Phase 4.3 contract](phase-4.3-contract.md#version-boundary) for the current matrix, the [Phase 4.2 contract](phase-4.2-contract.md#compatibility-versions-and-migration) for its migration source, and the [Phase 2.5 implementation record](phase-2.5-implementation.md#version-matrix) for earlier history.

## Vertical-slice boundary

Implemented now:

- four versioned 48 × 32 starting worlds with distinct topology, resource access, proximity, and need/trait distributions;
- eight autonomous creatures with needs, traits, skills, inventory, persistent desires/plans, actions, and retained factual reasons;
- deterministic A* movement and resource gathering;
- thirst, finite renewable potable-water nodes, drinking, water sharing, deterministic weighted travel scoring, and observational traffic trails;
- autonomous communal shelter site selection, construction, occupancy, upkeep, degradation, and one-time relocation;
- deterministic ageing, family formation, pregnancy, birth, dependent care, critical and natural death, life records, mourning, memorials, estate transfer, and group extinction;
- authoritative interaction slots, readable endpoints/routes, and deterministic claim validation/repair;
- sharing, theft, memories, directed relationships, group formation, leadership, communal storage, guarding, confrontation, and flight;
- pause, tick, speed, restart, typed shared focus, following, and environmental interventions;
- a semantic world navigator, attention/moment queue, progressive creature inspector, relationship evidence, and top-alternative decision breakdown;
- typed intervention outcomes and bounded response traces;
- state hashing, compatibility migrations, isolated replay, JSON snapshot continuity, deterministic scenario tests, and a scenario-aware streaming headless matrix.

Intentionally deferred:

- marriage, adoption, gender roles, genetics beyond bounded potential blending, direct lifecycle controls, population above 24, culture, migration, territory, trade, diplomacy, seasons, disease, predators, technology, public deployment, cross-device sync, Phase 5 history compression, and LLM narration.

The deferred systems should extend the same event and utility contracts only after the social feedback loop remains compelling across multi-seed runs.

Phase 4.2 engineering and automated release-candidate evidence are complete in the current workspace, but automated coverage alone does not close its release gate. Discovery and same-seed frozen verification each cover four scenarios × 64 seeds × 10,000 ticks. The separately reserved `2001..2064` holdout ran once, passed the frozen hard, contract, outcome, dominance, inherited-macro, and `SETTLEMENT` gates, and is permanently recorded with execution disabled. Source-only coverage, behavior-5 golden replay, payload, bundle, throughput, 46/46 Chromium journeys and visuals, and the 24/24 Chromium/Firefox/WebKit matrix pass. The [Phase 4.2 release ledger](baselines/phase-4.2-release-status-v1.md) records the remaining inherited and Phase 4.2 human gates.

Phase 4.3 lifecycle engineering and prospective release tooling are present,
but the checked-in lifecycle calibration remains `NOT_RUN` and its protected
holdout remains sealed. The [Phase 4.3 contract](phase-4.3-contract.md) and
[release ledger](baselines/phase-4.3-release-status-v1.md) define the ordered
path from formative testing through a frozen candidate, final NVDA, one-shot
holdout, and separate confirmatory participants. No implementation or focused
test result closes those gates.

Phase 3 and Phase 4.1 retain their immutable historical calibration, holdout, checksum, and browser evidence. Their pending manual NVDA and unfamiliar-participant records are not inferred from the later automated results, so neither historical slice is retroactively described as release-complete.
