// 根因回歸測試：footer／熱門目的地的地區連結用「短名」（?region=高雄），
// 但資料與 admin 表單以「全名」（高雄市）儲存，過去地區篩選用字串精確比對
// → '高雄' !== '高雄市' → 永遠 0 筆。本檔鎖定正規化後短名也能命中。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { normalizeRegionToDbValue } from '../../src/lib/region-slugs.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..');

test('normalizeRegionToDbValue: 短名 → DB 全名', () => {
  assert.equal(normalizeRegionToDbValue('高雄'), '高雄市');
  assert.equal(normalizeRegionToDbValue('台北'), '台北市');
  assert.equal(normalizeRegionToDbValue('花蓮'), '花蓮縣');
  assert.equal(normalizeRegionToDbValue('新北'), '新北市');
});

test('normalizeRegionToDbValue: 英文 slug → DB 全名', () => {
  assert.equal(normalizeRegionToDbValue('kaohsiung'), '高雄市');
  assert.equal(normalizeRegionToDbValue('new-taipei'), '新北市');
  assert.equal(normalizeRegionToDbValue('hualien'), '花蓮縣');
});

test('normalizeRegionToDbValue: DB 全名維持不變（冪等）', () => {
  assert.equal(normalizeRegionToDbValue('高雄市'), '高雄市');
  assert.equal(normalizeRegionToDbValue(normalizeRegionToDbValue('高雄')), '高雄市');
});

test('normalizeRegionToDbValue: 前後空白會被 trim', () => {
  assert.equal(normalizeRegionToDbValue('  高雄  '), '高雄市');
});

test('normalizeRegionToDbValue: 未知值原樣 trim 回傳，空值／非字串回 ""', () => {
  assert.equal(normalizeRegionToDbValue('火星'), '火星');
  assert.equal(normalizeRegionToDbValue(''), '');
  assert.equal(normalizeRegionToDbValue('   '), '');
  assert.equal(normalizeRegionToDbValue(null), '');
  assert.equal(normalizeRegionToDbValue(undefined), '');
  assert.equal(normalizeRegionToDbValue(123), '');
});

test('根因示範：fixtures 高雄行程以全名儲存，舊精確比對短名會漏，正規化兩端則命中', async () => {
  // 用明確 .ts 副檔名載入 fixtures（與 node 測試環境無關，環境獨立）。
  const { activities } = await import('../../src/fixtures/data.ts');
  const expected = activities
    .filter((a) => normalizeRegionToDbValue(a.region) === '高雄市')
    .map((a) => a.slug)
    .sort();
  assert.ok(expected.length > 0, 'fixtures 應有高雄行程，否則前提改變');

  // 舊行為：用 footer 短名「高雄」對全名「高雄市」精確比對 → 0 筆（這正是根因）。
  const oldExact = activities.filter((a) => ['高雄'].includes(a.region));
  assert.equal(oldExact.length, 0, '舊精確比對短名 高雄 對全名 高雄市 會 0 筆（根因）');

  // 修復後：兩端都正規化 → 短名／全名／slug 三種寫法都命中同一批行程。
  for (const raw of ['高雄', '高雄市', 'kaohsiung']) {
    const want = normalizeRegionToDbValue(raw);
    const got = activities
      .filter((a) => [want].includes(normalizeRegionToDbValue(a.region)))
      .map((a) => a.slug)
      .sort();
    assert.deepEqual(got, expected, `region=${raw} 應命中與高雄市相同的行程`);
  }
});

test('Source contract: db.mjs in-memory 地區篩選正規化兩端', () => {
  const src = readFileSync(join(REPO_ROOT, 'src/lib/db.mjs'), 'utf8');
  assert.match(
    src,
    /from\s+['"]\.\/region-slugs\.mjs['"]/,
    'db.mjs 應 import region-slugs 正規化器',
  );
  // 行程複選地區後，in-memory 篩選改用 activityMatchesRegion（主要或附加地區任一
  // 命中），其內部仍用 normalizeRegionToDbValue 正規化兩端，故短名↔全名仍相容。
  assert.match(
    src,
    /result\.filter\(a => activityMatchesRegion\(a, filters\.region\)\)/,
    'in-memory fallback 應以 activityMatchesRegion 比對（兩端正規化、含附加地區）',
  );
});

test('Source contract: db.mjs Supabase 查詢用 expandRegionToDbValues 展開集合', () => {
  const src = readFileSync(join(REPO_ROOT, 'src/lib/db.mjs'), 'utf8');
  // 短名展開成現行 dbValue 集合（'嘉義'→[嘉義市,嘉義縣]；多數短名/全名單值），
  // 兩端仍正規化，短名↔全名相容不破壞。
  assert.match(
    src,
    /const\s+regionValues\s*=\s*filters\.region\s*\?\s*expandRegionToDbValues\(filters\.region\)/,
    'Supabase 路徑應以 expandRegionToDbValues 展開 filters.region',
  );
  // 主查詢對集合中每個 dbValue 組 region.eq / regions.cs 多項 .or()
  assert.match(
    src,
    /orTerms\.join\(','\)/,
    '主查詢應以 orTerms.join(",") 組多項 .or()',
  );
  assert.match(
    src,
    /retry\s*=\s*retry\.in\('region',\s*regionValues\)/,
    "schema-drift retry 查詢應 .in('region', regionValues)",
  );
});

test('Source contract: Footer 用 /activities?region= 連到地區篩選', () => {
  const src = readFileSync(join(REPO_ROOT, 'src/components/layout/Footer.tsx'), 'utf8');
  assert.match(src, /\/activities\?region=/, 'Footer 應連到 /activities?region=');
  assert.match(src, /高雄/, 'Footer 地區清單應含高雄');
});

test('Source contract: ActivitiesContent 地區篩選用 activityMatchesRegion（主要或附加地區任一命中，兩端正規化）', () => {
  const src = readFileSync(join(REPO_ROOT, 'app/[locale]/activities/ActivitiesContent.tsx'), 'utf8');
  // 複選地區後改用 activityMatchesRegion：主要地區或附加地區任一命中即保留，
  // 其內部仍用 normalizeRegionToDbValue 正規化兩端，短名↔全名相容不破壞。
  assert.match(src, /activityMatchesRegion/, 'ActivitiesContent 應用 activityMatchesRegion 比對地區');
  assert.match(
    src,
    /selectedRegions\.some\(\(sel\) => activityMatchesRegion\(a, sel\)\)/,
    'filter 必須以 activityMatchesRegion 比對（含附加地區）',
  );
});
