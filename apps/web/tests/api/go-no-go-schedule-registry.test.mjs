import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(__dirname, '../..');
const REPO_ROOT = path.resolve(APP_ROOT, '../..');
const workflowDir = path.join(REPO_ROOT, '.github', 'workflows');
const registryModuleUrl = new URL('../../src/lib/admin/go-no-go-schedules.mjs', import.meta.url);

function parseScheduledWorkflows() {
  const files = readdirSync(workflowDir).filter((name) => name.endsWith('.yml'));
  const out = [];
  for (const file of files) {
    const source = readFileSync(path.join(workflowDir, file), 'utf8');
    const cronMatch = source.match(/cron:\s*['\"]([^'\"]+)['\"]/);
    if (!cronMatch) continue;
    const nameMatch = source.match(/^name:\s*(.+)$/m);
    out.push({
      workflowPath: `.github/workflows/${file}`,
      workflowName: nameMatch ? nameMatch[1].trim() : file,
      cron: cronMatch[1],
    });
  }
  out.sort((a, b) => a.workflowPath.localeCompare(b.workflowPath));
  return out;
}

test('Go/No-Go schedule registry covers every currently scheduled workflow file on main', async () => {
  const { SCHEDULE_REGISTRY } = await import(registryModuleUrl);
  const scheduled = parseScheduledWorkflows();

  const expectedPaths = scheduled.map((item) => item.workflowPath).sort();
  const actualPaths = SCHEDULE_REGISTRY.map((item) => item.workflowPath).sort();

  assert.deepEqual(
    actualPaths,
    expectedPaths,
    'registry must cover every workflow that currently has a cron schedule and no extras',
  );

  for (const workflow of scheduled) {
    const registryItem = SCHEDULE_REGISTRY.find((item) => item.workflowPath === workflow.workflowPath);
    assert.ok(registryItem, `missing registry entry for ${workflow.workflowPath}`);
    assert.equal(registryItem.workflowName, workflow.workflowName, `${workflow.workflowPath} workflowName mismatch`);
    assert.equal(registryItem.cron, workflow.cron, `${workflow.workflowPath} cron mismatch`);
  }
});

test('Every Go/No-Go schedule entry has a short zh-TW purpose summary and disable notice', async () => {
  const { SCHEDULE_REGISTRY } = await import(registryModuleUrl);

  for (const item of SCHEDULE_REGISTRY) {
    assert.ok(item.labelZh && item.labelZh.length >= 2, `${item.workflowPath} missing labelZh`);
    assert.ok(item.summaryZh && item.summaryZh.length >= 8, `${item.workflowPath} missing short summaryZh`);
    assert.ok(item.riskReasonZh && item.riskReasonZh.length >= 8, `${item.workflowPath} missing riskReasonZh`);
    assert.ok(item.disableEffectZh && item.disableEffectZh.length >= 12, `${item.workflowPath} missing disableEffectZh`);
    assert.match(item.disableEffectZh, /停用後/, `${item.workflowPath} disableEffectZh should explain stop behavior`);
    assert.match(item.disableEffectZh, /Telegram|TG/, `${item.workflowPath} disableEffectZh should mention Telegram/TG`);
    assert.match(item.disableEffectZh, /Email|mail/i, `${item.workflowPath} disableEffectZh should mention Email/mail`);
  }
});

test('Schedule view-model merge keeps live GitHub state and exposes toggle capability', async () => {
  const { buildScheduleViewModels } = await import(registryModuleUrl);

  const viewModels = buildScheduleViewModels({
    githubWorkflows: [
      {
        id: 101,
        name: 'refund-reconcile',
        path: '.github/workflows/refund-reconcile.yml',
        state: 'active',
        html_url: 'https://github.com/example/refund',
      },
      {
        id: 102,
        name: 'pre-tour-reminder-sweep',
        path: '.github/workflows/pre-tour-reminder-sweep.yml',
        state: 'disabled_manually',
        html_url: 'https://github.com/example/pre-tour',
      },
    ],
    hasGithubToken: true,
  });

  const refund = viewModels.find((item) => item.workflowPath === '.github/workflows/refund-reconcile.yml');
  const reminder = viewModels.find((item) => item.workflowPath === '.github/workflows/pre-tour-reminder-sweep.yml');

  assert.ok(refund, 'refund-reconcile should be present');
  assert.equal(refund.github.state, 'active');
  assert.equal(refund.github.enabled, true);
  assert.equal(refund.github.canToggle, true);

  assert.ok(reminder, 'pre-tour-reminder-sweep should be present');
  assert.equal(reminder.github.state, 'disabled_manually');
  assert.equal(reminder.github.enabled, false);
  assert.equal(reminder.github.canToggle, true);
  assert.match(reminder.disableEffectZh, /Telegram|TG/);
  assert.match(reminder.disableEffectZh, /Email|mail/i);
});

test('All hourly / every-6-hour schedules have been reduced to at most daily cadence', async () => {
  const { SCHEDULE_REGISTRY } = await import(registryModuleUrl);
  for (const item of SCHEDULE_REGISTRY) {
    const [minute, hour] = item.cron.split(/\s+/);
    // hour === '*' → 每小時；hour 含 '/' (e.g. */6) → 每數小時。降頻後皆不得出現。
    assert.notEqual(hour, '*', `${item.workflowPath} 仍是每小時排程（cron=${item.cron}），應已降為每日`);
    assert.doesNotMatch(hour, /\//, `${item.workflowPath} 仍是每數小時排程（cron=${item.cron}），應已降為每日`);
    // minute 也不得為萬用字元（避免每分鐘）
    assert.notEqual(minute, '*', `${item.workflowPath} minute 欄為萬用字元（cron=${item.cron}）`);
  }
});

test('Schedule view-model exposes lastRun from recent GitHub runs (path + id matched)', async () => {
  const { buildScheduleViewModels } = await import(registryModuleUrl);

  const viewModels = buildScheduleViewModels({
    githubWorkflows: [
      { id: 201, name: 'refund-reconcile', path: '.github/workflows/refund-reconcile.yml', state: 'active', html_url: 'https://github.com/example/refund' },
    ],
    githubRuns: [
      // 最新一筆（path 對）— runs API 依建立時間新到舊，第一筆即最新
      { workflow_id: 201, path: '.github/workflows/refund-reconcile.yml', status: 'completed', conclusion: 'success', run_started_at: '2026-07-10T03:00:12Z', created_at: '2026-07-10T03:00:00Z', html_url: 'https://github.com/example/run/2' },
      // 較舊一筆同 workflow — 不應覆蓋最新
      { workflow_id: 201, path: '.github/workflows/refund-reconcile.yml', status: 'completed', conclusion: 'failure', run_started_at: '2026-07-09T03:00:00Z', created_at: '2026-07-09T03:00:00Z', html_url: 'https://github.com/example/run/1' },
    ],
    hasGithubToken: true,
  });

  const refund = viewModels.find((item) => item.workflowPath === '.github/workflows/refund-reconcile.yml');
  assert.ok(refund.lastRun, 'refund-reconcile should carry a lastRun');
  assert.equal(refund.lastRun.startedAt, '2026-07-10T03:00:12Z', 'lastRun should be the newest run');
  assert.equal(refund.lastRun.conclusion, 'success');
  assert.equal(refund.lastRun.conclusionLabelZh, '成功');

  // 無對應 run 的排程 → lastRun 為 null
  const noRun = viewModels.find((item) => item.workflowPath === '.github/workflows/settlement-sweep.yml');
  assert.equal(noRun.lastRun, null, 'schedules without a matching run should expose lastRun=null');
});
