import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const pagePath = new URL('../../app/(non-locale)/admin/go-no-go/page.tsx', import.meta.url);

test('Go/No-Go admin page primary UI copy is Traditional Chinese', async () => {
  const pageSource = await readFile(pagePath, 'utf8');

  for (const expected of [
    'Go/No-Go 上線決策面板',
    '上線準備清單與系統決策摘要',
    '上線準備清單',
    '核心指標',
    '今日決策',
    '建議處置',
    '待補佐證',
    '目前不需處置，系統健康且可準備上線。',
    '必要的上線前佐證尚未簽核或未完成',
  ]) {
    assert.match(pageSource, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }

  for (const oldEnglish of [
    'Release readiness checklist and system verdict',
    'Readiness Checklist',
    'Core Metrics',
    "Today's Verdict",
    'Recommended Actions',
    'EVIDENCE REQUIRED',
    'No actions required — system is healthy and ready to deploy.',
  ]) {
    assert.doesNotMatch(pageSource, new RegExp(oldEnglish.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});
