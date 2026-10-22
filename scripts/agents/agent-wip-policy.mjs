// Subset port of smallwei0301/vibeaico-admin-rebuild@ddd158733bc133094da43df1c140b9b3fb0633f5 scripts/agents/agent-wip-policy.mjs.
// Only the active-candidate cap is needed by score-run-current.mjs; VibeAI's PR lane-metadata
// validation is not ported. This number is the B+ scoring cap, not a tour-platform dispatch quota.
export const MAX_ACTIVE_CANDIDATES = 3;
