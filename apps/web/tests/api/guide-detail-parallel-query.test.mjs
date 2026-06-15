/**
 * 導遊詳情頁查詢效能：getGuideBySlugDb 把 guide_profiles 與 activities 兩個
 * 「只用 slug、彼此不相依」的查詢改成 Promise.all 平行發送，2 個串行 round-trip
 * 併成 1 個（詳情頁 ISR cache-miss 首訪的延遲來源）。同時鎖住：停權守衛不得被
 * 平行化破壞、孤兒列表 API /api/guides 已移除（無前端/文件/sitemap 依賴）。
 *
 * Source-contract 測試（Supabase 分支無法在無 DB 環境實跑，鎖原始碼結構）。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP_ROOT = join(__dirname, '..', '..');
const DB_MJS = join(APP_ROOT, 'src/lib/db.mjs');

function sliceFn(src, name) {
  const start = src.indexOf(`export async function ${name}`);
  assert.ok(start >= 0, `找不到 ${name}`);
  const next = src.indexOf('\nexport async function ', start + 1);
  return src.slice(start, next === -1 ? undefined : next);
}

test('getGuideBySlugDb：guide_profiles 與 activities 查詢平行（Promise.all）', () => {
  const fn = sliceFn(readFileSync(DB_MJS, 'utf8'), 'getGuideBySlugDb');
  assert.match(fn, /Promise\.all\(/, '兩個獨立查詢需以 Promise.all 平行發送');
  // 平行的兩支查詢仍各自存在
  assert.match(fn, /\.from\(['"]guide_profiles['"]\)/, '需查 guide_profiles');
  assert.match(fn, /\.from\(['"]activities['"]\)[\s\S]*?\.eq\(['"]guide_slug['"]\s*,\s*slug\)/, 'activities 需以 guide_slug=slug 過濾');
});

test('getGuideBySlugDb：平行化後仍保留停權守衛（非 approved → null）', () => {
  const fn = sliceFn(readFileSync(DB_MJS, 'utf8'), 'getGuideBySlugDb');
  assert.match(
    fn,
    /verification_status\s*!==\s*['"]approved['"][\s\S]{0,40}return null/,
    '停權（非 approved）導遊必須回 null（詳情頁 404）',
  );
});

test('孤兒列表 API /api/guides（無參數）已移除', () => {
  assert.equal(
    existsSync(join(APP_ROOT, 'app/api/guides/route.ts')),
    false,
    '/api/guides 列表端點無前端/文件/sitemap 依賴，應移除（單一導遊 /api/guides/[slug] 保留）',
  );
  // 單一導遊端點仍在（有 API 文件記載）
  assert.equal(existsSync(join(APP_ROOT, 'app/api/guides/[slug]/route.ts')), true, '/api/guides/[slug] 應保留');
});
