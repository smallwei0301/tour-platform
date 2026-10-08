import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { formatExpectedTerminalFailure } from '../../../../scripts/testing/format-expected-terminal-failure.mjs';

const source = readFileSync(new URL('../../../../scripts/database-baseline/build-expected-terminal.mjs', import.meta.url), 'utf8');
const runner = readFileSync(new URL('../../../../scripts/testing/with-midao-local-supabase.mjs', import.meta.url), 'utf8');
const begin = source.indexOf('async function buildWithAdapters(options = {}) {');
const end = source.indexOf('\nexport async function buildExpectedTerminalPrepared', begin);
assert.ok(begin > 0 && end > begin);
const build = vm.runInNewContext('(' + source.slice(begin, end) + ')', { Buffer, Error, AggregateError });
const redactorSource = runner.match(/export function redactSupabaseOutput\(text, secrets = \[\]\) \{[\s\S]*?\n\}/u)?.[0];
const catcherSource = source.match(/main\(\)\.catch\((\(error\) => \{[\s\S]*?\n  \})\);/u)?.[1];
assert.ok(redactorSource && catcherSource, 'test must execute the real canonical redactor and CLI callback');
const redact = vm.runInNewContext('(' + redactorSource.replace('export ', '') + ')');
function cli(error, overrides = {}) {
  let output = '';
  const processSpy = { exitCode: undefined, stderr: { write: text => { output += text; } } };
  const catcher = vm.runInNewContext('(' + catcherSource + ')', {
    Error, process: processSpy, redactSupabaseOutput: redact, formatExpectedTerminalFailure, ...overrides,
  });
  catcher(error);
  return { output, exitCode: processSpy.exitCode };
}

test('real builder preserves primary/cleanup causes and CLI renders both while failing closed', async () => {
  const primary = new Error('SUPABASE_START_FAILED: synthetic-primary');
  const cleanup = new Error('materialized replay must restore before cleanup');
  let cleanups = 0, disposals = 0, starts = 0, error;
  try {
    await build({
      runs: 2,
      verifyCapture: async () => ({ transactionId: 'synthetic', manifest: { transactionId: 'synthetic' },
        ledger: { transactionId: 'synthetic' }, dispose: () => { disposals += 1; } }),
      materialize: async () => ({ cleanup: async () => { cleanups += 1; throw cleanup; } }),
      runLocal: async () => { starts += 1; throw primary; },
      extractTerminal: async () => { throw new Error('must not extract'); },
    });
  } catch (failure) { error = failure; }
  assert.ok(error instanceof AggregateError);
  assert.deepEqual(Array.from(error.errors), [primary, cleanup]);
  assert.deepEqual([cleanups, disposals, starts], [1, 1, 1]);
  const result = cli(error);
  assert.equal(result.exitCode, 1);
  assert.match(result.output, /root: local build and materializer cleanup failed/u);
  assert.match(result.output, /root\.errors\[0\]: SUPABASE_START_FAILED/u);
  assert.match(result.output, /root\.errors\[1\]: materialized replay must restore before cleanup/u);
});

test('unknown messages/stacks/commands and credential-bearing prefix tails never reach diagnostics', () => {
  const sensitive = 'synthetic-private-token postgres://fake:synthetic-password@127.0.0.1/postgres service_role_key=fake-secret command --password fake-command-secret';
  const primary = new Error('SUPABASE_START_FAILED: ' + sensitive, { cause: new Error(sensitive) });
  primary.stack = sensitive;
  const cleanup = Object.assign(new Error(sensitive), { code: 'ENOTEMPTY', path: sensitive, syscall: sensitive });
  const result = cli(new AggregateError([primary, cleanup], 'local build and materializer cleanup failed'));
  for (const forbidden of ['synthetic-private-token', 'postgres://', 'synthetic-password', 'fake-secret', 'fake-command-secret', '--password']) {
    assert.ok(!result.output.includes(forbidden), forbidden);
  }
  assert.match(result.output, /SUPABASE_START_FAILED/u);
  assert.match(result.output, /root\.errors\[0\]\.cause: \[REDACTED_ERROR\]/u);
  assert.match(result.output, /root\.errors\[1\]: ENOTEMPTY/u);
  assert.equal(result.exitCode, 1);
});

test('canonical sanitizer is still invoked and its failure never escapes formatting', () => {
  let calls = 0;
  const result = formatExpectedTerminalFailure(new Error('NODE_TOOLCHAIN_MISMATCH'), text => {
    calls += 1; return redact(text).replace('NODE_TOOLCHAIN_MISMATCH', '[canonical-filter]');
  });
  assert.equal(calls, 1);
  assert.match(result, /\[canonical-filter\]/u);
  for (const sanitize of [undefined, () => { throw new Error('synthetic-secret'); }, () => ({ secret: 'fake' })]) {
    assert.equal(formatExpectedTerminalFailure(new Error('NODE_TOOLCHAIN_MISMATCH'), sanitize),
      'expected-terminal-failure: diagnostics unavailable');
  }
});

test('cycles and shared cause objects are finite; depth and wide aggregates report truncation', () => {
  const cycle = new AggregateError([], 'local build and materializer cleanup failed');
  cycle.errors.push(cycle);
  assert.match(formatExpectedTerminalFailure(cycle, redact), /root\.errors\[0\]: \[CYCLE\]/u);
  let deep = new Error('ENOENT');
  for (let i = 0; i < 10; i += 1) deep = new Error('NODE_TOOLCHAIN_MISMATCH', { cause: deep });
  assert.match(formatExpectedTerminalFailure(deep, redact), /\[TRUNCATED\]/u);
  const wide = new AggregateError(Array.from({ length: 100 }, () => new Error('ENOENT')), 'materialized cleanup failed');
  const output = formatExpectedTerminalFailure(wide, redact);
  assert.equal(output.split('\n').length, 17);
  assert.match(output, /\[TRUNCATED\]/u);
  assert.ok(output.length < 4096);
});

test('diagnostics never call exception getters, inherited values or string coercion', () => {
  let getters = 0;
  const hostile = { toString() { throw new Error('coercion'); } };
  for (const key of ['message', 'code', 'cause', 'errors', 'stack']) {
    Object.defineProperty(hostile, key, { get() { getters += 1; throw new Error('private'); } });
  }
  assert.equal(formatExpectedTerminalFailure(hostile, redact), 'root: [REDACTED_ERROR]');
  assert.equal(getters, 0);
  assert.equal(formatExpectedTerminalFailure(Object.create({ message: 'ENOENT' }), redact), 'root: [REDACTED_ERROR]');
});

test('CLI retains exit 1 even if formatting or stderr output fails', () => {
  assert.equal(cli(new Error('NODE_TOOLCHAIN_MISMATCH'), {
    formatExpectedTerminalFailure: () => { throw new Error('formatting failure'); },
  }).exitCode, 1);
  const processSpy = { exitCode: undefined, stderr: { write() { throw new Error('write failure'); } } };
  cli(new Error('NODE_TOOLCHAIN_MISMATCH'), { process: processSpy });
  assert.equal(processSpy.exitCode, 1);
});

test('real published lifecycle validator retains its category and drops raw stderr under builder cleanup failure', async () => {
  const validatorSource = runner.slice(runner.indexOf('export function validateSupabaseLifecycleStderr('),
    runner.indexOf('\nexport function validateCliWorkdirNotice(')).replace('export ', '');
  const stripSource = runner.slice(runner.indexOf('function stripPinnedUpdateNotice('),
    runner.indexOf('\nexport function validateSupabaseLifecycleStderr('));
  const validate = vm.runInNewContext('(' + validatorSource + ')', { Error, isAbsolute: path.isAbsolute,
    redactSupabaseOutput: redact, stripPinnedUpdateNotice: vm.runInNewContext('(' + stripSource + ')') });
  let primary, error;
  try {
    await build({
      runs: 2,
      verifyCapture: async () => ({ transactionId: 'synthetic', manifest: { transactionId: 'synthetic' },
        ledger: { transactionId: 'synthetic' }, dispose() {} }),
      materialize: async () => ({ cleanup: async () => { throw new Error('materialized replay must restore before cleanup'); } }),
      runLocal: async () => {
        try { validate('Using workdir /synthetic-owned\nStarting database...\n' + 'synthetic-private-token '.repeat(500)
          + 'postgres://fake:synthetic-password@127.0.0.1/postgres\n',
          { expectedWorkdir: '/synthetic-owned', stage: 'start', migrationNames: ['00000000000000_midao_history_bootstrap.sql'], noticesByMigration: {} }); }
        catch (failure) { primary = failure; throw failure; }
      },
      extractTerminal: async () => { throw new Error('unreachable'); },
    });
  } catch (failure) { error = failure; }
  assert.ok(primary.message.startsWith('CLI_UNEXPECTED_STDERR: '));
  assert.ok(primary.message.length > 8192, 'large raw tails must not erase a fixed safe category');
  assert.ok(error instanceof AggregateError);
  const result = cli(error);
  assert.equal(result.exitCode, 1);
  assert.match(result.output, /root\.errors\[0\]: CLI_UNEXPECTED_STDERR/u);
  for (const privateValue of ['synthetic-private-token', 'synthetic-password', 'postgres://', '/synthetic-owned', 'Starting database']) {
    assert.ok(!result.output.includes(privateValue));
  }
});

test('real published builder parser keeps the safe fixed invalid-arguments category', () => {
  const parserSource = source.slice(source.indexOf('export function parseBuilderArgs('),
    source.indexOf('\nexport function assertNoAmbientDatabaseEnv(')).replace('export ', '');
  const parse = vm.runInNewContext('(' + parserSource + ')', { Error, path, process: { cwd: () => '/synthetic-owned' } });
  let error; try { parse([]); } catch (failure) { error = failure; }
  assert.equal(error.message, 'builder CLI arguments invalid');
  const result = cli(error);
  assert.equal(result.exitCode, 1);
  assert.equal(result.output, 'root: builder CLI arguments invalid\n');
});
