import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { resolveSearchRegionKey } from '../../src/lib/region-slugs.mjs';

// 地區統一：確認各消費者改為衍生自單一模組（region-slugs.mjs），不再各自硬編部分清單。

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..');
const read = (rel) => readFileSync(join(REPO_ROOT, rel), 'utf8');

test('Footer：改用 listSearchRegions()，無硬編地區陣列', () => {
  const src = read('src/components/layout/Footer.tsx');
  assert.match(src, /import \{ listSearchRegions \} from/);
  assert.match(src, /const FOOTER_REGIONS = listSearchRegions\(\)/);
  // 不應再有舊硬編 { key: 'taipei', region: '台北' } 形式
  assert.doesNotMatch(src, /\{ key: 'taipei', region: '台北' \}/);
});

test('ActivitiesContent 側欄：改用 listSearchRegions()（不再硬編 4 個）', () => {
  const src = read('app/[locale]/activities/ActivitiesContent.tsx');
  assert.match(src, /import \{ listSearchRegions, resolveSearchRegionKey \} from/);
  assert.match(src, /const REGIONS = listSearchRegions\(\)/);
  assert.doesNotMatch(src, /labelKey: 'taipeiCity'/);
});

test('guide 活動編輯：改用 listAllDivisions()（全 22），移除硬編 8 個與 REGION_SLUG_MAP', () => {
  const src = read('app/(non-locale)/guide/activities/[id]/edit/page.tsx');
  assert.match(src, /import \{ listAllDivisions \} from/);
  assert.match(src, /listAllDivisions\(\)\.map\(\(d\) => d\.dbValue\)/);
  assert.match(src, /normalizeRegionForActivityPath\(form\.region\)/);
  // 舊硬編陣列與本地 slug map 不應殘留
  assert.doesNotMatch(src, /const REGIONS = \['台北市'/);
  assert.doesNotMatch(src, /const REGION_SLUG_MAP/);
});

test('策展目的地（首頁／landing）的地區值都解析得到搜尋群組（無 orphan／typo）', () => {
  const files = [
    'src/components/home/DestinationsSection.tsx',
    'src/components/landing/LpSections.tsx',
  ];
  for (const f of files) {
    const src = read(f);
    // 取出 region:/slug: 的中文值
    const values = [...src.matchAll(/(?:region|slug): '([一-鿿]+)'/g)].map((m) => m[1]);
    assert.ok(values.length > 0, `${f} 應有地區值`);
    for (const v of values) {
      assert.notEqual(
        resolveSearchRegionKey(v),
        '',
        `${f} 的地區值 '${v}' 必須對應到一個搜尋群組（避免點了搜不到）`,
      );
    }
  }
});

test('footer.region i18n：兩語系皆含全 20 群組 key（含新縣市）', () => {
  const zh = JSON.parse(read('messages/zh-Hant.json')).footer.region;
  const en = JSON.parse(read('messages/en.json')).footer.region;
  const expectedKeys = [
    'taipei', 'new-taipei', 'taoyuan', 'taichung', 'tainan', 'kaohsiung',
    'keelung', 'hsinchu', 'miaoli', 'changhua', 'nantou', 'yunlin', 'chiayi',
    'pingtung', 'yilan', 'hualien', 'taitung', 'penghu', 'kinmen', 'matsu',
  ];
  for (const k of expectedKeys) {
    assert.ok(zh[k], `zh-Hant footer.region 缺 key ${k}`);
    assert.ok(en[k], `en footer.region 缺 key ${k}`);
  }
});
