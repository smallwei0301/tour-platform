import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeRegionForActivityPath } from '../../src/lib/region-slug.mjs';
import { REGION_REGISTRY } from '../../src/lib/region-slugs.mjs';

// 回歸：開放全台縣市複選後，每個縣市全名都必須對應到正確 URL slug。
// 過去 region-slug.mjs 只收錄少數縣市，其餘（屏東／宜蘭／台東…）會被 ASCII 化成
// 'taiwan'，造成這些地區的行程詳情頁 URL 與 revalidate 路徑全錯（broken URL）。

test('全台 18 縣市的 DB 全名都對應到 REGION_REGISTRY 的正確 slug', () => {
  for (const entry of Object.values(REGION_REGISTRY)) {
    assert.equal(
      normalizeRegionForActivityPath(entry.dbValue),
      entry.slug,
      `${entry.dbValue} 應對應 slug ${entry.slug}`,
    );
  }
});

test('沒有任何縣市退回 fallback "taiwan"', () => {
  for (const entry of Object.values(REGION_REGISTRY)) {
    assert.notEqual(
      normalizeRegionForActivityPath(entry.dbValue),
      'taiwan',
      `${entry.dbValue} 不應被 ASCII 化成 taiwan`,
    );
  }
});

test('常見短名（高雄／花蓮／屏東…）也對應正確 slug', () => {
  assert.equal(normalizeRegionForActivityPath('屏東'), 'pingtung');
  assert.equal(normalizeRegionForActivityPath('宜蘭'), 'yilan');
  assert.equal(normalizeRegionForActivityPath('台東'), 'taitung');
  assert.equal(normalizeRegionForActivityPath('馬祖'), 'matsu');
});
