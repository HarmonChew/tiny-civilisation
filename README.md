# Tiny Civilisation

Tiny Civilisation is an observable social simulation in a Petri dish. The player changes resources and terrain; the creatures decide how to respond. There are no movement orders, build orders, or buttons that force a relationship or group outcome.

This repository implements the first vertical slice of the larger design: a small deterministic world where food pressure can lead to sharing, trust, group formation, communal storage, theft, confrontation, and a factual history the player can inspect.

## What is implemented

- A fixed-tick, seeded simulation on a hardcoded 48 × 32 tile map.
- Eight autonomous creatures with hunger, fatigue, health, inventories, traits, and skills.
- Food and material nodes, blocked terrain, a chokepoint, grid pathfinding, and fixed-point movement.
- Rule-gated Utility AI with persistent goals, deterministic tie-breaking, and factor-by-factor decision records.
- Gathering, eating, resting, sharing, keeping, stealing, depositing, withdrawing, storage construction, guarding, fighting, fleeing, and joining a group.
- Directed trust, fear, familiarity, and rivalry; bounded memories for help, theft, harm, resources, and group formation.
- Emergent groups, leadership, descriptive roles, shared storage, witness-based theft detection, and nonlethal-biased conflict.
- A PixiJS world view with React controls and inspectors for intentions, relationships, groups, decisions, and history.
- Player commands for adding or removing food and toggling obstacles. Commands enter the simulation at an authoritative tick.
- A Node.js headless runner for deterministic single-seed and multi-seed runs.

The current slice deliberately excludes water, shelters, birth and ageing, culture, migration, trade, territory, seasons, disease, predators, technology, saving, Web Workers, and LLM narration. Those belong to later milestones after the social feedback loop is reliable and understandable.

## Quick start

Requirements:

- Node.js 22.12 or newer
- npm

Install and start the browser app:

```sh
npm install
npm run dev
```

Vite prints the local URL when the development server starts.

Useful verification commands:

```sh
npm run typecheck
npm run test:run
npm run test:golden
npm run build
```

`npm test` starts the interactive Vitest watchers. Use `npm run test:run` for a single non-interactive pass.

`npm run test:golden` verifies the checked-in deterministic replay baseline without updating it. Use `npm run test:golden:update` only for an intentional simulation behavior change, then review the fixture diff and record the rationale in the commit or pull request. Ordinary `npm run test:run` verification also disables snapshot updates.

## Browser controls

| Control | Result |
| --- | --- |
| Space | Play or pause |
| `.` | Advance one authoritative tick while paused |
| `1`, `2`, `4` | Set simulation speed |
| Click a creature | Select and inspect it |
| `F` | Follow the selected creature |
| Escape | Return to the inspect tool |
| Add food tool | Add food at the chosen tile through the command queue |
| Remove food tool | Remove food at the chosen tile through the command queue |
| Obstacle tool | Toggle a tile between open and blocked |
| Restart same seed | Recreate the initial world for a controlled comparison |

The interface also provides resource, intention, and group overlays plus filters for the event timeline.

## Headless simulation

Run one seed:

```sh
npm run headless -- --seed 4182 --ticks 10000
npm run headless -- run --seed 4182 --ticks 10000
```

Run a seed range or an explicit list:

```sh
npm run headless -- batch --seeds "1..100" --ticks 10000
npm run headless -- batch --seeds "3,8,21,34" --ticks 25000
```

Run seeds 1 through a count:

```sh
npm run batch -- --count 100 --ticks 10000
```

Use `npm run headless -- --help` for the complete CLI reference. A run prints structured JSON containing the final tick and state hash, surviving population, current group count, sharing, theft, conflict, and completed-storage counters. Batch output includes every run and aggregate counts.

Elapsed time and ticks per second are measurements of the current machine and are not deterministic. The seed, requested ticks, final state, counters, and hash are the reproducible part of the result.

## Architecture

```text
Browser input ──PlayerCommand──┐
                              ▼
Headless runner ─────────► deterministic sim-core
                              │
                    ┌─────────┴──────────┐
                    ▼                    ▼
              render snapshot      domain/history events
                    │                    │
                    └─────────┬──────────┘
                              ▼
                     PixiJS + React UI
```

The simulation core owns time and authoritative state. PixiJS renders read-only snapshots, React owns the interface, and the history layer summarizes facts emitted by the simulation. The headless app imports the same core as the browser and does not require a DOM or renderer.

The repository is organized as npm workspaces:

```text
tiny-civilisation/
├─ apps/
│  ├─ web/                 React interface and PixiJS renderer
│  └─ headless/            Node.js single-run and batch CLI
├─ packages/
│  └─ sim-core/            Deterministic state, systems, AI, events, and tests
├─ package.json            Workspace commands
└─ tsconfig.base.json      Shared strict TypeScript settings
```

## Determinism model

The authoritative simulation advances at a fixed 10 ticks per simulated second. It uses integer or fixed-point values, stable entity IDs, deterministic iteration, a saved sequential RNG for generation, and keyed random values for action outcomes. Player edits are scheduled commands rather than immediate renderer mutations.

`hashSimulationState` produces a canonical state hash. Given the same implementation, seed, tick count, and command log, a run should reach the same hash. Tests cover repeated runs, command ordering, seeded randomness, pathfinding, bounded social data, and social scenario invariants.

Rendering frame rate, camera state, open panels, elapsed wall-clock time, and CLI throughput are outside the authoritative state.

## Development boundary

The slice is successful when its story emerges from creature decisions rather than a scripted sequence:

```text
food pressure
  → sharing and trust
  → group formation
  → shared storage
  → theft and witnessing
  → confrontation
  → relationship and historical consequences
```

New systems should wait until this loop remains deterministic, bounded, inspectable, and interesting across many seeds. The next production milestones can then add water and shelter, lifecycle, culture, migration, saving, and worker execution without moving authority into the renderer or bypassing creature choice.
