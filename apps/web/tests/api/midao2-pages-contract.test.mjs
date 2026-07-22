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
