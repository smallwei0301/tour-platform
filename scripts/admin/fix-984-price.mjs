#!/usr/bin/env node
/**
 * Fix #984: activity-1780038051379 full-day-complete base_price 19 → 3000
 * Wei confirmed correct price is NT$3,000 (2026-05-31T09:51 Taipei)
 */
import { createClient } from '@supabase/supabase-js';

const client = createClient(
  process.env.SUPABASE_URL || process.env.TOUR_PLATFORM_SUPABASE_URL,
  process.env.TOUR_PLATFORM_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
);

const applyMode = process.env.APPLY === '1';
console.log('Mode:', applyMode ? 'APPLY' : 'DRY-RUN');

// Find activity
const { data: acts, error: actErr } = await client
  .from('activities')
  .select('id, slug, title')
  .ilike('slug', '%1780038051379%');

if (actErr || !acts?.length) {
  console.error('Activity not found:', actErr?.message);
  process.exit(1);
}
const activity = acts[0];
console.log('Activity:', activity.slug, '|', activity.title);

// Find formal plan
const { data: plan, error: planErr } = await client
  .from('activity_plans')
  .select('id, slug, base_price, status')
  .eq('activity_id', activity.id)
  .eq('slug', 'full-day-complete')
  .single();

if (planErr || !plan) {
  console.error('Plan not found:', planErr?.message);
  process.exit(1);
}

console.log(`BEFORE: activity_plans.base_price = ${plan.base_price}`);
console.log(`TARGET: base_price → 3000`);

if (!applyMode) {
  console.log('DRY-RUN: no changes made. Set APPLY=1 to apply.');
  process.exit(0);
}

// Apply update
const { error: updateErr } = await client
  .from('activity_plans')
  .update({ base_price: 3000 })
  .eq('id', plan.id);

if (updateErr) {
  console.error('Update failed:', updateErr.message);
  process.exit(1);
}

// Verify
const { data: after } = await client
  .from('activity_plans')
  .select('base_price')
  .eq('id', plan.id)
  .single();

console.log(`AFTER: activity_plans.base_price = ${after.base_price}`);
console.log('DONE ✅');
