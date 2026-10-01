import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { validateDispatch, preflight } from '../../../../scripts/agents/dispatch-preflight.mjs';

const root = new URL('../../../../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');
const dispatch = (extra = {}) => ({ phase: 'before', scope: 'tour-platform', role: 'build', provider: 'openai', model: 'gpt-6.1-sol', fork_turns: 'none', taskId: 'task-1', task: { kind: 'multi-step', requiresDiscovery: true }, scoutReceipt: { role: 'scout', provider: 'openai', model: 'gpt-6-luna', fork_turns: 'none', taskId: 'task-1', agentId: 'scout-1', output: 'report#scout', actual: 'unknown' }, ...extra });

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
  const receipt = dispatch({ phase: 'receipt', agentId: 'build-1', output: 'report#build', actual: 'unknown' });
  assert.equal(validateDispatch(receipt).ok, true);
  assert.equal(validateDispatch(receipt).identityStatus, 'NOT_VERIFIED');
  assert.equal(validateDispatch({ ...receipt, verified: true }).ok, false);
  assert.equal(validateDispatch({ ...receipt, actual: 'gpt-6.1-sol' }).ok, false);
  assert.equal(validateDispatch({ ...receipt, scoutReceipt: { ...receipt.scoutReceipt, verified: true } }).ok, false);
  assert.equal(validateDispatch({ ...receipt, scoutReceipt: { ...receipt.scoutReceipt, taskId: 'wrong' } }).ok, false);
});

test('CLI accepts stdin, emits JSON and exits nonzero on invalid dispatch', () => {
  const cli = new URL('scripts/agents/dispatch-preflight.mjs', root);
  const run = (input) => spawnSync(process.execPath, [cli.pathname, '-'], { input: JSON.stringify(input), encoding: 'utf8' });
  const valid = run(dispatch());
  assert.equal(valid.status, 0, valid.stderr);
  assert.equal(JSON.parse(valid.stdout).ok, true);
  const invalid = run(dispatch({ model: undefined }));
  assert.equal(invalid.status, 1);
  assert.ok(JSON.parse(invalid.stdout).errors.includes('EXPLICIT_MODEL_REQUIRED'));
});

test('Tour OpenAI builder routes to Sol 6.1 without changing Claude selectors', async () => {
  const policy = JSON.parse(await read('scripts/agents/model-routing.json'));
  assert.equal(policy.project, 'tour-platform');
  assert.equal(policy.models.build, 'gpt-6.1-sol');
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
  const input = premium({ ledgerPath: join(directory, 'ledger.json') });
  assert.equal((await preflight(input, { now })).ok, false);
  await writeFile(input.ledgerPath, JSON.stringify(ledgerFor(input)));
  const results = await Promise.all([preflight(input, { now }), preflight(input, { now })]);
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
  const receipt = { ...repaired, phase: 'receipt', output: 'review:sol', actual: 'unknown', verdict: 'PASS', unresolvedFindingCount: 0 };
  assert.equal(validateDispatch(receipt, { now }).ok, true);
  assert.equal(validateDispatch({ ...receipt, unresolvedFindingCount: 1 }, { now }).ok, false);
  assert.equal(validateDispatch({ ...receipt, unresolvedFindingCount: undefined }, { now }).ok, false);
});
