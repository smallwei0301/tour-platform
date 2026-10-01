import test from 'node:test';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, writeFile, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { validateDispatch as rawValidateDispatch, preflight } from '../../../../scripts/agents/dispatch-preflight.mjs';

// Pure policy tests supply a checked Scout result; CLI tests exercise persisted proof.
const validateDispatch = (input, options = {}) => rawValidateDispatch(input, { scoutCheck: { ok: true }, ...options });

const root = new URL('../../../../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');
const dispatch = (extra = {}) => ({ phase: 'before', scope: 'tour-platform', role: 'build', provider: 'openai', model: 'gpt-6.1-sol', fork_turns: 'none', taskId: 'task-1', runId: 'run-1', beforeRecordPath: '/tmp/fixture-before.json', buildSelection: { complexity: 'complex', reason: 'Cross-module implementation' }, task: { kind: 'multi-step', requiresDiscovery: true }, scoutReceipt: { role: 'scout', provider: 'openai', model: 'gpt-6-luna', fork_turns: 'none', taskId: 'task-1', agentId: 'scout-1', output: 'report#scout', actual: 'unknown' }, ...extra });

const fixtureProof = (input) => {
  const keys = ['beforeRecordPath', 'scope', 'taskId', 'role', 'provider', 'model', 'fork_turns', 'task', 'buildSelection', 'exactDiff', 'agentId', 'implementerAgentId', 'scoutReceipt', 'risk', 'costReason', 'reviewLineage', 'requestedAt', 'executionRef', 'attempt', 'ledgerPath', 'fallback'];
  return { status: 'PASS', runId: input.runId, generatedAt: '2026-10-01T09:59:00Z', dispatch: JSON.parse(JSON.stringify(Object.fromEntries(keys.filter(key => input[key] !== undefined && (key !== 'agentId' || input.role === 'audit')).map(key => [key, input[key]])))) };
};
const receiptValidation = (input, options = {}) => validateDispatch(input, { beforeRecord: fixtureProof(input), now: Date.parse('2026-10-01T10:05:00Z'), ...options });

test('preflight maps Scout and rejects missing receipt or explicit model', () => {
  assert.equal(validateDispatch(dispatch()).ok, true);
  assert.equal(validateDispatch(dispatch({ role: 'scout', model: 'gpt-6-luna', scoutReceipt: undefined })).ok, true);
  assert.equal(validateDispatch(dispatch({ role: 'scout', model: 'gpt-6.1-sol' })).ok, false);
  assert.ok(validateDispatch(dispatch({ scoutReceipt: undefined })).errors.includes('SCOUT_RECEIPT_REQUIRED'));
  assert.ok(validateDispatch(dispatch({ model: undefined })).errors.includes('EXPLICIT_MODEL_REQUIRED'));
});

test('only documented small tasks bypass Scout with a reason', () => {
  for (const task of [{ kind: 'single-fact', reason: 'Known symbol, one lookup' }, { kind: 'small-edit', fileCount: 2, reason: 'Two local wording edits' }]) {
    assert.equal(validateDispatch(dispatch({ task, scoutReceipt: undefined })).ok, true);
  }
  assert.equal(validateDispatch(dispatch({ task: { kind: 'single-fact' }, scoutReceipt: undefined })).ok, false);
  assert.equal(validateDispatch(dispatch({ task: { kind: 'small-edit', fileCount: 3, reason: 'Too large' } })).ok, false);
  assert.equal(validateDispatch(dispatch({ task: { kind: 'governance', reason: 'Not an exception' } })).ok, false);
  assert.equal(validateDispatch(dispatch({ scope: 'other', task: { kind: 'multi-step', requiresDiscovery: false, reason: 'Outside Tour' }, scoutReceipt: undefined })).ok, true);
  const buildOnly = validateDispatch(dispatch({ task: { kind: 'multi-step', requiresDiscovery: false }, scoutReceipt: undefined }));
  assert.equal(buildOnly.ok, true);
  assert.equal(buildOnly.needsScout, false);
  assert.equal(buildOnly.independentDispatchRequired, true);
  assert.equal(validateDispatch(dispatch({ task: { kind: 'multi-step' } })).ok, false);
});

test('review requires fresh independent agent and exact diff binding', () => {
  const audit = dispatch({ role: 'audit', agentId: 'audit-1', implementerAgentId: 'build-1', exactDiff: 'sha256:fixture' });
  assert.equal(validateDispatch(audit).ok, true);
  assert.equal(validateDispatch({ ...audit, fork_turns: 'all' }).ok, false);
  assert.equal(validateDispatch({ ...audit, agentId: 'build-1' }).ok, false);
  assert.equal(validateDispatch({ ...audit, exactDiff: undefined }).ok, false);
});

test('unknown identity stays unverified and forged verified claims fail', () => {
  const receipt = dispatch({ dispatchedAt: '2026-10-01T10:00:00Z', dispatchEvidenceRef: 'fixture:tool-time', phase: 'receipt', agentId: 'build-1', output: 'report#build', actual: 'unknown' });
  assert.equal(receiptValidation(receipt).ok, true);
  assert.equal(receiptValidation(receipt).identityStatus, 'NOT_VERIFIED');
  assert.equal(receiptValidation({ ...receipt, verified: true }).ok, false);
  assert.equal(receiptValidation({ ...receipt, actual: 'gpt-6.1-sol' }).ok, false);
  assert.equal(receiptValidation({ ...receipt, scoutReceipt: { ...receipt.scoutReceipt, verified: true } }).ok, false);
  assert.equal(receiptValidation({ ...receipt, scoutReceipt: { ...receipt.scoutReceipt, taskId: 'wrong' } }).ok, false);
});

test('CLI accepts stdin, emits JSON and exits nonzero on invalid dispatch', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'tour-cli-'));
  let sequence = 0;
  const cli = new URL('scripts/agents/dispatch-preflight.mjs', root);
  const run = (input) => spawnSync(process.execPath, [cli.pathname, '-'], { input: JSON.stringify({ ...input, task: { kind: 'multi-step', requiresDiscovery: false }, beforeRecordPath: join(directory, `before-${sequence++}.json`) }), encoding: 'utf8' });
  const valid = run(dispatch());
  assert.equal(valid.status, 0, valid.stderr);
  assert.equal(JSON.parse(valid.stdout).ok, true);
  const luna = run(dispatch({ model: 'gpt-6-luna', buildSelection: { complexity: 'simple', reason: 'Clear small scope' } }));
  assert.equal(luna.status, 0, luna.stderr);
  const noReason = run(dispatch({ buildSelection: { complexity: 'complex' } }));
  assert.equal(noReason.status, 1);
  assert.ok(JSON.parse(noReason.stdout).errors.includes('BUILD_SELECTION_REASON_REQUIRED'));
  const arrayComplexity = run(dispatch({ buildSelection: { complexity: ['simple'], reason: 'Invalid array complexity' } }));
  assert.equal(arrayComplexity.status, 1);
  assert.ok(JSON.parse(arrayComplexity.stdout).errors.includes('BUILD_COMPLEXITY_REQUIRED'));
  const invalid = run(dispatch({ model: undefined }));
  assert.equal(invalid.status, 1);
  assert.ok(JSON.parse(invalid.stdout).errors.includes('EXPLICIT_MODEL_REQUIRED'));
});

test('Tour OpenAI builder defaults to Sol and allows explicit Sol or Luna without changing Claude selectors', async () => {
  const policy = JSON.parse(await read('scripts/agents/model-routing.json'));
  assert.equal(policy.project, 'tour-platform');
  assert.equal(policy.models.build, 'gpt-6.1-sol');
  assert.deepEqual(policy.build.allowedModels, ['gpt-6.1-sol', 'gpt-6-luna']);
  assert.deepEqual(policy.build.complexityRecommendations, { simple: 'gpt-6-luna', complex: 'gpt-6.1-sol' });
  assert.deepEqual(policy.claudeSelectors, { scout: 'haiku', build: 'sonnet', audit: 'opus' });
  assert.equal(policy.review.freshContextRequired, true);
  assert.equal(policy.review.implementerMaySelfApprove, false);
  assert.equal(policy.capacity.scope, 'tour-platform');
  assert.equal(policy.capacity.sharedWithOtherProjects, false);
  assert.equal(policy.capacity.importsVibeAiQuotas, false);
  assert.equal(policy.identity.requestedIsNotActual, true);
  assert.equal(policy.identity.unknownActual, 'unknown');
  assert.equal(policy.identity.rewriteHistoricalEvidence, false);
  await read(policy.ownerDecision);
  await read(policy.capacity.source);
});

test('existing Tour orchestration connects to the canonical policy and preserves limits', async () => {
  const harness = await read('.cursor/harness/02_orchestration.md');
  assert.match(harness, /docs\/AGENT-EXECUTION\.md/);
  assert.match(harness, /scripts\/agents\/model-routing\.json/);
  assert.match(harness, /同一件事最多重試兩輪/);
  assert.match(harness, /2–3 個獨立 subagent/);
  assert.match(harness, /實作者不得自我驗收/);
  const execution = await read('docs/AGENT-EXECUTION.md');
  assert.match(execution, /gpt-6\.1-sol/);
  assert.doesNotMatch(execution, /gpt-5\.6-terra/);
});

const now = Date.parse('2026-10-01T10:05:00Z');
const premium = (extra = {}) => dispatch({ role: 'audit', model: 'gpt-6-astra', agentId: 'audit-1', implementerAgentId: 'build-1', exactDiff: 'sha256:fixture', risk: 'high', costReason: 'Auth boundary adversarial review', reviewLineage: 'issue-1', requestedAt: '2026-10-01T10:00:00Z', executionRef: 'exec-1', attempt: 1, ledgerPath: '/tmp/test-ledger.json', ...extra });
const ledgerFor = (input) => ({ budgetKnown: true, premiumUsed: 1, reviewLineage: input.reviewLineage, reservations: [{ ...Object.fromEntries(['taskId', 'reviewLineage', 'requestedAt', 'executionRef', 'risk', 'exactDiff', 'costReason', 'attempt'].map(key => [key, input[key]])), requestedModel: input.model, state: 'RESERVED' }] });
const downgrade = (extra = {}) => dispatch({ role: 'audit', agentId: 'sol-review-1', implementerAgentId: 'build-1', exactDiff: 'sha256:repaired', reviewLineage: 'issue-1', fallback: { reason: 'START_TIMEOUT', evidenceRef: 'runtime:exec-1/receipt', reviewLineage: 'issue-1', executionRef: 'exec-1', requestedAt: '2026-10-01T10:00:00Z', runtimeEvidence: [] }, ...extra });

test('Astra is high-risk only and requires known bound single reservation', () => {
  const input = premium();
  const ledger = ledgerFor(input);
  assert.equal(validateDispatch(input, { ledger, now }).ok, true);
  assert.equal(validateDispatch(premium({ risk: 'normal' }), { ledger, now }).ok, false);
  assert.equal(validateDispatch(input, { now }).ok, false);
  assert.equal(validateDispatch(premium({ attempt: 2 }), { ledger, now }).ok, false);
  assert.equal(validateDispatch(input, { ledger: { ...ledger, budgetKnown: 'unknown' }, now }).ok, false);
  assert.equal(validateDispatch(input, { ledger: { ...ledger, premiumUsed: 0 }, now }).ok, false);
  assert.equal(validateDispatch(premium({ exactDiff: 'different-head' }), { ledger, now }).ok, false);
  assert.equal(validateDispatch(input, { ledger: { ...ledger, reservations: [...ledger.reservations, ledger.reservations[0]] }, now }).ok, false);
});

test('persistent ledger read and atomic claim permit only one concurrent dispatch', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'tour-premium-'));
  const input = premium({ task: { kind: 'multi-step', requiresDiscovery: false }, ledgerPath: join(directory, 'ledger.json'), beforeRecordPath: join(directory, 'before.json') });
  assert.equal((await preflight(input, { now })).ok, false);
  await writeFile(input.ledgerPath, JSON.stringify(ledgerFor(input)));
  const results = await Promise.all([preflight(input, { now }), preflight({ ...input, beforeRecordPath: join(directory, 'concurrent-before.json') }, { now })]);
  assert.equal(results.filter(result => result.ok).length, 1);
  assert.equal((await preflight(input, { now })).ok, false);
  assert.equal(JSON.parse(await readFile(`${input.ledgerPath}.claim`, 'utf8')).executionRef, 'exec-1');
});

test('timeout starts at requestedAt: 299 fails, 300 passes; queue cannot extend it', () => {
  const input = downgrade();
  assert.equal(validateDispatch(input, { now: now - 1000 }).ok, false);
  assert.equal(validateDispatch(input, { now }).ok, true);
  const event = { event: 'QUEUED', at: '2026-10-01T10:00:01Z', executionRef: 'exec-1', sourceRef: 'runtime:event-1' };
  const withEvent = (changes) => ({ ...input, fallback: { ...input.fallback, runtimeEvidence: [{ ...event, ...changes }] } });
  assert.equal(validateDispatch(withEvent({}), { now }).ok, true);
  for (const changes of [{ event: 'RUNNING' }, { event: 'TOKEN_GENERATED' }, { event: 'TOOL_EXECUTED' }, { executionRef: 'wrong' }, { at: '2026-10-01T10:05:01Z' }, { sourceRef: '' }, { at: 'bad' }]) {
    assert.equal(validateDispatch(withEvent(changes), { now }).ok, false);
  }
  assert.equal(validateDispatch(withEvent({ event: 'RUNNING', at: '2026-10-01T10:05:01Z' }), { now: now + 2000 }).ok, true);
});

test('failure/used/unknown budget downgrade to Sol, findings need repair and block PASS', () => {
  const input = downgrade();
  for (const reason of ['FIRST_FAILURE', 'PREMIUM_USED', 'UNKNOWN_BUDGET']) {
    assert.equal(validateDispatch({ ...input, fallback: { ...input.fallback, reason } }, { now }).ok, true);
  }
  assert.equal(validateDispatch({ ...input, fallback: { ...input.fallback, safetyRefusal: true } }, { now }).ok, false);
  const repaired = { ...input, fallback: { ...input.fallback, reason: 'FINDINGS_REPAIRED', priorFindingsReviewed: 'findings:each', repairEvidence: 'tests:negative-cases' } };
  assert.equal(validateDispatch(repaired, { now }).ok, true);
  assert.equal(validateDispatch({ ...repaired, fallback: { ...repaired.fallback, repairEvidence: undefined } }, { now }).ok, false);
  const receipt = { ...repaired, dispatchedAt: '2026-10-01T10:00:00Z', dispatchEvidenceRef: 'fixture:tool-time', phase: 'receipt', output: 'review:sol', actual: 'unknown', verdict: 'PASS', unresolvedFindingCount: 0 };
  assert.equal(receiptValidation(receipt, { now }).ok, true);
  assert.equal(receiptValidation({ ...receipt, unresolvedFindingCount: 1 }, { now }).ok, false);
  assert.equal(receiptValidation({ ...receipt, unresolvedFindingCount: undefined }, { now }).ok, false);
});


test('Builder selection follows complexity, requires reason and respects allowed Owner override', () => {
  const simple = dispatch({ model: 'gpt-6-luna', buildSelection: { complexity: 'simple', reason: 'Clear small scope' } });
  assert.equal(validateDispatch(simple).ok, true);
  assert.equal(validateDispatch(dispatch()).ok, true);
  for (const buildSelection of [undefined, { complexity: 'complex' }, { complexity: 'complex', reason: ' ' }, { reason: 'No complexity' }, { complexity: 'toString', reason: 'Invalid complexity' }]) {
    assert.equal(validateDispatch(dispatch({ buildSelection })).ok, false);
  }
  for (const complexity of [['simple'], ['complex'], {}, { value: 'simple' }, 1, null, true]) {
    assert.ok(validateDispatch(dispatch({ buildSelection: { complexity, reason: 'Invalid complexity type' } })).errors.includes('BUILD_COMPLEXITY_REQUIRED'));
  }
  assert.equal(validateDispatch({ ...simple, model: 'gpt-6.1-sol', buildSelection: { complexity: 'simple', reason: 'Small scope with important safety checks' } }).ok, true);
  assert.equal(validateDispatch(dispatch({ model: 'gpt-6-luna', buildSelection: { complexity: 'complex', reason: 'Commander chooses Luna for bounded complex task' } })).ok, true);
  for (const [model, complexity] of [['gpt-6.1-sol', 'simple'], ['gpt-6-luna', 'complex']]) {
    assert.equal(validateDispatch(dispatch({ model, buildSelection: { complexity, reason: 'Owner specified allowed model', ownerModel: model } })).ok, true);
  }
  assert.ok(validateDispatch(dispatch({ buildSelection: { complexity: 'complex', reason: 'Owner asks Luna', ownerModel: 'gpt-6-luna' } })).errors.includes('OWNER_BUILD_MODEL_CONFLICT'));
  for (const model of ['gpt-6-astra', 'gpt-5.6-terra', 'sonnet']) {
    assert.ok(validateDispatch(dispatch({ model, buildSelection: { complexity: 'complex', reason: 'Owner request', ownerModel: model } })).errors.includes('OWNER_BUILD_MODEL_NOT_ALLOWED'));
    assert.ok(validateDispatch(dispatch({ model })).errors.includes('ROLE_MODEL_MISMATCH'));
  }
  const audit = dispatch({ role: 'audit', model: 'gpt-6-luna', agentId: 'audit-1', implementerAgentId: 'build-1', exactDiff: 'sha256:fixture' });
  assert.ok(validateDispatch(audit).errors.includes('ROLE_MODEL_MISMATCH'));
  assert.ok(validateDispatch({ ...audit, model: 'gpt-6.1-sol', agentId: 'build-1' }).errors.includes('INDEPENDENT_AUDITOR_REQUIRED'));
  assert.equal(validateDispatch(dispatch({ provider: 'claude', model: 'sonnet', buildSelection: undefined, scoutReceipt: { ...dispatch().scoutReceipt, provider: 'claude', model: 'haiku' } })).ok, true);
});


test('single CLI persists before proof and rejects missing, late or changed receipt proof', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'tour-sequence-'));
  const cli = new URL('scripts/agents/dispatch-preflight.mjs', root);
  const run = (input) => {
    const processResult = spawnSync(process.execPath, [cli.pathname, '-'], { input: JSON.stringify(input), encoding: 'utf8' });
    return { status: processResult.status, result: JSON.parse(processResult.stdout || processResult.stderr) };
  };
  const input = dispatch({ beforeRecordPath: join(directory, 'before.json'), task: { kind: 'multi-step', requiresDiscovery: false }, scoutReceipt: undefined });
  const before = run(input);
  assert.equal(before.status, 0);
  assert.equal(before.result.needsScout, false);
  const recordText = await readFile(input.beforeRecordPath, 'utf8');
  const record = JSON.parse(recordText);
  assert.equal(record.generatedAt, before.result.generatedAt);
  assert.equal(record.runId, input.runId);
  assert.equal(run(input).status, 1); // wx prevents overwrite.
  const receipt = { ...input, phase: 'receipt', agentId: 'build-1', output: 'fixture:output', actual: 'unknown', dispatchedAt: new Date().toISOString(), dispatchEvidenceRef: 'fixture:tool-dispatch-time' };
  assert.equal(run(receipt).status, 0);
  assert.equal(await readFile(input.beforeRecordPath, 'utf8'), recordText);
  const missing = join(directory, 'missing.json');
  assert.equal(run({ ...receipt, beforeRecordPath: missing }).status, 1);
  await assert.rejects(access(missing)); // Receipt cannot generate missing proof.
  for (const changes of [
    { runId: 'other-run' }, { model: 'gpt-6-luna' }, { taskId: 'other-task' },
    { task: { kind: 'multi-step', requiresDiscovery: true } },
    { buildSelection: { complexity: 'simple', reason: 'Changed selection' } },
    { exactDiff: 'sha256:changed' }, { scope: 'other' }, { role: 'scout', model: 'gpt-6-luna' },
    { provider: 'claude', model: 'sonnet' }, { fork_turns: 'all' },
    { beforePreflight: 'MISSED' }, { beforePreflight: 'MISSED; not retroactively reconstructed' }, { beforePreflight: 'FAILED' }, { dispatchedAt: 'unknown' }, { dispatchEvidenceRef: undefined },
    { dispatchedAt: '2999-01-01T00:00:00Z' }, { dispatchedAt: record.generatedAt }
  ]) assert.equal(run({ ...receipt, ...changes }).status, 1, JSON.stringify(changes));
  const posthoc = join(directory, 'posthoc.json');
  await writeFile(posthoc, JSON.stringify({ ...record, dispatch: { ...record.dispatch, beforeRecordPath: posthoc }, generatedAt: new Date(Date.parse(receipt.dispatchedAt) + 1000).toISOString() }));
  assert.ok(run({ ...receipt, beforeRecordPath: posthoc }).result.errors.includes('BEFORE_DISPATCH_SEQUENCE_INVALID'));
  assert.ok(run({ ...receipt, dispatchedAt: 'unknown' }).result.errors.includes('SEQUENCE_NOT_VERIFIED'));
  assert.ok(run({ ...receipt, beforePreflight: 'MISSED' }).result.errors.includes('BEFORE_PREFLIGHT_MISSED'));
});

test('invalid before input or uncreatable proof path does not consume premium claim', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'tour-sequence-premium-'));
  const input = premium({ task: { kind: 'multi-step', requiresDiscovery: false }, ledgerPath: join(directory, 'ledger.json'), beforeRecordPath: join(directory, 'absent-parent', 'before.json') });
  await writeFile(input.ledgerPath, JSON.stringify(ledgerFor(input)));
  assert.equal((await preflight(input, { now })).ok, false);
  await assert.rejects(access(`${input.ledgerPath}.claim`));
  assert.equal((await preflight({ ...input, beforeRecordPath: join(directory, 'valid-before.json'), fork_turns: 'all' }, { now })).ok, false);
  await assert.rejects(access(`${input.ledgerPath}.claim`));
  await assert.rejects(access(join(directory, 'valid-before.json')));
});


test('discovery Builder requires persisted completed Scout sequence, not inline identity alone', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'tour-scout-sequence-'));
  const cli = new URL('scripts/agents/dispatch-preflight.mjs', root);
  const run = (input) => {
    const result = spawnSync(process.execPath, [cli.pathname, '-'], { input: JSON.stringify(input), encoding: 'utf8' });
    return { status: result.status, result: JSON.parse(result.stdout || result.stderr) };
  };
  const scout = dispatch({ role: 'scout', model: 'gpt-6-luna', runId: 'scout-run', beforeRecordPath: join(directory, 'scout-before.json'), task: { kind: 'scan' }, scoutReceipt: undefined, buildSelection: undefined });
  const completed = { ...scout, phase: 'receipt', agentId: 'scout-1', output: 'fixture:scout-output', actual: 'unknown', dispatchedAt: new Date().toISOString(), dispatchEvidenceRef: 'fixture:scout-tool-time' };
  const builder = dispatch({ beforeRecordPath: join(directory, 'builder-before.json'), scoutReceipt: completed });
  assert.equal(run(builder).status, 1);
  await assert.rejects(access(builder.beforeRecordPath));
  assert.equal(run(scout).status, 0);
  completed.dispatchedAt = new Date().toISOString();
  assert.equal(run({ ...builder, scoutReceipt: { ...completed, beforePreflight: 'MISSED; not retroactively reconstructed' } }).status, 1);
  assert.equal(run({ ...builder, scoutReceipt: { ...completed, dispatchedAt: 'unknown' } }).status, 1);
  assert.equal(run({ ...builder, scoutReceipt: { ...completed, runId: 'other-run' } }).status, 1);
  assert.equal(run({ ...builder, scoutReceipt: completed }).status, 0);
  assert.equal(rawValidateDispatch(builder).ok, false); // Unchecked inline Scout cannot pass pure validator.
});


test('tool-order evidence binds persisted digest and distinct ordered tool refs without inventing UTC', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'tour-tool-order-'));
  const cli = new URL('scripts/agents/dispatch-preflight.mjs', root);
  const run = (input) => {
    const result = spawnSync(process.execPath, [cli.pathname, '-'], { input: JSON.stringify(input), encoding: 'utf8' });
    return { status: result.status, result: JSON.parse(result.stdout || result.stderr) };
  };
  const scout = dispatch({ role: 'scout', model: 'gpt-6-luna', task: { kind: 'scan' }, buildSelection: undefined, scoutReceipt: undefined, beforeRecordPath: join(directory, 'scout.json') });
  assert.equal(run(scout).status, 0);
  const bytes = await readFile(scout.beforeRecordPath);
  const proof = JSON.parse(bytes);
  const sequence = { kind: 'tool-order', beforeEvidenceRef: 'fixture:exec/chunk-before', dispatchEvidenceRef: 'fixture:spawn/scout-task', beforeRecordSHA256: createHash('sha256').update(bytes).digest('hex'), relation: 'before' };
  const receipt = { ...scout, phase: 'receipt', agentId: 'scout-1', output: 'fixture:scout-output', actual: 'unknown', dispatchEvidenceRef: sequence.dispatchEvidenceRef, dispatchSequence: sequence };
  const result = run(receipt);
  assert.equal(result.status, 0);
  assert.equal(result.result.sequenceStatus, 'TOOL_ORDER_EVIDENCE_RECORDED_NOT_PLATFORM_VERIFIED');
  assert.equal(result.result.identityStatus, 'NOT_VERIFIED');
  for (const change of [
    { beforeEvidenceRef: '' }, { dispatchEvidenceRef: '' }, { beforeRecordSHA256: 'wrong' },
    { relation: 'after' }, { relation: undefined }, { kind: 'unknown' },
    { beforeEvidenceRef: sequence.dispatchEvidenceRef }, { dispatchEvidenceRef: 'fixture:other-spawn' }
  ]) assert.equal(run({ ...receipt, dispatchSequence: { ...sequence, ...change } }).status, 1, JSON.stringify(change));
  for (const dispatchedAt of ['unknown', 'invalid', '2999-01-01T00:00:00Z', proof.generatedAt, new Date(Date.parse(proof.generatedAt) - 1).toISOString()]) {
    assert.equal(run({ ...receipt, dispatchedAt }).status, 1, dispatchedAt);
  }
  assert.equal(run({ ...receipt, beforePreflight: 'MISSED; not retroactively reconstructed' }).status, 1);
  assert.equal(run({ ...receipt, beforeRecordPath: join(directory, 'missing.json') }).status, 1);
  await assert.rejects(access(join(directory, 'missing.json')));
  const builder = dispatch({ beforeRecordPath: join(directory, 'builder.json'), scoutReceipt: receipt });
  assert.equal(run(builder).status, 0); // Nested completed Scout accepts the same supported evidence mode.
});
