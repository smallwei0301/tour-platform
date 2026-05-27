#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import { buildFormalPlanBackfillRows } from '../../apps/web/src/lib/activity-plans-rich-mapper.mjs';

function parseArgs(argv = process.argv.slice(2)) {
  const has = (flag) => argv.includes(flag);
  const get = (prefix) => {
    const found = argv.find((item) => item.startsWith(prefix));
    return found ? found.slice(prefix.length) : null;
  };

  const apply = has('--apply');
  const dryRun = !apply;

  return {
    apply,
    dryRun,
    yes: has('--yes'),
    activityId: get('--activity-id='),
  };
}

function summarizeSkips(skippedRows) {
  const skippedReasons = {};
  let invalidPriceBlocked = 0;

  for (const row of skippedRows) {
    const reason = row?.reason || 'unknown';
    skippedReasons[reason] = (skippedReasons[reason] ?? 0) + 1;
    if (reason === 'invalid_price') invalidPriceBlocked += 1;
  }

  return { skippedReasons, invalidPriceBlocked };
}

export async function runFormalPlanBackfill({
  client,
  apply = false,
  activityId = null,
}) {
  const scanQuery = client.from('activities').select('id, plans').not('plans', 'is', null);
  const scanned = activityId ? scanQuery.eq('id', activityId) : scanQuery;
  const { data: activities, error: activitiesErr } = await scanned.order('id', { ascending: true });

  if (activitiesErr) throw new Error(`load activities failed: ${activitiesErr.message}`);

  const activityRows = Array.isArray(activities) ? activities : [];
  const activityIds = activityRows.map((row) => row.id).filter(Boolean);

  const { data: existingRows, error: existingErr } = activityIds.length
    ? await client
        .from('activity_plans')
        .select('id, activity_id, slug')
        .in('activity_id', activityIds)
        .order('activity_id', { ascending: true })
    : { data: [], error: null };

  if (existingErr) throw new Error(`load activity_plans failed: ${existingErr.message}`);

  const existingByActivity = new Map();
  for (const row of Array.isArray(existingRows) ? existingRows : []) {
    if (!row?.activity_id || !row?.slug) continue;
    if (!existingByActivity.has(row.activity_id)) {
      existingByActivity.set(row.activity_id, new Map());
    }
    existingByActivity.get(row.activity_id).set(row.slug, row);
  }

  const allUpserts = [];
  const allSkipped = [];
  let candidatePlans = 0;

  for (const activity of activityRows) {
    const legacyPlans = Array.isArray(activity?.plans) ? activity.plans : [];
    candidatePlans += legacyPlans.length;

    const existingBySlug = existingByActivity.get(activity.id) ?? new Map();
    const { upserts, skipped } = buildFormalPlanBackfillRows({
      activityId: activity.id,
      legacyPlans,
      existingBySlug,
    });

    allUpserts.push(...upserts);
    allSkipped.push(...skipped);
  }

  const rowsUpdate = allUpserts.filter((row) => Boolean(row.id)).length;
  const rowsInsert = allUpserts.length - rowsUpdate;
  const { skippedReasons, invalidPriceBlocked } = summarizeSkips(allSkipped);

  if (apply && allUpserts.length > 0) {
    const { error: upsertErr } = await client
      .from('activity_plans')
      .upsert(allUpserts, { onConflict: 'activity_id,slug' });
    if (upsertErr) throw new Error(`upsert activity_plans failed: ${upsertErr.message}`);
  }

  return {
    mode: apply ? 'apply' : 'dry-run',
    scannedActivities: activityRows.length,
    candidatePlans,
    rowsInsert,
    rowsUpdate,
    rowsSkip: allSkipped.length,
    invalidPriceBlocked,
    skippedReasons,
  };
}

function validateApplySafety({ apply, yes }) {
  if (!apply) return;
  if (process.env.ISSUE841_BACKFILL_ALLOW_APPLY !== '1') {
    throw new Error('apply mode blocked: set ISSUE841_BACKFILL_ALLOW_APPLY=1 to continue');
  }
  if (!yes) {
    throw new Error('apply mode blocked: add --yes to confirm intentional write');
  }
}

async function createClientFromEnv() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('missing required env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY');
  }
  return createClient(url, key);
}

async function main() {
  const args = parseArgs();
  validateApplySafety(args);

  const client = await createClientFromEnv();
  const audit = await runFormalPlanBackfill({
    client,
    apply: args.apply,
    activityId: args.activityId,
  });

  console.log(JSON.stringify(audit, null, 2));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(`[issue841-formal-plan-backfill] ${error.message}`);
    process.exit(1);
  });
}
