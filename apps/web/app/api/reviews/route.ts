import { NextRequest, NextResponse } from 'next/server';
import { ok, fail } from '../../../src/lib/api';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { createClient } from '../../../src/lib/supabase/server';
import { evaluateReviewSubmission } from '../../../src/lib/review-ownership.mjs';
import { reviewSubmitLimiter, RateLimiter, createRateLimitResponse } from '../../../src/lib/rate-limit';
import { getSupabaseServiceRoleKey } from '../../../src/config/supabase-service-env.mjs';

function getServiceClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    getSupabaseServiceRoleKey()!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}

export async function POST(req: NextRequest) {
  // #1379: 評論提交 rate limit（5 次/分鐘/IP）
  const rateResult = reviewSubmitLimiter.check(`review-submit:${RateLimiter.getClientIp(req)}`);
  const rateLimited = createRateLimitResponse(rateResult);
  if (rateLimited) return rateLimited;

  // AC3 + AC7: Require authenticated user (browser session cookie)
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(fail('UNAUTHORIZED', 'login required'), { status: 401 });
  }

  // Parse body
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(fail('INVALID_REQUEST', 'invalid JSON body'), { status: 400 });
  }

  const { activityId, bookingId, rating, reviewText, photoUrls } = body as {
    activityId?: unknown;
    bookingId?: unknown;
    rating?: unknown;
    reviewText?: unknown;
    photoUrls?: unknown;
  };

  const ratingNum = Number(rating);
  const reviewTextStr = typeof reviewText === 'string' ? reviewText.trim() : '';

  // 評價照片（選填）：只接受本平台 review-photos bucket 的 public URL，最多 5 張，
  // 避免被當成任意外連圖床（SSRF/濫用）。順序保留旅客上傳順序。
  const REVIEW_PHOTO_MAX = 5;
  const storagePublicPrefix = '/storage/v1/object/public/review-photos/';
  const photoUrlList = Array.isArray(photoUrls)
    ? photoUrls
        .filter((u): u is string => typeof u === 'string' && u.includes(storagePublicPrefix))
        .slice(0, REVIEW_PHOTO_MAX)
    : [];

  const adminSupabase = getServiceClient();

  const reviewTargetId = String(bookingId || '').trim();
  if (!reviewTargetId) {
    return NextResponse.json(fail('INVALID_REQUEST', 'bookingId/orderId required'), { status: 400 });
  }

  // AC7: Verify ownership.
  // Primary contract: bookings.id + bookings.traveler_id
  // Compatibility fallback: legacy clients may pass orderId in bookingId field.
  const { data: booking } = await adminSupabase
    .from('bookings')
    .select('id, traveler_id, status')
    .eq('id', reviewTargetId)
    .maybeSingle();

  let order;
  if (!booking) {
    ({ data: order } = await adminSupabase
      .from('orders')
      .select('id, user_id, status')
      .eq('id', reviewTargetId)
      .maybeSingle());
  }

  // #1379: 統一守門 — 欄位驗證 + ownership + completed gate（行程完成後才能評論）
  const verdict = evaluateReviewSubmission({
    booking,
    order,
    userId: user.id,
    rating,
    reviewText: reviewTextStr,
  });
  if (!verdict.ok) {
    return NextResponse.json(fail(verdict.code, verdict.message), { status: verdict.status });
  }

  // AC3: Idempotency — check if review already exists for this (user_id, booking_id)
  const { data: existing } = await adminSupabase
    .from('activity_reviews')
    .select('id')
    .eq('user_id', user.id)
    .eq('booking_id', reviewTargetId)
    .maybeSingle();

  if (existing) {
    return NextResponse.json(fail('ALREADY_REVIEWED', 'review already submitted for this booking'), { status: 409 });
  }

  // AC3: Insert pending review
  let { data: review, error } = await adminSupabase
    .from('activity_reviews')
    .insert({
      id: crypto.randomUUID(),
      activity_slug: String(activityId || ''),
      rating: ratingNum,
      review_text: reviewTextStr,
      user_id: user.id,
      booking_id: reviewTargetId,
      status: 'pending',
      review_date: new Date().toISOString().split('T')[0],
      author: user.email || user.id,
      guide_slug: '',
      photo_urls: photoUrlList,
      // #1379: 一律來自本人完成訂單 → 驗證購買標章
      is_verified: true,
    })
    .select()
    .single();

  // schema-drift guard：photo_urls 欄位若尚未 migrate（42703）→ 退回不含照片的插入，
  // 評論本體不因照片欄位缺失而整筆失敗。
  if (error && (error.code === '42703' || /column .*photo_urls.* does not exist/i.test(error.message || ''))) {
    ({ data: review, error } = await adminSupabase
      .from('activity_reviews')
      .insert({
        id: crypto.randomUUID(),
        activity_slug: String(activityId || ''),
        rating: ratingNum,
        review_text: reviewTextStr,
        user_id: user.id,
        booking_id: reviewTargetId,
        status: 'pending',
        review_date: new Date().toISOString().split('T')[0],
        author: user.email || user.id,
        guide_slug: '',
        is_verified: true,
      })
      .select()
      .single());
  }

  if (error) {
    return NextResponse.json(fail('DB_ERROR', error.message), { status: 500 });
  }

  return NextResponse.json(ok(review), { status: 201 });
}
