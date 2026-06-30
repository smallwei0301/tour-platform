// source-contract：關鍵 sweep 與 drift workflow 都接上「失敗通知（Telegram + Email）」，
// 且 drift workflow 跑通用 migrations-applied 檢查。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '../../../..');
const wf = (name) => readFileSync(join(ROOT, '.github/workflows', name), 'utf8');

const NOTIFY_WORKFLOWS = [
  'unpaid-expiry-sweep.yml',
  'refund-reconcile.yml',
  'settlement-sweep.yml',
  'pre-tour-reminder-sweep.yml',
  'review-invitation-sweep.yml',
  'migration-drift-detect.yml',
];

for (const name of NOTIFY_WORKFLOWS) {
  test(`${name}：含 if: failure() 的 notify-failure 步驟（Telegram + Email）`, () => {
    const y = wf(name);
    assert.match(y, /if:\s*failure\(\)/, 'should have a failure-gated step');
    assert.match(y, /scripts\/cron\/notify-failure\.mjs/);
    assert.match(y, /TELEGRAM_BOT_TOKEN/);
    assert.match(y, /RESEND_API_KEY/);
    // notify 用到 node 腳本 → 必須有 checkout
    assert.match(y, /actions\/checkout/);
  });
}

test('migration-drift-detect：跑通用 migrations-applied 檢查', () => {
  const y = wf('migration-drift-detect.yml');
  assert.match(y, /verify-migrations-applied\.mjs/);
});

test('alert-selftest：手動觸發、用 notify-failure 送測試告警', () => {
  const y = wf('alert-selftest.yml');
  assert.match(y, /workflow_dispatch/);
  assert.match(y, /scripts\/cron\/notify-failure\.mjs/);
  assert.match(y, /TELEGRAM_BOT_TOKEN/);
  assert.match(y, /RESEND_API_KEY/);
});

test('synthetic-health-probe：排程已退役（改用 UptimeRobot），保留手動觸發', () => {
  const y = wf('synthetic-health-probe.yml');
  assert.doesNotMatch(y, /cron:/);
  assert.match(y, /workflow_dispatch/);
});
