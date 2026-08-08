# Phase 4.3 lifecycle and unified-alpha contract

Status: **candidate definition; release evidence not yet recorded**  
Contract date: **8 August 2026**

Phase 4.3 completes the simulation's lifecycle slice and then closes the
project's outstanding alpha evidence in one ordered release protocol. A
working implementation, passing automated tests, or a generated package is
only release-candidate evidence. None substitutes for the protected holdout,
manual NVDA observation, or participant records.

The executable semantic surface is
`apps/headless/src/phase-4.3-definition-contract.ts`. Its official candidate
record is emitted with:

```sh
npm run --silent headless -- phase-4.3-definition-contract
```

The shorter `phase-4.3-definition-fingerprint` command is diagnostic. The
fingerprint remains a candidate until discovery calibration is reviewed and a
reviewed change freezes the complete definition.

## Sequencing decision — 8 August 2026

Lifecycle engineering began before the still-open inherited and Phase 4.2
manual-NVDA and unfamiliar-participant gates were completed. This is the
project's second explicit sequencing deviation: Phase 4.2 already recorded the
earlier decision to continue engineering while inherited human gates remained
open. The unified-alpha protocol prospectively replaces those unexecuted manual
workflows with one lifecycle-integrated formative, NVDA, and confirmatory
sequence. This administrative supersession is not a pass, waiver, substituted
observation, or retroactive release decision for any earlier phase.

## Version boundary

Phase 4.3 advances the current contracts without altering the immutable Phase
4.2 evidence:

| Contract                                        | Phase 4.3 version |
| ----------------------------------------------- | ----------------: |
| Simulation behavior and state                   |                 6 |
| Activity profile                                |                 6 |
| Command                                         |                 3 |
| Snapshot                                        |                 6 |
| Replay and save                                 |                 5 |
| Scenario envelope / definition / map generation |         2 / 3 / 1 |
| Experiment                                      |                 6 |
| Outcome                                         |                 5 |
| Causal evidence                                 |                 6 |
| Intervention response                           |                 4 |
| Scenario analysis / outcome classifier          |             5 / 4 |

The Phase 4.2 recorded definition fingerprint remains historical evidence. It
is not recomputed from Phase 4.3 source and is not evidence that the new
behavior passed its release gates.

## Lifecycle mechanics

The following values are part of the candidate semantic definition and must be
reviewed together. A change to any value, lifecycle implementation captured by
the definition contract, activity meaning, classifier rule, or frozen band
changes the definition fingerprint.

| Area             | Candidate rule                                                                                                                             |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Life stages      | Juvenile through age 4,999 ticks; adult from 5,000; elder from 15,000.                                                                     |
| Fertility        | Eligible ages 7,500 through 14,999; two known opposite-sex parents; gestation 1,000 ticks; reproduction cooldown 6,000 ticks.              |
| Mortality        | Natural-lifespan minimum 18,000 ticks with a 4,000-tick variation span; critical-health threshold 1,200 with a 300-tick critical duration. |
| Population       | At most 24 living creatures and 256 retained identities.                                                                                   |
| Care             | Dependent youth can receive ordinary, observable care actions through the desire/plan/action system.                                       |
| Death and memory | Death records cause, age, final stage and group, major events, parentage, and heir; memorial lifetime is 600 ticks.                        |
| Estate           | Food, material, and water may transfer. Traits and skills remain historical facts and are never inherited as goods.                        |
| Group extinction | A group becomes extinct through the lifecycle system when it has no living members.                                                        |

Lifecycle behavior must remain deterministic under direct, Worker, save/load,
replay, experiment-branch, chunked, and one-shot execution. Identity, lineage,
death, memorial, and estate state must be deep-validated at every persistence
boundary.

## Observable explanation contract

Lifecycle behavior uses the same inspectable cognition and evidence paths as
the rest of the world. `RAISE_FAMILY`, `HONOUR_THE_DEAD`, and `SETTLE_ESTATE`
are lifecycle desire families. `FORM_FAMILY`, `CARE_FOR_YOUNG`, `MOURN`, and
`CLAIM_ESTATE` are ordinary actions. Their interactions use the `FAMILY`,
`CARE`, `MOURNING`, and `ESTATE` purposes.

The retained lifecycle event family covers family formation, pregnancy,
birth, life-stage change, care, death, memorial creation, mourning, estate
claim/closure, and group extinction. The interface must expose retained facts
without inferring an unrecorded motive or causal winner. In particular, it
must distinguish:

- goods transferred from traits and skills retained only in a life record;
- a living dependent from a historical descendant;
- a memorial from a living creature or active storage;
- observed population change from a claim that an intervention caused it; and
- a 24-creature living cap from a claim that the world will remain at the cap.

## Measurement and classifier boundary

Activity-profile schema 6 adds streaming lifecycle measurements for population,
reproduction, generation depth, dependent youth, life stages, care, mortality,
life records, memorials, mourning, estates, and group extinction. Reports must
retain per-run profiles and descriptive distributions; an aggregate status
without the underlying profiles is insufficient evidence.

Hard lifecycle invariants require:

- no living-population cap breach;
- every observed birth to have two known parents with the expected parental
  sexes;
- no duplicate creature/life-record identity;
- living and dead state to agree with death state and life records;
- no lineage cycle;
- every observed lifecycle metric delta to match its retained event count; and
- no missing life record for an observed death.

Classifier 4 adds factual, non-exclusive labels for a visible new generation,
dependent-youth care, mourning and memory, estate transfer, population growth,
population decline, and extinction. A run may receive more than one compatible
label. Classifier labels describe recorded state; they do not establish an
intervention effect or a preferred scenario.

## Corpus lock

Both Phase 4.3 corpora use the four catalog scenarios in catalog order and
10,000 ticks per run.

| Corpus                            | Seeds        |               Runs | Checked-in state    |
| --------------------------------- | ------------ | -----------------: | ------------------- |
| Discovery and frozen verification | `1..64`      | 256 per generation | Not run             |
| Protected holdout                 | `3001..3064` |                256 | Sealed and disabled |

Discovery writes only to
`docs/baselines/phase-4.3-lifecycle-calibration-v1.json.gz`. After a human
review freezes the definition, same-seed verification writes only to
`phase-4.3-lifecycle-calibration-v2.json.gz`. Each artifact has a checksum and
readable companion and is installed without overwriting any existing target.

The reserved holdout seeds are rejected by generic run, batch, profile,
matrix, and raw-simulation routes at every horizon. The holdout can become
ready only through an explicit reviewed policy edit that records valid hashes
for discovery, freeze review, verification, verification review, the automated
release check, deployment smoke, and final NVDA, plus the exact release-candidate
commit and frozen definition fingerprint. Merely placing files on disk does
not enable it.

Before the first protected tick, the authorized path creates an exclusive,
durable consumed-attempt marker. Success, failure, interruption, or a partial
artifact set consumes the attempt. The canonical holdout output, checksum, and
summary are never overwritten.

If that attempt fails, seeds `3001..3064` are not rerun or retuned. A replacement
may use seeds `4001..4064` only under a new semantic definition version,
fingerprint, reviewed authorization, output names, and audit trail.

## Unified alpha release gates

The human protocol is defined in
[`unified-alpha-human-protocol-v1.md`](unified-alpha-human-protocol-v1.md).
Its order is normative:

1. five unfamiliar formative participants, followed by fixes;
2. frozen release candidate, full automated release check, and deployment smoke;
3. a final manual NVDA pass on that candidate;
4. the one-shot protected holdout after an explicit reviewed unlock; and
5. five entirely different confirmatory participants on the same build after
   the holdout.

At least four of five confirmatory participants must pass every rubric row.
Automated accessibility tests, screenshots, implementation inspection,
calibration, or holdout data cannot replace any human or NVDA record.

## Scope exclusions

Phase 4.3 does not add marriage, adoption, gender roles, genetic systems beyond
bounded parental-potential blending, direct birth/death/pairing/revival
controls, population above 24, culture, trade, diplomacy, seasons, disease,
predators, technology, public deployment, cross-device sync, or Phase 5
scaling/history compression.

## Release decision

Phase 4.3 is release-complete only when the release ledger cites immutable
evidence for all of the following:

- formatting, lint, type-check, source-only coverage, golden replay, build,
  bundle and persistence budgets, and all four scenario benchmarks;
- routine Chromium journeys and every tagged release journey in Chromium,
  Firefox, and WebKit;
- deterministic packaging from a clean commit and a deployment smoke on the
  packaged candidate;
- reviewed discovery and frozen verification under one definition fingerprint;
- a valid one-shot holdout under that same definition and release candidate;
- the final manual NVDA record; and
- the formative and confirmatory participant records meeting the protocol.

Until all rows are attached, reports must say `releaseClaim: false` or use
equally explicit candidate-only language.

Only after every row above has immutable matching-provenance evidence may the
release ledger use this exact final wording:

> The lifecycle-integrated expanded alpha passed the current unified protocol.

That sentence is the approved future decision language, not the current status.
