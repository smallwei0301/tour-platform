/**
 * #1926：評價邀請失敗重試上限（純函式）。
 * - evaluateReviewInvitationIdempotency 的選用參數 maxFailedAttempts
 * - sweep 決策端傳入 REVIEW_INVITATION_SWEEP_MAX_FAILED_ATTEMPTS（3），failed 達上限即跳過
 * 候選範圍（首次啟用寄所有符合條件的歷史訂單）不在本測試範圍，也未改動。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateReviewInvitationIdempotency } from '../../src/lib/post-trip/review-invitation.mjs';
import {
  evaluateReviewInvitationSweepCandidates,
  REVIEW_INVITATION_SWEEP_MAX_FAILED_ATTEMPTS,
} from '../../src/lib/post-trip/review-invitation-sweep.mjs';

const failed = (n) => Array.from({ length: n }, () => ({ status: 'failed' }));

test('sweep 上限常數為 3', () => {
  assert.equal(REVIEW_INVITATION_SWEEP_MAX_FAILED_ATTEMPTS, 3);
});

test('failed 0／1／2 次（上限 3）→ 允許寄送', () => {
  assert.deepEqual(
    evaluateReviewInvitationIdempotency({ existingInvitations: failed(0), maxFailedAttempts: 3 }),
    { allowSend: true, code: 'first_send' },
  );
  for (const n of [1, 2]) {
    const r = evaluateReviewInvitationIdempotency({ existingInvitations: failed(n), maxFailedAttempts: 3 });
    assert.equal(r.allowSend, true);
    assert.equal(r.code, 'retry_after_failure');
  }
});

test('failed 3 次（含以上）→ retry_exhausted', () => {
  for (const n of [3, 4]) {
    const r = evaluateReviewInvitationIdempotency({ existingInvitations: failed(n), maxFailedAttempts: 3 });
    assert.equal(r.allowSend, false);
    assert.equal(r.code, 'retry_exhausted');
    assert.equal(r.reasonZh, '寄送失敗次數已達上限');
  }
});

test('有 sent → 維持 already_sent（即使 failed 也超過上限）', () => {
  const r = evaluateReviewInvitationIdempotency({
    existingInvitations: [...failed(5), { status: 'sent' }],
    maxFailedAttempts: 3,
  });
  assert.equal(r.allowSend, false);
  assert.equal(r.code, 'already_sent');
});

test('沒傳 maxFailedAttempts → 與原行為一致（failed 再多都允許）', () => {
  const r = evaluateReviewInvitationIdempotency({ existingInvitations: failed(10) });
  assert.deepEqual(r, { allowSend: true, code: 'retry_after_failure' });
});

test('sweep 決策：failed 3 次的訂單 skip（IDEMPOTENCY／retry_exhausted），2 次仍 send', () => {
  const NOW = '2026-06-04T12:00:00.000Z';
  const endAt = '2026-06-01T12:00:00.000Z';
  const mk = (id) => ({ id, status: 'paid', scheduleEndAt: endAt, hasDispute: false });
  const { decisions } = evaluateReviewInvitationSweepCandidates({
    orders: [mk('a'), mk('b'), mk('c')],
    existingInvitationsByOrderId: { a: failed(3), b: failed(2) },
    now: NOW,
    featureEnabled: true,
  });
  const by = Object.fromEntries(decisions.map((d) => [d.orderId, d]));
  assert.equal(by.a.action, 'skip');
  assert.equal(by.a.reason, 'IDEMPOTENCY');
  assert.equal(by.a.code, 'retry_exhausted');
  assert.equal(by.b.action, 'send');
  assert.equal(by.c.action, 'send');
});
