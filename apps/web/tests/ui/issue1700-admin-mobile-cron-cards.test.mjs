import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const panelPath = new URL('../../app/(non-locale)/admin/go-no-go/CronJobsPanel.tsx', import.meta.url);
const e2eSpecPath = new URL('../../e2e/issue1700-admin-mobile-cron-cards.spec.ts', import.meta.url);

async function panelSource() {
  return readFile(panelPath, 'utf8');
}

async function e2eSpecSource() {
  return readFile(e2eSpecPath, 'utf8');
}

test('issue #1700: 排程管理提供獨立 mobile card 呈現與 640px breakpoint', async () => {
  const source = await panelSource();

  assert.match(source, /data-testid={`cron-job-card-\${job\.jobKey}`}/, '每個 workflow 必須有可驗證的 mobile card');
  assert.match(source, /@media\s*\(max-width:\s*639px\)/, 'mobile card 必須在 <640px 顯示');
  assert.match(source, /@media\s*\(min-width:\s*640px\)/, 'desktop table 必須在 >=640px 保留');
});

test('issue #1700: mobile card 保留 workflow、排程、最後執行、風險、狀態與現有 toggle', async () => {
  const source = await panelSource();
  const mobileCards = source.slice(source.indexOf('className="cron-jobs-mobile"'), source.indexOf('className="cron-jobs-desktop"'));

  for (const requiredField of [
    'job.workflowName',
    'job.scheduleZh',
    '<LastRun job={job} />',
    'job.riskLevelZh',
    'job.github.stateLabelZh',
    'onToggle={toggle}',
  ]) {
    assert.ok(mobileCards.includes(requiredField), `mobile card must render ${requiredField}`);
  }
});

test('issue #1700: existing loading/error/token states remain in the panel', async () => {
  const source = await panelSource();

  for (const stateCopy of ['載入中⋯', '目前缺少 GitHub Actions admin token', '載入排程管理失敗']) {
    assert.ok(source.includes(stateCopy), `existing state missing: ${stateCopy}`);
  }
});

test('issue #1700: Playwright audit fixture follows the runtime registry contract', async () => {
  const source = await e2eSpecSource();

  for (const requiredContract of [
    "jobKey: 'public-booking-audit'",
    "workflowFile: 'public-booking-audit.yml'",
    "workflowUrl: 'https://github.com/smallwei0301/tour-platform/actions/workflows/public-booking-audit.yml'",
    "cron-job-card-public-booking-audit",
    "cron-job-row-public-booking-audit",
    "cron-toggle-public-booking-audit",
  ]) {
    assert.ok(source.includes(requiredContract), `E2E fixture must use runtime contract: ${requiredContract}`);
  }

  assert.ok(!source.includes('public-booking-v2-audit'), 'E2E fixture must not retain obsolete audit key or workflow file');
});
