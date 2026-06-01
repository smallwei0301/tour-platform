#!/usr/bin/env node
/**
 * repair-909-apply.mjs — APPLY script for issue #909
 *
 * Repairs 5 MISSING_FORMAL_PLAN cases and 1 NEEDS_HUMAN_REVIEW price fix
 * as approved by Wei on 2026-05-31.
 *
 * Decisions (confirmed by Wei):
 *   Cases 1-5 (MISSING_FORMAL_PLAN): Option A — create formal activity_plans rows
 *   Case 6 (half-day-morning public price): Y — update activities.plans price to NT$1,800
 *
 * Safety gate: Requires APPLY=1 env var.
 * All INSERTs use ON CONFLICT(activity_id, slug) DO NOTHING (idempotent).
 *
 * Usage:
 *   # Dry-run (default, no writes):
 *   node --env-file=.env scripts/admin/repair-909-apply.mjs
 *
 *   # Apply (writes to DB):
 *   APPLY=1 node --env-file=.env scripts/admin/repair-909-apply.mjs
 *
 * Note: --env-file does not expand $VAR references; set SUPABASE_URL and
 * SUPABASE_SERVICE_ROLE_KEY directly if using a .env with cross-references.
 */

// ── Supabase client ──────────────────────────────────────────────────────────

async function createClientFromEnv() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('missing required env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY');
  }
  // SAFETY: never log the key
  let createClient;
  try {
    ({ createClient } = await import('@supabase/supabase-js'));
  } catch {
    const { createClient: cc } = await import(
      new URL('../../../node_modules/@supabase/supabase-js/dist/index.mjs', import.meta.url).href
    );
    createClient = cc;
  }
  return createClient(url, key);
}

// ── Plan definitions (derived from dry-run report + DB data) ──────────────────

/**
 * 5 plans to INSERT as new activity_plans rows.
 * Fields: activity_id, slug, name, base_price, duration_minutes,
 *         max_participants, min_participants, status, price_type, booking_type
 *
 * Prices computed as: activity.price_twd * plan.priceMultiplier (rounded to integer)
 * Duration: parsed from plan.duration string (hours * 60)
 */
const PLANS_TO_INSERT = [
  // Case 1: dadadaocheng-walk / morning-walk
  // price_twd=1500, priceMultiplier=1 → 1500; duration≈3h→180min; max=8, min=1
  {
    activity_id: 'c0000003-0000-0000-0000-000000000002',
    slug: 'morning-walk',
    name: '早安漫步',
    base_price: 1500,
    duration_minutes: 180,
    max_participants: 8,
    min_participants: 1,
    status: 'active',
    price_type: 'per_person',
    booking_type: 'scheduled',
    _label: 'dadadaocheng-walk / morning-walk',
  },

  // Case 2: dadadaocheng-walk / afternoon-tea
  // price_twd=1500, priceMultiplier=1.2 → 1800; duration≈3h→180min; max=8, min=1
  {
    activity_id: 'c0000003-0000-0000-0000-000000000002',
    slug: 'afternoon-tea',
    name: '午後茶香',
    base_price: 1800,
    duration_minutes: 180,
    max_participants: 8,
    min_participants: 1,
    status: 'active',
    price_type: 'per_person',
    booking_type: 'scheduled',
    _label: 'dadadaocheng-walk / afternoon-tea',
  },

  // Case 3: hualien-river-trekking / standard
  // price_twd=3200, priceMultiplier=1 → 3200; duration≈8h→480min; max=8, min=4
  {
    activity_id: 'c0000003-0000-0000-0000-000000000003',
    slug: 'standard',
    name: '標準溯溪體驗',
    base_price: 3200,
    duration_minutes: 480,
    max_participants: 8,
    min_participants: 4,
    status: 'active',
    price_type: 'per_person',
    booking_type: 'scheduled',
    _label: 'hualien-river-trekking / standard',
  },

  // Case 4: kaohsiung-chaishan-cave-experience / full-day
  // price_twd=2000, priceMultiplier=1.8 → 3600; duration≈8h→480min; max=12, min=4
  {
    activity_id: 'c0000003-0000-0000-0000-000000000001',
    slug: 'full-day',
    name: '全日深度探索',
    base_price: 3600,
    duration_minutes: 480,
    max_participants: 12,
    min_participants: 4,
    status: 'active',
    price_type: 'per_person',
    booking_type: 'scheduled',
    _label: 'kaohsiung-chaishan-cave-experience / full-day',
  },

  // Case 5: activity-1775040922554 / full-day-complete
  // Public plan has price=3000 (explicit, not multiplier); duration≈7h→420min; max=8, min=4
  {
    activity_id: 'e78fb7c9-67be-4788-9195-bedd74f953e2',
    slug: 'full-day-complete',
    name: 'B. 全日深度探秘（含午餐）',
    base_price: 3000,
    duration_minutes: 420,
    max_participants: 8,
    min_participants: 4,
    status: 'active',
    price_type: 'per_person',
    booking_type: 'scheduled',
    _label: 'activity-1775040922554 / full-day-complete',
  },
];

/**
 * Case 6: Update activities.plans JSON so half-day-morning price = 1800
 * The formal plan (activity_plans) already has base_price=1800 (correct).
 * The public plan (activities.plans[]) had price=18 — fix to 1800.
 */
const PRICE_FIX = {
  activity_id: 'e78fb7c9-67be-4788-9195-bedd74f953e2',
  activity_slug: 'activity-1775040922554',
  plan_id: 'half-day-morning',
  old_price: 18,
  new_price: 1800,
  _label: 'activity-1775040922554 / half-day-morning public price fix',
};

// ── Repair logic ─────────────────────────────────────────────────────────────

async function repairInsertPlans(client, dryRun) {
  console.log('\n=== STEP 1: INSERT missing formal plans (5 cases) ===\n');

  let inserted = 0;
  let skipped = 0;

  for (const plan of PLANS_TO_INSERT) {
    const { _label, ...row } = plan;
    console.log(`[${dryRun ? 'DRY-RUN' : 'APPLY'}] ${_label}`);
    console.log(`  → INSERT activity_plans: slug=${row.slug}, base_price=${row.base_price}, duration_minutes=${row.duration_minutes}, max=${row.max_participants}, min=${row.min_participants}`);

    if (dryRun) {
      console.log('  (dry-run: no write)\n');
      continue;
    }

    // Check for existing row first (idempotent guard)
    const { data: existing, error: checkErr } = await client
      .from('activity_plans')
      .select('id, slug, base_price')
      .eq('activity_id', row.activity_id)
      .eq('slug', row.slug)
      .maybeSingle();

    if (checkErr) {
      console.error(`  [ERROR] pre-check failed: ${checkErr.message}`);
      throw checkErr;
    }

    if (existing) {
      console.log(`  [SKIP] already exists (id=${existing.id}, base_price=${existing.base_price})\n`);
      skipped++;
      continue;
    }

    const { data, error } = await client
      .from('activity_plans')
      .insert(row)
      .select('id, slug, base_price');

    if (error) {
      console.error(`  [ERROR] INSERT failed: ${error.message}`);
      throw error;
    }

    console.log(`  [OK] inserted id=${data[0]?.id}\n`);
    inserted++;
  }

  if (!dryRun) {
    console.log(`  Summary: inserted=${inserted}, skipped=${skipped}\n`);
  }

  return { inserted, skipped };
}

async function repairPriceFix(client, dryRun) {
  console.log('\n=== STEP 2: Fix half-day-morning public price (activities.plans JSON) ===\n');
  console.log(`[${dryRun ? 'DRY-RUN' : 'APPLY'}] ${PRICE_FIX._label}`);
  console.log(`  → UPDATE activities.plans[] where id='${PRICE_FIX.plan_id}': price ${PRICE_FIX.old_price} → ${PRICE_FIX.new_price}`);

  if (dryRun) {
    console.log('  (dry-run: no write)\n');
    return { updated: 0 };
  }

  // Fetch current plans JSON
  const { data: activityData, error: fetchErr } = await client
    .from('activities')
    .select('id, slug, plans')
    .eq('id', PRICE_FIX.activity_id)
    .single();

  if (fetchErr) {
    console.error(`  [ERROR] fetch activity failed: ${fetchErr.message}`);
    throw fetchErr;
  }

  const plans = Array.isArray(activityData.plans) ? activityData.plans : [];
  const targetPlan = plans.find((p) => (p.id || p.slug) === PRICE_FIX.plan_id);

  if (!targetPlan) {
    throw new Error(`plan '${PRICE_FIX.plan_id}' not found in activities.plans for ${PRICE_FIX.activity_slug}`);
  }

  const currentPrice = targetPlan.price;
  console.log(`  [BEFORE] current public price = ${currentPrice}`);

  // Update price in plans array
  const updatedPlans = plans.map((p) => {
    if ((p.id || p.slug) === PRICE_FIX.plan_id) {
      return { ...p, price: PRICE_FIX.new_price };
    }
    return p;
  });

  const { error: updateErr } = await client
    .from('activities')
    .update({ plans: updatedPlans })
    .eq('id', PRICE_FIX.activity_id);

  if (updateErr) {
    console.error(`  [ERROR] UPDATE failed: ${updateErr.message}`);
    throw updateErr;
  }

  console.log(`  [OK] public price updated to ${PRICE_FIX.new_price}\n`);
  return { updated: 1 };
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const dryRun = process.env.APPLY !== '1';

  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log(`║  repair-909-apply.mjs  [${dryRun ? 'DRY-RUN' : 'APPLY MODE'}]`);
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log(`Date: ${new Date().toISOString()}`);
  console.log(`Mode: ${dryRun ? 'DRY-RUN (no writes — set APPLY=1 to apply)' : 'APPLY (writing to DB)'}\n`);

  if (!dryRun) {
    console.log('[APPLY] Safety check: writing to Supabase. Proceeding in 2 seconds...');
    await new Promise((r) => setTimeout(r, 2000));
  }

  let client;
  try {
    client = await createClientFromEnv();
  } catch (err) {
    console.error(`[FATAL] ${err.message}`);
    process.exit(1);
  }

  let insertResult = { inserted: 0, skipped: 0 };
  let priceResult = { updated: 0 };

  try {
    insertResult = await repairInsertPlans(client, dryRun);
    priceResult = await repairPriceFix(client, dryRun);
  } catch (err) {
    console.error(`[FATAL] Repair failed: ${err.message}`);
    process.exit(1);
  }

  console.log('\n══════════════════════════════════════════════════════════════');
  if (dryRun) {
    console.log('[DRY-RUN COMPLETE] No rows were written.');
    console.log('  Would INSERT 5 activity_plans rows.');
    console.log('  Would UPDATE 1 activities.plans price (half-day-morning: 18→1800).');
    console.log('\nRun with APPLY=1 to execute.');
  } else {
    console.log('[APPLY COMPLETE]');
    console.log(`  activity_plans INSERTs: inserted=${insertResult.inserted}, skipped=${insertResult.skipped}`);
    console.log(`  activities.plans price fix: updated=${priceResult.updated}`);
  }
  console.log('══════════════════════════════════════════════════════════════\n');

  process.exit(0);
}

main().catch((err) => {
  console.error(`[repair-909-apply] ${err.message}`);
  process.exit(1);
});
