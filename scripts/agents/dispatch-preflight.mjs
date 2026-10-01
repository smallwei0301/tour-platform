import { readFile, open } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const policy = JSON.parse(await readFile(new URL('./model-routing.json', import.meta.url), 'utf8'));
const present = (value) => typeof value === 'string' && value.trim().length > 0;

// Input validation only: callers retain responsibility for truthful tool receipts.
export function validateDispatch(input, { ledger, now = Date.now() } = {}) {
  const errors = [];
  const require = (ok, code) => { if (!ok) errors.push(code); };
  require(['before', 'receipt'].includes(input.phase), 'PHASE_REQUIRED');
  require(['tour-platform', 'other'].includes(input.scope), 'SCOPE_REQUIRED');
  require(['scout', 'build', 'audit'].includes(input.role), 'ROLE_REQUIRED');
  require(['openai', 'claude'].includes(input.provider), 'PROVIDER_REQUIRED');
  require(present(input.model), 'EXPLICIT_MODEL_REQUIRED');
  const mapping = input.provider === 'claude' ? policy.claudeSelectors : policy.models;
  const premium = input.provider === 'openai' && input.model === policy.review.highRiskModel;
  require(input.model === mapping[input.role] || (premium && input.role === 'audit'), 'ROLE_MODEL_MISMATCH');
  if (premium) {
    require(input.risk === 'high' && present(input.costReason), 'HIGH_RISK_COST_REASON_REQUIRED');
    require(present(input.ledgerPath) && ledger !== undefined, 'PERSISTENT_LEDGER_REQUIRED');
    validatePremium(input, ledger ?? {}, now, require);
  }
  if (input.fallback !== undefined) validateFallback(input, now, require);
  require(input.fork_turns === 'none', 'FRESH_CONTEXT_REQUIRED');
  require(present(input.taskId), 'TASK_ID_REQUIRED');
  const task = input.task ?? {};
  const kinds = ['scan', 'plan', 'multi-step', 'small-edit', 'single-fact'];
  require(kinds.includes(task.kind), 'TASK_KIND_REQUIRED');
  const exception = ['small-edit', 'single-fact'].includes(task.kind);
  if (exception || input.scope === 'other') require(present(task.reason), 'EXCEPTION_REASON_REQUIRED');
  if (task.kind === 'small-edit') require(Number.isInteger(task.fileCount) && task.fileCount >= 1 && task.fileCount <= 2, 'SMALL_EDIT_MAX_TWO_FILES');
  if (task.kind === 'multi-step') require(typeof task.requiresDiscovery === 'boolean', 'DISCOVERY_DECLARATION_REQUIRED');
  const needsScout = input.scope === 'tour-platform' && (['scan', 'plan'].includes(task.kind) || (task.kind === 'multi-step' && task.requiresDiscovery === true));
  if (needsScout && input.role !== 'scout') {
    const scout = input.scoutReceipt ?? {};
    require(scout.role === 'scout', 'SCOUT_RECEIPT_REQUIRED');
    require(scout.provider === input.provider && scout.model === mapping.scout, 'SCOUT_MODEL_MISMATCH');
    require(scout.fork_turns === 'none', 'SCOUT_FRESH_CONTEXT_REQUIRED');
    require(scout.taskId === input.taskId, 'SCOUT_TASK_MISMATCH');
    require(present(scout.agentId) && present(scout.output), 'SCOUT_AGENT_OUTPUT_REQUIRED');
    validateIdentity(scout, require);
  }
  if (input.role === 'audit') {
    require(present(input.agentId) && present(input.implementerAgentId) && input.agentId !== input.implementerAgentId, 'INDEPENDENT_AUDITOR_REQUIRED');
    require(present(input.exactDiff), 'EXACT_DIFF_REQUIRED');
  }
  if (input.phase === 'receipt') {
    require(present(input.agentId) && present(input.output), 'AGENT_OUTPUT_REQUIRED');
    validateIdentity(input, require);
    if (input.role === 'audit') {
      require(['PASS', 'FIX_REQUIRED', 'FAILED'].includes(input.verdict), 'REVIEW_VERDICT_REQUIRED');
      require(Number.isInteger(input.unresolvedFindingCount) && input.unresolvedFindingCount >= 0, 'FINDING_COUNT_REQUIRED');
      require(input.verdict !== 'PASS' || input.unresolvedFindingCount === 0, 'UNRESOLVED_FINDINGS_BLOCK_PASS');
    }
  }
  return { ok: errors.length === 0, errors, needsScout, independentDispatchRequired: input.scope === 'tour-platform' && ['scan', 'plan', 'multi-step'].includes(task.kind) || input.role === 'audit', identityStatus: input.phase === 'receipt' && input.actual !== 'unknown' && present(input.actual) && present(input.identityEvidence) ? 'EVIDENCE_RECORDED_NOT_RUNTIME_VERIFIED' : 'NOT_VERIFIED' };
}

const timestamp = (value) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value) ? Date.parse(value) : NaN;

function validatePremium(input, ledger, now, require) {
  require(present(input.reviewLineage), 'REVIEW_LINEAGE_REQUIRED');
  require(input.attempt === 1, 'PREMIUM_SINGLE_ATTEMPT');
  require(Number.isFinite(timestamp(input.requestedAt)) && timestamp(input.requestedAt) <= now, 'REQUESTED_AT_REQUIRED');
  require(present(input.executionRef), 'EXECUTION_REF_REQUIRED');
  require(ledger.budgetKnown === true && ledger.premiumUsed === 1, 'KNOWN_RESERVED_BUDGET_REQUIRED');
  require(Array.isArray(ledger.reservations) && ledger.reservations.length === 1, 'SINGLE_LINEAGE_RESERVATION_REQUIRED');
  const reservation = ledger.reservations?.[0] ?? {};
  for (const key of ['taskId', 'reviewLineage', 'requestedAt', 'executionRef', 'risk', 'exactDiff', 'costReason', 'attempt']) {
    require(input[key] !== undefined && reservation[key] === input[key], `LEDGER_BINDING_${key.toUpperCase()}`);
  }
  require(ledger.reviewLineage === input.reviewLineage && reservation.requestedModel === input.model, 'LEDGER_MODEL_LINEAGE_MISMATCH');
  require(reservation.state === 'RESERVED', 'PREMIUM_RESERVATION_REQUIRED');
}

function validateFallback(input, now, require) {
  const fallback = input.fallback ?? {};
  require(input.role === 'audit' && input.provider === 'openai' && input.model === policy.premium.fallbackModel, 'FALLBACK_SOL_REVIEW_REQUIRED');
  require(present(input.reviewLineage) && fallback.reviewLineage === input.reviewLineage && present(fallback.evidenceRef), 'FALLBACK_LINEAGE_EVIDENCE_REQUIRED');
  require(['FIRST_FAILURE', 'START_TIMEOUT', 'PREMIUM_USED', 'UNKNOWN_BUDGET', 'FINDINGS_REPAIRED'].includes(fallback.reason), 'FALLBACK_REASON_REQUIRED');
  require(fallback.safetyRefusal !== true, 'SAFETY_REFUSAL_NOT_MODEL_FAILURE');
  if (fallback.reason === 'FINDINGS_REPAIRED') require(present(fallback.priorFindingsReviewed) && present(fallback.repairEvidence), 'FINDING_REPAIR_EVIDENCE_REQUIRED');
  if (fallback.reason === 'START_TIMEOUT') {
    const start = timestamp(fallback.requestedAt);
    require(Number.isFinite(start) && now - start >= 300_000, 'START_TIMEOUT_NOT_REACHED');
    require(present(fallback.executionRef), 'TIMEOUT_EXECUTION_REF_REQUIRED');
    const events = fallback.runtimeEvidence ?? [];
    require(Array.isArray(events), 'RUNTIME_EVIDENCE_ARRAY_REQUIRED');
    for (const event of Array.isArray(events) ? events : []) {
      const at = timestamp(event.at);
      require(present(event.sourceRef) && event.executionRef === fallback.executionRef && Number.isFinite(at) && at >= start && at <= now, 'INVALID_RUNTIME_EVIDENCE');
      const executed = ['RUNNING', 'TOKEN_GENERATED', 'TOOL_EXECUTED'].includes(event.event);
      require(!(executed && at <= start + 300_000), 'EXECUTION_STARTED_WITHIN_DEADLINE');
    }
  }
}

// Read caller-owned durable state, then atomically consume this reservation.
// A successful claim stays consumed even if the subsequent tool dispatch fails.
export async function preflight(input, options = {}) {
  let ledger;
  if (input.model === policy.review.highRiskModel) {
    try { ledger = JSON.parse(await readFile(input.ledgerPath, 'utf8')); }
    catch { return { ok: false, errors: ['PERSISTENT_LEDGER_UNREADABLE'] }; }
  }
  const result = validateDispatch(input, { ...options, ledger });
  if (result.ok && input.phase === 'before' && input.model === policy.review.highRiskModel) {
    try {
      const claim = await open(`${input.ledgerPath}.claim`, 'wx', 0o600);
      try { await claim.writeFile(JSON.stringify({ reviewLineage: input.reviewLineage, executionRef: input.executionRef, requestedAt: input.requestedAt })); }
      finally { await claim.close(); }
    } catch { return { ...result, ok: false, errors: ['PREMIUM_ALREADY_CLAIMED_OR_CLAIM_FAILED'] }; }
  }
  return result;
}

function validateIdentity(receipt, require) {
  require(present(receipt.actual), 'ACTUAL_REQUIRED_USE_UNKNOWN');
  // Even a supplied evidence reference cannot be independently authenticated here.
  require(receipt.verified !== true, 'RUNTIME_VERIFIED_CLAIM_UNSUPPORTED');
  if (present(receipt.actual) && receipt.actual !== 'unknown') require(present(receipt.identityEvidence), 'IDENTITY_EVIDENCE_REQUIRED');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const source = process.argv[2];
    if (!source || process.argv.length !== 3) throw new Error('Usage: node scripts/agents/dispatch-preflight.mjs <input.json|->');
    let body;
    if (source === '-') {
      body = '';
      for await (const chunk of process.stdin) body += chunk;
    } else body = await readFile(source, 'utf8');
    const input = JSON.parse(body);
    const result = await preflight(input);
    console.log(JSON.stringify(result, null, 2));
    process.exitCode = result.ok ? 0 : 1;
  } catch (error) {
    console.error(JSON.stringify({ ok: false, errors: ['INVALID_INPUT'], message: error.message }));
    process.exitCode = 1;
  }
}
