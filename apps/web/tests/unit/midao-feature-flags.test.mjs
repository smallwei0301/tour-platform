import assert from 'node:assert/strict';
import test from 'node:test';

const {
  isMidaoBackendEnabled,
  isMidaoBackendMutationsEnabled,
  isMidaoBackendModeSwitchEnabled,
  isMidaoE2ELocal,
} = await import('../../src/config/feature-flags.mjs');

const flags = [
  ['MIDAO_BACKEND_ENABLED', isMidaoBackendEnabled],
  ['MIDAO_BACKEND_MUTATIONS_ENABLED', isMidaoBackendMutationsEnabled],
  ['MIDAO_BACKEND_MODE_SWITCH_ENABLED', isMidaoBackendModeSwitchEnabled],
];

test('all Midao backend flags are default-off and only accept the existing truthy contract', () => {
  for (const [flagName, readFlag] of flags) {
    assert.equal(readFlag({}), false);
    for (const value of [undefined, '', '0', 'false', 'no', 'off', 'enabled', '2']) {
      assert.equal(readFlag({ [flagName]: value }), false);
    }
    for (const value of ['1', 'true', 'yes', 'on', ' TRUE ', 'On']) {
      assert.equal(readFlag({ [flagName]: value }), true);
    }
  }
});

test('backend, mutation, and mode-switch flags do not imply one another', () => {
  for (const [enabledName, enabledFlag] of flags) {
    const env = { [enabledName]: '1' };
    for (const [, readFlag] of flags) {
      assert.equal(readFlag(env), readFlag === enabledFlag, `${enabledName} must only enable its own gate`);
    }
  }
});

test('local Midao E2E diagnostics use the centralized default-off truthy contract', () => {
  assert.equal(isMidaoE2ELocal({}), false);
  for (const value of [undefined, '', '0', 'false', 'no', 'off', 'enabled', '2']) {
    assert.equal(isMidaoE2ELocal({ MIDAO_E2E_LOCAL: value }), false);
  }
  for (const value of ['1', 'true', 'yes', 'on', ' TRUE ', 'On']) {
    assert.equal(isMidaoE2ELocal({ MIDAO_E2E_LOCAL: value }), true);
  }
});

test('forward switching requires backend plus mode-switch while rollback remains available', () => {
  const canSwitch = (from, to, env) => {
    if (from === 'midao' && to === 'legacy') return true;
    if (from === 'legacy' && to === 'midao') {
      return isMidaoBackendEnabled(env) && isMidaoBackendModeSwitchEnabled(env);
    }
    return false;
  };

  assert.equal(canSwitch('legacy', 'midao', {}), false);
  assert.equal(canSwitch('legacy', 'midao', { MIDAO_BACKEND_ENABLED: '1' }), false);
  assert.equal(canSwitch('legacy', 'midao', { MIDAO_BACKEND_MODE_SWITCH_ENABLED: '1' }), false);
  assert.equal(canSwitch('legacy', 'midao', {
    MIDAO_BACKEND_ENABLED: '1',
    MIDAO_BACKEND_MODE_SWITCH_ENABLED: '1',
  }), true);
  assert.equal(canSwitch('midao', 'legacy', {}), true);
  assert.equal(canSwitch('midao', 'legacy', {
    MIDAO_BACKEND_MUTATIONS_ENABLED: '0',
    MIDAO_BACKEND_MODE_SWITCH_ENABLED: '0',
  }), true);
});
