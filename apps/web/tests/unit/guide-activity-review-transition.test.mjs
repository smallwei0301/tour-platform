/**
 * 導遊行程審核狀態機（純函式）單測。
 *
 * 行程審核（guide 送審 → admin 核准/退回）的狀態轉移規則，仿 refund-transition.mjs，
 * 與 db.mjs（Supabase）共用同一份規則、離線可單測。
 *
 * review_state 三態：null（無待審）/ 'pending'（待審）/ 'changes_requested'（已退回待修）。
 * 上架（status=published）不在此狀態機內 —— 由 route 沿用既有 validateActivityBookability 把關。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveActivityReviewTransition } from '../../src/lib/activity-review-transition.mjs';

const NOW = '2026-06-24T00:00:00.000Z';

test('submit → review_state 轉為 pending，不套用/不清除 pending_changes', () => {
  const r = resolveActivityReviewTransition('submit', { now: NOW });
  assert.equal(r.reviewState, 'pending');
  assert.equal(r.applyPending, false);
  assert.equal(r.clearPending, false);
  assert.equal(r.recordSubmission, true);
});

test('approve → 套用 pending_changes 進 live、清空 pending、review_state 歸 null', () => {
  const r = resolveActivityReviewTransition('approve', { now: NOW });
  assert.equal(r.reviewState, null);
  assert.equal(r.applyPending, true);
  assert.equal(r.clearPending, true);
});

test('reject → review_state 轉 changes_requested，保留 pending_changes 讓導遊續修', () => {
  const r = resolveActivityReviewTransition('reject', { now: NOW });
  assert.equal(r.reviewState, 'changes_requested');
  assert.equal(r.applyPending, false);
  // 退回不清除：導遊看得到自己填的內容、改完可再送審（計劃邊角案例 #4）
  assert.equal(r.clearPending, false);
});

test('未知 action 應丟錯', () => {
  assert.throws(() => resolveActivityReviewTransition('publish', { now: NOW }), /invalid activity review action/);
});
