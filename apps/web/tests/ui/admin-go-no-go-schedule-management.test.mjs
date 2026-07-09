import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const pagePath = new URL('../../app/admin/go-no-go/page.tsx', import.meta.url);
const panelPath = new URL('../../app/admin/go-no-go/CronJobsPanel.tsx', import.meta.url);

test('Go/No-Go page still mounts the schedule management panel', async () => {
  const src = await readFile(pagePath, 'utf8');
  assert.match(src, /CronJobsPanel/);
});

test('Cron jobs panel renders schedule management copy in Traditional Chinese', async () => {
  const src = await readFile(panelPath, 'utf8');

  for (const expected of [
    '排程管理',
    '真實 GitHub Actions 排程',
    '風險分級',
    '功能說明',
    '停用後不會再發 Telegram / Email 通知',
    '開啟',
    '停用',
  ]) {
    assert.match(src, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});

test('Cron jobs panel fetches and mutates the cron jobs admin endpoint', async () => {
  const src = await readFile(panelPath, 'utf8');

  assert.match(src, /\/api\/admin\/cron-jobs/, 'panel should fetch cron jobs admin endpoint');
  assert.match(src, /method:\s*'PATCH'/, 'panel should PATCH toggle state');
  assert.match(src, /enabled/, 'panel should send enabled flag');
});
