import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const read = (p) => readFile(path.join(ROOT, p), 'utf8');

test('midao2 首頁：summary 串接＋統計卡導轉＋複製回覆', async () => {
  const src = await read('app/(non-locale)/midao2/page.tsx');
  assert.match(src, /\/api\/v2\/guide\/midao\/summary/);
  assert.match(src, /status=new/);
  assert.match(src, /status=pending_reply/);
  assert.match(src, /buildLineReplyText/);
  assert.match(src, /midao2-top-view/);
  assert.match(src, /midao2-share-cta/);
});

test('midao2 需求列表：tab 對映＋排序＋卡片導轉', async () => {
  const src = await read('app/(non-locale)/midao2/requests/page.tsx');
  assert.match(src, /\/api\/v2\/guide\/midao\/requests\?status=/);
  for (const s of ['all', 'new', 'pending_reply', 'replied', 'closed']) assert.match(src, new RegExp(`['"]${s}['"]`));
  assert.match(src, /unreplied_first/);
  assert.match(src, /tabCounts/);
  assert.match(src, /midao2-req-sort/);
  assert.match(src, /VALID_STATUSES|includes\(rawStatus/);
});

test('midao2 需求詳情：自動轉待回覆＋radio 三態＋複製回覆帶轉確認中', async () => {
  const src = await read('app/(non-locale)/midao2/requests/[id]/page.tsx');
  assert.match(src, /pending_reply/);
  assert.match(src, /buildRequestSummaryText/);
  assert.match(src, /buildLineReplyText/);
  assert.match(src, /line\.me\/R\/ti\/p\/~/);
  for (const v of ['replied', 'closed_won', 'closed_done']) assert.match(src, new RegExp(`midao2-status-${v}`));
  assert.match(src, /midao2-detail-copy-reply/);
});
