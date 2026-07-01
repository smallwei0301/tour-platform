import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { normalizeRegionToDbValue } from '../../src/lib/region-slugs.mjs';

// 導遊「熟悉區域」統一存全名（高雄→高雄市），與行程地區格式一致。旅客偏好維持 slug
// （未使用，讀取層可正規化）——本檔鎖定導遊側寫入/讀取接線，並加旅客側 guardrail。

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..');
const read = (rel) => readFileSync(join(REPO_ROOT, rel), 'utf8');

test('guide/profile 表單：熟悉區域顯示短名、存全名（listAllDivisions）', () => {
  const src = read('app/guide/profile/page.tsx');
  assert.match(src, /import \{ listAllDivisions, normalizeRegionToDbValue \} from/);
  assert.match(src, /const REGION_OPTIONS = listAllDivisions\(\)/);
  // chip 的 id 用全名 dbValue、label 用短名 displayName
  assert.match(src, /options=\{REGION_OPTIONS\.map\(\(d\) => \(\{ id: d\.dbValue, label: d\.displayName \}\)\)\}/);
  // 載入舊資料時正規化成全名
  assert.match(src, /normalizeRegionToDbValue\(r\)/);
});

test('guide/apply 表單：熟悉區域 checkbox 存全名 dbValue、顯示短名', () => {
  const src = read('app/guide/apply/page.tsx');
  assert.match(src, /import \{ listAllDivisions \} from/);
  assert.match(src, /const regionOptions = listAllDivisions\(\)/);
  assert.match(src, /checked=\{regions\.includes\(d\.dbValue\)\}/);
  assert.match(src, /toggleList\(d\.dbValue,/);
});

test('db.mjs createGuideApplicationDb：regions 以 normalizeRegionToDbValue 存全名', () => {
  const src = read('src/lib/db.mjs');
  assert.match(src, /toStringArray\(input\?\.regions\)\.map\(normalizeRegionToDbValue\)/);
});

test('guide/profile route 與 promote route：寫入前正規化 regions 成全名', () => {
  const profileRoute = read('app/api/guide/profile/route.ts');
  assert.match(profileRoute, /normalizeRegionToDbValue/);
  assert.match(profileRoute, /dbUpdate\.regions/);
  const promote = read('app/api/admin/guides/promote/route.ts');
  assert.match(promote, /normalizeRegionToDbValue/);
});

test('GuidesContent：篩選用 listSearchRegions 短名群組 + 展開比對全名', () => {
  const src = read('app/[locale]/guides/GuidesContent.tsx');
  assert.match(src, /listSearchRegions/);
  assert.match(src, /resolveSearchRegionKey\(g\.region\)/);
  assert.match(src, /expandRegionToDbValues\(sel\)\.includes\(normalizeRegionToDbValue\(g\.region\)\)/);
});

test('guardrail：三種儲存格式（slug/短名/全名）都正規化到同一 DB 全名', () => {
  // 旅客存 slug、導遊（舊）存短名、行程存全名——讀取層正規化後一致，異質儲存安全。
  assert.equal(normalizeRegionToDbValue('kaohsiung'), '高雄市');
  assert.equal(normalizeRegionToDbValue('高雄'), '高雄市');
  assert.equal(normalizeRegionToDbValue('高雄市'), '高雄市');
  assert.equal(normalizeRegionToDbValue('taipei'), '台北市');
  assert.equal(normalizeRegionToDbValue('台北'), '台北市');
  assert.equal(normalizeRegionToDbValue('台北市'), '台北市');
});
