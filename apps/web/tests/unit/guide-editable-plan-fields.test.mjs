/**
 * 導遊方案可編輯欄位白名單 + 建立驗證單測（Phase 2）。
 * 安全關鍵：導遊送來的方案 payload 不能挾帶 status / slug / activity_id / 審核欄位
 * 繞過審核與歸屬保護。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  pickGuideEditablePlanFields,
  validateGuidePlanCreate,
  GUIDE_EDITABLE_PLAN_FIELDS,
} from '../../src/lib/guide-editable-plan-fields.mjs';

test('保留白名單內的方案欄位（含價格、人數、內容）', () => {
  const picked = pickGuideEditablePlanFields({
    name: '半日遊', base_price: 1800, price_type: 'per_person',
    duration_minutes: 240, min_participants: 2, max_participants: 8,
    plan_inclusions: ['保險'], highlights: ['亮點'],
  });
  assert.equal(picked.name, '半日遊');
  assert.equal(picked.base_price, 1800);
  assert.equal(picked.price_type, 'per_person');
  assert.equal(picked.duration_minutes, 240);
  assert.equal(picked.min_participants, 2);
  assert.equal(picked.max_participants, 8);
  assert.deepEqual(picked.plan_inclusions, ['保險']);
  assert.deepEqual(picked.highlights, ['亮點']);
});

test('丟棄危險欄位：status / slug / activity_id / id / legacy_plan_id / 審核欄位', () => {
  const picked = pickGuideEditablePlanFields({
    name: '方案',
    status: 'active',
    slug: 'hijack',
    activity_id: 'other-activity',
    id: 'plan-id',
    legacy_plan_id: 'legacy',
    review_state: 'pending',
    pending_changes: { base_price: 0 },
    pending_new_plan: true,
    review_admin_note: '繞過',
    created_at: '2020-01-01',
    updated_at: '2020-01-01',
  });
  assert.equal(picked.name, '方案');
  for (const forbidden of ['status', 'slug', 'activity_id', 'id', 'legacy_plan_id',
    'review_state', 'pending_changes', 'pending_new_plan', 'review_admin_note',
    'created_at', 'updated_at']) {
    assert.equal(forbidden in picked, false, `${forbidden} 不應通過白名單`);
  }
});

test('未提供的欄位不會出現在輸出（支援部分更新）', () => {
  const picked = pickGuideEditablePlanFields({ base_price: 999 });
  assert.deepEqual(Object.keys(picked), ['base_price']);
});

test('非物件輸入 → 回空物件', () => {
  assert.deepEqual(pickGuideEditablePlanFields(null), {});
  assert.deepEqual(pickGuideEditablePlanFields(undefined), {});
  assert.deepEqual(pickGuideEditablePlanFields('x'), {});
});

test('白名單不含敏感欄位（防呆）', () => {
  for (const forbidden of ['status', 'slug', 'activity_id', 'id', 'legacy_plan_id',
    'review_state', 'pending_changes']) {
    assert.equal(GUIDE_EDITABLE_PLAN_FIELDS.includes(forbidden), false, `${forbidden} 不應在白名單`);
  }
});

test('validateGuidePlanCreate：合法輸入通過', () => {
  const r = validateGuidePlanCreate({
    name: '一日遊', duration_minutes: 480, price_type: 'per_person', base_price: 2500,
    min_participants: 1, max_participants: 10,
  });
  assert.equal(r.ok, true);
});

test('validateGuidePlanCreate：缺名稱／時長過短／價格負／人數區間錯 → 擋下', () => {
  assert.equal(validateGuidePlanCreate({ duration_minutes: 60, price_type: 'per_person', base_price: 100 }).ok, false);
  assert.equal(validateGuidePlanCreate({ name: 'x', duration_minutes: 10, price_type: 'per_person', base_price: 100 }).ok, false);
  assert.equal(validateGuidePlanCreate({ name: 'x', duration_minutes: 60, price_type: 'bad', base_price: 100 }).ok, false);
  assert.equal(validateGuidePlanCreate({ name: 'x', duration_minutes: 60, price_type: 'per_person', base_price: -1 }).ok, false);
  assert.equal(validateGuidePlanCreate({ name: 'x', duration_minutes: 60, price_type: 'per_person', base_price: 100, min_participants: 5, max_participants: 2 }).ok, false);
});
