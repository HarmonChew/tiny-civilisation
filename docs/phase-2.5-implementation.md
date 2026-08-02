# Phase 2.5 implementation architecture

Status: **architecture and code implemented; manual release evidence remains**  
Updated: **2 August 2026**

This document records the Phase 2.5 contracts that are present in the repository. It is the implementation counterpart to the [Phase 2.5 execution plan](phase-2.5-execution-plan.md), not a claim that every release-evidence activity in that plan has been completed.

## Runtime and authority boundary

```text
browser controls ── typed command ──▶ Worker SimulationEngine ──▶ sim-core
       ▲                                      │
       │                                      ├─ read-only snapshot v2 + nullable frame hash
       │                                      └─ typed on-demand projections/checkpoints
       │
React evidence + Pixi dish ◀── WorldView built from the observation snapshot

headless profile/tests ──▶ direct SimulationEngine or sim-core
isolated replay       ──▶ fresh disposable engine ──▶ captured frames + final hash
```

`sim-core` owns desires, plans, actions, reason facts, interaction claims, events, command outcomes, time, and canonical state. The browser sends commands through the engine boundary and consumes immutable frames. Pixi camera state, React focus, open panels, moment cards, playback speed, and elapsed wall-clock time are not authoritative simulation state.

Snapshot v2 is the live observation contract. Static tiles are sent after create/load and whenever `navigationRevision` changes; intermediate frames reuse the retained tile projection. Creature intent summaries, bounded route/evidence data, world objects, groups, attention events, history, and metrics remain in the snapshot because the current UI consumes them directly.

Ordinary create/play/advance/step/intervention frames do not compute a canonical state hash. `SimulationFrame.hash` is nullable and is populated only when that exact boundary has already been verified, such as load or final replay. `getCanonicalHash` and `getCheckpoint` perform explicit canonical work in the runtime; the web controller retains the latest verified hash and its tick instead of implying that every visual refresh was hashed. At seed 4182 and tick 5,000, the deterministic UTF-8 JSON measurement for the hot frame is 64,759 bytes, 777 bytes below the 65,536-byte gate.

Full state/save/load and replay remain explicit operations. Canonical hash, detached checkpoint, causal evidence, entity detail, intervention-outcome projection, current outcome, and equal-horizon comparison each have typed direct/Worker operations. Workspace save/export/branch, evidence, intervention reconciliation, and comparison paths use those operations instead of reconstructing projections or hashing `SimulationState` on the main thread. On-demand Worker projections accept cancellation; causal navigation also aborts superseded work and ignores stale responses.

## D1–D8 implementation decisions

### D1. Desire, plan, action, and reason are distinct

The v2 state separates nine `DesireKind` values, fourteen `PlanKind` values, the physical `ActionKind`, and a structured strongest reason. `ActiveDesire` carries commitment and reconsideration ticks. `ActivePlan` carries status, target, expected utility, reason, and interaction claim. `ActiveAction` remains the current physical step.

Candidate ranking is deterministic across the desire, plan, and action levels. Desire commitment and plan continuity apply before stable lexical/entity tie-breaking. The legacy-compatible `ActiveGoal` record remains internal continuation state, but projections and user-facing summaries use the separate desire and plan contracts.

### D2. Reasons are retained facts

`ReasonFact` records fact kind, key, label, source measurement, unit, stable entity/event sources, and capture tick. The measurement is retained separately from the scaled utility contribution: for example, travel records tiles rather than the weighted travel penalty. Utility factors may carry one of these fact snapshots, and decision records retain a deterministic strongest reason. Implementation-only continuity/tie-break factors are excluded from strongest-reason selection.

`projectCreatureObservationSummary` returns separate desire, plan, action, and reason clauses with their fact references. The inspector presents those clauses before the ranked candidate/factor record, and causal evidence can navigate desire, plan, decision, event, memory, relationship, group, structure, resource, creature, and tile references.

### D3. Interaction slots are authoritative

`InteractionClaim` is stored with active action/plan state. Stable footprint templates provide bounded slots for gathering, resting, social interaction, storage access, construction, guarding, and conflict. Selection uses fixed-point endpoints, walkability, route reachability, distance, and slot index; authoritative creature processing remains in stable ID order.

Validation rejects duplicate slots, duplicate endpoints, blocked targets, and out-of-capacity claims. Repair clears invalid actions, marks the corresponding plan blocked, and schedules reconsideration. Claims therefore affect path targets and replay hashes; they are not renderer offsets.

### D4. Event facts and presentation policy are separate

Every domain event carries a deterministic `attentionTier` and `clusterKey`. The pure core policy classifies routine, notable, significant, and critical events and maps tier × playback speed × persistent user preference to a browser cue, queue decision, and optional slow/pause action.

The web moment policy keeps significant/critical events in a bounded, expiring queue, coalesces repeated cluster members, and preserves cause/tier changes as distinct moments. Automatic pacing is disabled for retained backfill and restores the prior speed and playing state when the owning moment is continued, dismissed, removed, or reset.

### D5. Live frames are observation projections

The Worker owns the mutable `SimulationState`; `makeWorldViewFromSnapshot` builds the live web model from `RenderSnapshot` rather than from authoritative state on the main thread. The direct engine implements the same async interface for tests and environments without a Worker. Static navigation data is delivered only at bootstrap/load or after a navigation revision, and the hot frame contains no full authoritative state.

The current v2 snapshot deliberately includes bounded recent decisions, memories, relationships, routes, and attention events. Canonical hashing and the larger checkpoint/evidence/detail/outcome projections are requested only by workflows that need them. Runtime tests assert direct/Worker parity, detached results, cancellation messages, stale-result suppression, absence of `get-state` traffic for the typed projection workflows, and the 64 KiB hot-frame ceiling.

### D6. Version 1 artifacts do not claim v2 equivalence

Phase 2.5 intentionally changes deterministic outcomes, so behavior and authoritative state are version 2. Version 1 saves, replays, and experiments have explicit migration paths. Old v1 expected hashes are discarded instead of being presented as verified v2 results. Unknown versions and malformed shapes fail at the central contract boundary before an active run is replaced.

The complete matrix and migration effects are recorded below.

### D7. One typed focus state coordinates the web surfaces

`WorldRef` is a discriminated reference for creatures, resources, structures, groups, tiles, events, memories, relationships, desires, and plans. The reducer keeps hover and keyboard focus transient while selection and evidence focus remain persistent. Idempotent transitions avoid update loops, and selecting a new subject clears stale evidence context deliberately.

The dish, chronicle, inspector, moment queue, and semantic world navigator use the same focus controller. The navigator supplies stable spatial ordering, filters, textual dish and selected-subject summaries, roving keyboard focus, and a debounced polite announcement for new significant/critical events.

### D8. Deterministic replay is isolated

General verification replay and moment replay create a fresh `SimulationEngine`, reconstruct from the active branch seed and command log, report progress/hash evidence, and dispose the engine. They do not replay into, save over, or load over the live authoritative simulation.

A moment declares a 20-tick prelude, one-tick action interval, and 20-tick aftermath, clamped to the active branch horizon. The isolated replay captures observation frames at the approach, decision, action, and aftermath ticks. Once the final hash is acceptable, those four `WorldView` beats drive the existing dish and replay controls while the live simulation stays paused.

Launching a moment records the live play state, followed creature, complete typed world-focus state, mobile region, invoking DOM focus, and Pixi pan/zoom. The replay camera frames the focal subject, actors, targets, and retained event location together and locks live dish input. Exit, failure, cancellation, or disappearance of the replay presentation restores the captured viewport, focus, play, follow, region, and DOM focus; replay camera state is never authoritative or persisted.

## Version matrix

The constants in `packages/sim-core/src/versions.ts` and `packages/sim-core/src/intervention-response.ts` are the source of truth.

| Contract or boundary  | Current version | Compatibility behavior                                                                                                                                                                  |
| --------------------- | --------------: | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Simulation behavior   |               3 | Same seed/commands are comparable only within behavior v3. V3 corrects retained fact measurements; action outcomes remain v2-equivalent, but authoritative hashes intentionally change. |
| Authoritative state   |               2 | State v1 migrates deterministically to the v2 intent, route, claim, reason, and attention shape.                                                                                        |
| Command envelope      |               1 | Shape remains v1 and carries behavior v3. Scheduled commands inside legacy replays/experiments are preserved by those migrations.                                                       |
| Render snapshot       |               2 | Live, regenerated observation projection; old snapshots are not persisted or migrated.                                                                                                  |
| Replay envelope       |               1 | Behavior/state v1 replay input preserves seed and commands, upgrades to v2, and drops the old target/hash.                                                                              |
| Save envelope         |               1 | Behavior/state v1 saves migrate through the central save/state boundary; current saves validate strictly.                                                                               |
| Scenario reference    |               1 | Current references carry behavior v3. Legacy embedded experiment scenarios are upgraded with the experiment.                                                                            |
| Experiment            |               2 | Schema v1 experiments migrate immutably, adding nullable versioned response traces; behavior-v1 verification claims are cleared.                                                        |
| Outcome               |               1 | Regenerated from current state and tagged with behavior v3; no persisted legacy migration is exposed.                                                                                   |
| Causal evidence       |               2 | Regenerated projection with v2 desire/plan/fact references; no persisted legacy migration is exposed.                                                                                   |
| Intervention response |               1 | Nested, bounded factual trace persisted on an experiment command-log entry; it is observational and not a replay input.                                                                 |

Schema version and behavior version answer different questions. Replay, save, scenario, and outcome envelopes remain schema 1 while declaring behavior 3. Experiment schema 2 adds `responseTrace`; the nested trace starts at schema 1 and does not change replay schema because it records observational evidence rather than simulation input.

## Migration and rejection behavior

| Input                                                                                         | Implemented result                                                                                                                                                                                                                                                                          |
| --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| State v1                                                                                      | Clone input; add bounds, routes, and intent history; enrich decisions and events; derive active desire/plan; leave reason facts null because v1 retained scores but not their source measurements; rebuild valid claims where possible; validate as state v2.                               |
| Save schema 1 with behavior/state v1                                                          | Run the state migration, validate the candidate, and return a save schema 1 envelope tagged behavior/state v3/2. The runtime parses and hashes the candidate before replacing its active state.                                                                                             |
| Replay schema 1 with behavior/state v1                                                        | Preserve seed and ordered command log; emit behavior/state v3/2; remove legacy `finalTick` and `finalHash`, so the replay is unverified until run under v3.                                                                                                                                 |
| Experiment schema 1 with behavior/state v3/2                                                  | Do not mutate the input; preserve branches, commands, outcomes, labels, bookmarks, target/hash pairs, and checkpoints; emit schema 2 with `responseTrace: null` on every command-log entry.                                                                                                 |
| Experiment schema 1 with behavior/state v1                                                    | Do not mutate the input; upgrade experiment/scenario behavior and state tags; preserve branches, commands, labels, and bookmarks; add `responseTrace: null`; reset command outcomes to pending; clear branch target/hash pairs and checkpoints. A new v2 replay must establish new results. |
| Unknown version, extra field, invalid ID/reference, oversized JSON, or malformed nested state | Reject with a specific contract error. Load/import workflows retain the active run when candidate parsing or reconstruction fails.                                                                                                                                                          |

Migration is intentionally asymmetric. Current behavior-v3/state-v2 artifacts are validated and preserved; v1 artifacts may retain historical commands and labels, but no older hash is silently reinterpreted as v3 proof.

## Readability and intervention surfaces

The Phase 2.5 contracts feed three complementary observation paths:

- Pixi marks show stable identity, direction, destination/route, carrying, work/construction, guarding, sharing, conflict, flight, rest, selection, and intervention preview without making animation the only information carrier.
- React supplies the semantic world navigator, selected-subject summary, progressive inspector, chronicle, recoverable moment queue, and experiment replay/causal surfaces.
- Typed command outcome events reconcile intervention records by `commandId`, not summary text. A bounded schema-v1 response trace is persisted with its experiment command-log entry and records noticed, desire/plan reconsideration, rerouting, action, blocked-plan failure, or `NO_RECORDED_RESPONSE`; the last label means only that no linked evidence was retained before the window closed. Each ledger entry exposes typed routes to its affected tile, command evidence, recorded responders, retained downstream evidence or important moments, the active-branch comparison, and branch replay.

## Verification evidence in the repository

The implementation is covered at several boundaries:

- deterministic core tests for intent hierarchy, reason selection, slots, attention policy, state validation, migration, replay, malformed data, and golden hashes;
- streaming headless activity-profile tests and the versioned [Phase 2.5 metric definitions](baselines/phase-2.5-metrics-v2.md), including authoritative contention and failed-claim counters;
- direct/Worker runtime tests for projection-only frames, typed on-demand query parity, request ordering, cancellation, stale responses, final replay hashing, and the exact 64,759-byte tick-5,000 payload;
- web policy/component tests for focus, roster/navigator semantics, event clustering and pacing, moment queue behavior, progressive inspector output, intervention reconciliation/persisted response traces, captured replay beats, event-camera framing, and exact live-session restoration;
- Playwright journeys in the Chromium project through the real Worker and Pixi renderer, experiment persistence/replay/comparison/causal flow, malformed import recovery, and console-error collection;
- Chromium coverage for touch input, reduced motion, forced colors, 200% text, 400% effective-zoom reflow, and 18 reference screenshots across six story states and three viewports.

Use `npm run check` for the repository gate, `npm run test:golden` for the separately protected deterministic fixture, `npm run profile -- --ticks 10000` for the reference activity corpus, and `npm run benchmark` for machine-sensitive throughput. The root production build runs `scripts/check-web-bundle.mjs`, which enforces per-chunk, total JavaScript, and total CSS budgets after Vite emits the web assets.

The targeted Chromium touch, 200% text, and 400% reflow checks pass 3/3, the six-story × three-viewport screenshot matrix passes 18/18, and the stable final build, bundle gate, and whole-file Chromium run pass 26/26.

## Remaining release evidence

The checked-in automated tests do not substitute for observation with assistive-technology users or unfamiliar players. Before Phase 2.5 is described as having complete release evidence, the project still needs:

- a manual NVDA or VoiceOver session covering world navigator → selected summary → world object → moment → evidence, including focus return and status announcements;
- the planned formative and confirmatory usability sessions with participants unfamiliar with the implementation, with observed comprehension failures and resulting decisions recorded;
- Firefox and WebKit release runs; the checked-in automated browser project currently covers Chromium only.

Until those sessions and browser runs are attached, the accurate status is: implementation architecture complete and automated evidence checked in; manual screen-reader, usability, Firefox, and WebKit evidence remains outstanding.
