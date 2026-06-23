/**
 * #multilingual Phase 0 — i18n message fallback（deep-merge）契約測試。
 *
 * zh-Hant 是 source of truth；目標語言缺鍵時必須 fallback 回 zh-Hant，
 * 確保畫面永不出現空字串或裸鍵。
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { deepMergeMessages } from '../../src/i18n/deep-merge.ts';
import zhHant from '../../messages/zh-Hant.json' with { type: 'json' };
import en from '../../messages/en.json' with { type: 'json' };

test('override 有的鍵用 override 值', () => {
  const merged = deepMergeMessages({ nav: { explore: '探索行程' } }, { nav: { explore: 'Explore' } });
  assert.equal(merged.nav.explore, 'Explore');
});

test('override 缺的鍵 fallback 回 base（zh-Hant）', () => {
  const merged = deepMergeMessages(
    { nav: { explore: '探索行程', guides: '認識導遊' } },
    { nav: { explore: 'Explore' } },
  );
  assert.equal(merged.nav.guides, '認識導遊');
});

test('巢狀物件遞迴合併，未覆蓋的深層鍵保留 base', () => {
  const merged = deepMergeMessages(
    { availability: { full: { title: '已額滿', body: '名額已滿' } } },
    { availability: { full: { title: 'Fully booked' } } },
  );
  assert.equal(merged.availability.full.title, 'Fully booked');
  assert.equal(merged.availability.full.body, '名額已滿');
});

test('override 為 null/undefined 時回傳 base 的淺拷貝', () => {
  const base = { a: '1' };
  const merged = deepMergeMessages(base, null);
  assert.deepEqual(merged, base);
  assert.notEqual(merged, base);
});

test('不變動傳入物件', () => {
  const base = { nav: { explore: '探索行程' } };
  const override = { nav: { explore: 'Explore' } };
  deepMergeMessages(base, override);
  assert.equal(base.nav.explore, '探索行程');
});

test('en catalog 的每個 namespace 都存在於 zh-Hant（避免孤兒鍵）', () => {
  for (const ns of Object.keys(en)) {
    assert.ok(ns in zhHant, `en 的 namespace "${ns}" 不在 zh-Hant 中`);
  }
});

test('merge en 後所有 zh-Hant 鍵都仍有值（無漏譯造成空畫面）', () => {
  const merged = deepMergeMessages(zhHant, en);
  const walk = (node, path) => {
    for (const [k, v] of Object.entries(node)) {
      if (typeof v === 'string') {
        assert.ok(v.length > 0, `${path}${k} 為空字串`);
      } else {
        walk(v, `${path}${k}.`);
      }
    }
  };
  walk(merged, '');
});
