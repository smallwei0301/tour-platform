// 首頁精選改用「真實已發布行程」+ 文案覆寫 — route / page / db source-contract。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const read = (rel) => fs.readFileSync(path.join(__dirname, rel), 'utf8');
const routeSrc = read('../../app/api/admin/homepage-featured/route.ts');
const pageSrc = read('../../app/[locale]/page.tsx');
const dbSrc = read('../../src/lib/db-homepage-featured.mjs'); // #1613 strangler 後實作所在

test('admin route：選單 choices 來自真實已發布行程（listPublishedActivitiesDb），不再用 fixtures', () => {
  assert.match(routeSrc, /listPublishedActivitiesDb/, 'choices 須改用 listPublishedActivitiesDb');
  assert.doesNotMatch(routeSrc, /from '\.\.\/\.\.\/\.\.\/\.\.\/src\/fixtures\/data'/, 'route 不應再 import fixtures activities');
});

test('admin route PUT：接受並傳遞 editorPickCopy / moreFeaturedCopy，validSlugs 用真實 choices', () => {
  assert.match(routeSrc, /editorPickCopy/, 'PUT 須接受 editorPickCopy');
  assert.match(routeSrc, /moreFeaturedCopy/, 'PUT 須接受 moreFeaturedCopy');
  assert.match(routeSrc, /validSlugs:\s*choices\.map/, 'validSlugs 須來自真實 choices');
});

test('首頁 page：用 listPublishedActivitiesDb + resolveHomepageFeaturedView 渲染真實行程', () => {
  assert.match(pageSrc, /listPublishedActivitiesDb/, 'page 須讀真實已發布行程目錄');
  assert.match(pageSrc, /resolveHomepageFeaturedView/, 'page 須用 view-model 解析器');
  assert.match(pageSrc, /featured=\{editorPick/, 'LpFeatured 須吃真實行程 view-model');
  assert.match(pageSrc, /tours=\{tours\}/, 'LpTours 須吃真實行程 view-model');
});

test('db.mjs：get/set 帶 copy 欄位 + 文案 migration 未套用時欄位 fallback', () => {
  assert.match(dbSrc, /editor_pick_copy/, 'select/upsert 須含 editor_pick_copy');
  assert.match(dbSrc, /more_featured_copy/, 'select/upsert 須含 more_featured_copy');
  assert.match(dbSrc, /isMissingHomepageFeaturedCopyColumn/, '須處理 copy 欄位不存在的 fallback');
  assert.match(dbSrc, /sanitizeEditorPickCopy/, 'set 須清洗 editorPickCopy');
  assert.match(dbSrc, /sanitizeMoreFeaturedCopy/, 'set 須清洗 moreFeaturedCopy');
});
