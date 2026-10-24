/**
 * #1926：評價邀請失敗重試上限（純函式）。
 * - evaluateReviewInvitationIdempotency 的選用參數 maxFailedAttempts
 * - sweep 決策端傳入 REVIEW_INVITATION_SWEEP_MAX_FAILED_ATTEMPTS（3），failed 達上限即跳過
 * 候選範圍（首次啟用寄所有符合條件的歷史訂單）不在本測試範圍，也未改動。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { redactEmailsInText, redactErrorForReport } from '../../src/lib/post-trip/sweep/redact-error-email.mjs';
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

test('suppressed 不計入上限：3 筆 suppressed + 0 筆 failed 仍允許寄送', () => {
  const r = evaluateReviewInvitationIdempotency({
    existingInvitations: Array.from({ length: 3 }, () => ({ status: 'suppressed' })),
    maxFailedAttempts: 3,
  });
  assert.equal(r.allowSend, true);
});

test('admin 手動寄送不受上限影響：未傳 maxFailedAttempts 時 3 筆以上 failed 仍 allowSend', () => {
  for (const n of [3, 5]) {
    assert.equal(evaluateReviewInvitationIdempotency({ existingInvitations: failed(n) }).allowSend, true);
  }
  const WEB = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
  const src = readFileSync(path.join(WEB, 'app/api/v2/admin/orders/[orderId]/send-review-invitation/route.ts'), 'utf8');
  assert.match(src, /evaluateReviewInvitationIdempotency\(/);
  assert.ok(!src.includes('maxFailedAttempts'), 'admin route 不得傳 maxFailedAttempts');
});

test('redactEmailsInText／redactErrorForReport：email 換成 [email]，其餘保留，stack 不外帶', () => {
  // 規格 regex 為 /[^\s@]+@[^\s@]+/g，緊接 email 的標點會一併被吞（寧可多遮不漏）
  assert.equal(redactEmailsInText('rejected a.b+c@ex.co full'), 'rejected [email] full');
  const e = redactErrorForReport(new Error('to user@example.com failed'));
  assert.ok(e instanceof Error);
  assert.equal(e.message, 'to [email] failed');
  assert.ok(!String(e.stack).includes('user@example.com'));
  assert.equal(redactErrorForReport('x@y.z').message, '[email]');
  assert.equal(redactEmailsInText(null), '');
});

test('遮罩效能：100k 字元、不含 @ 的字串在 50ms 內完成，且被截斷', () => {
  const big = 'a'.repeat(100_000);
  const t0 = performance.now();
  const out = redactEmailsInText(big);
  const ms = performance.now() - t0;
  assert.ok(ms < 50, `耗時 ${ms.toFixed(1)}ms`);
  assert.ok(out.endsWith('…[truncated]'));
  assert.ok(out.length < 2100);
});

test('長字串中段的 email 不會留在截斷後結果；跨截斷邊界的 email 也不殘留完整位址', () => {
  const mid = 'x '.repeat(30_000) + 'user@example.com' + ' y'.repeat(30_000);
  assert.ok(!redactEmailsInText(mid).includes('user@example.com'));
  const edge = 'z'.repeat(1990) + ' user@example.com tail';
  const out = redactEmailsInText(edge);
  assert.ok(!out.includes('user@example.com'));
  assert.ok(!out.includes('user@'));
  assert.ok(!redactErrorForReport(new Error(mid)).message.includes('user@example.com'));
});
