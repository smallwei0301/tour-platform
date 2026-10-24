import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter, errorMonitor } from 'node:events';
import { PassThrough } from 'node:stream';
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync, copyFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { observeFixtureChild } from '../../../../scripts/testing/fixture-child-diagnostics.mjs';

const require = createRequire(resolve(process.cwd(), 'package.json'));
const ts = require('typescript');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const sourceFile = 'apps/web/e2e/issue1882-upcoming-schedules.spec.ts';

async function exercise(sourceRoot, evidence, scenario) {
  const source = readFileSync(resolve(sourceRoot, sourceFile), 'utf8');
  const child = new EventEmitter();
  Object.assign(child, { pid: scenario === 'enoent' ? undefined : 1882, exitCode: null, signalCode: null, stdout: new PassThrough(), stderr: new PassThrough() });
  const hooks = {};
  const kills = [], timers = new Map();
  let fetches = 0, removed = false, saved;
  const persistenceError = Object.assign(new Error('mock cleanup diagnostic write failed'), { code: 'ENOSPC' });
  const original = Object.assign(new Error('spawn ENOENT'), { code: 'ENOENT' });
  const end = (code, signal) => {
    child.exitCode = code; child.signalCode = signal;
    child.emit('exit', code, signal);
    child.stdout.emit('end'); child.stderr.emit('end');
    child.emit('close', code, signal);
    child.stdout.emit('close'); child.stderr.emit('close');
  };
  child.kill = signal => {
    kills.push(signal);
    if (['live-timeout', 'cleanup-write-failure'].includes(scenario)) return true;
    if (scenario === 'delayed-close') {
      child.signalCode = signal;
      child.emit('exit', null, signal);
      queueMicrotask(() => { child.stdout.emit('end'); child.stderr.emit('end'); child.emit('close', null, signal); child.stdout.emit('close'); child.stderr.emit('close'); });
    } else end(null, signal);
    return true;
  };
  const launchEvents = () => {
    if (scenario === 'enoent') child.emit('error', original);
    if (scenario.startsWith('pre-exit')) { child.exitCode = 7; child.emit('exit', 7, null); }
    if (scenario === 'nonzero') end(7, null);
    if (scenario === 'signal') end(null, 'SIGTERM');
    if (scenario === 'observed-exit') { child.emit('exit', null, 'SIGKILL'); child.emit('close', null, 'SIGKILL'); child.stdout.emit('end'); child.stderr.emit('end'); child.stdout.emit('close'); child.stderr.emit('close'); }
    if (scenario === 'saturated') {
      child.stdout.emit('data', Buffer.alloc(20000, 'x'));
      child.stderr.emit('data', Buffer.from('stderr-final-tail'));
      end(9, null);
    }
  };
  const register = () => {};
  Object.assign(register, { use() {}, setTimeout() {}, beforeAll(fn) { hooks.before = fn; }, afterAll(fn) { hooks.after = fn; }, afterEach() {}, describe(_name, fn) { fn(); } });
  const expect = value => ({ toBe(expected) { assert.equal(value, expected); } });
  expect.poll = fn => ({ async toBe(expected) { launchEvents(); assert.equal(await fn(), expected); } });
  const stubs = {
    '@playwright/test': { test: register, expect },
    'node:child_process': { spawn() { return child; } },
    'node:fs': { writeFileSync(path, text) {
      assert.equal(path, '/tmp/tour-1882-loop-closure-child.json');
      const attempted = JSON.parse(text);
      if (scenario === 'cleanup-write-failure' && attempted.cleanupTimeout) throw persistenceError;
      saved = attempted;
      writeFileSync(resolve(evidence, `${scenario}.json`), text);
    } },
    'node:fs/promises': {
      async mkdtemp() { return '/tmp/mock-fixture-owned'; },
      async writeFile(path) { if (scenario === 'log-failure' && path.endsWith('server.log')) throw new Error('mock log write failed'); },
      async rm() { removed = true; if (scenario === 'rm-failure') throw new Error('mock rm failed'); },
    },
    'node:os': { tmpdir() { return '/tmp'; } },
    'node:path': require('node:path'),
    '../../../scripts/testing/fixture-child-diagnostics.mjs': { observeFixtureChild },
  };
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function('require', 'exports', 'process', 'fetch', 'setTimeout', 'clearTimeout', compiled)(name => {
    assert.ok(Object.hasOwn(stubs, name), `unexpected require: ${name}`); return stubs[name];
  }, {}, { execPath: '/mock/node', cwd: () => '/mock/web', env: { PLAYWRIGHT_NO_WEBSERVER: '1' }, versions: { node: '22.23.1' } }, async () => { fetches++; return { status: 200 }; }, (fn, milliseconds) => { timers.set(fn, milliseconds); return fn; }, fn => timers.delete(fn));
  let failure;
  try { await hooks.before(); } catch (error) { failure = error; }
  const beforeCleanup = saved && JSON.parse(JSON.stringify(saved));
  if (scenario === 'enoent') assert.equal(failure, original, 'original unhandled error is preserved');
  let cleanupFailure;
  const cleanup = hooks.after().catch(error => { cleanupFailure = error; });
  // Let the hook pass its async log write and install bounded cleanup timers.
  await Promise.resolve(); await Promise.resolve();
  if (scenario === 'pre-exit-late-close') {
    assert.equal(child.listenerCount('close'), 2, 'observer and cleanup both await close');
    child.stderr.emit('data', Buffer.from('late stderr after exit'));
    child.stdout.emit('end'); child.stderr.emit('end');
    child.stdout.emit('close'); child.stderr.emit('close');
    child.emit('close', 7, null);
  }
  if (['pre-exit-timeout', 'live-timeout', 'enoent', 'cleanup-write-failure'].includes(scenario)) {
    child.stderr.emit('data', Buffer.from('last stderr before deadline'));
    const force = [...timers].find(([, ms]) => ms === 5000);
    const limit = [...timers].find(([, ms]) => ms === 10000);
    assert.ok(force); assert.ok(limit);
    force[0]();
    assert.doesNotThrow(() => limit[0](), 'deadline callback never throws synchronously');
  }
  await cleanup;
  if (scenario === 'cleanup-write-failure') {
    assert.match(cleanupFailure.message, /did not close/);
    assert.equal(cleanupFailure.cause, persistenceError, 'persistence error identity remains observable');
    assert.equal(cleanupFailure.cause.code, 'ENOSPC');
    assert.equal(saved.cleanupTimeout, undefined, 'failed diagnostic write is never reported as persisted');
  }
  {
    assert.equal(removed, true);
    assert.equal(child.listenerCount(errorMonitor), 0);
    assert.equal(child.listenerCount('exit'), 0);
    assert.equal(child.listenerCount('close'), 0);
    assert.equal(child.stderr.listenerCount('data'), 1, 'original serverLog listener remains');
    assert.equal(timers.size, 0);
    if (['log-failure', 'rm-failure'].includes(scenario)) assert.match(cleanupFailure.message, /mock .* failed/);
  }
  return { failure, cleanupFailure, beforeCleanup, saved, kills, fetches, removed };
}

await test('self-contained spec cleanup keeps late close evidence and bounded timeout snapshots', async () => {
  const temporary = mkdtempSync(resolve(tmpdir(), 'fixture-wiring-unit-'));
  try {
    const relocated = resolve(temporary, 'repo');
    // Only the four delivered source files exist here; no adjacent base snapshot.
    for (const relative of [sourceFile, 'scripts/testing/fixture-child-diagnostics.mjs',
      'apps/web/tests/unit/fixture-child-diagnostics.test.mjs', 'apps/web/tests/unit/fixture-child-wiring.test.mjs']) {
      const destination = resolve(relocated, relative);
      mkdirSync(dirname(destination), { recursive: true });
      copyFileSync(resolve(root, relative), destination);
    }
    const observations = [];
    for (const scenario of ['pre-exit-late-close', 'pre-exit-timeout', 'live-timeout', 'enoent', 'live', 'saturated', 'cleanup-write-failure']) {
      const wired = await exercise(relocated, temporary, scenario);
      assert.ok(Buffer.byteLength(JSON.stringify(wired.saved)) < 40000);
      if (scenario === 'pre-exit-late-close') {
        assert.equal(wired.kills.length, 0, 'already exited child is never killed');
        assert.equal(wired.fetches, 0);
        assert.equal(wired.saved.close.close.code, 7);
        assert.equal(wired.saved.close.stderr.text, 'late stderr after exit');
        assert.equal(wired.saved.close.stderr.closed, true);
        assert.equal(wired.saved.cleanupTimeout, undefined);
      } else if (scenario === 'live') {
        assert.deepEqual(wired.kills, ['SIGTERM']);
        assert.equal(wired.saved.close.close.signal, 'SIGTERM');
      } else if (scenario === 'saturated') {
        assert.equal(wired.saved.exit.stderr.text, 'stderr-final-tail');
        assert.equal(wired.saved.close.close.code, 9);
        assert.equal(wired.saved.streams.stderr.closed, true);
        assert.deepEqual(wired.kills, []);
      } else if (scenario === 'cleanup-write-failure') {
        assert.match(wired.cleanupFailure.message, /did not close/);
        assert.equal(wired.cleanupFailure.cause.code, 'ENOSPC');
        assert.equal(wired.saved.cleanupTimeout, undefined);
        assert.deepEqual(wired.kills, ['SIGTERM', 'SIGKILL']);
      } else {
        assert.match(wired.cleanupFailure.message, /did not close/);
        assert.equal(wired.saved.close, undefined, 'deadline does not fabricate close');
        assert.equal(wired.saved.cleanupTimeout.close, null);
        assert.equal(wired.saved.cleanupTimeout.stderr.closed, false);
        assert.equal(wired.saved.cleanupTimeout.stderr.text, 'last stderr before deadline');
        assert.deepEqual(wired.kills, scenario === 'live-timeout' ? ['SIGTERM', 'SIGKILL'] : []);
      }
      if (scenario === 'enoent') assert.equal(wired.failure.code, 'ENOENT');
      observations.push({ scenario, cleanupError: wired.cleanupFailure && { message: wired.cleanupFailure.message, cause: wired.cleanupFailure.cause && { name: wired.cleanupFailure.cause.name, message: wired.cleanupFailure.cause.message, code: wired.cleanupFailure.cause.code } }, kills: wired.kills, fetches: wired.fetches, final: wired.saved });
    }
    writeFileSync(resolve(temporary, 'observations.json'), JSON.stringify(observations, null, 2));
    if (process.env.FIXTURE_CHILD_WIRING_EVIDENCE) {
      writeFileSync(process.env.FIXTURE_CHILD_WIRING_EVIDENCE, JSON.stringify(observations, null, 2));
    }
    console.log('fixture-wiring internal scenarios:', observations.length);
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});
