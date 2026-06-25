/**
 * 行程 pending overlay 純函式單測。
 *
 * 導遊的修改存在 activities.pending_changes（JSONB），不碰 live 欄位。
 *   - applyPendingOverlay：把 pending_changes 疊在 live 物件上 → 導遊編輯器看到的「進行中」內容。
 *   - buildPendingDiff：產生 live vs pending 的逐欄差異 → admin 審核頁的 diff。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  applyPendingOverlay,
  buildPendingDiff,
} from '../../src/lib/activity-pending-overlay.mjs';

test('applyPendingOverlay：pending 欄位覆蓋 live，未列欄位保持 live 原值', () => {
  const live = { title: '舊標題', priceTwd: 1000, description: '原描述', region: '台北市' };
  const pending = { title: '新標題', priceTwd: 1200 };
  const merged = applyPendingOverlay(live, pending);
  assert.equal(merged.title, '新標題');
  assert.equal(merged.priceTwd, 1200);
  assert.equal(merged.description, '原描述');
  assert.equal(merged.region, '台北市');
});

test('applyPendingOverlay：pending 為 null/空 → 回傳 live 副本（不變動）', () => {
  const live = { title: '標題', priceTwd: 1000 };
  assert.deepEqual(applyPendingOverlay(live, null), live);
  assert.deepEqual(applyPendingOverlay(live, {}), live);
});

test('applyPendingOverlay：不可變 —— 不修改傳入的 live 物件', () => {
  const live = { title: '舊', priceTwd: 1000 };
  applyPendingOverlay(live, { title: '新' });
  assert.equal(live.title, '舊');
});

test('buildPendingDiff：只列出有差異的欄位，附 before/after', () => {
  const live = { title: '舊標題', priceTwd: 1000, description: '同樣的描述' };
  const pending = { title: '新標題', priceTwd: 1000, description: '同樣的描述' };
  const diff = buildPendingDiff(live, pending);
  assert.equal(diff.length, 1);
  assert.deepEqual(diff[0], { field: 'title', before: '舊標題', after: '新標題' });
});

test('buildPendingDiff：陣列/物件型欄位以深層比較判斷差異', () => {
  const live = { inclusions: ['A', 'B'], faq: [{ question: 'q', answer: 'a' }] };
  const pendingSame = { inclusions: ['A', 'B'], faq: [{ question: 'q', answer: 'a' }] };
  assert.equal(buildPendingDiff(live, pendingSame).length, 0);

  const pendingChanged = { inclusions: ['A', 'B', 'C'] };
  const diff = buildPendingDiff(live, pendingChanged);
  assert.equal(diff.length, 1);
  assert.equal(diff[0].field, 'inclusions');
});

test('buildPendingDiff：pending 為 null/空 → 無差異', () => {
  assert.deepEqual(buildPendingDiff({ title: 'x' }, null), []);
  assert.deepEqual(buildPendingDiff({ title: 'x' }, {}), []);
});
