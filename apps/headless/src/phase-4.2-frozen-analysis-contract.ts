/**
 * Readable immutable snapshot extracted from the recorded Phase 4.2 v2
 * calibration artifact. Later runtime phases must not reinterpret these
 * classifier-v3 semantics through current function implementations.
 */
export const PHASE_4_2_FROZEN_ANALYSIS_IMPLEMENTATION_SHA256 =
  "652df6684398d4dae4570b92ac8414b7181c0ba0770258f4efa1e9f48c27fadd" as const;

export const PHASE_4_2_FROZEN_ANALYSIS_IMPLEMENTATION = {
  scenarioAnalysisSchemaVersion: 4,
  outcomeClassifierVersion: 3,
  outcomeLabelOrder: [
    "COOPERATIVE_SHARED_STORAGE",
    "FRAGMENTED_SOCIAL_STRUCTURE",
    "PERSISTENT_PRIVATE_RESERVES",
    "RECURRING_CONFLICT",
    "SHARED_HYDRATION",
    "SOURCE_BOTTLENECK",
    "PERSISTENT_DEHYDRATION",
    "CONCENTRATED_WATER_ROUTES",
    "ESTABLISHED_SETTLEMENT",
    "CHRONIC_SHELTER_NEGLECT",
    "SHELTER_CROWDING",
    "GUEST_SHELTERING",
    "SETTLEMENT_RELOCATION",
    "QUIET_STALEMATE",
  ],
  outcomeLabelTitles: {
    COOPERATIVE_SHARED_STORAGE: "Cooperative shared storage",
    FRAGMENTED_SOCIAL_STRUCTURE: "Fragmented social structure",
    PERSISTENT_PRIVATE_RESERVES: "Persistent private reserves",
    RECURRING_CONFLICT: "Recurring conflict",
    SHARED_HYDRATION: "Shared hydration",
    SOURCE_BOTTLENECK: "Source bottleneck",
    PERSISTENT_DEHYDRATION: "Persistent dehydration",
    CONCENTRATED_WATER_ROUTES: "Concentrated water routes",
    ESTABLISHED_SETTLEMENT: "Established settlement",
    CHRONIC_SHELTER_NEGLECT: "Chronic shelter neglect",
    SHELTER_CROWDING: "Shelter crowding",
    GUEST_SHELTERING: "Guest sheltering",
    SETTLEMENT_RELOCATION: "Settlement relocation",
    QUIET_STALEMATE: "Quiet stalemate",
  },
  historicalClassifier2LabelOrder: [
    "COOPERATIVE_SHARED_STORAGE",
    "FRAGMENTED_SOCIAL_STRUCTURE",
    "PERSISTENT_PRIVATE_RESERVES",
    "RECURRING_CONFLICT",
    "SHARED_HYDRATION",
    "SOURCE_BOTTLENECK",
    "PERSISTENT_DEHYDRATION",
    "CONCENTRATED_WATER_ROUTES",
    "QUIET_STALEMATE",
  ],
  evaluationWindows: {
    anyObservedTickEnablesOrdinaryLabels: true,
    matrixTicks: 10000,
    stalemateWindowTicks: 1000,
  },
  phase42CorpusContracts: {
    calibration: {
      seeds: [
        1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23,
        24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44,
        45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60, 61, 62, 63, 64,
      ],
      ticks: 10000,
    },
    holdout: {
      seeds: [
        2001, 2002, 2003, 2004, 2005, 2006, 2007, 2008, 2009, 2010, 2011, 2012, 2013, 2014,
        2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026, 2027, 2028,
        2029, 2030, 2031, 2032, 2033, 2034, 2035, 2036, 2037, 2038, 2039, 2040, 2041, 2042,
        2043, 2044, 2045, 2046, 2047, 2048, 2049, 2050, 2051, 2052, 2053, 2054, 2055, 2056,
        2057, 2058, 2059, 2060, 2061, 2062, 2063, 2064,
      ],
      ticks: 10000,
    },
  },
  phase42ClassifierRuleKeys: [
    "chronicNeglectMinimumActiveShelterTicks",
    "chronicNeglectMinimumLowConditionExposureRate",
    "establishedSettlementMinimumActiveShelters",
    "guestShelteringMinimumEvents",
    "settlementRelocationMinimumCount",
    "shelterCrowdingMinimumEvents",
  ],
  classifierImplementation: {
    summarizeRunOutcome:
      'function summarizeRunOutcome(profile,phase42Rules=PHASE_4_2_CLASSIFIER_RULES){const labels=[];const evaluatedLabelIds=[];const notEvaluatedLabelIds=[];const ordinaryLabels=OUTCOME_LABEL_ORDER.filter(labelId=>labelId!=="QUIET_STALEMATE");const hasObservationWindow=profile.window.observedTicks>0;const stalemateEligible=profile.window.observedTicks===SCENARIO_MEASUREMENT_HORIZONS.matrixTicks&&profile.stalemate.observedWindowTicks===SCENARIO_MEASUREMENT_HORIZONS.stalemateWindowTicks&&profile.stalemate.eligible;if(hasObservationWindow)evaluatedLabelIds.push(...ordinaryLabels);else notEvaluatedLabelIds.push(...ordinaryLabels);if(stalemateEligible)evaluatedLabelIds.push("QUIET_STALEMATE");else notEvaluatedLabelIds.push("QUIET_STALEMATE");if(hasObservationWindow){const sharedFoodEvents=interactionCount(profile,"FOOD_SHARED");const storedResources=profile.horizon.storage.food+profile.horizon.storage.material+profile.horizon.storage.water;if(profile.horizon.storage.completedStorageCount>=1&&storedResources>=1&&profile.groups.horizon.groupedCreatureCount>=2&&sharedFoodEvents>=1){labels.push({id:"COOPERATIVE_SHARED_STORAGE",title:OUTCOME_LABEL_TITLES.COOPERATIVE_SHARED_STORAGE,factualSummary:"A completed group store held resources after at least one observed food-sharing event.",evidence:[outcomeEvidence("profile.horizon.storage.completedStorageCount",profile.horizon.storage.completedStorageCount,"GTE",1),outcomeEvidence("profile.horizon.storage.food+profile.horizon.storage.material+profile.horizon.storage.water",storedResources,"GTE",1),outcomeEvidence("profile.groups.horizon.groupedCreatureCount",profile.groups.horizon.groupedCreatureCount,"GTE",2),outcomeEvidence("profile.interactions.byType[FOOD_SHARED].count",sharedFoodEvents,"GTE",1)]})}if(profile.relationships.componentCount>=2){labels.push({id:"FRAGMENTED_SOCIAL_STRUCTURE",title:OUTCOME_LABEL_TITLES.FRAGMENTED_SOCIAL_STRUCTURE,factualSummary:"The relationship graph remained split across two or more connected components at the horizon.",evidence:[outcomeEvidence("profile.relationships.componentCount",profile.relationships.componentCount,"GTE",2),outcomeEvidence("profile.relationships.vertexCount",profile.relationships.vertexCount,"GTE",1)]})}const keep=action(profile,"KEEP");const privateResources=profile.horizon.resources.ungroupedCarriedFood+profile.horizon.resources.ungroupedCarriedMaterial+profile.horizon.resources.ungroupedCarriedWater;if(keep.count>=1&&privateResources>=1&&profile.horizon.storage.completedStorageCount===0){labels.push({id:"PERSISTENT_PRIVATE_RESERVES",title:OUTCOME_LABEL_TITLES.PERSISTENT_PRIVATE_RESERVES,factualSummary:"At least one KEEP action occurred and ungrouped creatures still carried resources without a completed store at the horizon.",evidence:[outcomeEvidence("profile.actions.byKind[KEEP].count",keep.count,"GTE",1),outcomeEvidence("profile.horizon.resources.ungroupedCarriedFood+profile.horizon.resources.ungroupedCarriedMaterial+profile.horizon.resources.ungroupedCarriedWater",privateResources,"GTE",1),outcomeEvidence("profile.horizon.storage.completedStorageCount",profile.horizon.storage.completedStorageCount,"EQ",0)]})}const attacks=interactionCount(profile,"CREATURE_ATTACKED");if(attacks>=2){labels.push({id:"RECURRING_CONFLICT",title:OUTCOME_LABEL_TITLES.RECURRING_CONFLICT,factualSummary:"Two or more creature-attack events occurred in the observed window.",evidence:[outcomeEvidence("profile.interactions.byType[CREATURE_ATTACKED].count",attacks,"GTE",2)]})}if(profile.hydration.flow.sharedUnits>=4&&profile.hydration.flow.distinctRecipients>=3){labels.push({id:"SHARED_HYDRATION",title:OUTCOME_LABEL_TITLES.SHARED_HYDRATION,factualSummary:"At least four water units were shared across at least three distinct recipients.",evidence:[outcomeEvidence("profile.hydration.flow.sharedUnits",profile.hydration.flow.sharedUnits,"GTE",4),outcomeEvidence("profile.hydration.flow.distinctRecipients",profile.hydration.flow.distinctRecipients,"GTE",3)]})}const depletedSourceBottleneck=profile.hydration.sources.depletedSourceTicks>=500;const contentionBottleneck=profile.hydration.sources.gatherAttempts>0&&profile.hydration.sources.contentionRate>=.1;if(depletedSourceBottleneck||contentionBottleneck){const evidence=[];if(depletedSourceBottleneck){evidence.push(outcomeEvidence("profile.hydration.sources.depletedSourceTicks",profile.hydration.sources.depletedSourceTicks,"GTE",500))}if(contentionBottleneck){evidence.push(outcomeEvidence("profile.hydration.sources.contentionRate",profile.hydration.sources.contentionRate,"GTE",.1))}labels.push({id:"SOURCE_BOTTLENECK",title:OUTCOME_LABEL_TITLES.SOURCE_BOTTLENECK,factualSummary:"Potable-water access met the declared depletion or contention threshold.",evidence})}const severeExposure=profile.hydration.need.severeExposureRate>=.1;const longSevereSpell=profile.hydration.need.longestSevereSpellTicks>=1e3;if(severeExposure||longSevereSpell){const evidence=[];if(severeExposure){evidence.push(outcomeEvidence("profile.hydration.need.severeExposureRate",profile.hydration.need.severeExposureRate,"GTE",.1))}if(longSevereSpell){evidence.push(outcomeEvidence("profile.hydration.need.longestSevereSpellTicks",profile.hydration.need.longestSevereSpellTicks,"GTE",1e3))}labels.push({id:"PERSISTENT_DEHYDRATION",title:OUTCOME_LABEL_TITLES.PERSISTENT_DEHYDRATION,factualSummary:"Severe thirst met the declared exposure-share or continuous-spell threshold.",evidence})}if(profile.hydration.routes.dominantEdgeShare>=.35&&profile.hydration.routes.herfindahlIndex>=.15){labels.push({id:"CONCENTRATED_WATER_ROUTES",title:OUTCOME_LABEL_TITLES.CONCENTRATED_WATER_ROUTES,factualSummary:"Water-trip movement concentrated on a dominant corridor under both declared route thresholds.",evidence:[outcomeEvidence("profile.hydration.routes.dominantEdgeShare",profile.hydration.routes.dominantEdgeShare,"GTE",.35),outcomeEvidence("profile.hydration.routes.herfindahlIndex",profile.hydration.routes.herfindahlIndex,"GTE",.15)]})}if(profile.settlement.horizon.activeShelterCount>=phase42Rules.establishedSettlementMinimumActiveShelters){labels.push({id:"ESTABLISHED_SETTLEMENT",title:OUTCOME_LABEL_TITLES.ESTABLISHED_SETTLEMENT,factualSummary:"The completed communal shelter count at the horizon met the declared threshold.",evidence:[outcomeEvidence("profile.settlement.horizon.activeShelterCount",profile.settlement.horizon.activeShelterCount,"GTE",phase42Rules.establishedSettlementMinimumActiveShelters)]})}if(profile.settlement.condition.activeShelterTicks>=phase42Rules.chronicNeglectMinimumActiveShelterTicks&&profile.settlement.condition.lowConditionExposureRate>=phase42Rules.chronicNeglectMinimumLowConditionExposureRate){labels.push({id:"CHRONIC_SHELTER_NEGLECT",title:OUTCOME_LABEL_TITLES.CHRONIC_SHELTER_NEGLECT,factualSummary:"Low-condition exposure met both declared active-shelter duration and exposure-rate thresholds.",evidence:[outcomeEvidence("profile.settlement.condition.activeShelterTicks",profile.settlement.condition.activeShelterTicks,"GTE",phase42Rules.chronicNeglectMinimumActiveShelterTicks),outcomeEvidence("profile.settlement.condition.lowConditionExposureRate",profile.settlement.condition.lowConditionExposureRate,"GTE",phase42Rules.chronicNeglectMinimumLowConditionExposureRate)]})}if(profile.settlement.occupancy.crowdingEvents>=phase42Rules.shelterCrowdingMinimumEvents){labels.push({id:"SHELTER_CROWDING",title:OUTCOME_LABEL_TITLES.SHELTER_CROWDING,factualSummary:"Capacity-based shelter crowding met the declared event threshold.",evidence:[outcomeEvidence("profile.settlement.occupancy.crowdingEvents",profile.settlement.occupancy.crowdingEvents,"GTE",phase42Rules.shelterCrowdingMinimumEvents)]})}if(profile.settlement.rest.guestUseEvents>=phase42Rules.guestShelteringMinimumEvents){labels.push({id:"GUEST_SHELTERING",title:OUTCOME_LABEL_TITLES.GUEST_SHELTERING,factualSummary:"Non-member shelter use met the declared event threshold.",evidence:[outcomeEvidence("profile.settlement.rest.guestUseEvents",profile.settlement.rest.guestUseEvents,"GTE",phase42Rules.guestShelteringMinimumEvents)]})}if(profile.settlement.relocation.relocations>=phase42Rules.settlementRelocationMinimumCount){labels.push({id:"SETTLEMENT_RELOCATION",title:OUTCOME_LABEL_TITLES.SETTLEMENT_RELOCATION,factualSummary:"Completed settlement relocations met the declared count threshold.",evidence:[outcomeEvidence("profile.settlement.relocation.relocations",profile.settlement.relocation.relocations,"GTE",phase42Rules.settlementRelocationMinimumCount)]})}}if(stalemateEligible&&profile.stalemate.declared){labels.push({id:"QUIET_STALEMATE",title:OUTCOME_LABEL_TITLES.QUIET_STALEMATE,factualSummary:"The locked trailing-window stalemate rule found low movement, fewer than three transitions, no structural social change, and no significant event.",evidence:[outcomeEvidence("profile.window.observedTicks",profile.window.observedTicks,"EQ",SCENARIO_MEASUREMENT_HORIZONS.matrixTicks),outcomeEvidence("profile.stalemate.observedWindowTicks",profile.stalemate.observedWindowTicks,"EQ",SCENARIO_MEASUREMENT_HORIZONS.stalemateWindowTicks),outcomeEvidence("profile.stalemate.declared",true,"EQ",true),outcomeEvidence("profile.stalemate.movementFixedUnitsPerLivingCreatureTick",profile.stalemate.movementFixedUnitsPerLivingCreatureTick,"LTE",profile.stalemate.thresholds.maximumMovementFixedUnitsPerLivingCreatureTick),outcomeEvidence("profile.stalemate.actionTransitions",profile.stalemate.actionTransitions,"LTE",profile.stalemate.thresholds.maximumActionTransitions),outcomeEvidence("profile.stalemate.structuralSocialChanges",profile.stalemate.structuralSocialChanges,"EQ",0),outcomeEvidence("profile.stalemate.significantEvents",profile.stalemate.significantEvents,"EQ",0)]})}return{classifierVersion:OUTCOME_CLASSIFIER_VERSION,multiLabel:true,interpretation:"FACTUAL_NON_EXCLUSIVE_NO_WINNER",seed:profile.seed,labels,evaluatedLabelIds,notEvaluatedLabelIds}}',
    phase42ClassifierRulesForContext:
      "function phase42ClassifierRulesForContext(context){return context.phase42Definitions?.classifierRules??PHASE_4_2_CLASSIFIER_RULES}",
    outcomeEvidence:
      "function outcomeEvidence(metricPath,value,comparison,threshold){return{metricPath,value,comparison,threshold}}",
    action:
      "function action(profile,kind){return profile.actions.byKind.find(item=>item.kind===kind)??{count:0,share:0}}",
    interactionCount:
      "function interactionCount(profile,eventType){return profile.interactions.byType.find(item=>item.eventType===eventType)?.count??0}",
    labelIncidence:
      "function labelIncidence(summaries){return OUTCOME_LABEL_ORDER.map(labelId=>{const eligible=summaries.filter(summary=>summary.evaluatedLabelIds.includes(labelId));const occurrences=eligible.filter(summary=>summary.labels.some(label=>label.id===labelId)).length;return{labelId,title:OUTCOME_LABEL_TITLES[labelId],totalRuns:summaries.length,eligibleRuns:eligible.length,...wilsonOutcome(occurrences,eligible.length)}})}",
    wilsonOutcome:
      'function wilsonOutcome(occurrences,runs){if(occurrences<0||runs<0||occurrences>runs){throw new RangeError("Wilson interval counts must satisfy 0 <= occurrences <= runs.")}if(runs===0){return{runs,occurrences,incidence:null,wilson95:{confidence:.95,lower:null,upper:null}}}const z=1.959963984540054;const zSquared=z*z;const proportion=occurrences/runs;const denominator=1+zSquared/runs;const centre=(proportion+zSquared/(2*runs))/denominator;const margin=z/denominator*Math.sqrt(proportion*(1-proportion)/runs+zSquared/(4*runs*runs));return{runs,occurrences,incidence:round(proportion),wilson95:{confidence:.95,lower:round(Math.max(0,centre-margin)),upper:round(Math.min(1,centre+margin))}}}',
    evaluateScenarioOutcomeBands:
      'function evaluateScenarioOutcomeBands(scenarioId,profiles,context){const validation=corpusValidation(profiles,context);const eligibility=outcomeBandEligibility(validation,context);const eligible=eligibility.status==="FULL_CALIBRATION"||eligibility.status==="FULL_HOLDOUT"||eligibility.status==="FULL_PHASE_4_2_CALIBRATION"||eligibility.status==="FULL_PHASE_4_2_HOLDOUT";const phase42Context=context.corpus==="phase-4.2-calibration"||context.corpus==="phase-4.2-holdout";const incidences=labelIncidence(profiles.map(profile=>summarizeRunOutcome(profile,phase42ClassifierRulesForContext(context))));const definitions=(phase42Context?context.phase42Definitions?.incidenceBands??PHASE_4_2_SCENARIO_OUTCOME_INCIDENCE_BANDS:SCENARIO_OUTCOME_INCIDENCE_BANDS).filter(definition=>definition.scenarioId===scenarioId);const evaluations=definitions.map(definition=>{const incidence=incidences.find(candidate=>candidate.labelId===definition.labelId);const observed=incidence?.occurrences??null;const eligibleRuns=incidence?.eligibleRuns??0;const reason=!eligible?eligibility.reason:incidence===void 0?"The required outcome label is absent from the classifier incidence table.":eligibleRuns!==definition.requiredEligibleRuns?`The label must be eligible in all ${definition.requiredEligibleRuns.toString()} locked runs.`:null;const status=!eligible?"NOT_EVALUATED":reason!==null||observed===null?"FAIL":observed>=definition.threshold?"PASS":"FAIL";return{tableVersion:definition.tableVersion,labelId:definition.labelId,metricPath:definition.metricPath,status,observed,eligibleRuns,comparison:definition.comparison,threshold:definition.threshold,requiredEligibleRuns:definition.requiredEligibleRuns,reason:reason??(status==="FAIL"?"The label incidence is below its frozen calibration minimum.":null),provenance:definition.provenance}});const dominanceLabelOrder=phase42Context?OUTCOME_LABEL_ORDER:PHASE_4_1_OUTCOME_LABEL_ORDER;const dominanceEvaluations=dominanceLabelOrder.map(labelId=>{const incidence=incidences.find(candidate=>candidate.labelId===labelId);const rationale=(phase42Context?context.phase42Definitions?.dominanceRationales??PHASE_4_2_SCENARIO_OUTCOME_DOMINANCE_RATIONALES:SCENARIO_OUTCOME_DOMINANCE_RATIONALES).find(candidate=>candidate.scenarioId===scenarioId&&candidate.labelId===labelId)??null;const value=incidence?.incidence??null;const rationaleRequired=value!==null&&value>SCENARIO_OUTCOME_DOMINANCE_THRESHOLD;const incomplete=incidence===void 0||incidence.eligibleRuns!==PHASE_4_1_CALIBRATION_SEED_COUNT;const status=!eligible?"NOT_EVALUATED":incomplete||rationaleRequired&&rationale===null?"FAIL":"PASS";return{labelId,metricPath:`analysis.outcomes.incidence[${labelId}].incidence`,status,incidence:value,occurrences:incidence?.occurrences??0,eligibleRuns:incidence?.eligibleRuns??0,comparison:"GT",threshold:SCENARIO_OUTCOME_DOMINANCE_THRESHOLD,rationaleRequired,rationale,reason:!eligible?eligibility.reason:incomplete?`Dominance review requires ${PHASE_4_1_CALIBRATION_SEED_COUNT.toString()} eligible runs for every label.`:rationaleRequired&&rationale===null?"Incidence exceeds 85% without a checked-in mechanics-and-scenario rationale.":null}});const rationaleFailures=dominanceEvaluations.filter(evaluation=>evaluation.status==="FAIL"&&evaluation.rationaleRequired&&evaluation.rationale===null).map(evaluation=>evaluation.labelId);return{tableVersion:SCENARIO_OUTCOME_BAND_TABLE_VERSION,status:evaluationSummaryStatus([...evaluations,...dominanceEvaluations]),eligibility,releaseClaim:false,provenance:phase42Context?PHASE_4_2_CALIBRATION_PROVENANCE:PHASE_4_1_FROZEN_CALIBRATION_PROVENANCE,evaluations,dominance:{status:evaluationSummaryStatus(dominanceEvaluations),threshold:SCENARIO_OUTCOME_DOMINANCE_THRESHOLD,evaluations:dominanceEvaluations,rationaleFailures}}}',
    corpusValidation:
      'function corpusValidation(profiles,context){const contract=CORPUS_CONTRACT[context.corpus];const observedSeeds=profiles.map(profile=>profile.seed).sort((a,b)=>a-b);const seedsMatch=context.seeds.length===contract.seeds.length&&observedSeeds.length===contract.seeds.length&&sameNumbers(context.seeds,contract.seeds)&&sameNumbers(observedSeeds,contract.seeds);const horizonMatches=context.requestedTicks===contract.ticks&&profiles.every(profile=>profile.window.observedTicks===contract.ticks);return{status:!seedsMatch?"CORPUS_MISMATCH":!horizonMatches?"HORIZON_MISMATCH":"MATCHED_LOCKED_CORPUS",expectedSeeds:contract.seeds,observedSeeds,expectedTicks:contract.ticks,observedTicks:context.requestedTicks}}',
    outcomeBandEligibility:
      'function outcomeBandEligibility(validation,context){if(validation.status!=="MATCHED_LOCKED_CORPUS"){return{status:"NOT_EVALUATED",reason:validation.status==="CORPUS_MISMATCH"?"Outcome-incidence bands require the complete locked 64-seed corpus.":"Outcome-incidence bands require the locked 10,000-tick horizon."}}if(context.corpus==="calibration"){return{status:"FULL_CALIBRATION",reason:null}}if(context.corpus==="holdout"){return{status:"FULL_HOLDOUT",reason:null}}if(context.corpus==="phase-4.2-calibration"){return phase42DefinitionsAreFrozenForContext(context)?{status:"FULL_PHASE_4_2_CALIBRATION",reason:null}:{status:"PHASE_4_2_CALIBRATION_CANDIDATE",reason:"Phase 4.2 discovery calibration reports candidate distributions; classifier and bands are not frozen."}}if(context.corpus==="phase-4.2-holdout"){return phase42DefinitionsAreFrozenForContext(context)?{status:"FULL_PHASE_4_2_HOLDOUT",reason:null}:{status:"PHASE_4_2_NOT_FROZEN",reason:"Phase 4.2 outcome-incidence and dominance bands are not frozen; the reserved holdout remains sealed."}}return{status:"NOT_EVALUATED",reason:"Frozen outcome-incidence bands evaluate only the full calibration or full holdout corpus."}}',
    phase42DefinitionsAreFrozenForContext:
      'function phase42DefinitionsAreFrozenForContext(context){return context.phase42Definitions?.status==="FROZEN"?true:context.phase42Definitions?.status==="CANDIDATE"?false:phase42BandsAreFrozen(context.phase42DefinitionFingerprint)}',
    compareBand:
      'function compareBand(observed,comparison,threshold){return comparison==="GTE"?observed>=threshold:observed<threshold}',
    sameNumbers:
      "function sameNumbers(left,right){const normalizedLeft=[...new Set(left)].sort((a,b)=>a-b);const normalizedRight=[...new Set(right)].sort((a,b)=>a-b);return normalizedLeft.length===normalizedRight.length&&normalizedLeft.every((value,index)=>value===normalizedRight[index])}",
    evaluationSummaryStatus:
      'function evaluationSummaryStatus(evaluations){if(evaluations.some(evaluation=>evaluation.status==="FAIL"))return"FAIL";if(evaluations.every(evaluation=>evaluation.status==="NOT_EVALUATED")){return"NOT_EVALUATED"}if(evaluations.some(evaluation=>evaluation.status==="NOT_EVALUATED")){return"PARTIAL"}return"PASS"}',
  },
  safetyAndInvariantImplementation: {
    minimumPresent:
      "function minimumPresent(values){const present=values.filter(value=>value!==null);return present.length===0?null:Math.min(...present)}",
    maximum: "function maximum(values){return values.length===0?null:Math.max(...values)}",
    sameScenarioReference:
      "function sameScenarioReference(left,right){return left.kind===right.kind&&left.schemaVersion===right.schemaVersion&&left.behaviorVersion===right.behaviorVersion&&left.scenarioId===right.scenarioId&&left.scenarioVersion===right.scenarioVersion&&left.mapGenerationVersion===right.mapGenerationVersion&&left.seed===right.seed}",
    bandMetricValue:
      'function bandMetricValue(metricId,profiles){switch(metricId){case"MINIMUM_RUN_OCCUPIED_TILE_P10":return minimumPresent(profiles.map(profile=>profile.spatial.occupiedTiles.p10));case"MINIMUM_RUN_OCCUPIED_TILE_MEDIAN":return minimumPresent(profiles.map(profile=>profile.spatial.occupiedTiles.median));case"MAXIMUM_RUN_EXACT_OVERLAP_RATE":return maximum(profiles.map(profile=>profile.spatial.exactOverlap.rate));case"CORPUS_KEEP_SHARE":{const completedActions=profiles.reduce((total,profile)=>total+profile.actions.completedActions,0);const keepActions=profiles.reduce((total,profile)=>total+action(profile,"KEEP").count,0);return completedActions===0?null:round(keepActions/completedActions)}case"MAXIMUM_RUN_KEEP_SHARE":return maximum(profiles.map(profile=>action(profile,"KEEP").share));case"OBSERVED_ACTION_FAMILY_COUNT":return new Set(profiles.flatMap(profile=>profile.actions.byKind.filter(item=>item.count>0).map(item=>item.kind))).size;case"OBSERVED_DESIRE_FAMILY_COUNT":return new Set(profiles.flatMap(profile=>profile.desires.byFamily.filter(item=>item.exposureCreatureTicks>0).map(item=>item.family))).size}}',
    evaluateScenarioExpectedBands:
      'function evaluateScenarioExpectedBands(scenarioId,profiles,context){const validation=corpusValidation(profiles,context);const definitions=SCENARIO_EXPECTED_BANDS.filter(definition=>definition.scenarioId===scenarioId);const evaluations=definitions.map(definition=>{const observed=bandMetricValue(definition.metricId,profiles);const validationReason=validation.status==="CORPUS_MISMATCH"?"The observed seeds do not match the locked corpus.":validation.status==="HORIZON_MISMATCH"?"The observed horizon does not match the locked corpus horizon.":null;const status=validationReason!==null||observed===null?"NOT_EVALUATED":compareBand(observed,definition.comparison,definition.threshold)?"PASS":"FAIL";return{metricId:definition.metricId,metricPath:definition.metricPath,status,observed,comparison:definition.comparison,threshold:definition.threshold,reason:validationReason??(observed===null?"The metric has no observations.":null),bandType:definition.bandType,provenance:definition.provenance}});const scenarioOutcomeBands=evaluateScenarioOutcomeBands(scenarioId,profiles,context);const safetyStatus=evaluationSummaryStatus(evaluations);const phase42Candidate=context.corpus==="phase-4.2-calibration"&&!phase42DefinitionsAreFrozenForContext(context);return{tableVersion:SCENARIO_EXPECTED_BAND_TABLE_VERSION,status:phase42Candidate&&safetyStatus!=="FAIL"?"PARTIAL":safetyStatus,corpusValidation:validation,provenance:{releaseOutcomeClaim:false,calibrationEvidence:validation.status!=="MATCHED_LOCKED_CORPUS"?"NOT_PRESENT":context.corpus==="calibration"?"FULL_CALIBRATION_PRESENT":context.corpus==="phase-4.2-calibration"?phase42DefinitionsAreFrozenForContext(context)?"FULL_PHASE_4_2_CALIBRATION_PRESENT":"PHASE_4_2_CANDIDATE_CALIBRATION_PRESENT":context.corpus==="nightly"?"NIGHTLY_SUBSET_ONLY":context.corpus==="smoke"?"SMOKE_SUBSET_ONLY":"NOT_PRESENT",holdoutEvidence:validation.status!=="MATCHED_LOCKED_CORPUS"?"NOT_PRESENT":context.corpus==="holdout"?"FULL_HOLDOUT_PRESENT":context.corpus==="phase-4.2-holdout"&&phase42DefinitionsAreFrozenForContext(context)?"FULL_PHASE_4_2_HOLDOUT_PRESENT":"NOT_PRESENT"},evaluations,scenarioOutcomeBands}}',
    hardEvaluation:
      'function hardEvaluation(id,metricPath,observed,comparison,threshold,eligible,ineligibleReason){const passed=observed!==null&&(comparison==="EQ"?observed===threshold:comparison==="GTE"?observed>=threshold:observed<threshold);return{id,classification:"LOCKED_CONTRACT_SAFETY_INVARIANT",status:!eligible||observed===null?"NOT_EVALUATED":passed?"PASS":"FAIL",metricPath,observed,comparison,threshold,reason:!eligible?ineligibleReason:observed===null?"Metric is absent.":null}}',
    runHardInvariants:
      'function runHardInvariants(run,horizonEligible){const profile=run.profile;const reason="The run does not use the locked corpus horizon.";const keepShare=action(profile,"KEEP").share;const evaluations=[hardEvaluation("PROFILE_SCENARIO_IDENTITY_MATCH","run.profile.scenario",sameScenarioReference(profile.scenario,run.scenario)?1:0,"EQ",1,true,reason),hardEvaluation("PROFILE_COMPILED_MAP_HASH_MATCH","run.profile.compiledMapHash",profile.compiledMapHash===run.compiledMapHash?1:0,"EQ",1,true,reason),hardEvaluation("CRITICAL_RESOURCE_REACHABILITY","profile.horizon.resources.unreachableCreatureResourceKinds",profile.horizon.resources.unreachableCreatureResourceKinds,"EQ",0,true,reason),hardEvaluation("OCCUPIED_TILE_P10","profile.spatial.occupiedTiles.p10",profile.spatial.occupiedTiles.p10,"GTE",3,horizonEligible,reason),hardEvaluation("OCCUPIED_TILE_MEDIAN","profile.spatial.occupiedTiles.median",profile.spatial.occupiedTiles.median,"GTE",4,horizonEligible,reason),hardEvaluation("EXACT_OVERLAP_RATE","profile.spatial.exactOverlap.rate",profile.spatial.exactOverlap.rate,"LT",.01,horizonEligible,reason),hardEvaluation("PER_SEED_KEEP_SHARE","profile.actions.byKind[KEEP].share",keepShare,"LT",.5,horizonEligible,reason)];return{seed:run.scenario.seed,status:evaluationSummaryStatus(evaluations),evaluations}}',
    corpusHardInvariants:
      'function corpusHardInvariants(bandReport){return bandReport.evaluations.map(evaluation=>({id:evaluation.metricId,classification:"LOCKED_CONTRACT_SAFETY_INVARIANT",status:evaluation.status,metricPath:evaluation.metricPath,observed:evaluation.observed,comparison:evaluation.comparison,threshold:evaluation.threshold,reason:evaluation.reason}))}',
    analyzeScenarioRuns:
      'function analyzeScenarioRuns(runs,context){const identity=summarizeScenarioIdentity(runs);const scenarioId=runs[0]?.scenario.scenarioId;if(scenarioId===void 0)throw new Error("Scenario analysis requires at least one run.");const profiles=runs.map(run=>run.profile);const validation=corpusValidation(profiles,context);const outcomes=profiles.map(profile=>summarizeRunOutcome(profile,phase42ClassifierRulesForContext(context)));const expectedBands=evaluateScenarioExpectedBands(scenarioId,profiles,context);const horizonEligible=validation.status==="MATCHED_LOCKED_CORPUS";const perRunHardInvariants=runs.map(run=>runHardInvariants(run,horizonEligible));const corpus=corpusHardInvariants(expectedBands);return{schemaVersion:SCENARIO_ANALYSIS_SCHEMA_VERSION,...identity,outcomes:{perRun:outcomes,incidence:labelIncidence(outcomes)},hardInvariants:{status:evaluationSummaryStatus([...perRunHardInvariants.flatMap(report=>report.evaluations),...corpus]),perRun:perRunHardInvariants,corpus},expectedBands}}',
  },
  pairedMetricRegistry: [
    {
      id: "GROUP_COUNT",
      dimension: "SOCIAL",
      metricPath: "profile.groups.horizon.groupCount",
      missingValuePolicy: "ZERO_IS_OBSERVED",
      readImplementation: "profile=>profile.groups.horizon.groupCount",
    },
    {
      id: "RELATIONSHIP_COMPONENT_COUNT",
      dimension: "SOCIAL",
      metricPath: "profile.relationships.componentCount",
      missingValuePolicy: "ZERO_IS_OBSERVED",
      readImplementation: "profile=>profile.relationships.componentCount",
    },
    {
      id: "COMPLETED_STORAGE_COUNT",
      dimension: "STORAGE",
      metricPath: "profile.horizon.storage.completedStorageCount",
      missingValuePolicy: "ZERO_IS_OBSERVED",
      readImplementation: "profile=>profile.horizon.storage.completedStorageCount",
    },
    {
      id: "STORED_RESOURCE_UNITS",
      dimension: "STORAGE",
      metricPath: "profile.horizon.storage.food+profile.horizon.storage.material",
      missingValuePolicy: "ZERO_IS_OBSERVED",
      readImplementation:
        "profile=>profile.horizon.storage.food+profile.horizon.storage.material",
    },
    {
      id: "ATTACK_EVENT_COUNT",
      dimension: "CONFLICT",
      metricPath: "profile.interactions.byType[CREATURE_ATTACKED].count",
      missingValuePolicy: "ZERO_IS_OBSERVED",
      readImplementation: 'profile=>interactionCount(profile,"CREATURE_ATTACKED")',
    },
    {
      id: "CREATURE_PAIR_DISTANCE_MEDIAN",
      dimension: "SPATIAL",
      metricPath: "profile.spatial.dispersion.creaturePairDistanceTiles.median",
      missingValuePolicy: "ZERO_IS_OBSERVED",
      readImplementation:
        "profile=>profile.spatial.dispersion.creaturePairDistanceTiles.median",
    },
    {
      id: "ROUTE_HERFINDAHL_INDEX",
      dimension: "SPATIAL",
      metricPath: "profile.spatial.routes.herfindahlIndex",
      missingValuePolicy: "ZERO_IS_OBSERVED",
      readImplementation: "profile=>profile.spatial.routes.herfindahlIndex",
    },
    {
      id: "SEVERE_THIRST_EXPOSURE_RATE",
      dimension: "HYDRATION",
      metricPath: "profile.hydration.need.severeExposureRate",
      missingValuePolicy: "ZERO_IS_OBSERVED",
      readImplementation: "profile=>profile.hydration.need.severeExposureRate",
    },
    {
      id: "DEPLETED_WATER_SOURCE_TICKS",
      dimension: "HYDRATION",
      metricPath: "profile.hydration.sources.depletedSourceTicks",
      missingValuePolicy: "ZERO_IS_OBSERVED",
      readImplementation: "profile=>profile.hydration.sources.depletedSourceTicks",
    },
    {
      id: "WATER_SHARED_UNITS",
      dimension: "HYDRATION",
      metricPath: "profile.hydration.flow.sharedUnits",
      missingValuePolicy: "ZERO_IS_OBSERVED",
      readImplementation: "profile=>profile.hydration.flow.sharedUnits",
    },
    {
      id: "WATER_ROUTE_HERFINDAHL_INDEX",
      dimension: "HYDRATION",
      metricPath: "profile.hydration.routes.herfindahlIndex",
      missingValuePolicy: "ZERO_IS_OBSERVED",
      readImplementation: "profile=>profile.hydration.routes.herfindahlIndex",
    },
    {
      id: "ACTIVE_SHELTER_COUNT",
      dimension: "SETTLEMENT",
      metricPath: "profile.settlement.horizon.activeShelterCount",
      missingValuePolicy: "ZERO_IS_OBSERVED",
      readImplementation: "profile=>profile.settlement.horizon.activeShelterCount",
    },
    {
      id: "SHELTERED_REST_SHARE",
      dimension: "SETTLEMENT",
      metricPath: "profile.settlement.rest.shelteredRestShare",
      missingValuePolicy: "ZERO_IS_OBSERVED",
      readImplementation: "profile=>profile.settlement.rest.shelteredRestShare",
    },
    {
      id: "MEAN_SHELTER_CONDITION",
      dimension: "SETTLEMENT",
      metricPath: "profile.settlement.condition.meanCondition",
      missingValuePolicy: "EXCLUDE_PAIR_IF_EITHER_VALUE_MISSING",
      readImplementation:
        "profile=>profile.settlement.condition.activeShelterTicks===0?null:profile.settlement.condition.meanCondition",
    },
    {
      id: "SHELTER_GUEST_USE_EVENTS",
      dimension: "SETTLEMENT",
      metricPath: "profile.settlement.rest.guestUseEvents",
      missingValuePolicy: "ZERO_IS_OBSERVED",
      readImplementation: "profile=>profile.settlement.rest.guestUseEvents",
    },
    {
      id: "SETTLEMENT_RELOCATION_COUNT",
      dimension: "SETTLEMENT",
      metricPath: "profile.settlement.relocation.relocations",
      missingValuePolicy: "ZERO_IS_OBSERVED",
      readImplementation: "profile=>profile.settlement.relocation.relocations",
    },
  ],
  pairedMetricImplementation: {
    pairedMetricSummary:
      'function pairedMetricSummary(definition,leftBySeed,rightBySeed,pairedSeeds){const pairs=[];for(const seed of pairedSeeds){const left=leftBySeed.get(seed);const right=rightBySeed.get(seed);if(!left||!right)continue;const leftValue=definition.read(left.profile);const rightValue=definition.read(right.profile);if(leftValue===null||rightValue===null)continue;pairs.push({seed,leftValue,rightValue,delta:round(rightValue-leftValue)})}const deltas=pairs.map(pair=>pair.delta);const average=mean(deltas);const standardDeviation=sampleStandardDeviation(deltas);return{metricId:definition.id,dimension:definition.dimension,metricPath:definition.metricPath,missingValuePolicy:definition.missingValuePolicy??"ZERO_IS_OBSERVED",deltaDirection:"RIGHT_MINUS_LEFT",pairs,summary:{pairedSeedCount:pairs.length,meanDelta:average,medianDelta:median(deltas),meanAbsoluteDelta:mean(deltas.map(delta=>Math.abs(delta))),sampleStandardDeviationDelta:standardDeviation,positiveDeltas:deltas.filter(delta=>delta>0).length,zeroDeltas:deltas.filter(delta=>delta===0).length,negativeDeltas:deltas.filter(delta=>delta<0).length},effect:{method:"PAIRED_STANDARDIZED_MEAN_DELTA_COHEN_DZ",value:average===null||standardDeviation===null||standardDeviation===0?null:round(average/standardDeviation),interpretation:"DESCRIPTIVE_NON_CAUSAL"}}}',
    pairedScenarioComparisons:
      'function pairedScenarioComparisons(runs){const byScenario=new Map;for(const metadata of SCENARIO_CATALOG)byScenario.set(metadata.scenarioId,new Map);for(const run of runs)byScenario.get(run.scenario.scenarioId)?.set(run.scenario.seed,run);const comparisons=[];for(let leftIndex=0;leftIndex<SCENARIO_CATALOG.length;leftIndex+=1){const leftScenario=SCENARIO_CATALOG[leftIndex];if(!leftScenario)continue;for(let rightIndex=leftIndex+1;rightIndex<SCENARIO_CATALOG.length;rightIndex+=1){const rightScenario=SCENARIO_CATALOG[rightIndex];if(!rightScenario)continue;const leftBySeed=byScenario.get(leftScenario.scenarioId)??new Map;const rightBySeed=byScenario.get(rightScenario.scenarioId)??new Map;const pairedSeeds=[...leftBySeed.keys()].filter(seed=>rightBySeed.has(seed)).sort((left,right)=>left-right);comparisons.push({leftScenarioId:leftScenario.scenarioId,rightScenarioId:rightScenario.scenarioId,comparisonKind:"DESCRIPTIVE_CROSS_SCENARIO_NON_CAUSAL",pairedSeeds,metrics:MACRO_METRICS.map(definition=>pairedMetricSummary(definition,leftBySeed,rightBySeed,pairedSeeds))})}}return comparisons}',
    evaluatePairedSeedEligibility:
      'function evaluatePairedSeedEligibility(definition,observedSeeds,expectedSeeds){const uniqueObservedSeeds=[...new Set(observedSeeds)];const expectedSeedSet=new Set(expectedSeeds);if(uniqueObservedSeeds.length!==observedSeeds.length||uniqueObservedSeeds.some(seed=>!expectedSeedSet.has(seed))){return{eligible:false,reason:"Eligible paired seeds must be unique members of the locked corpus."}}if(definition.eligiblePairPolicy==="ALL_LOCKED_SEEDS"){if(definition.missingValuePolicy!=="ZERO_IS_OBSERVED"||definition.requiredPairedSeeds!==expectedSeeds.length){return{eligible:false,reason:"An all-seed band must declare ZERO_IS_OBSERVED and require the complete locked corpus."}}return sameNumbersWithCardinality(observedSeeds,expectedSeeds)?{eligible:true,reason:null}:{eligible:false,reason:`The metric must contain all ${expectedSeeds.length.toString()} locked paired seeds exactly once.`}}const thresholdValid=Number.isInteger(definition.requiredPairedSeeds)&&definition.requiredPairedSeeds>=1&&definition.requiredPairedSeeds<=expectedSeeds.length;if(definition.missingValuePolicy!=="EXCLUDE_PAIR_IF_EITHER_VALUE_MISSING"||!thresholdValid){return{eligible:false,reason:"A missing-value exclusion band must freeze an eligible-pair threshold within the locked corpus size."}}return observedSeeds.length>=definition.requiredPairedSeeds?{eligible:true,reason:null}:{eligible:false,reason:`The metric has ${observedSeeds.length.toString()} eligible paired seeds; the frozen minimum is ${definition.requiredPairedSeeds.toString()}.`}}',
    validateFrozenPairedMacroCorpus:
      'function validateFrozenPairedMacroCorpus(runs,context){const contract=CORPUS_CONTRACT[context.corpus];const observedSeedsByScenario=Object.fromEntries(SCENARIO_CATALOG.map(scenario=>[scenario.scenarioId,runs.filter(run=>run.scenario.scenarioId===scenario.scenarioId).map(run=>run.scenario.seed).sort((left,right)=>left-right)]));const base={expectedSeeds:contract.seeds,observedSeedsByScenario,expectedTicks:contract.ticks,observedTicks:context.requestedTicks};const supportedCorpus=context.corpus==="calibration"||context.corpus==="holdout"||context.corpus==="phase-4.2-calibration"||context.corpus==="phase-4.2-holdout";if(!supportedCorpus){return{...base,status:"NOT_FULL_CALIBRATION_OR_HOLDOUT",reason:"Frozen paired macro bands evaluate only the full calibration or full holdout corpus."}}const seedsMatch=sameNumbersWithCardinality(context.seeds,contract.seeds)&&SCENARIO_CATALOG.every(scenario=>sameNumbersWithCardinality(observedSeedsByScenario[scenario.scenarioId],contract.seeds));if(!seedsMatch){return{...base,status:"CORPUS_MISMATCH",reason:"Every catalog scenario must contain each locked seed exactly once before paired bands are evaluated."}}const horizonMatches=context.requestedTicks===contract.ticks&&runs.every(run=>run.profile.window.observedTicks===contract.ticks);if(!horizonMatches){return{...base,status:"HORIZON_MISMATCH",reason:"Every paired run must use the locked 10,000-tick horizon."}}if(context.corpus==="phase-4.2-calibration"){return phase42DefinitionsAreFrozenForContext(context)?{...base,status:"FULL_PHASE_4_2_CALIBRATION",reason:null}:{...base,status:"PHASE_4_2_CALIBRATION_CANDIDATE",reason:"Phase 4.2 discovery calibration reports candidate settlement effects; macro bands are not frozen."}}if(context.corpus==="phase-4.2-holdout"){return phase42DefinitionsAreFrozenForContext(context)?{...base,status:"FULL_PHASE_4_2_HOLDOUT",reason:null}:{...base,status:"PHASE_4_2_NOT_FROZEN",reason:"Phase 4.2 settlement macro bands are not frozen; the reserved holdout remains sealed."}}return{...base,status:context.corpus==="calibration"?"FULL_CALIBRATION":"FULL_HOLDOUT",reason:null}}',
    evaluateFrozenPairedMacroBands:
      'function evaluateFrozenPairedMacroBands(runs,comparisons,context){const corpusValidation2=validateFrozenPairedMacroCorpus(runs,context);const corpusEligible=corpusValidation2.status==="FULL_CALIBRATION"||corpusValidation2.status==="FULL_HOLDOUT"||corpusValidation2.status==="FULL_PHASE_4_2_CALIBRATION"||corpusValidation2.status==="FULL_PHASE_4_2_HOLDOUT";const phase42Context=context.corpus==="phase-4.2-calibration"||context.corpus==="phase-4.2-holdout";const expectedSeeds=corpusValidation2.expectedSeeds;const definitions=phase42Context?[...PAIRED_MACRO_BANDS,...context.phase42Definitions?.pairedMacroBands??PHASE_4_2_PAIRED_MACRO_BANDS]:PAIRED_MACRO_BANDS;const evaluations=definitions.map(definition=>{const comparison=comparisons.find(candidate=>candidate.leftScenarioId===definition.leftScenarioId&&candidate.rightScenarioId===definition.rightScenarioId);const metric=comparison?.metrics.find(candidate=>candidate.metricId===definition.metricId);const pairedSeeds=metric?.pairs.map(pair=>pair.seed)??[];const pairedSeedCount=metric?.summary.pairedSeedCount??0;const meanDelta=metric?.summary.meanDelta??null;const cohenDz=metric?.effect.value??null;const absoluteMeanDelta=meanDelta===null?null:Math.abs(meanDelta);const absoluteCohenDz=cohenDz===null?null:Math.abs(cohenDz);const pairEligibility=evaluatePairedSeedEligibility(definition,pairedSeeds,expectedSeeds);const pairedSeedCountMatches=pairedSeedCount===pairedSeeds.length;const missingValuePolicyMatches=metric?.missingValuePolicy===definition.missingValuePolicy;const evidencePresent=comparison!==void 0&&metric!==void 0&&pairedSeedCountMatches&&missingValuePolicyMatches&&pairEligibility.eligible&&absoluteMeanDelta!==null&&absoluteCohenDz!==null;const passed=evidencePresent&&absoluteMeanDelta>=definition.minimumAbsoluteMeanDelta&&absoluteCohenDz>=definition.minimumAbsoluteCohenDz;const status=!corpusEligible?"NOT_EVALUATED":evidencePresent?passed?"PASS":"FAIL":"FAIL";const reason=!corpusEligible?corpusValidation2.reason:comparison===void 0?"The frozen scenario pair is absent.":metric===void 0?"The frozen paired metric is absent.":!pairedSeedCountMatches?"The reported paired-seed count does not match the retained eligible pairs.":!missingValuePolicyMatches?"The observed metric does not use the frozen missing-value policy.":!pairEligibility.eligible?pairEligibility.reason:absoluteMeanDelta===null||absoluteCohenDz===null?"Both paired mean delta and Cohen dz must be present.":!passed?"The paired materiality magnitude is below one or both frozen thresholds.":null;return{tableVersion:definition.tableVersion,dimension:definition.dimension,leftScenarioId:definition.leftScenarioId,rightScenarioId:definition.rightScenarioId,metricId:definition.metricId,metricPath:definition.metricPath,status,pairedSeedCount,requiredPairedSeeds:definition.requiredPairedSeeds,missingValuePolicy:definition.missingValuePolicy,eligiblePairPolicy:definition.eligiblePairPolicy,meanDelta,absoluteMeanDelta,minimumAbsoluteMeanDelta:definition.minimumAbsoluteMeanDelta,cohenDz,absoluteCohenDz,minimumAbsoluteCohenDz:definition.minimumAbsoluteCohenDz,reason,provenance:definition.provenance}});const passingDimensions=[...new Set(evaluations.filter(evaluation=>evaluation.status==="PASS"&&evaluation.dimension!=="SETTLEMENT").map(evaluation=>evaluation.dimension))];const dimensionStatus=!corpusEligible?"NOT_EVALUATED":passingDimensions.length>=REQUIRED_PASSING_PHASE_3_MACRO_DIMENSIONS?"PASS":"FAIL";const passingSettlementBands=evaluations.filter(evaluation=>evaluation.status==="PASS"&&evaluation.dimension==="SETTLEMENT").length;const settlementStatus=!phase42Context||!corpusEligible?"NOT_EVALUATED":passingSettlementBands>=REQUIRED_PASSING_PHASE_4_2_SETTLEMENT_BANDS?"PASS":"FAIL";const overallStatus=phase42Context?!corpusEligible?"NOT_EVALUATED":dimensionStatus==="PASS"&&settlementStatus==="PASS"?"PASS":"FAIL":dimensionStatus;return{tableVersion:PAIRED_MACRO_BAND_TABLE_VERSION,status:overallStatus,bandEvaluationStatus:evaluationSummaryStatus(evaluations),releaseClaim:false,provenance:phase42Context?PHASE_4_2_CALIBRATION_PROVENANCE:PHASE_4_1_FROZEN_CALIBRATION_PROVENANCE,corpusValidation:corpusValidation2,evaluations,dimensionRequirement:{status:dimensionStatus,metricPath:"evaluations[status=PASS].dimension|distinctCount",observed:corpusEligible?passingDimensions.length:null,comparison:"GTE",threshold:REQUIRED_PASSING_PHASE_3_MACRO_DIMENSIONS,passingDimensions,reason:!corpusEligible?corpusValidation2.reason:dimensionStatus==="FAIL"?"Fewer than three distinct original Phase 3 macro dimensions pass their frozen materiality bands.":null},settlementRequirement:{status:settlementStatus,metricPath:"evaluations[dimension=SETTLEMENT,status=PASS]|count",observed:phase42Context&&corpusEligible?passingSettlementBands:null,comparison:"GTE",threshold:REQUIRED_PASSING_PHASE_4_2_SETTLEMENT_BANDS,reason:!phase42Context?"The historical Phase 4.1 macro table has no settlement gate.":!corpusEligible?corpusValidation2.reason:settlementStatus==="FAIL"?"No frozen SETTLEMENT materiality band passed.":null}}}',
    sameNumbersWithCardinality:
      "function sameNumbersWithCardinality(left,right){return left.length===right.length&&sameNumbers(left,right)}",
    round:
      "function round(value,decimalPlaces=6){const scale=10**decimalPlaces;return Math.round(value*scale)/scale}",
    mean: "function mean(values){return values.length===0?null:round(values.reduce((total,value)=>total+value,0)/values.length)}",
    median:
      "function median(values){if(values.length===0)return null;const sorted=[...values].sort((left2,right2)=>left2-right2);const middle=Math.floor(sorted.length/2);const right=sorted[middle];if(right===void 0)return null;if(sorted.length%2===1)return right;const left=sorted[middle-1];return left===void 0?right:round((left+right)/2)}",
    sampleStandardDeviation:
      "function sampleStandardDeviation(values){if(values.length<2)return null;const average=mean(values);if(average===null)return null;const variance=values.reduce((total,value)=>total+(value-average)**2,0)/(values.length-1);return round(Math.sqrt(variance))}",
  },
};
