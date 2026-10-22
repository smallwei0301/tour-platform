// Subset port of smallwei0301/vibeaico-admin-rebuild@417263410475fcca2b83b71dcf389f75977e2acc scripts/agents/agent-wip-policy.mjs.
// Only the active-candidate cap is needed by score-run-current.mjs; VibeAI's PR lane-metadata
// validation is not ported. This number is the B+ scoring cap, not a tour-platform dispatch quota.
export const MAX_ACTIVE_CANDIDATES = 3;
