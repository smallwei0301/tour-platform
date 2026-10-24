import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

for (const mode of ['control', 'recording']) {
  test(`public confirmation lifecycle: ${mode}`, () => {
    const env = { ...process.env, ISSUE1816_PROBE_MODE: mode };
    // A nested runner must not inherit the parent's child-v8 test protocol.
    delete env.NODE_TEST_CONTEXT;
    const child = spawnSync(process.execPath, [
      '--experimental-test-module-mocks', '--experimental-strip-types', '--test', '--test-reporter=tap',
      fileURLToPath(new URL('./fixtures/issue1816-access-probe.mjs', import.meta.url)),
    ], { env, encoding: 'utf8' });
    assert.equal(child.status, 0, child.stdout + child.stderr);
    assert.match(child.stdout, /^# tests 2$/m);
    assert.match(child.stdout, /^# pass 2$/m);
    assert.match(child.stdout, /^# skipped 0$/m);
  });
}
