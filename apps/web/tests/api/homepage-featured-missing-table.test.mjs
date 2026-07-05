// 首頁精選 missing-table 行為 source-contract（#admin 首頁精選錯誤修復）
// 鎖定：migration 未套用（PostgREST schema cache 找不到表）時的處理路徑——
//  - getHomepageFeaturedDb：fail-open 回未設定狀態（首頁／admin 載入不爆）
//  - setHomepageFeaturedDb：丟 HOMEPAGE_FEATURED_TABLE_MISSING + 可執行繁中訊息
//  - route PUT：把該 code 以 503 回傳
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const read = (rel) => fs.readFileSync(path.join(__dirname, rel), 'utf8');
const dbSrc = read('../../src/lib/db-homepage-featured.mjs'); // #1613 strangler 後實作所在
const routeSrc = read('../../app/api/admin/homepage-featured/route.ts');

test('db.mjs 匯入 missing-table 偵測 helper', () => {
  assert.match(dbSrc, /isMissingHomepageFeaturedTable/);
  assert.match(dbSrc, /HOMEPAGE_FEATURED_TABLE_MISSING_MESSAGE/);
  assert.match(dbSrc, /from '\.\/homepage-featured-error\.mjs'/);
});

test('getHomepageFeaturedDb：表不存在時 fail-open（return，不 throw）', () => {
  const start = dbSrc.indexOf('export async function getHomepageFeaturedDb');
  assert.ok(start > -1);
  const fnSrc = dbSrc.slice(start, start + 1200);
  // 偵測 missing-table 後必須是 return（fail-open），而不是 throw
  const guardAt = fnSrc.indexOf('isMissingHomepageFeaturedTable(error)');
  assert.ok(guardAt > -1, 'get 必須偵測 missing-table');
  const afterGuard = fnSrc.slice(guardAt, guardAt + 200);
  // fail-open 回未設定狀態（共用 HOMEPAGE_FEATURED_EMPTY 常數，editorPickSlug:null）
  assert.match(afterGuard, /return\s*\{\s*\.\.\.HOMEPAGE_FEATURED_EMPTY\s*\}/, 'missing-table 應 fail-open 回 HOMEPAGE_FEATURED_EMPTY');
  assert.match(dbSrc, /const HOMEPAGE_FEATURED_EMPTY\s*=\s*\{[^}]*editorPickSlug:\s*null/, 'HOMEPAGE_FEATURED_EMPTY 須含 editorPickSlug:null');
});

test('setHomepageFeaturedDb：表不存在時丟 HOMEPAGE_FEATURED_TABLE_MISSING', () => {
  const start = dbSrc.indexOf('export async function setHomepageFeaturedDb');
  assert.ok(start > -1);
  const fnSrc = dbSrc.slice(start, start + 2600);
  const guardAt = fnSrc.indexOf('isMissingHomepageFeaturedTable(error)');
  assert.ok(guardAt > -1, 'set 必須偵測 missing-table');
  const afterGuard = fnSrc.slice(guardAt, guardAt + 260);
  assert.match(afterGuard, /HOMEPAGE_FEATURED_TABLE_MISSING_MESSAGE/, '訊息須用可執行繁中常數');
  assert.match(afterGuard, /code\s*=\s*'HOMEPAGE_FEATURED_TABLE_MISSING'/, 'error.code 須為 HOMEPAGE_FEATURED_TABLE_MISSING');
});

test('route PUT：HOMEPAGE_FEATURED_TABLE_MISSING → 503', () => {
  assert.match(routeSrc, /HOMEPAGE_FEATURED_TABLE_MISSING/);
  const idx = routeSrc.indexOf("code === 'HOMEPAGE_FEATURED_TABLE_MISSING'");
  assert.ok(idx > -1, 'PUT 須辨識 HOMEPAGE_FEATURED_TABLE_MISSING');
  assert.match(routeSrc.slice(idx, idx + 220), /status:\s*503/, 'table-missing 應回 503');
});
