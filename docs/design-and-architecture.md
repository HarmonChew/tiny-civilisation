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
React controls ── PlayerCommand ──▶ deterministic sim-core
                                          │
                               read-only RenderSnapshot
                                          │
                      ┌───────────────────┴──────────────────┐
                      ▼                                      ▼
                Pixi world                             React evidence UI
```

React and Pixi never mutate authoritative entities. A world-edit click becomes a command scheduled for a simulation tick. The headless runner imports the same core and reaches the same state hash for the same seed and command log.

## Simulation invariants

- Ten fixed authoritative ticks equal one simulated second.
- Authoritative needs, traits, skills, resources, positions, and utility contributions are integers.
- Creature and event IDs are stable and monotonically allocated.
- System and entity iteration uses stable ordering.
- Action outcomes use keyed randomness so unrelated random calls do not contaminate later outcomes.
- Inventory quantities never become negative and never exceed capacity.
- Goals receive commitment time, a continuation bonus, and switching hysteresis.
- Memories, relationships, decisions, and recent events have explicit bounds.
- Timeline prose is assembled only from emitted facts and stored decision factors.

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

## Version policy

- `SIMULATION_BEHAVIOR_VERSION` changes when the same seed and command log intentionally produces a different result.
- `SIMULATION_STATE_VERSION` changes when authoritative serialized state changes shape.
- Command, snapshot, replay, and save schema versions change independently at their transport boundaries.
- Save parsing and migration happens only in `sim-core`; internal applications do not probe or silently alias incompatible fields.

## Vertical-slice boundary

Implemented now:

- a 48 × 32 seeded map with a chokepoint, two food patches, material, and obstacles;
- eight autonomous creatures with needs, traits, skills, inventory, goals, and actions;
- deterministic A* movement and resource gathering;
- sharing, theft, memories, directed relationships, group formation, leadership, communal storage, guarding, confrontation, and flight;
- pause, tick, speed, restart, selection, following, and environmental interventions;
- a timeline, creature inspector, relationship evidence, and top-alternative decision breakdown;
- state hashing, JSON snapshot continuity, scenario tests, and headless batch metrics.

Intentionally deferred:

- water, shelter, birth, ageing, death, culture, migration, territory, trade, seasons, disease, predators, technology, and LLM narration.

The deferred systems should extend the same event and utility contracts only after the social feedback loop remains compelling across multi-seed runs.
