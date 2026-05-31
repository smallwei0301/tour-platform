#!/usr/bin/env node
/**
 * Fix #907: demote 3 playwright/e2e test-seed activities from status=published to draft
 * These test activities appear in /api/activities public listing and /activities/<slug> (HTTP 200)
 * despite PR #900 filtering them from sitemap.
 * Safe: just changes status; no delete; no order/booking impact expected for test fixtures.
 */
import { createClient } from '@supabase/supabase-js';

const client = createClient(
  process.env.SUPABASE_URL || process.env.TOUR_PLATFORM_SUPABASE_URL,
  process.env.TOUR_PLATFORM_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
);

const applyMode = process.env.APPLY === '1';
console.log('Mode:', applyMode ? 'APPLY' : 'DRY-RUN');

const TEST_SLUGS = [
  'playwright-e2e-1775872569478-1775872569552',
  'playwright-e2e-1775872048549-1775872048625',
  'e2e-accept-test-001',
];

// Find the 3 test activities
const { data: activities, error: findErr } = await client
  .from('activities')
  .select('id, slug, title, status')
  .in('slug', TEST_SLUGS);

if (findErr) { console.error('Find failed:', findErr.message); process.exit(1); }

if (!activities?.length) {
  console.log('No matching activities found. Already demoted or slugs changed.');
  process.exit(0);
}

console.log(`Found ${activities.length} test activities:`);
activities.forEach(a => console.log(`  ${a.slug} | status=${a.status} | id=${a.id}`));

// Check FK: orders or bookings referencing these activities
const activityIds = activities.map(a => a.id);
const { data: orders } = await client
  .from('orders')
  .select('id, status')
  .in('activity_id', activityIds)
  .limit(5);

if (orders?.length) {
  console.warn(`⚠️  ${orders.length} order(s) reference these activities. Status: ${orders.map(o => o.status).join(', ')}`);
  console.warn('Proceeding with demote (not delete) is safe — orders remain intact.');
}

if (!applyMode) {
  console.log('DRY-RUN: no changes made. Set APPLY=1 to demote to status=draft.');
  process.exit(0);
}

// Demote to draft
const { error: updateErr } = await client
  .from('activities')
  .update({ status: 'draft' })
  .in('id', activityIds);

if (updateErr) { console.error('Update failed:', updateErr.message); process.exit(1); }

// Verify
const { data: after } = await client
  .from('activities')
  .select('slug, status')
  .in('id', activityIds);

after?.forEach(a => console.log(`AFTER: ${a.slug} → status=${a.status}`));
console.log('DONE ✅ — 3 test activities demoted to draft');
