#!/usr/bin/env node
/**
 * scripts/qa/seed-qa-test-orders.mjs
 *
 * Issue #430 — QA Seed Script
 *
 * Inserts two test orders for the QA traveler (Rita):
 *   1. A 'paid' order linked to an open future schedule (start_at > now + 7d)
 *   2. A 'completed' order (uses a past schedule if available, otherwise same future one)
 *
 * Both orders are tagged with admin_note containing 'qa-seed:rita:v1' for idempotency.
 *
 * Usage:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... TOUR_PLATFORM_TRAVELER_EMAIL=... \
 *     node scripts/qa/seed-qa-test-orders.mjs
 *
 * Idempotent: re-running prints existing order URLs without inserting duplicates.
 */

import { createClient } from '@supabase/supabase-js';

// ---------------------------------------------------------------------------
// Env validation (AC4)
// ---------------------------------------------------------------------------
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const TOUR_PLATFORM_TRAVELER_EMAIL = process.env.TOUR_PLATFORM_TRAVELER_EMAIL;

if (!SUPABASE_URL) {
  console.error('Missing required env var: SUPABASE_URL');
  process.exit(1);
}
if (!SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing required env var: SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}
if (!TOUR_PLATFORM_TRAVELER_EMAIL) {
  console.error('Missing required env var: TOUR_PLATFORM_TRAVELER_EMAIL');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const QA_MARKER = 'qa-seed:rita:v1';
const BASE_URL = 'https://tour-platform-nine.vercel.app/me/orders';
const TRAVELER_EMAIL = TOUR_PLATFORM_TRAVELER_EMAIL;

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
export async function main() {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // ------------------------------------------------------------------
  // AC2: Idempotency — check if QA orders already exist
  // ------------------------------------------------------------------
  const { data: existing, error: existingError } = await supabase
    .from('orders')
    .select('id, status')
    .eq('contact_email', TRAVELER_EMAIL)
    .in('status', ['paid', 'completed'])
    .like('admin_note', `%qa-seed:rita%`);

  if (existingError) {
    console.error('Failed to query existing QA orders:', existingError.message);
    process.exit(1);
  }

  const existingPaid = existing?.find((o) => o.status === 'paid');
  const existingCompleted = existing?.find((o) => o.status === 'completed');

  if (existingPaid && existingCompleted) {
    console.log('[qa-seed] Idempotency: QA orders already exist. Skipping insert.');
    console.log(`${BASE_URL}/${existingPaid.id}`);
    console.log(`${BASE_URL}/${existingCompleted.id}`);
    return { paidOrderId: existingPaid.id, completedOrderId: existingCompleted.id };
  }

  // ------------------------------------------------------------------
  // Step 1: Find first activity with a future schedule (start_at > now + 7d)
  // ------------------------------------------------------------------
  const sevenDaysFromNow = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  const { data: futureSchedules, error: futureError } = await supabase
    .from('activity_schedules')
    .select('id, activity_id, start_at, end_at, capacity, booked_count')
    .eq('status', 'open')
    .gt('start_at', sevenDaysFromNow)
    .order('start_at', { ascending: true })
    .limit(1);

  if (futureError) {
    console.error('Failed to query future schedules:', futureError.message);
    process.exit(1);
  }

  if (!futureSchedules || futureSchedules.length === 0) {
    console.error('No open future schedule found (start_at > now + 7d). Cannot seed paid order.');
    process.exit(1);
  }

  const futureSchedule = futureSchedules[0];
  const activityId = futureSchedule.activity_id;

  // ------------------------------------------------------------------
  // Step 2: Fetch activity price
  // ------------------------------------------------------------------
  const { data: activity, error: activityError } = await supabase
    .from('activities')
    .select('id, title, price_twd')
    .eq('id', activityId)
    .single();

  if (activityError || !activity) {
    console.error('Failed to fetch activity:', activityError?.message || 'not found');
    process.exit(1);
  }

  // ------------------------------------------------------------------
  // Step 3: Find a past schedule for the 'completed' order
  //         (same activity, start_at < now). Fall back to futureSchedule.
  // ------------------------------------------------------------------
  const now = new Date().toISOString();

  const { data: pastSchedules } = await supabase
    .from('activity_schedules')
    .select('id, activity_id, start_at, end_at')
    .eq('activity_id', activityId)
    .lt('start_at', now)
    .order('start_at', { ascending: false })
    .limit(1);

  const completedSchedule =
    pastSchedules && pastSchedules.length > 0 ? pastSchedules[0] : futureSchedule;

  // ------------------------------------------------------------------
  // Step 4: Insert the 'paid' order (if not already present)
  // ------------------------------------------------------------------
  let paidOrderId = existingPaid?.id;

  if (!paidOrderId) {
    const paidPayload = {
      activity_id: activityId,
      schedule_id: futureSchedule.id,
      status: 'paid',
      people_count: 1,
      total_twd: activity.price_twd,
      contact_name: 'Rita QA',
      contact_phone: '+886900000000',
      contact_email: TRAVELER_EMAIL,
      admin_note: QA_MARKER,
      paid_at: new Date().toISOString(),
    };

    const { data: paidOrder, error: paidError } = await supabase
      .from('orders')
      .insert(paidPayload)
      .select('id')
      .single();

    if (paidError || !paidOrder) {
      console.error('Failed to insert paid order:', paidError?.message || 'unknown error');
      process.exit(1);
    }

    paidOrderId = paidOrder.id;
    console.log(`[qa-seed] Inserted paid order: ${paidOrderId}`);
  }

  // ------------------------------------------------------------------
  // Step 5: Insert the 'completed' order (if not already present)
  // ------------------------------------------------------------------
  let completedOrderId = existingCompleted?.id;

  if (!completedOrderId) {
    const completedPayload = {
      activity_id: activityId,
      schedule_id: completedSchedule.id,
      status: 'completed',
      people_count: 1,
      total_twd: activity.price_twd,
      contact_name: 'Rita QA',
      contact_phone: '+886900000000',
      contact_email: TRAVELER_EMAIL,
      admin_note: QA_MARKER,
      paid_at: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
    };

    const { data: completedOrder, error: completedError } = await supabase
      .from('orders')
      .insert(completedPayload)
      .select('id')
      .single();

    if (completedError || !completedOrder) {
      console.error('Failed to insert completed order:', completedError?.message || 'unknown error');
      process.exit(1);
    }

    completedOrderId = completedOrder.id;
    console.log(`[qa-seed] Inserted completed order: ${completedOrderId}`);
  }

  // ------------------------------------------------------------------
  // Step 6: Print order URLs (AC1)
  // ------------------------------------------------------------------
  console.log(`${BASE_URL}/${paidOrderId}`);
  console.log(`${BASE_URL}/${completedOrderId}`);

  return { paidOrderId, completedOrderId };
}

// Run when executed directly
main().catch((err) => {
  console.error('[qa-seed] Unexpected error:', err?.message || err);
  process.exit(1);
});
