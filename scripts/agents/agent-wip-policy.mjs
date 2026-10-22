// Subset port of smallwei0301/vibeaico-admin-rebuild@0741fff37e114b6ebeec165352f1e68e1ee919ee scripts/agents/agent-wip-policy.mjs.
// Only the active-candidate cap is needed by score-run-current.mjs; VibeAI's PR lane-metadata
// validation is not ported. This number is the B+ scoring cap, not a tour-platform dispatch quota.
export const MAX_ACTIVE_CANDIDATES = 3;
