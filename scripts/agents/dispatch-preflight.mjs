import { readFile, open } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { pathToFileURL } from 'node:url';

const policy = JSON.parse(await readFile(new URL('./model-routing.json', import.meta.url), 'utf8'));
const present = (value) => typeof value === 'string' && value.trim().length > 0;

// Input validation only: callers retain responsibility for truthful tool receipts.
export function validateDispatch(input, { ledger, beforeRecord, beforeRecordSHA256, scoutCheck, now = Date.now() } = {}) {
  const errors = [];
  let sequenceStatus = 'NOT_VERIFIED';
  const require = (ok, code) => { if (!ok) errors.push(code); };
  require(['before', 'receipt'].includes(input.phase), 'PHASE_REQUIRED');
  require(['tour-platform', 'other'].includes(input.scope), 'SCOPE_REQUIRED');
  require(['scout', 'build', 'audit'].includes(input.role), 'ROLE_REQUIRED');
  require(['openai', 'claude'].includes(input.provider), 'PROVIDER_REQUIRED');
  require(present(input.model), 'EXPLICIT_MODEL_REQUIRED');
  const mapping = input.provider === 'claude' ? policy.claudeSelectors : policy.models;
  const premium = input.provider === 'openai' && input.model === policy.review.highRiskModel;
  const selectableBuild = input.provider === 'openai' && input.role === 'build';
  require(selectableBuild ? policy.build.allowedModels.includes(input.model) : input.model === mapping[input.role] || (premium && input.role === 'audit'), 'ROLE_MODEL_MISMATCH');
  if (selectableBuild) {
    const selection = input.buildSelection ?? {};
    require(present(selection.reason), 'BUILD_SELECTION_REASON_REQUIRED');
    require(typeof selection.complexity === 'string' && Object.hasOwn(policy.build.complexityRecommendations, selection.complexity), 'BUILD_COMPLEXITY_REQUIRED');
    if (selection.ownerModel !== undefined) {
      require(policy.build.allowedModels.includes(selection.ownerModel), 'OWNER_BUILD_MODEL_NOT_ALLOWED');
      require(input.model === selection.ownerModel, 'OWNER_BUILD_MODEL_CONFLICT');
    }
  }
  if (premium) {
    require(input.risk === 'high' && present(input.costReason), 'HIGH_RISK_COST_REASON_REQUIRED');
    require(present(input.ledgerPath) && ledger !== undefined, 'PERSISTENT_LEDGER_REQUIRED');
    validatePremium(input, ledger ?? {}, now, require);
  }
  if (input.fallback !== undefined) validateFallback(input, now, require);
  require(input.fork_turns === 'none', 'FRESH_CONTEXT_REQUIRED');
  require(present(input.taskId), 'TASK_ID_REQUIRED');
  require(present(input.runId), 'RUN_ID_REQUIRED');
  require(present(input.beforeRecordPath), 'BEFORE_RECORD_PATH_REQUIRED');
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
    require(scoutCheck?.ok === true, 'SCOUT_SEQUENCE_NOT_VERIFIED');
  }
  if (input.role === 'audit') {
    require(present(input.agentId) && present(input.implementerAgentId) && input.agentId !== input.implementerAgentId, 'INDEPENDENT_AUDITOR_REQUIRED');
    require(present(input.exactDiff), 'EXACT_DIFF_REQUIRED');
  }
  if (input.phase === 'receipt') {
    require(present(input.agentId) && present(input.output), 'AGENT_OUTPUT_REQUIRED');
    validateIdentity(input, require);
    require(input.beforePreflight === undefined || input.beforePreflight === 'PASS', 'BEFORE_PREFLIGHT_MISSED');
    require(beforeRecord?.status === 'PASS', 'BEFORE_RECORD_REQUIRED');
    require(beforeRecord?.runId === input.runId, 'BEFORE_RUN_MISMATCH');
    require(isDeepStrictEqual(beforeRecord?.dispatch, boundDispatch(input)), 'BEFORE_DISPATCH_BINDING_MISMATCH');
    const generated = timestamp(beforeRecord?.generatedAt);
    const dispatched = timestamp(input.dispatchedAt);
    const sequence = input.dispatchSequence;
    const toolOrder = sequence?.kind === 'tool-order';
    require(present(input.dispatchEvidenceRef), 'SEQUENCE_NOT_VERIFIED');
    // Supplied timestamps remain authoritative; tool order cannot hide invalid UTC.
    if (input.dispatchedAt !== undefined || !toolOrder) {
      require(Number.isFinite(dispatched), 'SEQUENCE_NOT_VERIFIED');
      require(Number.isFinite(generated) && generated < dispatched && dispatched <= now, 'BEFORE_DISPATCH_SEQUENCE_INVALID');
    }
    if (sequence !== undefined) {
      require(toolOrder, 'DISPATCH_SEQUENCE_KIND_INVALID');
      require(present(sequence.beforeEvidenceRef) && present(sequence.dispatchEvidenceRef), 'TOOL_ORDER_REFS_REQUIRED');
      require(sequence.beforeEvidenceRef !== sequence.dispatchEvidenceRef, 'TOOL_ORDER_DISTINCT_REFS_REQUIRED');
      require(sequence.dispatchEvidenceRef === input.dispatchEvidenceRef, 'TOOL_ORDER_DISPATCH_REF_MISMATCH');
      require(sequence.relation === 'before', 'TOOL_ORDER_RELATION_INVALID');
      require(typeof beforeRecordSHA256 === 'string' && sequence.beforeRecordSHA256 === beforeRecordSHA256, 'TOOL_ORDER_BEFORE_DIGEST_MISMATCH');
      require(Number.isFinite(generated) && generated <= now, 'BEFORE_RECORD_TIME_INVALID');
    }
    if (errors.length === 0) sequenceStatus = toolOrder ? 'TOOL_ORDER_EVIDENCE_RECORDED_NOT_PLATFORM_VERIFIED' : 'UTC_EVIDENCE_RECORDED_NOT_PLATFORM_VERIFIED';
    if (input.role === 'audit') {
      require(['PASS', 'FIX_REQUIRED', 'FAILED'].includes(input.verdict), 'REVIEW_VERDICT_REQUIRED');
      require(Number.isInteger(input.unresolvedFindingCount) && input.unresolvedFindingCount >= 0, 'FINDING_COUNT_REQUIRED');
      require(input.verdict !== 'PASS' || input.unresolvedFindingCount === 0, 'UNRESOLVED_FINDINGS_BLOCK_PASS');
    }
  }
  return { ok: errors.length === 0, errors, sequenceStatus, needsScout, independentDispatchRequired: input.scope === 'tour-platform' && ['scan', 'plan', 'multi-step'].includes(task.kind) || input.role === 'audit', identityStatus: input.phase === 'receipt' && input.actual !== 'unknown' && present(input.actual) && present(input.identityEvidence) ? 'EVIDENCE_RECORDED_NOT_RUNTIME_VERIFIED' : 'NOT_VERIFIED' };
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

// Bind dispatch intent, excluding receipt fields that only exist after execution.
function boundDispatch(input) {
  const keys = ['beforeRecordPath', 'scope', 'taskId', 'role', 'provider', 'model', 'fork_turns', 'task', 'buildSelection', 'exactDiff', 'agentId', 'implementerAgentId', 'scoutReceipt', 'risk', 'costReason', 'reviewLineage', 'requestedAt', 'executionRef', 'attempt', 'ledgerPath', 'fallback'];
  // Builder/Scout actor identity is supplied by the runtime only after dispatch.
  return JSON.parse(JSON.stringify(Object.fromEntries(keys.filter(key => input[key] !== undefined && (key !== 'agentId' || input.role === 'audit')).map(key => [key, input[key]]))));
}

// Only this entry point persists before proof. Receipt never creates or overwrites it.
export async function preflight(input, options = {}) {
  let ledger;
  let beforeRecord;
  let beforeRecordSHA256;
  if (input.model === policy.review.highRiskModel) {
    try { ledger = JSON.parse(await readFile(input.ledgerPath, 'utf8')); }
    catch { return { ok: false, errors: ['PERSISTENT_LEDGER_UNREADABLE'] }; }
  }
  if (input.phase === 'receipt') {
    try {
      const bytes = await readFile(input.beforeRecordPath);
      beforeRecordSHA256 = createHash('sha256').update(bytes).digest('hex');
      beforeRecord = JSON.parse(bytes.toString('utf8'));
    }
    catch { return { ok: false, errors: ['BEFORE_RECORD_UNREADABLE', ...(input.beforePreflight !== undefined && input.beforePreflight !== 'PASS' ? ['BEFORE_PREFLIGHT_MISSED'] : [])] }; }
  }
  const needsScout = input.scope === 'tour-platform' && input.role !== 'scout' && (['scan', 'plan'].includes(input.task?.kind) || (input.task?.kind === 'multi-step' && input.task.requiresDiscovery === true));
  let scoutCheck;
  if (needsScout && input.scoutReceipt?.role === 'scout') {
    // Scout role terminates nesting; completed discovery must have its own before proof.
    scoutCheck = await preflight({ ...input.scoutReceipt, phase: 'receipt' }, options);
  }
  const result = validateDispatch(input, { ...options, ledger, beforeRecord, beforeRecordSHA256, scoutCheck });
  if (scoutCheck && !scoutCheck.ok) result.errors.push(...scoutCheck.errors.map(code => `SCOUT_${code}`));
  if (!result.ok || input.phase !== 'before') return result;
  let record;
  try { record = await open(input.beforeRecordPath, 'wx', 0o600); }
  catch { return { ...result, ok: false, errors: ['BEFORE_RECORD_EXISTS_OR_CREATE_FAILED'] }; }
  try {
    // Validate and reserve the proof path before consuming premium budget.
    if (input.model === policy.review.highRiskModel) {
      try {
        const claim = await open(`${input.ledgerPath}.claim`, 'wx', 0o600);
        try { await claim.writeFile(JSON.stringify({ reviewLineage: input.reviewLineage, executionRef: input.executionRef, requestedAt: input.requestedAt })); }
        finally { await claim.close(); }
      } catch { return { ...result, ok: false, errors: ['PREMIUM_ALREADY_CLAIMED_OR_CLAIM_FAILED'] }; }
    }
    const proof = { status: 'PASS', runId: input.runId, generatedAt: new Date().toISOString(), dispatch: boundDispatch(input) };
    await record.writeFile(JSON.stringify(proof, null, 2) + '\n');
    await record.sync();
    return { ...result, beforeRecordPath: input.beforeRecordPath, generatedAt: proof.generatedAt };
  } catch { return { ...result, ok: false, errors: ['BEFORE_RECORD_WRITE_FAILED'] }; }
  finally { await record.close(); }
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
