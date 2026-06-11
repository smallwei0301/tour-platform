const REVIEW_TEXT_MAX_CHARS = 2000;

/**
 * #1379 — 旅客評論提交統一守門（純函式，離線可測）。
 * 驗證順序：登入 → 欄位（rating/內容）→ ownership → completed 狀態。
 *
 * @returns {{ ok: true } | { ok: false, status: number, code: string, message: string }}
 */
export function evaluateReviewSubmission({ booking, order, userId, rating, reviewText }) {
  if (!userId) {
    return { ok: false, status: 401, code: 'UNAUTHORIZED', message: 'login required' };
  }

  const ratingNum = Number(rating);
  if (!rating || !Number.isFinite(ratingNum) || ratingNum < 1 || ratingNum > 5) {
    return { ok: false, status: 400, code: 'INVALID_RATING', message: 'rating must be 1-5' };
  }

  const text = typeof reviewText === 'string' ? reviewText.trim() : '';
  if (!text) {
    return { ok: false, status: 400, code: 'EMPTY_TEXT', message: 'review text required' };
  }
  if (text.length > REVIEW_TEXT_MAX_CHARS) {
    return {
      ok: false,
      status: 400,
      code: 'TEXT_TOO_LONG',
      message: `review text must be at most ${REVIEW_TEXT_MAX_CHARS} characters`,
    };
  }

  const owned = isReviewSubmissionAuthorized({
    booking,
    order,
    userId,
    bookingOwned: booking ? booking.traveler_id === userId : false,
    orderOwned: !booking && order ? order.user_id === userId : false,
  });
  if (!owned) {
    return { ok: false, status: 403, code: 'FORBIDDEN', message: 'booking not owned by user' };
  }

  const targetStatus = booking ? booking.status : order?.status;
  if (targetStatus !== 'completed') {
    return {
      ok: false,
      status: 403,
      code: 'NOT_COMPLETED',
      message: '行程完成後才能撰寫評價',
    };
  }

  return { ok: true };
}

export function isReviewSubmissionAuthorized({
  booking,
  order,
  userId,
  bookingOwned,
  orderOwned,
}) {
  if (!userId) {
    return false;
  }

  if (booking) {
    return bookingOwned ?? booking.traveler_id === userId;
  }

  return orderOwned ?? Boolean(order?.user_id === userId);
}
