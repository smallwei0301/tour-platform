/**
 * Source-contract tests — 7 支 internal cron endpoints 必須接上
 * src/lib/cron-job-controls.mjs 的後台開關（isCronJobEnabled）與
 * 執行紀錄（recordCronRun），且開關檢查落在 auth guard 之後。
 *
 * Run:
 *   node --test apps/web/tests/api/cron-route-wiring.test.mjs
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = join(__dirname, '..', '..');

const ROUTES = [
  { jobKey: 'settlement_sweep', file: 'app/api/internal/settlement/sweep/route.ts' },
  { jobKey: 'settlement_generate_payouts', file: 'app/api/internal/settlement/generate-payouts/route.ts' },
  { jobKey: 'pre_tour_reminder_sweep', file: 'app/api/internal/reminders/pre-tour-sweep/route.ts' },
  { jobKey: 'review_invitation_sweep', file: 'app/api/internal/reviews/review-invitation-sweep/route.ts' },
  { jobKey: 'unpaid_expiry_sweep', file: 'app/api/internal/bookings/unpaid-expiry-sweep/route.ts' },
  { jobKey: 'ecpay_failure_sweep', file: 'app/api/internal/alerts/ecpay-failure-sweep/route.ts' },
  { jobKey: 'ecpay_reconcile', file: 'app/api/internal/payments/ecpay-reconcile/route.ts' },
];

for (const { jobKey, file } of ROUTES) {
  const src = readFileSync(join(WEB_ROOT, file), 'utf8');

  test(`${jobKey} — route 檔 import cron-job-controls.mjs`, () => {
    assert.match(
      src,
      /import\s*\{[^}]*isCronJobEnabled[^}]*\}\s*from\s*['"][^'"]*src\/lib\/cron-job-controls\.mjs['"]/,
      `${file} 必須從 src/lib/cron-job-controls.mjs import isCronJobEnabled`
    );
    assert.match(
      src,
      /import\s*\{[^}]*recordCronRun[^}]*\}\s*from\s*['"][^'"]*src\/lib\/cron-job-controls\.mjs['"]/,
      `${file} 必須從 src/lib/cron-job-controls.mjs import recordCronRun`
    );
  });

  test(`${jobKey} — 用正確 jobKey 呼叫 isCronJobEnabled`, () => {
    assert.match(
      src,
      new RegExp(`isCronJobEnabled\\(\\s*'${jobKey}'\\s*\\)`),
      `${file} 必須呼叫 isCronJobEnabled('${jobKey}')`
    );
    // 不得出現其他 jobKey 的 gate（防複製貼上錯 key）
    for (const other of ROUTES.map((r) => r.jobKey).filter((k) => k !== jobKey)) {
      assert.doesNotMatch(
        src,
        new RegExp(`isCronJobEnabled\\(\\s*'${other}'\\s*\\)`),
        `${file} 不應出現別支 job 的 isCronJobEnabled('${other}')`
      );
    }
  });

  test(`${jobKey} — 停用時回 skipped_by_admin`, () => {
    assert.match(src, /skipped_by_admin/, `${file} 必須有 skipped_by_admin no-op 回應`);
  });

  test(`${jobKey} — 至少一處 recordCronRun`, () => {
    const calls = src.match(/recordCronRun\(/g) ?? [];
    assert.ok(calls.length >= 1, `${file} 必須至少呼叫一次 recordCronRun`);
    assert.match(
      src,
      new RegExp(`recordCronRun\\(\\{\\s*jobKey:\\s*'${jobKey}'`),
      `${file} 的 recordCronRun 必須帶 jobKey: '${jobKey}'`
    );
  });

  test(`${jobKey} — isCronJobEnabled 落在 auth guard 之後`, () => {
    // 每支 route 的 POST handler 都以 isAuthorized(req)（x-internal-token 檢查）開頭
    const postIdx = src.indexOf('export async function POST');
    assert.ok(postIdx >= 0, `${file} 必須有 POST handler`);
    const authIdx = src.indexOf('isAuthorized(req)', postIdx);
    assert.ok(authIdx >= 0, `${file} 的 POST handler 必須呼叫 isAuthorized(req)`);
    const gateIdx = src.indexOf(`isCronJobEnabled('${jobKey}')`, postIdx);
    assert.ok(gateIdx >= 0, `${file} 的 POST handler 必須呼叫 isCronJobEnabled`);
    assert.ok(
      gateIdx > authIdx,
      `${file}: isCronJobEnabled 必須在 auth guard（isAuthorized / x-internal-token 檢查）之後`
    );
    // auth guard 本身確實是 x-internal-token 檢查
    assert.match(src, /x-internal-token/, `${file} 的 auth guard 必須讀 x-internal-token header`);
  });
}
