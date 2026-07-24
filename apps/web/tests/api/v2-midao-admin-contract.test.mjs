import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const read = (p) => readFile(path.join(ROOT, p), 'utf8');

test('admin midao requests route：無 guide auth（middleware 把關）＋status 白名單＋跨導遊 db 函式', async () => {
  const src = await read('app/api/v2/admin/midao/requests/route.ts');
  assert.doesNotMatch(src, /verifyGuideSession/);
  assert.match(src, /export\s+async\s+function\s+GET/);
  assert.match(src, /jsonError\('INVALID_STATUS'/);
  for (const s of ['all', 'new', 'pending_reply', 'replied', 'closed']) {
    assert.match(src, new RegExp(`['"]${s}['"]`));
  }
  assert.match(src, /listAllMidaoRequestsDb\(\{\s*status\s*\}\)/);
  assert.match(src, /handleRouteError/);
});

test('admin midao requests page：串接 API 路徑＋唯讀（無操作按鈕）', async () => {
  const src = await read('app/(non-locale)/admin/midao-requests/page.tsx');
  assert.match(src, /\/api\/v2\/admin\/midao\/requests\?status=/);
  assert.match(src, /'use client'/);
});

test('AdminShell nav：含 midao2 需求單入口', async () => {
  const src = await read('src/components/admin/AdminShell.tsx');
  assert.match(src, /midao2 需求單/);
  assert.match(src, /\/admin\/midao-requests/);
});
