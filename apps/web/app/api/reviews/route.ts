import { NextRequest, NextResponse } from 'next/server';
import { ok, fail } from '../../../src/lib/api';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { createClient } from '../../../src/lib/supabase/server';

function getServiceClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}

export async function POST(req: NextRequest) {
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

  const { activityId, bookingId, rating, reviewText } = body as {
    activityId?: unknown;
    bookingId?: unknown;
    rating?: unknown;
    reviewText?: unknown;
  };

  // Validate rating
  const ratingNum = Number(rating);
  if (!rating || ratingNum < 1 || ratingNum > 5) {
    return NextResponse.json(fail('INVALID_RATING', 'rating must be 1-5'), { status: 400 });
  }

  // Validate reviewText
  const reviewTextStr = typeof reviewText === 'string' ? reviewText.trim() : '';
  if (!reviewTextStr) {
    return NextResponse.json(fail('EMPTY_TEXT', 'review text required'), { status: 400 });
  }

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

  const bookingOwned = Boolean(booking && booking.traveler_id === user.id);

  let orderOwned = false;
  if (!bookingOwned) {
    const { data: order } = await adminSupabase
      .from('orders')
      .select('id, user_id, status')
      .eq('id', reviewTargetId)
      .maybeSingle();
    orderOwned = Boolean(order && order.user_id === user.id);
  }

  if (!bookingOwned && !orderOwned) {
    return NextResponse.json(fail('FORBIDDEN', 'booking not owned by user'), { status: 403 });
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
  const { data: review, error } = await adminSupabase
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
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json(fail('DB_ERROR', error.message), { status: 500 });
  }

  return NextResponse.json(ok(review), { status: 201 });
}
