# Phase 4.2 shelter and settlement contract

Status: **mechanics, measurement definitions, classifier rules, and bands frozen; untouched holdout recorded; human release gates pending**  
Mechanics frozen: **5 August 2026**; classifier and bands frozen: **6 August 2026**

Phase 4.2 adds one communal home loop to persistent groups: choose a site,
build a shelter, rest there, maintain it, and—at most once—relocate after a
stable better-site signal. The system remains autonomous. The player may alter
environmental material supply, but cannot order construction, maintenance,
rest, or relocation.

This contract preserves the four scenario definitions, eight-creature
population, 48 × 32 maps, scenario-definition version 2, and map-generation
version 1. It does not claim that automated release gates or human
comprehension gates have passed.

## Scope boundary

In scope are communal shelter sites, completed and abandoned shelters,
condition-dependent capacity and recovery, member and trusted-guest use,
material-funded maintenance, deterministic site ranking, one relocation per
group, material interventions, causal events, browser projections, and
headless settlement evidence.

Communal water storage, shelter collapse or deletion, multiple active
outposts, lifecycle, population growth, territory, culture, trade, diplomacy,
external pressure, technology, and larger maps or populations remain out of
scope. Existing `GroupState.stage` meanings do not change.

## Authoritative mechanics

### Eligibility and state

- Only a `PERSISTENT` group may establish a shelter site. Persistence still
  comes from completing the group's shared store.
- A group has at most one `activeShelterId` and one `pendingShelterId`.
- Shelter structures form a discriminated union with storage structures. Their
  kinds are `SHELTER_SITE`, `SHELTER`, and `ABANDONED_SHELTER`.
- A shelter site retains its selected-site assessment, material and work
  progress, group, tile, and optional predecessor shelter. Completion changes
  the site to `SHELTER` atomically.
- Condition is bounded to `0..10,000`. A shelter never closes, collapses,
  disappears, or loses all benefit because of condition. Abandoned shelters
  remain inspectable.
- Occupancy is derived from live `STRUCTURE` interaction claims for
  `REST_SHELTERED`; it is not stored as a second authoritative occupant list.
  A live claim is a reserved place in any action phase; physical use requires
  the creature to be in the action's `WORKING` phase. Projections and headless
  evidence report both measures, with independent member and eligible-guest
  splits for reservations and physical rests.

### Construction and site choice

The new actions are `ESTABLISH_SHELTER_SITE`, `BUILD_SHELTER`,
`REST_SHELTERED`, and `MAINTAIN_SHELTER`. They use the existing
`COMPLETE_SHARED_WORK` and `RECOVER_ENERGY` desires through the explicit plans
`ESTABLISH_SHELTER`, `BUILD_COMMUNAL_SHELTER`, `REST_IN_SHELTER`, and
`MAINTAIN_COMMUNAL_SHELTER`. Outdoor `REST` remains available.

The group leader ranks a bounded set of legal tiles around the living-member
centroid, current home, shared store, and nearest stocked food, material, and
water anchors. Candidate enumeration is stable, capped at 32 tiles, and tied
by tile index. Generic ranking does not inspect scenario ID.

The locked score is lower-is-better:

| Term                               |          Weight or cost |
| ---------------------------------- | ----------------------: |
| Mean living-member travel cost     |                      ×3 |
| Shared-store travel cost           |                      ×2 |
| Nearest stocked food access        |                      ×1 |
| Nearest stocked material access    |                      ×2 |
| Nearest stocked water access       |                      ×2 |
| Nearby non-member crowding         | 350 per nearby creature |
| Relocation construction investment |    active condition ÷ 5 |
| Relocation change cost             |                   1,600 |

A site requires 18 material and 10,000 work. Each completed work action adds
`1,100 + floor(loyalty / 15)` progress, and completion also requires all
material. Work adds 35 group cohesion; completion adds 500.

### Rest, occupancy, and guests

- A new shelter has six base rest places. Condition reduces effective capacity
  deterministically, with a minimum of two usable places.
- Member claims outrank guest claims. A non-member is eligible only if at least
  one living group member has directed trust of 2,500 or more toward that
  creature.
- Ineligible or displaced creatures reconsider normally and may use outdoor
  rest. The shelter action recovers fatigue according to current condition and
  restores 180 health; outdoor rest restores 4,200 fatigue and 120 health.
- Completing a sheltered rest adds 90 condition wear. Every 50 ticks an active
  shelter also loses `18 + 12 × reserved places` condition.

The final sheltered-recovery floor must remain strictly greater than outdoor
recovery. Any tuning that changes this ordering changes the behavior contract.

### Maintenance and relocation

`WORN` begins below 6,500 condition and `LOW` below 3,500. A member may spend
up to two carried material in one maintenance action; each unit restores 2,200
condition, records material spent, and adds 90 cohesion.

A group evaluates relocation only after a 1,500-tick minimum commitment,
without another pending site, and before it has relocated. The same candidate
must remain at least 1,200 score points better for three consecutive
evaluations. The existing shelter stays active while the replacement is built.
When the replacement completes, home and active shelter change together, the
old structure becomes `ABANDONED_SHELTER`, and the group's relocation count
becomes one. No second relocation is legal.

## Observer interventions

Command schema 3 adds `ADD_MATERIAL` and `REMOVE_MATERIAL` with the same
scheduled command ordering as food and water interventions. They alter material
resource-node stock at the selected tile; they never select a builder, shelter,
or destination. Their applied facts must survive save, replay, experiment,
comparison, causal evidence, and bounded intervention-response traces.

## Event-attention policy

All shelter events use the shared importance thresholds and clustering policy:
routine below 18, notable from 18, significant from 50, and critical from 80.
Routine events cluster for 30 ticks, notable events for 60, and significant or
critical events for 120.

| Event family                                    | Frozen presentation intent                                        |
| ----------------------------------------------- | ----------------------------------------------------------------- |
| Site selected                                   | Significant, factual score/access evidence, recoverable moment    |
| Construction started                            | Notable; it does not queue a moment                               |
| Construction contributions                      | Routine and coalescible; 25%, 50%, and 75% milestones are notable |
| Shelter completed                               | Critical completion moment and historical event                   |
| Sheltered rest                                  | Routine and coalescible                                           |
| Ordinary maintenance                            | Routine and coalescible                                           |
| Low condition or maintenance from low condition | Significant transition evidence                                   |
| Condition recovered or trusted guest use        | Notable                                                           |
| Capacity crowding or member displacement        | Notable, coalescible by shelter and participants                  |
| Abandonment                                     | Significant and linked to replacement completion                  |
| Relocation                                      | Critical moment and historical event                              |

The first occurrence, an attention-tier escalation, and terminal completion or
relocation remain separately recoverable even when routine events coalesce.

## Compatibility versions and migration

| Contract                                        | Phase 4.2 version |
| ----------------------------------------------- | ----------------: |
| behavior / authoritative state                  |             5 / 5 |
| command / snapshot                              |             3 / 5 |
| replay / save                                   |             4 / 4 |
| scenario envelope / definition / map generation |         2 / 2 / 1 |
| experiment / outcome / causal evidence          |         5 / 4 / 5 |
| intervention response / activity profile        |             3 / 5 |
| browser workspace / Worker protocol             |             4 / 4 |
| scenario analysis / outcome classifier          |             4 / 3 |

Migration is clone-first, validated, and atomic.

- A behavior-4/state-4 save must not already contain shelter structures. The
  migration adds zeroed shelter action counters, empty group shelter fields,
  zeroed shelter metrics, and one truthful `SHELTER_RULES_ENABLED` event at the
  load tick. Existing storage, outdoor rest, scenario identity, and genuine
  history remain intact; no pre-upgrade shelter history is synthesized.
- Legacy replays keep scenario identity, ordered commands, and declared
  horizons, but clear hashes and checkpoints that cannot verify behavior 5.
- Legacy experiments keep branch topology, commands, labels, bookmarks, and
  target horizons. Outcomes, response traces, target hashes, and checkpoints
  that cannot prove Phase 4.2 facts are cleared. Reruns remain visibly
  unverified until reconstruction finishes.
- Historical Phase 3 and Phase 4.1 corpora remain immutable evidence for their
  versions. Activity profiles are regenerated under schema 5 rather than
  silently reinterpreted.

## Headless measurement contract

Activity-profile schema 5 delegates shelter evidence to the focused
`settlement-activity` collector. Post-tick sampling records:

- fatigue unit-ticks, mean fatigue, exposure at or above 8,000, spell counts,
  observed recovery latency, and recovered fatigue units;
- sheltered and outdoor rest events and physical action-ticks, including
  member and eligible-guest use;
- selected sites, starts, completions, completion latency, work events, and
  distinct contributors;
- active-shelter condition unit-ticks, low-condition exposure, transitions,
  maintenance events, and material spent;
- effective-capacity ticks; total, member, and guest reservation ticks; total,
  member, and guest physical-rest ticks; plus denied claims and crowding
  events;
- every retained site-score component; and
- abandonment, relocation, and the same-tick score improvement recorded by
  the relocation event.

Classifier version 3 adds factual, non-exclusive labels. Discovery v1 treated
the Phase 4.2 data-only definition as a candidate. The calibration review
superseded that candidate for v2, froze the rules and Wilson-derived incidence
floors with their dominance rationales and settlement macro band, and recorded
their provenance. Same-seed verification v2 and the untouched holdout both pass
the frozen definition:

| Label                     | Rule                                                                                            |
| ------------------------- | ----------------------------------------------------------------------------------------------- |
| `ESTABLISHED_SETTLEMENT`  | at least one active shelter at the horizon                                                      |
| `CHRONIC_SHELTER_NEGLECT` | at least 1,000 active-shelter ticks and low condition for at least 50% of them                  |
| `SHELTER_CROWDING`        | at least one emitted capacity-crowding event; trust-ineligible denials remain a separate metric |
| `GUEST_SHELTERING`        | at least one trusted-guest shelter use                                                          |
| `SETTLEMENT_RELOCATION`   | at least one completed relocation                                                               |

Cross-scenario paired descriptions add a `SETTLEMENT` macro dimension for
active shelters, sheltered-rest share, mean condition, guest use, and
relocation. These remain descriptive and non-causal. The frozen Phase 4.2
macro gate retains the historical Phase 3 bands and still requires at least
three passing original dimensions, then additionally requires at least one
passing frozen `SETTLEMENT` band. Phase 4.2 additions do not replace or
reinterpret the Phase 4.1 table.

`MEAN_SHELTER_CONDITION` is nullable when a seed has no active-shelter ticks.
Condition distributions omit those ineligible seeds, and a cross-scenario
paired comparison omits a seed pair if either side is ineligible; absence is
not silently scored as zero. A frozen mean-condition band records that missing
value policy and a minimum eligible-pair count selected during calibration;
post-freeze verification and holdout must meet the same minimum. Metrics that
cannot be missing continue to require every locked seed pair exactly once.

## Calibration, holdout, and release boundary

Phase 4.2 calibration uses seeds `1..64`, all four scenarios, and 10,000 ticks
per run through the distinct `phase-4.2-calibration` selector. Its first run is
a candidate-discovery artifact at the canonical path
`docs/baselines/phase-4.2-calibration-v1.json.gz`. It must say that classifier
3 and its Phase 4.2 bands are candidates, not describe them as frozen or
present a Phase 4.2 pass. The discovery artifact, checksum, and readable
companion use a staged no-clobber write and must not replace an existing file.
The artifact records a candidate definition fingerprint: canonical SHA-256 over
the complete classifier-v3 implementation, its eligibility rules and label
order, every paired-metric reader and missing-value rule, inherited and Phase
4.2 band semantics, gate constants, versions, scenarios, and corpus contract.
The sole official evidence surface for reading that runtime contract and its
fingerprint is
`npm run --silent headless -- phase-4.2-definition-contract`. It uses the same
file-loader entrypoint as corpus generation and prints one JSON line containing
`schemaVersion`, `fingerprintAlgorithm`, `fingerprint`, and the complete
`contract`. The hash-only
`npm run --silent headless -- definition-fingerprint` alias prints one lowercase
SHA-256 line for diagnostics, but is insufficient calibration evidence by
itself. Eval, bundle, test-runner, and build-output surfaces—including `tsx -e`—
are forbidden for evidence because the version-1 contract includes runtime
function source, whose textual transpilation can differ without a semantic
change.
Each companion is installed atomically from a staged file and normal failures
roll back the set. Because a host or process failure can interrupt a multi-file
install, any partial set is invalid evidence that requires manual audit and may
not be overwritten or presented as a fresh run.

The review may retain or revise the six data-only Phase 4.2 classifier
thresholds, then freezes those thresholds, scenario-incidence bands, dominance rationales, and
`SETTLEMENT` macro bands with the discovery artifact SHA-256 and review
provenance. The freeze review records the candidate and final frozen
fingerprints and whether the candidate was accepted unchanged or superseded.
The fingerprinted evaluator implementation and all non-Phase-4.2 analysis
semantics must remain identical: supersession changes validated data, never
evaluates code from an artifact.
Artifact/review hashes are intentionally outside the semantic fingerprint, so
the review can cite the fingerprint without a hash cycle. After that freeze,
the same four-scenario calibration corpus is run
again as post-freeze verification to the new canonical path
`docs/baselines/phase-4.2-calibration-v2.json.gz`. The holdout cannot be
authorized until this v2 result passes the frozen definitions and a reviewed
change records its artifact path, SHA-256 checksum, readable companion, and the
separate
`docs/baselines/phase-4.2-calibration-verification-review-v1.md` review. Frozen
definitions retain the v1 discovery SHA and freeze-review SHA; holdout
authorization separately retains the v2 verification SHA and verification-review
SHA. The v2 runner validates the complete v1 evidence and freeze review before
its first tick, then records the same frozen fingerprint in v2. Only then may
calibration become `REVIEWED` while the band status remains
`FROZEN`.

The Phase 4.2 holdout is a separate locked corpus: seeds `2001..2064`, all four
scenarios, and exactly 10,000 ticks per run. Its
`--corpus phase-4.2-holdout` selector accepts no seed or tick override and no
noncanonical output path; it writes only to the canonical
`docs/baselines/phase-4.2-holdout-v1.json.gz` path. Generic run, batch, profile,
and other matrix selectors cannot execute any reserved seed at any horizon.
Direct imports of lower-level simulation helpers are outside this CLI
release-process guard; exported headless simulation/profile helpers enforce it,
while direct simulation-core imports must not be used to produce or inspect
reserved-seed evidence. The runner rejects the holdout unless the reviewed calibration and
freeze provenance is complete and its checked-in status explicitly authorizes
the one-shot run. It also refuses to overwrite or rerun a recorded artifact;
the compressed artifact and companions use the staged no-clobber installation
described above, after which
the status is recorded and execution is disabled again.

### Recorded Phase 4.2 evidence

The protected sequence completed once on 6 August 2026 without changing the
frozen semantic definition:

- discovery v1 SHA-256:
  `296239c70c1e13de577e5a5b19b5871584acb37d22ce21349782de4b3a6c1e78`;
- freeze-review SHA-256:
  `3fff144ca7c375dd673d1c6a1b4e97c87bb475c81b2dd3d2c4d9a8120a77677e`;
- frozen verification v2 SHA-256:
  `1b7fd1e4cedcde43a4601d42109dfa7dc2c7a17e1cbce27031a31e9ee41ac52a`;
- verification-review SHA-256:
  `c4e33906bff857a93a413dd579dd6c0f69339a3bd98ee14918350456e9b7d1e4`;
- untouched holdout SHA-256:
  `cbd4ab5b8012eb394f7b519d3d9d90a88d6e4524bb0794fe725970f9e0dea666`.

The frozen definition fingerprint is
`3f46b03b570de25c321c595f2bdc4b5df6081e52cd564680b0f1d0613c9606c6`.
The durable consumed-attempt marker remains beside the holdout, and the process
policy is `REVIEWED / FROZEN / RECORDED` with execution disabled. All evidence
artifacts retain `releaseClaim: false`; their automated pass does not close the
human release gates.

Authorization records separate immutable provenance for the discovery v1
artifact/checksum and freeze review, plus the post-freeze v2
artifact/checksum and a distinct verification review. The runner decompresses
and parses v2 before unlock, requiring the exact 256-run matrix, behavior 5,
activity profile 5, scenario analysis 4, classifier 3, and passing hard,
outcome, dominance, preserved legacy-macro, and `SETTLEMENT` macro gates. It
also validates the complete retained profile/outcome/aggregate/comparison
structure. Before v2 runs, the private production authenticator regenerates
all 256 discovery runs and exact-compares scenario identity, map and final
hashes, requested ticks, full activity profiles, and the complete re-derived
matrix report under the embedded candidate rule/table payload. Before the
holdout marker, it repeats that authentication for v1 and v2. Only process
provenance fields are excluded from the derived equality because their reviewed
status legitimately changes between generations. A skeletal artifact with
hand-authored PASS strings, a padded zero-tick report, or a self-consistent but
non-regenerated profile is invalid.
The checked-in runtime, policy, freeze review, v2 artifact, and verification
review must all carry the same frozen definition fingerprint.
Both reviews carry machine-readable `key: value` lines. The freeze review names
its v1 path/SHA, classifier 3, `bandFreezeStatus: FROZEN`, and
`decisionStatus: REVIEWED`; the verification review names its v2 path/SHA and
explicit PASS markers for hard invariants, outcome bands, dominance, preserved
legacy macro bands, and settlement macro bands. Matching the review file hash
or mentioning an artifact SHA in arbitrary prose is insufficient.

The authorized CLI path exclusively creates the durable
`phase-4.2-holdout-v1.attempt.json` marker before the first tick and binds the
simulation to the canonical evidence writer. The marker survives success,
failure, and process interruption. Any failed or partial attempt is consumed
and requires explicit audit; it cannot be retried silently. Imported
`runMatrix` cannot execute the protected corpus without that private binding.
On POSIX the runner fsyncs both marker file and parent directory. On Windows it
fsyncs the marker file and records that Node directory fsync is unavailable;
the evidence must not claim a stronger power-loss guarantee than the platform
primitive provides.

Historical Phase 3 and Phase 4.1 calibration and holdout artifacts remain
immutable evidence for their versions. In particular, the legacy `calibration`
and `holdout` selectors and Phase 4.1 seeds `1001..1064` are not repurposed or
overwritten by Phase 4.2.

No Phase 4.2 release claim is valid until the untouched holdout, full automated
suite, bundle and persistence budgets, at least 25,905 isolated ticks/second,
three-browser release matrix, manual NVDA workflow, and fresh formative and
confirmatory five-person rounds are recorded. At least four confirmatory
participants must explain site choice, occupancy, condition, rest destination,
and one intervention response from visible factual evidence.
