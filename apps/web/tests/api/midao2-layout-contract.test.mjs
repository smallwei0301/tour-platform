import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const read = (p) => readFile(path.join(ROOT, p), 'utf8');

test('midao2 layout：CSRF 預熱＋401 導 login＋五格 tab', async () => {
  const src = await read('app/(non-locale)/midao2/layout.tsx');
  assert.match(src, /'use client'/);
  assert.match(src, /\/api\/guide\/auth\/csrf/);
  assert.match(src, /\/api\/v2\/guide\/midao\/summary/);
  assert.match(src, /\/guide\/login\?next=\/midao2/);
  assert.match(src, /env\(safe-area-inset-bottom\)/);
  for (const label of ['首頁', '需求', '行事曆', '服務', '我的頁面']) assert.match(src, new RegExp(label));
});

test('midao2 ui：envelope 處理＋401 導轉＋STATUS_META 五態', async () => {
  const src = await read('app/(non-locale)/midao2/ui.tsx');
  assert.match(src, /json\.success/);
  assert.match(src, /csrfHeaders\(/);
  assert.match(src, /401/);
  for (const s of ['new', 'pending_reply', 'replied', 'closed_won', 'closed_done']) {
    assert.match(src, new RegExp(`['"]${s}['"]`));
  }
  assert.match(src, /新需求/); assert.match(src, /待回覆/); assert.match(src, /已回覆/);
  assert.match(src, /已成交/); assert.match(src, /已完成/);
});
