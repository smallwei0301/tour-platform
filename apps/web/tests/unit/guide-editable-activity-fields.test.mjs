/**
 * 導遊可編輯欄位白名單單測 —— 安全關鍵：確保導遊送來的 payload 不能挾帶
 * status / guideSlug / ratingAvg / plans 等敏感欄位繞過審核與歸屬保護。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  pickGuideEditableFields,
  GUIDE_EDITABLE_ACTIVITY_FIELDS,
} from '../../src/lib/guide-editable-activity-fields.mjs';

test('保留白名單內的內容欄位', () => {
  const picked = pickGuideEditableFields({
    title: '行程', priceTwd: 1200, description: '描述', faq: [{ question: 'q', answer: 'a' }],
  });
  assert.equal(picked.title, '行程');
  assert.equal(picked.priceTwd, 1200);
  assert.equal(picked.description, '描述');
  assert.deepEqual(picked.faq, [{ question: 'q', answer: 'a' }]);
});

test('丟棄危險欄位：status / guideSlug / guideId / ratingAvg / reviewCount / plans', () => {
  const picked = pickGuideEditableFields({
    title: '行程',
    status: 'published',
    guideSlug: 'someone-else',
    guideId: 'g999',
    ratingAvg: 5,
    reviewCount: 999,
    plans: [{ name: '惡意方案' }],
    minParticipants: 1,
    maxParticipants: 99,
  });
  assert.equal(picked.title, '行程');
  assert.equal('status' in picked, false);
  assert.equal('guideSlug' in picked, false);
  assert.equal('guideId' in picked, false);
  assert.equal('ratingAvg' in picked, false);
  assert.equal('reviewCount' in picked, false);
  assert.equal('plans' in picked, false);
  assert.equal('minParticipants' in picked, false);
  assert.equal('maxParticipants' in picked, false);
});

test('未提供的欄位不會出現在輸出（支援部分更新）', () => {
  const picked = pickGuideEditableFields({ title: '只改標題' });
  assert.deepEqual(Object.keys(picked), ['title']);
});

test('非物件輸入 → 回空物件', () => {
  assert.deepEqual(pickGuideEditableFields(null), {});
  assert.deepEqual(pickGuideEditableFields(undefined), {});
  assert.deepEqual(pickGuideEditableFields('x'), {});
});

test('白名單不含敏感欄位（防呆）', () => {
  for (const forbidden of ['status', 'guideSlug', 'guideId', 'ratingAvg', 'reviewCount', 'plans']) {
    assert.equal(GUIDE_EDITABLE_ACTIVITY_FIELDS.includes(forbidden), false, `${forbidden} 不應在白名單`);
  }
});
