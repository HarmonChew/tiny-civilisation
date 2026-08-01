# Tiny Civilisation — Progress and Expansion Plan

Last updated: 1 August 2026

## Current position

Phase 0 (baseline protection), Phase 1 (behavior-preserving architecture), and Phase 2 (the repeatable experiment loop) are complete. The deterministic simulation is divided into focused systems behind typed, versioned contracts; the browser delegates authoritative work to a Web Worker; and players can preserve, reconstruct, compare, and explain controlled interventions.

The next milestone is Phase 2.5: making the existing eight-creature civilisation readable, spatially alive, and dramatically paced. Phase 3 scenario variation and major simulation systems remain deferred until a player can understand who the creatures are, what they want, what they are doing, and why an important event matters without first opening a dense evidence view.

The current implementation proves that the simulation can retain and explain a social story. Phase 2.5 must make that story visible while it unfolds.

### Verification coverage

- `npm run check` covers formatting, linting, type-checking, coverage, production-browser journeys, and builds across the workspaces.
- The checked-in golden replay corpus remains protected from accidental snapshot updates during ordinary verification.
- Runtime tests exercise the direct and Worker engines, queued operations, replay progress and cancellation, stale responses, and crash recovery.
- Contract and persistence tests cover experiment round trips, branching, deep validation, browser-storage fallback behavior, size limits, and malformed data.
- Browser journeys cover paused setup, the real Pixi renderer, interventions, local save/load, replay hash verification, outcome comparison, import/export, causal navigation, malformed-file recovery, and narrow, medium, and wide screenshot baselines.
- Commands, snapshots, replays, saves, scenarios, experiments, outcomes, causal evidence, behavior, and authoritative state have explicit version contracts.

### Main engineering risks

- The render projection is rebuilt frequently. Measure and optimize it against the richer character, intention, and spatial projections introduced in Phase 2.5.
- Desire, plan, action, interaction-slot, and event-focus changes will intentionally affect authoritative behavior. They require explicit behavior-version decisions, reviewed golden-corpus updates, migrations where state shapes change, and deterministic replay coverage.
- Worker execution keeps authoritative work off the UI thread, but projection size, message volume, replay time, population, world size, and rendering budgets still need representative targets.
- Pixi rendering has real browser coverage, but its camera and layer modules remain costly to unit-test in jsdom; screenshot and real-browser interaction gates remain necessary.
- A live browser review emitted repeated React maximum-update-depth errors. Isolate and fix the loop before adding more reactive world and inspector state.
- Browser persistence currently centers on one active local save. A named experiment library, cross-device sync, and long-term archival policy remain later product decisions.

### Main product risks

- The dish does not currently communicate the simulation at a glance. Characters are small marks, overlapping creatures collapse into one visual position, and important motives are legible mainly after selection.
- The current goal projection repeats an action kind such as `KEEP` or `GUARD`. It does not distinguish a longer-lived desire, the plan chosen to pursue it, the action being performed, and the reason that action matters now.
- A focused audit of seeds 4182, 921, and 23 at 2,000 ticks found all eight creatures on one tile by tick 50 and only one or two occupied creature tiles at tick 2,000. `KEEP` accounted for approximately 76% of completed actions across those runs.
- Seed 4182 is tuned to demonstrate the complete social-storage-theft-conflict story. In the reference run, the first group forms around five simulated seconds, storage completes around sixteen seconds, and theft appears around forty-seven seconds. At higher playback speeds, the complete arc can pass before the player recognises its participants or stakes.
- In an audit of seeds 1–20 at 10,000 ticks, every run formed exactly one group and completed one storage. Conflict varied, but the macro outcome did not.
- The current scenario choices are seed-led presets over the same world contract. Structural scenario variation remains necessary, but different maps alone will not solve character, intention, overlap, or pacing problems.
- The chronicle records important outcomes, while routine intention changes and developing tensions are easy to miss. The causal explorer is powerful after an event but too detailed to serve as the first explanation of a live moment.
- The canvas supports keyboard panning and zooming, but it lacks an equivalent keyboard-accessible way to browse creatures and world objects.

## Product principles

Future work should preserve these rules:

- Players change environmental conditions; they do not issue orders to creatures.
- A player should be able to recognise a creature, understand its current desire and action, and see a concise reason before opening raw evidence.
- Important outcomes can be traced backward through decisions, memories, relationships, environmental facts, and prior events.
- The living world remains the dominant surface. Supporting panels orient attention and explain selected moments without turning the product into a dashboard.
- Character identity, spatial patterns, construction, carrying, cooperation, avoidance, and conflict must be visible in the dish rather than represented only as numbers.
- Significant events receive enough time and emphasis to be noticed at every supported playback speed.
- Explanations disclose complexity progressively: plain-language summary first, retained factors and source evidence second, raw contract data only when requested.
- Comparison and discovery matter more than accumulation.
- Accessibility, responsive behavior, input parity, and reduced-motion behavior are implementation requirements for each phase rather than final cleanup.
- New systems must create several credible, readable outcomes instead of extending one predetermined sequence or adding invisible complexity.

The core product loop should become:

> Recognise a creature → understand what it wants → notice a tension → form a hypothesis → change one condition → watch the consequence → explain and compare the result.

The design thesis is:

> Tiny Civilisation should feel like an ant farm crossed with a small social drama, documented through a field notebook. The notebook supports attention and evidence; the dish carries the life, identity, movement, and suspense.

## Expansion roadmap

The phases below are ordered by dependency. Calendar estimates should be set after team capacity and the intended population scale are confirmed.

### Phase 0 — Protect the baseline

Status: **Complete — baseline protected (1 August 2026).**

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

Status: **Complete — architecture refactored (1 August 2026).** The checked-in replay corpus is byte-for-byte unchanged.

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

Status: **Complete — experiment loop delivered (1 August 2026).**

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

### Phase 2.5 — Make the civilisation readable and dramatic

Status: **Next milestone.**

Goal: make the existing eight-creature world understandable and compelling to watch before adding scenario breadth or new systemic nouns.

Phase 2.5 changes both mechanics and presentation. It is not a cosmetic pass. The simulation must produce spatially distinct, paced, character-specific behavior, and the interface must expose that behavior without requiring the player to reconstruct it from raw utility factors.

#### 2.5.1 Establish the comprehension and activity baseline

- Add headless measures for action-share distribution, action transitions, movement distance, occupied creature tiles, overlap duration, crowding, interaction frequency, significant-event cadence, and time to group, storage, theft, conflict, and recovery.
- Record the current values for the reference seeds and retain them as product baselines rather than pass/fail golden outcomes.
- Add browser instrumentation or deterministic test helpers that can assert selected-character labels, current desire, plan, action, reason, destination, and event-focus state.
- Capture representative tick-0, early-settlement, construction, theft, conflict, and aftermath screenshots at narrow, medium, and wide sizes.
- Isolate and fix the maximum-update-depth error observed during the live browser review.
- Define the event-importance and speed rules that determine which moments receive a cue, slow-down, pause, replay marker, or chronicle entry.

#### 2.5.2 Separate desire, plan, action, and reason

- Extend the authoritative character model so a creature can retain a longer-lived desire independently from its immediate action.
- Represent at least four distinct concepts in the projection: what the creature wants, the plan or commitment it is pursuing, the current physical action, and the strongest factual reason for that action.
- Give desires meaningful persistence and explicit reconsideration rules so characters do not read as a sequence of unrelated action labels.
- Introduce a small set of desires using existing mechanics: security, hunger relief, reciprocity, belonging, protecting a person or group, avoiding a threat, repairing a relationship, preserving a private reserve, and completing shared work.
- Allow memories, relationships, roles, needs, and environmental facts to support or challenge a desire without bypassing Utility AI.
- Record desire and plan changes as causal facts when they are important enough to explain later behavior.
- Preserve stable ordering, deterministic tie-breaking, serialization, replay, and bounded history.

The first readable character sentence should be derivable from authoritative facts, for example:

> Aro wants Fernhollow to be safe. Aro is guarding the store because Taro recently stole from it.

#### 2.5.3 Prevent spatial collapse

- Add deterministic interaction positions around resources, structures, work sites, social encounters, and conflict targets so several creatures can use one place without sharing an exact coordinate.
- Add crowding and travel factors to target selection. A creature should consider a nearby open interaction position before joining an already saturated tile.
- Reserve exact co-location for explicit interactions whose presentation requires it, and render those interactions with participant separation.
- Give construction, storage, guarding, resting, sharing, and confrontation distinct spatial footprints.
- Ensure important structures and resources offer enough interaction capacity for the intended population while still allowing visible competition.
- Add invariants and multi-seed tests for valid interaction-slot ownership, release, pathing, and reconstruction.
- Tune `KEEP`, `GUARD`, and other stationary actions from the new activity measures. Scenario-specific expected ranges should replace universal dominance by a low-information action.
- Use occupied-tile count, overlap duration, movement, and action transition data as balance signals alongside macro outcomes.

#### 2.5.4 Make characters readable in the dish

- Add a compact creature roster that exposes all eight names, identity marks, roles, current desires, immediate actions, and alert states.
- Make roster, chronicle, inspector, causal evidence, and dish selection share one focus model. Hover, focus, or selection in one surface must identify the same creature everywhere else.
- Replace anonymous dot-scale marks with scalable character marks that remain distinguishable at the default camera scale and high zoom.
- Encode selected state, group membership, health risk, carried items, action family, and movement direction with redundant cues rather than color alone.
- Show names and concise action labels on hover, keyboard focus, or selection. Avoid permanent label clutter for unselected creatures.
- Add visible carrying, gathering, eating, building, sharing, guarding, fighting, fleeing, and resting feedback. Start with clear geometric or code-native animation before considering asset-heavy character art.
- Make resource patches, structures, construction progress, guard positions, gathering positions, paths, and group influence visually legible as world objects rather than legend-only marks.
- Add a selected-character focus mode that keeps the creature and destination visible, shows its recent route, and presents one line each for desire, action, and reason.
- Preserve the field-notebook frame, but reduce or reflow supporting panels when they obscure the dish or the event being explained.
- Respect reduced motion and keep informative state available without animation.

#### 2.5.5 Pace and frame important moments

- Introduce a speed-aware attention system for significant events. At 1×, a clear cue may be sufficient; at 2× or 4×, the same event may require a brief slow-down, pause, or queued moment card.
- Keep automatic slow-down and pause behavior optional, persistent, and keyboard accessible.
- Present a compact moment card with who acted, what happened, the plain-language reason, the immediate consequence, and controls to inspect or continue.
- Recenter or gently frame participants without destroying the player’s camera position. Provide a direct way to return to the prior view.
- Make construction and escalating conflict produce readable intermediate beats instead of appearing only as completed outcomes.
- Cluster repeated low-information events while preserving the first occurrence, material escalation, change in cause, and final consequence.
- Add replayable event moments with enough pre-event context to show approach, decision, action, and aftermath. Reconstruct them deterministically rather than storing renderer state as authority.
- Ensure queued moment cards do not interrupt every routine action or make higher playback speeds unusable.

#### 2.5.6 Make explanation progressive

- Generate a concise causal summary from retained facts for selected creatures and important events.
- Lead with desire, action, reason, and consequence. Keep complete candidate rankings, numeric utility contributions, memory edges, relationship edges, and raw identifiers behind explicit disclosure.
- Use participant names and world-object names wherever retained data permits. Do not display unresolved references as unexplained event identifiers; identify a retention gap or omit the unavailable item.
- Keep the selected moment spatially connected to the dish while evidence is open through highlights, participant focus, or a compact docked explanation.
- Allow evidence navigation to move between event, creature, memory, relationship, group, structure, resource, and tile without losing the breadcrumb path.
- Test explanations against factual events so summaries never invent motives, certainty, or consequences absent from authoritative state.

#### 2.5.7 Make interventions visibly consequential

- Keep the existing environmental tools, but preview the affected tile, command timing, and likely mechanical category without predicting an outcome the simulation has not decided.
- Explain rejection before or immediately after submission with the blocking rule and a recoverable next action.
- After an accepted intervention, identify which creatures noticed, reconsidered, rerouted, or remained unaffected as those facts become authoritative.
- Connect the intervention record to the affected world location, first responses, later important events, and comparison result.
- Add scenario questions and observation prompts without adding victory conditions or direct creature orders.
- Preserve replay-backed branching as the recovery path for testing a different intervention.

#### 2.5.8 Bring accessibility and usability into the core loop

- Add a keyboard-accessible creature and world-object navigator with the same focus and selection behavior as pointer interaction.
- Provide a live textual summary of important world state, selected-character state, and significant changes as an alternative to canvas-only discovery.
- Maintain usable touch targets, focus order, announcements, zoom/reflow, and mobile region transitions as the roster and moment system are introduced.
- Test all informative motion with reduced motion enabled and provide non-motion equivalents for event emphasis, direction, and action state.
- Run short usability sessions before Phase 3 around these questions:
  - Who are you watching?
  - What does that creature want?
  - What is it doing now, and why?
  - What important event just happened?
  - What changed because of the intervention?
- Record failures as product evidence and revise the flow before expanding the scenario matrix.

#### Phase 2.5 completion gates

Phase 2.5 is complete when:

- A new player can identify at least two creatures and accurately describe a selected creature’s desire, current action, and one factual reason after a short unassisted observation.
- All living creatures can be reached through pointer, keyboard, and textual navigation, and selection remains consistent across the roster, dish, chronicle, inspector, and evidence views.
- Creatures no longer collapse invisibly onto one tile during ordinary resource, storage, and group behavior; explicit interactions remain visually separable.
- The reference scenarios have documented ranges for action share, occupied tiles, overlap duration, movement, interaction frequency, and significant-event cadence. `KEEP` no longer consumes roughly three quarters of completed actions across every preset without a scenario-specific reason.
- Important events remain noticeable and recoverable at 1×, 2×, and 4×. A player can inspect a moment after it occurs without reconstructing the story from an event list alone.
- Character and event explanations lead with plain-language desire, action, reason, and consequence while retaining navigable raw evidence.
- An accepted intervention produces visible, factual feedback about affected locations and responding creatures; rejected interventions explain how to recover.
- Narrow, medium, and wide layouts preserve the living dish, character navigation, event comprehension, and input parity.
- Reduced-motion, keyboard-only, high-zoom, and touch checks pass for the primary observe → select → inspect → intervene → explain flow.
- Determinism, save/load, replay hashes, comparison, causal evidence, migrations, screenshot gates, performance budgets, and `npm run check` pass with intentional version changes documented.
- The browser completes the primary workflow without unexplained console errors.

### Phase 3 — Increase variation with readable mechanics

Status: **After Phase 2.5.**

Goal: broaden emergence while preserving the comprehension, pacing, and spatial-legibility standards established in Phase 2.5.

- Turn the seed-led presets into structurally distinct deterministic scenarios with varied terrain, chokepoints, resource distribution, starting traits, starting desires, social proximity, and interaction capacity.
- Give each scenario a concise dramatic question and a small set of observable tensions without defining a scripted ending.
- Establish a versioned deterministic scenario and map-generation contract.
- Extend batch reporting with distributions, percentiles, time-to-event, group composition, relationship-network structure, spatial dispersion, overlap duration, action transitions, event cadence, stalemate detection, and dominant-strategy warnings.
- Define scenario-specific expected ranges for macro outcomes and moment-to-moment activity instead of requiring one story or one global balance target.
- Identify actions, desires, locations, traits, and relationships that are unreachable, dominant, repetitive, irrelevant, or convergent across seed batches.
- Verify that different outcomes are visible through behavior and world state, not only distinguishable in end-of-run metrics.

The variation phase is complete when:

- The scenario matrix produces several meaningful macro outcomes and several readable paths toward them.
- A player can explain how two scenarios differ in starting conditions, developing tensions, character behavior, and eventual result.
- Balance changes are evaluated statistically and remain explainable through recorded facts.
- No scenario achieves variety only by replacing one universal dominant action, location, or group outcome with another.
- The original one-group, one-storage story remains a useful reference scenario rather than the universal result.

### Phase 4 — Add systemic depth vertically

Goal: add one complete causal and visible system at a time.

Recommended order:

- **Water and mobility:** thirst, gathering, carrying, sharing, spatial competition, route formation, and wet or dry scenarios. Water is first because it can create visible movement and settlement pressure using the Phase 2.5 spatial and intention grammar.
- **Shelter and settlement:** fatigue recovery, communal construction, maintenance, occupancy, and settlement choice.
- **Lifecycle:** ageing, death, birth, lineage, mourning, inheritance, and population stability.
- **Collective difference:** group norms, culture, territory, migration, trade, and diplomacy.
- **External pressure:** seasons, disease, predators, and environmental shocks.
- **Technology:** only after knowledge transmission and cultural difference have meaningful mechanics.

Every system must include:

- Authoritative data, invariants, versioning, and migration.
- Desire and plan effects as well as decision candidates, utility factors, targeting, and action execution.
- Domain events and causal links.
- Memory, relationship, group, or environmental consequences.
- A readable world representation, action feedback, character summary, event treatment, and progressive explanation.
- Headless outcome, activity, spatial, and pacing metrics with multi-seed tests.
- Keyboard, touch, reduced-motion, narrow-layout, and textual-summary states.
- Performance measurements against established budgets.

LLM narration, if added later, should remain optional and downstream of factual events. It must not create authoritative history, infer private motives absent from state, or explain facts the simulation did not record.

### Phase 5 — Scale, persistence, and long-run quality

Goal: expand the proven experience without weakening comprehension, determinism, accessibility, or responsiveness.

- Establish and enforce population, world-size, tick-rate, projection, Worker-message, replay-time, rendering, memory, persistence, and bundle budgets before increasing scale.
- Add level-of-detail, clustering, history compression, and navigation patterns that preserve individual stories when the population grows.
- Add a named experiment library, archival policy, and optional cross-device sync once the local experiment workflow and version policy are stable.
- Add replay-backed undo or branch shortcuts for interventions without introducing non-deterministic state mutation.
- Extend long-run summaries, comparison, and causal retention so important arcs remain recoverable without storing unbounded history.
- Add optional ambient sound and action feedback with independent volume controls, captions or textual equivalents where relevant, and reduced sensory modes.
- Continue usability, accessibility, responsive, and performance regression checks as release gates. Product quality is not deferred to this phase.

## Definition of a successful expanded alpha

The project is ready for broad feature expansion when:

- The same seed, scenario contract, behavior version, and command log replay identically.
- Saves are versioned and migration-tested.
- Internal package boundaries are typed and new actions fit the stable extension pattern.
- A player can recognise multiple creatures and understand a selected creature’s desire, plan, action, and immediate reason without opening raw evidence.
- Spatial behavior remains legible around resources, structures, groups, and conflict.
- Important moments are noticeable, recoverable, and explainable at every supported speed.
- A player can conduct and compare an experiment without external instructions and can see which creatures and locations responded to an intervention.
- Important events have concise factual summaries and navigable causal evidence.
- Scenario runs produce several meaningful, readable macro outcomes rather than several opaque metric combinations.
- The browser remains responsive within the chosen population, world-size, projection, and replay budgets.
- Core interaction is usable by keyboard, pointer, touch, textual navigation, reduced motion, at narrow mobile widths, and at high zoom.

## Recommended next work

Phase 2 is complete. Implement Phase 2.5 in this dependency order:

1. Fix the observed maximum-update-depth error and add the action, spatial, overlap, movement, interaction, event-cadence, and comprehension baselines.
2. Define and version the desire → plan → action → reason contract, including serialization, projection, causal facts, migration, and deterministic tests.
3. Implement deterministic interaction positions, crowding-aware targeting, and distinct spatial footprints for resources, storage, construction, guarding, sharing, rest, and conflict.
4. Tune `KEEP`, `GUARD`, and other stationary behavior from the new activity measures so the reference world produces visible movement and differentiated routines.
5. Build the shared creature focus model, eight-character roster, scalable character marks, world-object treatments, selected-character route, and concise desire/action/reason presentation.
6. Add speed-aware moment cues, optional slow-down or pause, intermediate construction and conflict beats, event clustering, and deterministic moment replay.
7. Rework the inspector and causal explorer around progressive factual summaries, with complete numeric evidence available on demand and retention gaps handled explicitly.
8. Add intervention previews, visible response tracing, keyboard and textual world navigation, reduced-motion behavior, and responsive input parity.
9. Run short usability sessions, address observed comprehension failures, lock Phase 2.5 product gates, and only then begin the structural scenario matrix in Phase 3.

Phase 2.5 should finish with one eight-creature civilisation that is worth watching before it is worth scaling. Its characters should be recognisable, their intentions understandable, their movement and work spatially readable, and every concise explanation grounded in deterministic evidence.
