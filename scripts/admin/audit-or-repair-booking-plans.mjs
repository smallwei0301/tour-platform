#!/usr/bin/env node
/**
 * Booking plan repair script — DRY_RUN audit (#883 phase 1)
 *
 * Audits all published activities and reports plan/data mismatches.
 * NO DB writes in this script (dry-run only). APPLY mode is stubbed as a
 * hard exit(1) until Wei/Rita approve the repair plan (phase 2 / issue #883).
 *
 * Usage:
 *   node --env-file=.env scripts/admin/audit-or-repair-booking-plans.mjs        # dry-run (default)
 *   DRY_RUN=1 node --env-file=.env scripts/admin/audit-or-repair-booking-plans.mjs
 *   APPLY=1 ISSUE883_REPAIR_ALLOW_APPLY=1 node ... --yes   # (gated, phase 2 — currently exits 1)
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// ── Constants ────────────────────────────────────────────────────────────────

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPORT_DIR = path.resolve(__dirname, '../../docs/operations/reports');
const DATE_STAMP = new Date().toISOString().slice(0, 10);

/**
 * @typedef {'OK'|'MISSING_FORMAL_PLAN'|'INACTIVE_FORMAL_PLAN'|'CAPACITY_MISMATCH'|'NEEDS_HUMAN_REVIEW'|'TEST_FIXTURE'} ProblemCode
 */

// ── Arg parsing ───────────────────────────────────────────────────────────────

function parseArgs(argv = process.argv.slice(2)) {
  const has = (flag) => argv.includes(flag);

  // apply mode requires both env var AND --yes flag
  const applyEnv = process.env.APPLY === '1';
  const apply = applyEnv && has('--yes');
  const dryRun = !apply;

  return { apply, dryRun, yes: has('--yes') };
}

// ── Supabase client ───────────────────────────────────────────────────────────

async function createClientFromEnv() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('missing required env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY');
  }
  // Lazy import — keeps this module importable in tests without Supabase installed
  // SAFETY: never log the key
  // Use the explicit CJS dist path because the workspace root node_modules/@supabase/supabase-js
  // ships without a package.json (incomplete install) — the same pattern used in apps/web/src/lib/
  let createClient;
  try {
    ({ createClient } = await import('@supabase/supabase-js'));
  } catch {
    // Fallback for workspace root: resolve via explicit dist path
    const { createClient: cc } = await import(
      new URL('../../../node_modules/@supabase/supabase-js/dist/index.mjs', import.meta.url).href
    );
    createClient = cc;
  }
  return createClient(url, key);
}

// ── Classification logic ──────────────────────────────────────────────────────

/**
 * Determines whether an activity is a test fixture by inspecting its slug.
 *
 * @param {string} activitySlug
 * @returns {boolean}
 */
export function isTestFixture(activitySlug) {
  if (!activitySlug) return false;
  const lower = activitySlug.toLowerCase();
  return lower.includes('e2e') || lower.includes('playwright') || lower.includes('test');
}

/**
 * Classifies a single public plan entry against the formal plan records
 * and schedule data.
 *
 * @param {{id?: string, slug?: string, price?: number, duration?: number, maxParticipants?: number}} publicPlan
 * @param {Array<{id: string, slug: string, status: string, max_participants: number, min_participants: number, base_price: number, duration_minutes: number}>} formalPlans
 * @param {Array<{capacity: number, plan_id?: string, activity_plan_id?: string}>} schedules
 * @param {string} activitySlug - slug of the parent activity (for TEST_FIXTURE check)
 * @returns {ProblemCode}
 */
export function classifyPublicPlan(publicPlan, formalPlans, schedules, activitySlug = '') {
  // TEST_FIXTURE takes priority — skip real analysis for test data
  if (isTestFixture(activitySlug)) {
    return 'TEST_FIXTURE';
  }

  const planKey = publicPlan?.id || publicPlan?.slug;
  if (!planKey) return 'MISSING_FORMAL_PLAN';

  // Find matching formal plan by slug OR id
  const match = (formalPlans || []).find(
    (fp) => fp.slug === planKey || fp.id === planKey
  );

  if (!match) {
    return 'MISSING_FORMAL_PLAN';
  }

  if (match.status !== 'active') {
    return 'INACTIVE_FORMAL_PLAN';
  }

  // Check capacity: any schedule whose capacity exceeds plan.max_participants
  const planSchedules = (schedules || []).filter(
    (s) => s.plan_id === match.id || s.activity_plan_id === match.id
  );
  if (planSchedules.length > 0 && typeof match.max_participants === 'number') {
    for (const sched of planSchedules) {
      if (typeof sched.capacity === 'number' && sched.capacity > match.max_participants) {
        return 'CAPACITY_MISMATCH';
      }
    }
  }

  // Check for price / duration / max_participants divergence
  const priceDiffers =
    typeof publicPlan.price === 'number' &&
    typeof match.base_price === 'number' &&
    publicPlan.price !== match.base_price;

  const durationDiffers =
    typeof publicPlan.duration === 'number' &&
    typeof match.duration_minutes === 'number' &&
    publicPlan.duration !== match.duration_minutes;

  const maxPDiffers =
    typeof publicPlan.maxParticipants === 'number' &&
    typeof match.max_participants === 'number' &&
    publicPlan.maxParticipants !== match.max_participants;

  if (priceDiffers || durationDiffers || maxPDiffers) {
    return 'NEEDS_HUMAN_REVIEW';
  }

  return 'OK';
}

// ── Core audit logic ──────────────────────────────────────────────────────────

/**
 * Run the full dry-run audit against Supabase.
 *
 * @param {{ client: import('@supabase/supabase-js').SupabaseClient }} options
 * @returns {Promise<Array>} array of finding rows
 */
export async function runAudit({ client }) {
  // 1. Fetch all published activities with their embedded plans JSON
  const { data: activities, error: activitiesErr } = await client
    .from('activities')
    .select('id, slug, title, plans')
    .eq('status', 'published');

  if (activitiesErr) {
    throw new Error(`load activities failed: ${activitiesErr.message}`);
  }

  const activityRows = Array.isArray(activities) ? activities : [];
  const activityIds = activityRows.map((r) => r.id).filter(Boolean);

  if (activityIds.length === 0) {
    console.warn('[WARN] No published activities found.');
    return [];
  }

  // 2. Bulk-fetch all activity_plans for these activities
  const { data: formalPlansRaw, error: formalPlansErr } = await client
    .from('activity_plans')
    .select('id, activity_id, slug, status, max_participants, min_participants, base_price, duration_minutes')
    .in('activity_id', activityIds);

  if (formalPlansErr) {
    throw new Error(`load activity_plans failed: ${formalPlansErr.message}`);
  }

  const formalPlansByActivity = new Map();
  for (const fp of Array.isArray(formalPlansRaw) ? formalPlansRaw : []) {
    if (!fp?.activity_id) continue;
    if (!formalPlansByActivity.has(fp.activity_id)) {
      formalPlansByActivity.set(fp.activity_id, []);
    }
    formalPlansByActivity.get(fp.activity_id).push(fp);
  }

  // 3. Bulk-fetch all activity_schedules for these activities (for capacity check)
  const formalPlanIds = (formalPlansRaw || []).map((fp) => fp.id).filter(Boolean);
  let schedulesByPlanId = new Map();

  if (formalPlanIds.length > 0) {
    // Try plan_id column first; fall back gracefully if column does not exist
    const { data: schedulesRaw, error: schedulesErr } = await client
      .from('activity_schedules')
      .select('id, plan_id, activity_plan_id, capacity')
      .or(`plan_id.in.(${formalPlanIds.join(',')}),activity_plan_id.in.(${formalPlanIds.join(',')})`);

    if (schedulesErr && !schedulesErr.message.includes('column')) {
      // Non-schema error — propagate
      throw new Error(`load activity_schedules failed: ${schedulesErr.message}`);
    }

    for (const sched of Array.isArray(schedulesRaw) ? schedulesRaw : []) {
      const key = sched.plan_id || sched.activity_plan_id;
      if (!key) continue;
      if (!schedulesByPlanId.has(key)) schedulesByPlanId.set(key, []);
      schedulesByPlanId.get(key).push(sched);
    }
  }

  // 4. Classify each public plan
  const findings = [];

  for (const activity of activityRows) {
    const publicPlans = Array.isArray(activity.plans) ? activity.plans : [];
    const formalPlans = formalPlansByActivity.get(activity.id) || [];

    if (publicPlans.length === 0) {
      // Activity has no embedded plans — nothing to check against
      findings.push({
        activityId: activity.id,
        activitySlug: activity.slug || activity.id,
        activityTitle: activity.title || '',
        planKey: '(none)',
        problemCode: isTestFixture(activity.slug || '') ? 'TEST_FIXTURE' : 'MISSING_FORMAL_PLAN',
        detail: 'activity.plans is empty or null',
      });
      continue;
    }

    for (const publicPlan of publicPlans) {
      const planKey = publicPlan?.id || publicPlan?.slug || '(unknown)';

      // Gather schedules for all formal plans matching this public plan key
      const matchedFormal = formalPlans.find(
        (fp) => fp.slug === planKey || fp.id === planKey
      );
      const schedules = matchedFormal
        ? (schedulesByPlanId.get(matchedFormal.id) || [])
        : [];

      const problemCode = classifyPublicPlan(
        publicPlan,
        formalPlans,
        schedules,
        activity.slug || ''
      );

      let detail = '';
      if (problemCode === 'CAPACITY_MISMATCH' && matchedFormal) {
        detail = `plan.max_participants=${matchedFormal.max_participants}; schedule over-capacity`;
      } else if (problemCode === 'INACTIVE_FORMAL_PLAN' && matchedFormal) {
        detail = `formal plan status=${matchedFormal.status}`;
      } else if (problemCode === 'NEEDS_HUMAN_REVIEW') {
        const parts = [];
        if (typeof publicPlan.price === 'number' && matchedFormal?.base_price !== undefined)
          parts.push(`price public=${publicPlan.price} formal=${matchedFormal.base_price}`);
        if (typeof publicPlan.duration === 'number' && matchedFormal?.duration_minutes !== undefined)
          parts.push(`duration public=${publicPlan.duration} formal=${matchedFormal.duration_minutes}`);
        if (typeof publicPlan.maxParticipants === 'number' && matchedFormal?.max_participants !== undefined)
          parts.push(`maxP public=${publicPlan.maxParticipants} formal=${matchedFormal.max_participants}`);
        detail = parts.join('; ');
      }

      findings.push({
        activityId: activity.id,
        activitySlug: activity.slug || activity.id,
        activityTitle: activity.title || '',
        planKey,
        problemCode,
        detail,
      });
    }
  }

  return findings;
}

// ── Report generation ─────────────────────────────────────────────────────────

function buildSummary(findings) {
  const counts = {};
  for (const f of findings) {
    counts[f.problemCode] = (counts[f.problemCode] || 0) + 1;
  }
  return counts;
}

function writeReports(findings) {
  mkdirSync(REPORT_DIR, { recursive: true });

  const summary = buildSummary(findings);
  const actionableFindings = findings.filter((f) => f.problemCode !== 'OK' && f.problemCode !== 'TEST_FIXTURE');

  // JSON report
  const jsonPath = path.join(REPORT_DIR, `booking-plan-repair-dry-run-${DATE_STAMP}.json`);
  const jsonPayload = {
    meta: {
      generatedAt: new Date().toISOString(),
      dateStamp: DATE_STAMP,
      mode: 'DRY_RUN',
      issue: '#893 refs #883',
    },
    summary,
    actionableCount: actionableFindings.length,
    findings,
  };
  writeFileSync(jsonPath, JSON.stringify(jsonPayload, null, 2));
  console.log(`\n報告 JSON: ${jsonPath}`);

  // Markdown report (Chinese summary)
  const order = ['OK', 'MISSING_FORMAL_PLAN', 'INACTIVE_FORMAL_PLAN', 'CAPACITY_MISMATCH', 'NEEDS_HUMAN_REVIEW', 'TEST_FIXTURE'];
  const summaryRows = order
    .filter((k) => summary[k])
    .map((k) => `| ${k} | ${summary[k]} |`)
    .join('\n');

  const actionableTable =
    actionableFindings.length === 0
      ? '（無需處理項目）'
      : [
          '| Activity Slug | Plan Key | 問題分類 | 說明 |',
          '|--------------|----------|---------|------|',
          ...actionableFindings.map(
            (f) => `| ${f.activitySlug} | ${f.planKey} | ${f.problemCode} | ${f.detail || ''} |`
          ),
        ].join('\n');

  const md = `# 訂位方案修復稽核報告（DRY_RUN）
**稽核日期：** ${DATE_STAMP}
**模式：** DRY_RUN（唯讀，不修改任何資料）
**Issue：** #893 refs #883

## 摘要

| 分類 | 數量 |
|------|------|
${summaryRows}
| **合計** | **${findings.length}** |

## 需要處理的項目（${actionableFindings.length} 筆）

${actionableTable}

## 說明

- **OK** — 正常，formal plan 存在且狀態為 active，無容量或欄位異常
- **MISSING_FORMAL_PLAN** — activity.plans 中的方案 ID/slug 在 activity_plans 表找不到對應記錄
- **INACTIVE_FORMAL_PLAN** — 找到對應記錄但 status != 'active'
- **CAPACITY_MISMATCH** — schedule.capacity > plan.max_participants
- **NEEDS_HUMAN_REVIEW** — price/duration/maxParticipants 在 public 與 formal 之間不一致，需人工確認
- **TEST_FIXTURE** — activity slug 包含 e2e/playwright/test，略過

## 後續行動

若需執行修復，請參閱 issue #883 APPLY 流程，並取得 Wei/Rita 核准後再執行 APPLY 模式。
APPLY 模式目前為 **hard exit(1) stub**，不會寫入任何資料。
`;

  const mdPath = path.join(REPORT_DIR, `booking-plan-repair-dry-run-${DATE_STAMP}.md`);
  writeFileSync(mdPath, md);
  console.log(`報告 MD:   ${mdPath}`);
}

// ── APPLY stub ────────────────────────────────────────────────────────────────

function runApplyStub() {
  console.error('[APPLY MODE] APPLY mode not yet enabled.');
  console.error('[APPLY MODE] Run dry-run first and get Wei/Rita approval.');
  console.error('[APPLY MODE] See issue #883 for the APPLY procedure.');
  console.error('[APPLY MODE] This stub will be replaced in phase 2 after dry-run review.');
  process.exit(1);
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs();

  // Check for APPLY mode attempt — always stub exit(1) in this PR
  if (process.env.APPLY === '1') {
    if (!process.env.ISSUE883_REPAIR_ALLOW_APPLY) {
      console.error('[BLOCKED] apply mode blocked: set ISSUE883_REPAIR_ALLOW_APPLY=1 to continue');
      runApplyStub();
    }
    if (!args.yes) {
      console.error('[BLOCKED] apply mode blocked: add --yes to confirm intentional write');
      runApplyStub();
    }
    // Even if all env vars and flags are present, APPLY is not implemented yet
    runApplyStub();
  }

  console.log('\n訂位方案修復稽核 (Booking Plan Repair Dry-Run Audit)');
  console.log(`模式: DRY_RUN (唯讀)`);
  console.log(`日期: ${DATE_STAMP}`);
  console.log('─────────────────────────────────────────────────────────────\n');

  let client;
  try {
    client = await createClientFromEnv();
  } catch (err) {
    console.error(`[FATAL] ${err.message}`);
    process.exit(1);
  }

  let findings;
  try {
    findings = await runAudit({ client });
  } catch (err) {
    console.error(`[FATAL] Audit failed: ${err.message}`);
    process.exit(1);
  }

  // Console summary table
  const summary = buildSummary(findings);
  const order = ['OK', 'MISSING_FORMAL_PLAN', 'INACTIVE_FORMAL_PLAN', 'CAPACITY_MISMATCH', 'NEEDS_HUMAN_REVIEW', 'TEST_FIXTURE'];

  console.log('─────────────────────────────────────────────────────────────');
  console.log('稽核結果摘要 (Audit Summary)');
  console.log('─────────────────────────────────────────────────────────────');
  for (const k of order) {
    if (summary[k]) console.log(`  ${k.padEnd(28)} ${summary[k]}`);
  }
  console.log(`  ${'TOTAL'.padEnd(28)} ${findings.length}`);

  const actionable = findings.filter((f) => f.problemCode !== 'OK' && f.problemCode !== 'TEST_FIXTURE');
  if (actionable.length > 0) {
    console.log(`\n[ACTION NEEDED] ${actionable.length} finding(s) require attention:`);
    for (const f of actionable) {
      console.log(`  ${f.problemCode.padEnd(24)} | ${f.activitySlug} / ${f.planKey}`);
      if (f.detail) console.log(`  ${''.padEnd(24)}   detail: ${f.detail}`);
    }
  } else {
    console.log('\n[OK] No actionable findings — all plans are OK or TEST_FIXTURE.');
  }

  // Write report files
  try {
    writeReports(findings);
  } catch (err) {
    console.error(`[WARN] Could not write report files: ${err.message}`);
    // Don't exit 1 — the audit ran successfully
  }

  console.log('\n[DRY_RUN COMPLETE] No DB rows were modified.');
  // Exit 0 — dry-run is always success even with findings
  process.exit(0);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(`[audit-or-repair-booking-plans] ${err.message}`);
    process.exit(1);
  });
}
