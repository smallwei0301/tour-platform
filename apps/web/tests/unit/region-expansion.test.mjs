import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  expandRegionToDbValues,
  listAllDivisions,
  listSearchRegions,
  resolveSearchRegionKey,
  REGION_REGISTRY,
} from '../../src/lib/region-slugs.mjs';

// 全台地區「統一模組」：全 22 現行縣市 + 短名搜尋展開（只含現行名稱，無舊縣名）。

// 22 個現行行政區（縣市合併後；沒有高雄縣，只有高雄市）。
const CURRENT_DIVISIONS = [
  '台北市', '新北市', '桃園市', '台中市', '台南市', '高雄市', // 6 直轄市
  '基隆市', '新竹市', '嘉義市', // 3 市
  '新竹縣', '苗栗縣', '彰化縣', '南投縣', '雲林縣', '嘉義縣', '屏東縣',
  '宜蘭縣', '花蓮縣', '台東縣', '澎湖縣', '金門縣', '連江縣', // 13 縣
];
const LEGACY_NAMES = ['高雄縣', '台南縣', '台中縣', '桃園縣', '台北縣'];

test('expandRegionToDbValues：現行並存雙名短名展開成市＋縣', () => {
  assert.deepEqual(expandRegionToDbValues('嘉義'), ['嘉義市', '嘉義縣']);
  assert.deepEqual(expandRegionToDbValues('新竹'), ['新竹市', '新竹縣']);
});

test('expandRegionToDbValues：其餘短名單值（無舊縣名，高雄不含高雄縣）', () => {
  assert.deepEqual(expandRegionToDbValues('高雄'), ['高雄市']);
  assert.deepEqual(expandRegionToDbValues('台南'), ['台南市']);
  assert.deepEqual(expandRegionToDbValues('台中'), ['台中市']);
  assert.deepEqual(expandRegionToDbValues('彰化'), ['彰化縣']);
  assert.deepEqual(expandRegionToDbValues('雲林'), ['雲林縣']);
});

test('expandRegionToDbValues：slug / 全名 收斂同集合', () => {
  assert.deepEqual(expandRegionToDbValues('kaohsiung'), ['高雄市']);
  assert.deepEqual(expandRegionToDbValues('高雄市'), ['高雄市']);
});

test('expandRegionToDbValues：全名/ slug 維持 specific 單一 division（不被展開）', () => {
  // 詳情頁 /activities/chiayi 用 dbValue '嘉義縣' → 只顯示嘉義縣，不混入嘉義市。
  assert.deepEqual(expandRegionToDbValues('嘉義市'), ['嘉義市']);
  assert.deepEqual(expandRegionToDbValues('嘉義縣'), ['嘉義縣']);
  assert.deepEqual(expandRegionToDbValues('chiayi'), ['嘉義縣']);
  assert.deepEqual(expandRegionToDbValues('chiayi-city'), ['嘉義市']);
});

test('expandRegionToDbValues：未知值原樣、空/非字串回 []', () => {
  assert.deepEqual(expandRegionToDbValues('火星'), ['火星']);
  assert.deepEqual(expandRegionToDbValues(''), []);
  assert.deepEqual(expandRegionToDbValues('   '), []);
  assert.deepEqual(expandRegionToDbValues(null), []);
  assert.deepEqual(expandRegionToDbValues(123), []);
});

test('listAllDivisions：涵蓋全 22 現行縣市，各一次', () => {
  const dbValues = listAllDivisions().map((d) => d.dbValue);
  assert.equal(dbValues.length, 22);
  for (const div of CURRENT_DIVISIONS) {
    assert.equal(dbValues.filter((v) => v === div).length, 1, `${div} 應恰出現一次`);
  }
  // 無舊縣名
  for (const legacy of LEGACY_NAMES) {
    assert.ok(!dbValues.includes(legacy), `不應含舊名 ${legacy}`);
  }
});

test('listSearchRegions：20 群組，聯集恰為 22 現行縣市（不含任何舊縣名）', () => {
  const groups = listSearchRegions();
  assert.equal(groups.length, 20);
  const union = [...new Set(groups.flatMap((g) => g.dbValues))].sort();
  assert.deepEqual(union, [...CURRENT_DIVISIONS].sort());
  for (const legacy of LEGACY_NAMES) {
    assert.ok(!union.includes(legacy), `搜尋群組不應含舊名 ${legacy}`);
  }
  // 只有嘉義／新竹是雙值
  const dual = groups.filter((g) => g.dbValues.length > 1).map((g) => g.label).sort();
  assert.deepEqual(dual, ['嘉義', '新竹']);
});

test('resolveSearchRegionKey：任意輸入 → 群組 label', () => {
  assert.equal(resolveSearchRegionKey('高雄市'), '高雄');
  assert.equal(resolveSearchRegionKey('kaohsiung'), '高雄');
  assert.equal(resolveSearchRegionKey('高雄'), '高雄');
  assert.equal(resolveSearchRegionKey('嘉義市'), '嘉義');
  assert.equal(resolveSearchRegionKey('嘉義縣'), '嘉義');
  assert.equal(resolveSearchRegionKey('chiayi-city'), '嘉義');
  assert.equal(resolveSearchRegionKey('火星'), '');
  assert.equal(resolveSearchRegionKey(''), '');
});

test('REGION_REGISTRY：4 個新 division slug 正確對應', () => {
  assert.equal(REGION_REGISTRY['chiayi-city'].dbValue, '嘉義市');
  assert.equal(REGION_REGISTRY['hsinchu-county'].dbValue, '新竹縣');
  assert.equal(REGION_REGISTRY['changhua'].dbValue, '彰化縣');
  assert.equal(REGION_REGISTRY['yunlin'].dbValue, '雲林縣');
});
