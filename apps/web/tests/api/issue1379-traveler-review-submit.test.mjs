/**
 * Issue #1379 — 旅客評論提交：completed gate + 驗證購買標章 + rate limit
 *
 * 前提勘誤：POST /api/reviews 與訂單頁表單已存在（#359 家族）。
 * 本 issue 實際缺口：
 *   AC2a: 「非 completed 訂單」server 端必須拒絕（原 route 只驗 ownership 未驗狀態）
 *   AC3a: 旅客評論應標 is_verified=true（驗證購買標章）
 *   加固: 內容長度上限、提交 rate limit
 *
 * 純 helper（review-ownership.mjs）離線可測；route 接線以 source-contract 鎖定。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import {
  isReviewSubmissionAuthorized,
  evaluateReviewSubmission,
} from '../../src/lib/review-ownership.mjs';

const USER = 'user-aaa';
const ownBookingCompleted = { id: 'b1', traveler_id: USER, status: 'completed' };
const ownBookingPaid = { id: 'b2', traveler_id: USER, status: 'paid' };
const foreignBooking = { id: 'b3', traveler_id: 'someone-else', status: 'completed' };
const ownOrderCompleted = { id: 'o1', user_id: USER, status: 'completed' };
const ownOrderPaid = { id: 'o2', user_id: USER, status: 'paid' };

const VALID_INPUT = { rating: 5, reviewText: '很棒的體驗，導遊超專業！' };

test('AC1: owner + completed booking + 合法欄位 → ok', () => {
  const r = evaluateReviewSubmission({
    booking: ownBookingCompleted,
    order: null,
    userId: USER,
    ...VALID_INPUT,
  });
  assert.equal(r.ok, true);
});

test('AC1: owner + completed order（legacy orderId 路徑）→ ok', () => {
  const r = evaluateReviewSubmission({
    booking: null,
    order: ownOrderCompleted,
    userId: USER,
    ...VALID_INPUT,
  });
  assert.equal(r.ok, true);
});

test('AC2: 非 completed（paid）→ 403 NOT_COMPLETED（booking 與 order 兩路徑）', () => {
  for (const target of [
    { booking: ownBookingPaid, order: null },
    { booking: null, order: ownOrderPaid },
  ]) {
    const r = evaluateReviewSubmission({ ...target, userId: USER, ...VALID_INPUT });
    assert.equal(r.ok, false);
    assert.equal(r.status, 403);
    assert.equal(r.code, 'NOT_COMPLETED');
  }
});

test('AC2: 非 owner → 403 FORBIDDEN', () => {
  const r = evaluateReviewSubmission({
    booking: foreignBooking,
    order: null,
    userId: USER,
    ...VALID_INPUT,
  });
  assert.equal(r.ok, false);
  assert.equal(r.status, 403);
  assert.equal(r.code, 'FORBIDDEN');
});

test('AC2: 未登入 → 401', () => {
  const r = evaluateReviewSubmission({
    booking: ownBookingCompleted,
    order: null,
    userId: '',
    ...VALID_INPUT,
  });
  assert.equal(r.status, 401);
  assert.equal(r.code, 'UNAUTHORIZED');
});

test('rating 邊界：0 / 6 / 缺值 → 400 INVALID_RATING；1 與 5 合法', () => {
  for (const rating of [0, 6, undefined, null, 'x']) {
    const r = evaluateReviewSubmission({
      booking: ownBookingCompleted, order: null, userId: USER,
      rating, reviewText: VALID_INPUT.reviewText,
    });
    assert.equal(r.ok, false, `rating=${rating} 應被拒`);
    assert.equal(r.status, 400);
    assert.equal(r.code, 'INVALID_RATING');
  }
  for (const rating of [1, 5]) {
    const r = evaluateReviewSubmission({
      booking: ownBookingCompleted, order: null, userId: USER,
      rating, reviewText: VALID_INPUT.reviewText,
    });
    assert.equal(r.ok, true, `rating=${rating} 應合法`);
  }
});

test('內容長度：空白 → EMPTY_TEXT；>2000 字 → TEXT_TOO_LONG；2000 字內 ok', () => {
  const empty = evaluateReviewSubmission({
    booking: ownBookingCompleted, order: null, userId: USER, rating: 5, reviewText: '   ',
  });
  assert.equal(empty.code, 'EMPTY_TEXT');
  assert.equal(empty.status, 400);

  const tooLong = evaluateReviewSubmission({
    booking: ownBookingCompleted, order: null, userId: USER, rating: 5,
    reviewText: 'x'.repeat(2001),
  });
  assert.equal(tooLong.code, 'TEXT_TOO_LONG');
  assert.equal(tooLong.status, 400);

  const okLen = evaluateReviewSubmission({
    booking: ownBookingCompleted, order: null, userId: USER, rating: 5,
    reviewText: 'x'.repeat(2000),
  });
  assert.equal(okLen.ok, true);
});

test('回溯相容：isReviewSubmissionAuthorized 行為不變', () => {
  assert.equal(
    isReviewSubmissionAuthorized({ booking: ownBookingCompleted, order: null, userId: USER, bookingOwned: true, orderOwned: false }),
    true
  );
  assert.equal(
    isReviewSubmissionAuthorized({ booking: foreignBooking, order: ownOrderCompleted, userId: USER, bookingOwned: false, orderOwned: true }),
    false,
    '存在他人 booking 時不得經 order fallback 通過'
  );
});

// ── source-contract：route 接線 ─────────────────────────────────────────────

const routeSrc = readFileSync(path.resolve('app/api/reviews/route.ts'), 'utf8');

test('接線: route 以 evaluateReviewSubmission 統一守門（含 completed gate），在 insert 之前', () => {
  assert.match(routeSrc, /evaluateReviewSubmission/, 'route 應改用 evaluateReviewSubmission');
  const evalIdx = routeSrc.indexOf('evaluateReviewSubmission(');
  const insertIdx = routeSrc.indexOf(".insert(");
  assert.ok(evalIdx > 0 && evalIdx < insertIdx, '守門應在 .insert( 之前');
});

test('接線: 旅客評論 insert 帶 is_verified: true（驗證購買標章）', () => {
  assert.match(routeSrc, /is_verified:\s*true/, 'insert 應標 is_verified: true');
});

test('接線: 提交套用 rate limit', () => {
  assert.match(routeSrc, /reviewSubmitLimiter|limiters\.reviewSubmit/, '應使用 review 提交 limiter');
  assert.match(routeSrc, /createRateLimitResponse/, '超限應回 429');
});
