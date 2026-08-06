/** Changes only when deterministic simulation outcomes intentionally change. */
export const SIMULATION_BEHAVIOR_VERSION = 5 as const;

/** Version of the authoritative state stored inside SimulationState. */
export const SIMULATION_STATE_VERSION = 5 as const;

/** Public transport-contract versions. */
export const COMMAND_SCHEMA_VERSION = 3 as const;
export const SNAPSHOT_SCHEMA_VERSION = 5 as const;
export const REPLAY_SCHEMA_VERSION = 4 as const;
export const SAVE_SCHEMA_VERSION = 4 as const;
export const SCENARIO_SCHEMA_VERSION = 2 as const;
export const EXPERIMENT_SCHEMA_VERSION = 5 as const;
export const OUTCOME_SCHEMA_VERSION = 4 as const;
export const CAUSAL_EVIDENCE_SCHEMA_VERSION = 5 as const;
