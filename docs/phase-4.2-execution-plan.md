# Phase 4.2 execution plan

Status: **engineering and automated release-candidate evidence complete; inherited and Phase 4.2 human gates pending**  
Updated: **6 August 2026**

The normative mechanics, versions, measurement definitions, and corpus policy
are frozen in [`phase-4.2-contract.md`](phase-4.2-contract.md). This plan tracks
delivery without converting implementation progress into a release claim.

## Entry gate

Phase 4.2 release work depends on closing the inherited human gates. The
historical Phase 3 and Phase 4.1 automated artifacts remain valid, but the
unified NVDA workflow and the formative and confirmatory unfamiliar-participant
rounds are still required. Any blocker or high-severity finding must be fixed
and affected automated evidence rerun.

Implementation work began before those human entry gates were completed. This
is a recorded sequencing deviation from the requested delivery order. It does
not waive, merge, or convert the inherited entry evidence into the separate new
Phase 4.2 human release evidence required after feature freeze.

## Work packages

### W0 — Restore and verify the baseline (automated portion passed; human exit pending)

- Keep persistent-state tests hermetic and canvas behavior explicitly stubbed.
- Enforce headless coverage thresholds instead of treating coverage as an
  informational report.
- Run formatting, lint, type-checking, coverage, golden verification, build,
  Chromium journeys, visuals, and the release browser matrix.
- Reconcile the Phase 2.5, Phase 3, and Phase 4.1 human-evidence ledgers.

Required exit: the inherited code gates pass and the unified inherited NVDA,
five-person formative, and five-new-person confirmatory rounds are complete;
no stale test counts are presented as current evidence. This exit has not been
met, even though later engineering work is present.

### W1 — Versioned state and compatibility (complete)

- Land the storage/shelter discriminated union and group shelter references.
- Deep-validate condition, assessments, predecessor links, group ownership,
  one-active/one-pending constraints, and one-relocation limits.
- Finish behavior-4 save, replay, experiment, response-trace, browser-workspace,
  and Worker migrations with atomic rejection of malformed inputs.
- Review and regenerate behavior-5 golden fixtures while retaining historical
  fixtures unchanged.

Exit: direct, Worker, save/load, replay, experiment, chunked, and one-shot paths
agree under version 5, and legacy artifacts rerun visibly unverified.

Automated exit recorded: passed.

### W2 — Autonomous settlement behavior (complete)

- Implement deterministic, scenario-agnostic site ranking and legal footprint
  checks.
- Implement physical establish, build, sheltered-rest, and maintenance actions
  through ordinary desire, plan, decision, claim, and resolver paths.
- Enforce member priority, directed-trust guest eligibility, capacity repair,
  outdoor fallback, bounded wear, upkeep, and atomic one-time relocation.
- Record cohesion consequences and the complete shelter event family.

Exit: focused tests cover scoring and tie-breaking, legal and reachable sites,
material accounting, construction, condition bounds, recovery ordering,
occupancy priority, denied claims, maintenance, relocation stability, and the
absence of scenario-ID branches in generic AI.

Automated exit recorded: passed.

### W3 — Observer experiment loop (complete)

- Carry `ADD_MATERIAL` and `REMOVE_MATERIAL` through command scheduling,
  persistence, replay, experiment branching, comparison, causal evidence, and
  intervention-response traces.
- Preserve equal-horizon comparison and deterministic command ordering.
- Coalesce routine rest and upkeep while retaining first, escalated, completed,
  abandoned, and relocated evidence.

Exit: a material intervention changes environmental stock only, its response
chain is bounded and factual, and reconstruction reproduces the same result.

Automated exit recorded: passed.

### W4 — Dish-first interface (automated exit complete)

- Support creature, group, storage, shelter-site, active-shelter, degraded-
  shelter, and abandoned-shelter Subject variants without adding a Settlement
  tab.
- Expose site rationale, progress, condition, effective capacity, reservations,
  physical rests, guest eligibility, upkeep need, rest destination, and linked
  events.
- Give every shelter state a redundant shape/pattern/text treatment and preserve
  focus, navigator, chronicle, moment replay, and camera restoration.
- Verify wide, narrow, touch, keyboard, forced-color, reduced-motion, 200% text,
  and 400% reflow states while keeping the dish dominant.

Exit: the browser explains why a tired creature chose sheltered or outdoor
rest and why a group chose or changed its site using only retained facts.

Automated browser exit recorded: passed. Manual NVDA comprehension remains a
separate human gate.

### W5 — Headless calibration and release evidence (automated portion complete)

- Use activity-profile schema 5 and scenario-analysis schema 4/classifier 3.
- Run the distinct `phase-4.2-calibration` discovery corpus at seeds `1..64`
  across all four scenarios for 10,000 ticks. Review its shelter and settlement
  distributions as candidate evidence, then freeze settlement scenario bands,
  dominance rationales, and paired macro bands.
- After the freeze, rerun the same calibration corpus to a new v2 artifact and
  verify classifier 3 and every frozen band before authorizing the holdout.
- Authenticate each retained nonprotected calibration generation by
  regenerating all 256 runs and recomputing the complete derived matrix before
  any later generation or the holdout may begin. Classifier supersession is
  restricted to the six embedded data-only Phase 4.2 thresholds; evaluator
  code stays fixed.
- Replace the checked-in `NOT_RUN` / `NOT_FROZEN` / `SEALED` process lock only
  in reviewed changes that record the canonical artifact, checksum, and freeze
  review provenance; until then the configured `phase-4.2-holdout` selector
  must reject execution.
- Open the exact four-scenario, `2001..2064`, 10,000-tick Phase 4.2 holdout
  exactly once on the post-freeze verified candidate.
- Keep the historical Phase 3 and Phase 4.1 calibration and holdout artifacts
  and their legacy selectors immutable.
- Record compressed artifacts, checksums, benchmark, payloads, bundle sizes,
  browser evidence, and human evidence separately.

Exit: the release ledger can cite immutable artifacts for every passing gate;
failed or unrun gates remain visibly pending.

Automated exit recorded: discovery, freeze review, same-seed frozen
verification, the one-shot untouched holdout, performance, bundle, Chromium,
and three-browser evidence pass. Human evidence remains visibly pending.

### Calibration-to-holdout transition (completed once and resealed)

The holdout unlock was a reviewed repository change, not a command-line
convention. The completed protected workflow followed this sequence after
mechanics and tests were stable:

1. Run `matrix --corpus phase-4.2-calibration` to the canonical discovery path
   `docs/baselines/phase-4.2-calibration-v1.json.gz`. The report must identify
   classifier 3 and its Phase 4.2 bands as candidate/not frozen, and expose
   readable shelter and settlement distributions. Retain its generated
   checksum and readable companion. The writer must install all three files
   from staging without replacement and roll back caught failures. A crash-time
   partial set is invalid evidence requiring manual audit. Refuse an existing
   target; do not select the holdout or reuse
   a Phase 3/4.1 artifact in this step.
   The report must also record its candidate definition fingerprint over the
   complete classifier-v3 and paired-analysis implementation and all semantic
   band/gate inputs. Read and record the contract and fingerprint only with
   `npm run --silent headless -- phase-4.2-definition-contract`, the same
   file-loader entrypoint used for corpus generation. Its one-line JSON payload
   is the official evidence surface and includes the schema, algorithm,
   fingerprint, and complete contract. The hash-only `definition-fingerprint`
   alias is diagnostic and insufficient evidence by itself; `tsx -e` and other
   eval, bundle, test-runner, or build-output surfaces are forbidden for
   evidence.
2. Review distributions and candidate label incidence. Record the decision in
   `docs/baselines/phase-4.2-calibration-review-v1.md` and freeze the final
   classifier rules, scenario-incidence bands, dominance rationales,
   `SETTLEMENT` materiality bands, required seeds/horizon, artifact path, and
   discovery SHA-256 provenance in `apps/headless/src/scenario-bands.ts`. Keep
   the historical macro bands and their three-original-dimension requirement;
   add a separate requirement for at least one passing `SETTLEMENT` band. If a
   mean-condition band is selected, freeze its missing-value exclusion policy
   and minimum eligible-pair count rather than treating absent shelters as
   zero. Record both candidate and frozen fingerprints plus the explicit
   `ACCEPTED_UNCHANGED` or `SUPERSEDED_FOR_V2` disposition. Add
   focused tests in `scenario-analysis.test.ts`. This freeze review does not by
   itself authorize the holdout.
3. With the frozen definitions checked in, run the same
   `phase-4.2-calibration` corpus as post-freeze verification to the new
   canonical `docs/baselines/phase-4.2-calibration-v2.json.gz` path. Require
   classifier 3 and the frozen outcome, rationale, and `SETTLEMENT` macro gates
   to evaluate and pass. Review the v2 readable companion and checksum; do not
   overwrite v1 or any historical Phase 3/4.1 artifact. Record the verification
   decision separately in
   `docs/baselines/phase-4.2-calibration-verification-review-v1.md` so the v1
   freeze review remains immutable.
   Before executing any v2 tick, the runner must validate the full v1 artifact,
   checksum, freeze review, and runtime fingerprint. The v2 artifact and its
   review must repeat the exact frozen fingerprint.
4. In a reviewed holdout-unlock change, update
   `apps/headless/src/phase-4.2-corpora.ts` to the `REVIEWED` calibration and
   `FROZEN` band statuses. Record separate canonical v1 discovery/checksum and
   freeze-review provenance, plus the canonical v2 artifact/checksum and a
   distinct verification-review provenance. The unlock validator must parse v2
   and prove the exact corpus, versions, and passing hard/outcome/dominance,
   preserved legacy-macro, and `SETTLEMENT` macro gates. Mark the holdout
   ready and enable it only after those values and all frozen definitions are
   present. Update the release ledger before executing the holdout.
   Both reviewed Markdown records must include the contract's machine-readable
   artifact/path/status markers; a matching review hash plus free-form mention
   of an artifact SHA is not sufficient unlock evidence.
   The validator must reject stripped profiles, outcomes, aggregates,
   comparisons, or definition evaluations even when their remaining status
   strings say PASS, and must require the same fingerprint from checked-in
   runtime definitions, policy, freeze review, v2, and verification review.
   Generic CLI and exported headless raw/profile paths must continue to reject
   every reserved seed at every horizon; direct simulation-core imports are
   outside that process guard and must not be used for reserved-seed evidence.
5. Run `matrix --corpus phase-4.2-holdout` once. It must accept no seed or tick
   override and no noncanonical output path, and must resolve exactly four scenarios, seeds
   `2001..2064`, 10,000 ticks, and the canonical
   `docs/baselines/phase-4.2-holdout-v1.json.gz` target. Install its staged
   artifact, checksum, and readable companion without replacement; a caught
   failure rolls back the attempt, while any crash-time partial set is invalid
   and requires manual audit. Then set the holdout status to recorded and
   disable execution again. Existing targets must stop the run rather than be
   overwritten or presented as a fresh untouched result.
   Before the first tick, acquire the exclusive durable
   `phase-4.2-holdout-v1.attempt.json` marker through the private CLI path bound
   to the writer. Never remove it automatically: success, crash, failure, or a
   partial set consumes the attempt and any retry requires explicit audit.
   Record the platform durability model: file plus parent-directory fsync on
   POSIX, or file fsync with Node directory-fsync unavailability stated on
   Windows. Do not turn the latter into an unqualified power-loss guarantee.

At the current repository state, all five steps have completed. The process
constants are `REVIEWED`, `FROZEN`, `RECORDED`, and disabled. The durable
consumed-attempt marker remains beside the passing holdout, and the CLI rejects
any second execution.

## Acceptance matrix

| Area                | Required evidence                                                                                                                                                             |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Core                | deterministic site ranking, one active/pending shelter, condition bounds, material accounting, claim repair, guest priority, outdoor fallback, maintenance, atomic relocation |
| Compatibility       | deep rejection tests, version-4 migration, continuation, replay reconstruction, experiment branching, response traces, direct/Worker and chunked/one-shot parity              |
| Product             | all Subject variants, long labels, absent/full/degraded/abandoned states, focus restoration, event replay, material feedback, equal-horizon comparison                        |
| Accessibility       | keyboard, touch, axe, NVDA, reduced motion, forced colors, 200% text, 400% reflow                                                                                             |
| Visual              | narrow/medium/wide site, construction, occupancy, degradation, and relocation baselines                                                                                       |
| Performance         | bootstrap under 128 KiB, hot frame below 65,536 bytes, save at or below 2.5 MB, existing bundle ceilings, throughput at least 25,905 ticks/second                             |
| Human comprehension | five-person formative round, five new-person confirmatory round, at least four confirmatory participants meeting every shelter criterion                                      |

## Current evidence boundary

The automated release-candidate record is complete. Discovery v1, its freeze
review, frozen verification v2, its verification review, and the one-shot
holdout are attached with checksums. The holdout passed all run/scenario hard,
contract, outcome, dominance, four inherited macro, and `SETTLEMENT` gates and
is now permanently resealed. Formatting, lint, type-check, 506 source-only
tests, golden replay, bundle and persistence budgets, 30,761.8 ticks/s, 46/46
Chromium journeys/visuals, and the 24/24 three-browser release matrix pass.
Historical Phase 3 and Phase 4.1 artifacts remain unchanged.

The inherited unified NVDA, five-person formative, and five-new-person
confirmatory records remain pending, as do the separate Phase 4.2 NVDA,
five-person formative, and five-new-person confirmatory records. These human
gates prevent a Phase 4.2 release-complete claim.
