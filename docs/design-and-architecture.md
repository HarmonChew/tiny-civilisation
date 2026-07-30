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
