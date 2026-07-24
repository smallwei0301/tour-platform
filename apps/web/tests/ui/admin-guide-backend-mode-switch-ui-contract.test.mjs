import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const helperPath = resolve(here, '../../src/lib/midao/admin-backend-mode-switch.mjs');
const page = readFileSync(
  resolve(here, '../../app/(non-locale)/admin/guides/[guideId]/page.tsx'),
  'utf8'
);

async function loadHelper() {
  assert.equal(existsSync(helperPath), true, 'runtime backend-mode switch helper missing');
  return import(`${pathToFileURL(helperPath).href}?t=${Date.now()}`);
}

test('admin guide detail wires the runtime switch helper and visible controls', () => {
  assert.match(page, /data-testid="admin-guide-backend-mode-badge"/u);
  assert.match(page, /data-testid="admin-guide-backend-mode-switch"/u);
  assert.match(page, /executeAdminBackendModeSwitch/u);
  assert.match(page, /canSwitchAdminGuideBackendMode/u);
});

test('runtime guard permits approved profiles only and blocks duplicate submissions', async () => {
  const { canSwitchAdminGuideBackendMode } = await loadHelper();
  assert.equal(canSwitchAdminGuideBackendMode({ kind: 'profile', verification_status: 'approved' }, false), true);
  assert.equal(canSwitchAdminGuideBackendMode({ kind: 'profile', verification_status: 'approved' }, true), false);
  assert.equal(canSwitchAdminGuideBackendMode({ kind: 'application', verification_status: 'approved' }, false), false);
  assert.equal(canSwitchAdminGuideBackendMode({ kind: 'profile', verification_status: 'pending' }, false), false);
  assert.equal(canSwitchAdminGuideBackendMode(null, false), false);
});

test('runtime reason validator rejects cancelled blank and oversized values', async () => {
  const { normalizeAdminBackendModeReason } = await loadHelper();
  assert.deepEqual(normalizeAdminBackendModeReason(null), { ok: false, cancelled: true });
  assert.deepEqual(normalizeAdminBackendModeReason('   '), { ok: false, cancelled: false, message: '切換原因必填，且不可超過 500 字' });
  assert.deepEqual(normalizeAdminBackendModeReason('x'.repeat(501)), { ok: false, cancelled: false, message: '切換原因必填，且不可超過 500 字' });
  assert.deepEqual(normalizeAdminBackendModeReason('  維運回切  '), { ok: true, reason: '維運回切' });
});

test('runtime command refreshes CSRF and sends exact idempotent request', async () => {
  const { executeAdminBackendModeSwitch } = await loadHelper();
  const calls = [];
  const result = await executeAdminBackendModeSwitch({
    guideId: 'guide-1',
    currentMode: 'legacy',
    reason: '灰度啟用',
  }, {
    ensureCsrfToken: async () => calls.push(['csrf']),
    csrfHeaders: () => ({ 'x-csrf-token': 'test-csrf' }),
    randomUUID: () => 'request-uuid',
    fetchImpl: async (url, init) => {
      calls.push(['fetch', url, init]);
      return { ok: true, json: async () => ({ success: true, data: { backendMode: 'midao' } }) };
    },
  });
  assert.deepEqual(result, { ok: true, backendMode: 'midao' });
  assert.deepEqual(calls[0], ['csrf']);
  const [, url, init] = calls[1];
  assert.equal(url, '/api/v2/admin/guides/guide-1/backend-mode');
  assert.equal(init.method, 'POST');
  assert.equal(init.headers['x-csrf-token'], 'test-csrf');
  assert.equal(init.headers['Idempotency-Key'], 'request-uuid');
  assert.deepEqual(JSON.parse(init.body), { backendMode: 'midao', reason: '灰度啟用' });
});

test('runtime command returns sanitized API failure and rejects malformed success', async () => {
  const { executeAdminBackendModeSwitch } = await loadHelper();
  const deps = {
    ensureCsrfToken: async () => {},
    csrfHeaders: () => ({}),
    randomUUID: () => 'request-uuid',
  };
  const failed = await executeAdminBackendModeSwitch({ guideId: 'guide-1', currentMode: 'midao', reason: '回切' }, {
    ...deps,
    fetchImpl: async () => ({ ok: false, json: async () => ({ success: false, error: { message: '功能暫停' } }) }),
  });
  assert.deepEqual(failed, { ok: false, message: '功能暫停' });

  const malformed = await executeAdminBackendModeSwitch({ guideId: 'guide-1', currentMode: 'legacy', reason: '啟用' }, {
    ...deps,
    fetchImpl: async () => ({ ok: true, json: async () => ({ success: true, data: { backendMode: 'legacy' } }) }),
  });
  assert.deepEqual(malformed, { ok: false, message: '切換導遊後台模式失敗' });
});
