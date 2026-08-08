# Unified alpha human protocol v1

Status: **prospective protocol; no sessions or NVDA pass recorded**  
Applies to: **the lifecycle-integrated Phase 4.3 release candidate**

This protocol replaces the unexecuted, phase-by-phase manual workflows with
one final alpha validation of the integrated product. It does not retroactively
pass Phase 3, Phase 4.1, or Phase 4.2, and it does not alter their historical
automated artifacts.

## Required sequence and separation

1. **Formative:** five people unfamiliar with Tiny Civilisation. Observe the
   full task set, then make any needed fixes.
2. **Candidate:** freeze one commit and definition; pass the automated release
   check and deployment smoke on its deterministic package.
3. **Final NVDA:** a manual keyboard and screen-reader pass on that exact
   candidate, before any protected holdout tick.
4. **Protected holdout:** execute once after reviewed authorization.
5. **Confirmatory:** five entirely different unfamiliar participants on the
   same candidate after the holdout.

Do not reuse a participant across rounds. A facilitator or observer may be the
same, but must not count as a participant. Record informed consent, collect only
the minimum information needed for the study, replace names with participant
codes, keep contact/consent data separate from observation notes, and document
where evidence is retained and who may access it.

## Session conditions

Record for every session:

- participant code and round, with a separate attestation that the two groups
  do not overlap;
- date, start/end time, facilitator, observer, and whether help was requested;
- release-candidate commit, package SHA-256, deployment identifier/URL, browser,
  OS, viewport, input method, and accessibility settings;
- task accuracy, completion time, route taken, missed cues, vocabulary
  confusion, false causal claims, input failures, and accessibility failures;
- prompts given after the independent attempt, clearly separated from the
  participant's unaided answer; and
- blocker/high/medium/low findings with owner and disposition.

Use the same scenarios, task wording, and scoring rules across participants in
a round. Counterbalance starting scenario or subject only with a recorded
schedule. Do not teach the expected answer before scoring the independent
attempt.

## Comprehension rubric

Score each row `PASS`, `FAIL`, or `NOT OBSERVED`, with the participant's route
and a short factual note. `NOT OBSERVED` does not count as a pass.

| Row                                   | Independent evidence required                                                                                                                                                                                 |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Scenario and hypothesis               | Identifies the selected scenario, distinguishes scenario choice from the numeric seed, states what is true at tick 0, and forms a testable question without describing the hypothesis as a result.            |
| Creature cognition and current moment | For a selected creature, finds and explains its desire, plan, current action, strongest retained reason, replays a retained moment, and returns focus to the live subject.                                    |
| Hydration                             | Identifies thirst or hydration state, source/route pressure, and the factual observed effect of a water intervention without claiming more causality than the comparison supports.                            |
| Settlement                            | Identifies selected site rationale, reservation versus physical occupancy, structure condition/upkeep, sheltered versus outdoor rest destination, and the factual observed effect of a material intervention. |
| Birth, lineage, and care              | Finds a birth, identifies biological sex and both parents, explains bounded inherited trait/skill potentials, distinguishes dependent youth and caregiver, and finds retained care evidence.                  |
| Death, memory, and estate             | Finds the retained death cause, mourning, memorial, inherited goods, named heir, and permanent remembered life record; distinguishes goods from traits/skills retained only as history.                       |
| Population interpretation             | Describes observed growth or decline, cap pressure, environmental influence only where evidence supports it, the 24-living cap, and extinction without making an unsupported causal claim.                    |

The confirmatory gate passes only when at least four of five participants pass
**every** row. Evaluate the threshold row by row; do not average scores across
rows or participants.

## Candidate and fixture integrity

Serve the checksummed static candidate archive on the controlled test machine;
never substitute the development server. Retain its commit, lockfile, Node/npm,
browser, schema, bundle, and automated-test manifests with each round.

Choose lifecycle fixtures only from discovery/calibration seeds `1..64` by
scanning catalog scenario order and then ascending seed order against the
predeclared task facts. Record the selected fixture and answer key before the
session. Never inspect or expose protected holdout seeds to a participant or
facilitator. Confirmatory participants use different qualifying calibration
fixtures from the formative round while keeping the same task wording and
scoring contract.

## Formative round

The formative round is diagnostic and may expose design changes. Let each
participant attempt the rubric tasks with minimal intervention. After the
independent attempt, use neutral probes such as “show me where you found that”
or “what does the interface say happened?” Record both the initial answer and
the prompted route.

After five sessions, group repeated findings without erasing individual
records. Fix every blocker and high-severity pattern. Rerun affected unit,
integration, accessibility, E2E, visual, persistence, performance, and
definition tests. If a fix changes mechanics, measurement, classifier rules,
or frozen bands, begin a new calibration/definition cycle.

Run an exploratory NVDA preflight during formative preparation. It may find
issues but never substitutes for final NVDA. Mint a newly identified candidate
and checksum for every runtime or configuration change; do not silently serve
changed files under an earlier candidate identity.

## Final manual NVDA workflow

Run final NVDA after the formative fixes, automated release check, and
deployment smoke, and before the holdout. Automated axe or keyboard tests are
supporting evidence only.

Record the NVDA version, speech synthesizer, browser/version, OS/build,
candidate commit, package SHA-256, deployment identifier, observer, and any
non-default NVDA/browser settings. Complete the workflow by keyboard:

1. launch the application and confirm the initial title, setup dialog, scenario
   facts, seed, and paused-at-tick-zero state;
2. move through the primary regions and tabs in a logical order with no focus
   trap or silent control;
3. use the world navigator and creature roster, select a creature, and confirm
   selection and camera/focus restoration;
4. read the selected creature's desire, plan, action, strongest retained
   reason, status, and current moment;
5. navigate the chronicle and retained moments chronologically, dismiss or
   recover a moment, and verify status announcements;
6. find lineage, a birth, dependent-youth care, a death/life record, mourning,
   memorial, and estate information, including goods-versus-traits wording;
7. find hydration/source-route evidence and settlement site, occupancy,
   condition, upkeep, and rest-destination evidence;
8. schedule a permitted intervention, advance to an equal horizon, and inspect
   the factual comparison and bounded causal evidence;
9. save/load and replay or reopen comparison evidence, confirming that focus
   returns to a meaningful control and announcements do not duplicate or vanish;
10. repeat critical routes at increased text size or reflow if the manual
    observation reveals an interaction that automated zoom coverage cannot
    establish.

For each step record `PASS`, `FAIL`, or `NOT OBSERVED`, the exact keyboard route,
what NVDA announced, expected behavior, observed behavior, and severity. A
blocker or high-severity failure must be fixed and the affected workflow rerun
on a newly identified candidate. Never copy an earlier phase's NVDA result into
this record.

## Confirmatory round

Run the confirmatory round only after the one-shot holdout, on the same commit,
package, and deployment build. Use five participants who did not join the
formative round. Score unaided attempts before neutral probing.

If fewer than four participants pass any rubric row, the human gate fails. If a
fix is required after the holdout, do not describe the existing holdout as
validation of the changed candidate. Record the mismatch and start the required
new definition/release evidence cycle; do not silently reuse or overwrite
protected evidence.

## Decision record

The final reviewed human record must include:

- the five formative and five confirmatory participant codes and non-overlap
  attestation;
- row-level results for all ten participants, with the confirmatory pass count
  for each row;
- issue dispositions and links to affected automated reruns;
- candidate commit, definition fingerprint, archive checksum, deployment
  identity, final NVDA record hash, and protected holdout hash; and
- an explicit decision of `PASS`, `FAIL`, or `INCOMPLETE`.

A template, empty table, planned session, or implementation claim is not
evidence that a row passed.
