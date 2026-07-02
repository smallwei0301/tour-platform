/**
 * Unit tests for src/lib/cron-job-controls.mjs — cron 後台開關與執行紀錄 lib。
 *
 * 覆蓋：
 *   1. CRON_JOBS registry 完整性（7 筆、jobKey 唯一、欄位齊全）
 *   2. in-memory fallback（無 Supabase env）：開關預設 enabled、停用、
 *      unknown jobKey、執行紀錄寫入/讀回、test reset
 *   3. fail-open 契約：getCronJobControls 對所有 key 回物件且預設 enabled
 *
 * Run:
 *   node --test apps/web/tests/api/cron-job-controls.test.mjs
 */

import test from 'node:test';
import assert from 'node:assert/strict';

// 強制走 in-memory fallback（hasSupabaseEnv() 在呼叫時讀 env，import 前清掉即可）
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

const {
  CRON_JOBS,
  CRON_JOB_KEYS,
  isCronJobEnabled,
  getCronJobControls,
  setCronJobControl,
  recordCronRun,
  listRecentCronRuns,
  __resetCronControlsForTest,
} = await import('../../src/lib/cron-job-controls.mjs');

const EXPECTED_JOB_KEYS = [
  'settlement_sweep',
  'settlement_generate_payouts',
  'pre_tour_reminder_sweep',
  'review_invitation_sweep',
  'unpaid_expiry_sweep',
  'ecpay_failure_sweep',
  'ecpay_reconcile',
];

// ---------------------------------------------------------------------------
// 1. CRON_JOBS registry
// ---------------------------------------------------------------------------

test('CRON_JOBS registry — 7 筆且 jobKey 唯一', () => {
  assert.equal(CRON_JOBS.length, 7, 'registry 必須有 7 筆');
  const keys = CRON_JOBS.map((j) => j.jobKey);
  assert.equal(new Set(keys).size, 7, 'jobKey 必須唯一');
  assert.deepEqual([...keys].sort(), [...EXPECTED_JOB_KEYS].sort(), 'jobKey 集合須符合預期 7 支 job');
  assert.deepEqual(CRON_JOB_KEYS, keys, 'CRON_JOB_KEYS 須與 registry 一致');
});

test('CRON_JOBS registry — 每筆有 nameZh/endpoint/workflowFile/schedule', () => {
  for (const job of CRON_JOBS) {
    assert.ok(typeof job.nameZh === 'string' && job.nameZh.length > 0, `${job.jobKey}: nameZh 缺失`);
    assert.match(job.endpoint, /^\/api\/internal\//, `${job.jobKey}: endpoint 必須是 /api/internal/ 路徑`);
    assert.match(job.workflowFile, /\.yml$/, `${job.jobKey}: workflowFile 必須是 .yml`);
    assert.ok(typeof job.schedule === 'string' && job.schedule.length > 0, `${job.jobKey}: schedule 缺失`);
  }
});

// ---------------------------------------------------------------------------
// 2. In-memory 開關
// ---------------------------------------------------------------------------

test('isCronJobEnabled — 未設定時預設 enabled:true', async () => {
  __resetCronControlsForTest();
  const result = await isCronJobEnabled('settlement_sweep');
  assert.deepEqual(result, { enabled: true });
});

test('setCronJobControl — 停用後 isCronJobEnabled 回 enabled:false，重新啟用回 true', async () => {
  __resetCronControlsForTest();

  const set = await setCronJobControl({
    jobKey: 'unpaid_expiry_sweep',
    enabled: false,
    actor: 'admin@test',
    reason: 'go/no-go drill',
  });
  assert.equal(set.ok, true);

  assert.deepEqual(await isCronJobEnabled('unpaid_expiry_sweep'), { enabled: false });
  // 其他 job 不受影響
  assert.deepEqual(await isCronJobEnabled('ecpay_reconcile'), { enabled: true });

  const reEnable = await setCronJobControl({ jobKey: 'unpaid_expiry_sweep', enabled: true, actor: 'admin@test' });
  assert.equal(reEnable.ok, true);
  assert.deepEqual(await isCronJobEnabled('unpaid_expiry_sweep'), { enabled: true });
});

test('setCronJobControl — unknown jobKey 回 ok:false', async () => {
  __resetCronControlsForTest();
  const result = await setCronJobControl({ jobKey: 'not_a_real_job', enabled: false });
  assert.equal(result.ok, false);
  assert.match(result.error, /unknown job_key/);
});

// ---------------------------------------------------------------------------
// 3. 執行紀錄
// ---------------------------------------------------------------------------

test('recordCronRun + listRecentCronRuns — 回寫入的紀錄（含 outcome/summary/source）', async () => {
  __resetCronControlsForTest();

  const startedAt = '2026-07-02T01:00:00.000Z';
  const write = await recordCronRun({
    jobKey: 'ecpay_failure_sweep',
    outcome: 'success',
    summary: { failure_count: 2, alerted: false },
    startedAt,
  });
  assert.equal(write.ok, true);

  await recordCronRun({ jobKey: 'ecpay_failure_sweep', outcome: 'skipped_by_admin' });

  const runs = await listRecentCronRuns({ perJob: 5 });
  const rows = runs.ecpay_failure_sweep;
  assert.equal(rows.length, 2);
  // memoryRuns 是 unshift（新的在前）
  assert.equal(rows[0].outcome, 'skipped_by_admin');
  assert.equal(rows[1].outcome, 'success');
  assert.deepEqual(rows[1].summary, { failure_count: 2, alerted: false });
  assert.equal(rows[1].source, 'schedule');
  assert.equal(rows[1].started_at, startedAt);
  assert.ok(rows[1].finished_at, 'finished_at 必須有值');

  // 其他 job 沒紀錄 → 空陣列
  assert.deepEqual(runs.settlement_sweep, []);
});

test('listRecentCronRuns — perJob 上限生效', async () => {
  __resetCronControlsForTest();
  for (let i = 0; i < 8; i++) {
    await recordCronRun({ jobKey: 'pre_tour_reminder_sweep', outcome: 'success', summary: { sent: i } });
  }
  const runs = await listRecentCronRuns({ perJob: 3 });
  assert.equal(runs.pre_tour_reminder_sweep.length, 3);
});

test('__resetCronControlsForTest — 清空開關與紀錄', async () => {
  await setCronJobControl({ jobKey: 'settlement_sweep', enabled: false });
  await recordCronRun({ jobKey: 'settlement_sweep', outcome: 'error', summary: { error: 'boom' } });

  __resetCronControlsForTest();

  assert.deepEqual(await isCronJobEnabled('settlement_sweep'), { enabled: true });
  const runs = await listRecentCronRuns();
  assert.deepEqual(runs.settlement_sweep, []);
});

// ---------------------------------------------------------------------------
// 4. fail-open 契約
// ---------------------------------------------------------------------------

test('getCronJobControls — 對所有 jobKey 回物件且預設 enabled', async () => {
  __resetCronControlsForTest();
  const controls = await getCronJobControls();
  assert.deepEqual(Object.keys(controls).sort(), [...EXPECTED_JOB_KEYS].sort());
  for (const key of EXPECTED_JOB_KEYS) {
    assert.equal(controls[key].enabled, true, `${key} 預設必須 enabled（fail-open 契約）`);
    assert.equal(controls[key].updatedAt, null);
    assert.equal(controls[key].updatedBy, null);
    assert.equal(controls[key].reason, null);
  }
});

test('getCronJobControls — 反映已停用的 job，其餘維持 enabled', async () => {
  __resetCronControlsForTest();
  await setCronJobControl({ jobKey: 'review_invitation_sweep', enabled: false, actor: 'ops', reason: '暫停寄信' });

  const controls = await getCronJobControls();
  assert.equal(controls.review_invitation_sweep.enabled, false);
  assert.equal(controls.review_invitation_sweep.updatedBy, 'ops');
  assert.equal(controls.review_invitation_sweep.reason, '暫停寄信');
  for (const key of EXPECTED_JOB_KEYS.filter((k) => k !== 'review_invitation_sweep')) {
    assert.equal(controls[key].enabled, true);
  }
  __resetCronControlsForTest();
});
