import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveActivityPriceUnit } from '../../src/lib/activity-price-unit.mjs';

// 行程公開頁的「活動層級起價」單位（hero／側欄／底部 CTA 預設狀態）必須跟著
// 方案計價方式走：只要所有方案都是「每團報價」就顯示每團單位，否則維持每人。
test('所有方案皆為每團 → per_group（normalize 後的 priceType 形狀）', () => {
  const plans = [
    { id: 'a', priceType: 'per_group' },
    { id: 'b', priceType: 'per_group' },
  ];
  assert.equal(resolveActivityPriceUnit(plans), 'per_group');
});

test('所有方案皆為每團 → per_group（資料庫原始 price_type 形狀）', () => {
  const plans = [
    { id: 'a', price_type: 'per_group' },
    { id: 'b', price_type: 'per_group' },
  ];
  assert.equal(resolveActivityPriceUnit(plans), 'per_group');
});

test('單一每團方案 → per_group', () => {
  assert.equal(resolveActivityPriceUnit([{ id: 'a', priceType: 'per_group' }]), 'per_group');
});

test('混合每團與每人 → 保守回 per_person', () => {
  const plans = [
    { id: 'a', priceType: 'per_group' },
    { id: 'b', priceType: 'per_person' },
  ];
  assert.equal(resolveActivityPriceUnit(plans), 'per_person');
});

test('所有方案皆為每人 → per_person', () => {
  assert.equal(resolveActivityPriceUnit([{ priceType: 'per_person' }]), 'per_person');
});

test('無方案／空陣列 → per_person（保留 legacy 預設）', () => {
  assert.equal(resolveActivityPriceUnit([]), 'per_person');
  assert.equal(resolveActivityPriceUnit(null), 'per_person');
  assert.equal(resolveActivityPriceUnit(undefined), 'per_person');
});

test('忽略 null／非物件項目，仍依有效方案判斷', () => {
  const plans = [null, undefined, { priceType: 'per_group' }];
  assert.equal(resolveActivityPriceUnit(plans), 'per_group');
});

test('未知／缺漏的 price_type 視為非每團 → per_person', () => {
  assert.equal(resolveActivityPriceUnit([{ id: 'a' }]), 'per_person');
  assert.equal(resolveActivityPriceUnit([{ priceType: 'weird' }]), 'per_person');
});
