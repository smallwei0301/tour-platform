#!/usr/bin/env node
/**
 * audit-public-booking-v2.mjs — Issue #885
 *
 * Audit all published activities' public plans against the Booking V2 API.
 * No Supabase credentials required — public API only.
 *
 * DB-direct capacity audit requires SUPABASE_SERVICE_ROLE_KEY.
 * The admin write-path guard (PR implementing #891) now prevents new violations.
 * Existing violations are caught by validateActivityBookability() at publish time (#881).
 *
 * Classification:
 *   PASS                    200 + valid slots schema + capacityLeft ≤ selectedPlan.maxParticipants
 *   GRACEFUL_PLAN_NOT_FOUND 404 code=PLAN_NOT_FOUND  (known, pending #883 data backfill)
 *   GRACEFUL_PLAN_INACTIVE  404 code=PLAN_INACTIVE
 *   GRACEFUL_AMBIGUOUS      409 code=AMBIGUOUS_PLAN
 *   FAIL_INVALID_PLAN_FORMAT 400 message contains 'Invalid planId format' — MUST NEVER happen post-#886
 *   FAIL_CAPACITY_VIOLATION  capacityLeft > selectedPlan.maxParticipants
 *   FAIL_500                 any 5xx or unexpected status
 *
 * Exit codes:
 *   0 — only PASS + GRACEFUL_* results
 *   1 — at least one FAIL_* result
 *
 * Usage:
 *   node scripts/audit-public-booking-v2.mjs
 *   BASE_URL=https://my-preview.vercel.app node scripts/audit-public-booking-v2.mjs
 *   AUDIT_DATE=2026-09-15 node scripts/audit-public-booking-v2.mjs
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// ── Config ───────────────────────────────────────────────────────────────────

const BASE_URL = process.env.BASE_URL || 'https://tour-platform-nine.vercel.app';
const PARTICIPANTS = parseInt(process.env.AUDIT_PARTICIPANTS || '1', 10);
const AUDIT_DATE = process.env.AUDIT_DATE || (() => {
  const d = new Date();
  d.setDate(d.getDate() + 30);
  return d.toISOString().slice(0, 10);
})();
const DATE_FROM = AUDIT_DATE;
const DATE_TO   = AUDIT_DATE;
const TIMEZONE  = 'Asia/Taipei';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPORT_DIR = path.resolve(__dirname, '../docs/operations/reports');
const DATE_STAMP = new Date().toISOString().slice(0, 10);

// ── Classification ───────────────────────────────────────────────────────────

/**
 * @typedef {'PASS'|'GRACEFUL_PLAN_NOT_FOUND'|'GRACEFUL_PLAN_INACTIVE'|'GRACEFUL_AMBIGUOUS'|'FAIL_INVALID_PLAN_FORMAT'|'FAIL_CAPACITY_VIOLATION'|'FAIL_500'} Classification
 */

/**
 * @param {number} status
 * @param {object} body
 * @returns {Classification}
 */
function classify(status, body) {
  if (status >= 500) return 'FAIL_500';

  if (status === 404) {
    const code = body?.error?.code;
    if (code === 'PLAN_NOT_FOUND') return 'GRACEFUL_PLAN_NOT_FOUND';
    if (code === 'PLAN_INACTIVE')  return 'GRACEFUL_PLAN_INACTIVE';
    return 'FAIL_500'; // unexpected 404
  }

  if (status === 409) {
    const code = body?.error?.code;
    if (code === 'AMBIGUOUS_PLAN') return 'GRACEFUL_AMBIGUOUS';
    return 'FAIL_500';
  }

  if (status === 400) {
    const msg = body?.error?.message || '';
    if (msg.includes('Invalid planId format')) return 'FAIL_INVALID_PLAN_FORMAT';
    return 'FAIL_500'; // other 400 is unexpected for a public slug
  }

  if (status === 200) {
    const data = body?.data;
    if (!data) return 'FAIL_500';
    const slots = data.slots || [];
    const maxP  = data.selectedPlan?.maxParticipants;
    if (typeof maxP === 'number') {
      for (const slot of slots) {
        if (typeof slot.capacityLeft === 'number' && slot.capacityLeft > maxP) {
          return 'FAIL_CAPACITY_VIOLATION';
        }
      }
    }
    return 'PASS';
  }

  return 'FAIL_500';
}

// ── Fetch public activities list ─────────────────────────────────────────────

async function fetchPublishedActivities() {
  // /api/activities returns published activities (status filter applied server-side)
  const url = `${BASE_URL}/api/activities`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch activities list: ${res.status} ${await res.text()}`);
  }
  const body = await res.json();
  // Support both { data: [...] } and [...] shapes
  return Array.isArray(body) ? body : (body.data || []);
}

// ── Probe one (activityId, planKey) pair ─────────────────────────────────────

async function probeSlots(activityId, planKey) {
  const params = new URLSearchParams({
    planId:       planKey,
    dateFrom:     DATE_FROM,
    dateTo:       DATE_TO,
    timezone:     TIMEZONE,
    participants: String(PARTICIPANTS),
  });
  const url = `${BASE_URL}/api/v2/activities/${activityId}/available-slots?${params}`;
  let status, body;
  try {
    const res = await fetch(url);
    status = res.status;
    body   = await res.json().catch(() => null);
  } catch (err) {
    status = 0;
    body   = { error: { message: String(err) } };
  }
  const classification = classify(status, body);
  return { url, status, body, classification };
}

// ── Collect plan candidates for an activity ──────────────────────────────────

function extractPlanKeys(activity) {
  // Prefer explicit plan slugs/IDs from the activity object.
  // Fall back to the activity's own id as a planKey (some endpoints accept that).
  const keys = new Set();
  if (activity.plan_slug) keys.add(activity.plan_slug);
  if (activity.planSlug)  keys.add(activity.planSlug);
  if (activity.plan_id)   keys.add(activity.plan_id);
  if (activity.planId)    keys.add(activity.planId);
  // If the activity carries an array of plans, use those slugs/IDs
  const plans = activity.plans || activity.activity_plans || [];
  for (const p of plans) {
    if (p.slug) keys.add(p.slug);
    if (p.id)   keys.add(p.id);
  }
  // Final fallback: use the activity id itself as planKey (resolves via schedule path)
  if (keys.size === 0) keys.add(activity.id);
  return [...keys];
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n公開訂位 V2 稽核 (Public Booking V2 Audit)`);
  console.log(`BASE_URL:     ${BASE_URL}`);
  console.log(`AUDIT_DATE:   ${AUDIT_DATE}`);
  console.log(`PARTICIPANTS: ${PARTICIPANTS}`);
  console.log(`─────────────────────────────────────────────────────────────\n`);

  let activities;
  try {
    activities = await fetchPublishedActivities();
  } catch (err) {
    console.error(`[FATAL] Cannot fetch activities: ${err.message}`);
    process.exit(1);
  }

  if (activities.length === 0) {
    console.warn('[WARN] No published activities found — check BASE_URL or activity status filter');
  }

  /** @type {Array<{activityId:string, activitySlug:string, planKey:string, status:number, classification:Classification, url:string, detail:string}>} */
  const results = [];

  for (const activity of activities) {
    const activityId   = activity.id;
    const activitySlug = activity.slug || activityId;
    const planKeys     = extractPlanKeys(activity);

    for (const planKey of planKeys) {
      process.stdout.write(`  probe ${activitySlug} / ${planKey} … `);
      const { url, status, body, classification } = await probeSlots(activityId, planKey);
      const detail = body?.error?.message || body?.error?.code || '';
      console.log(`${classification} (HTTP ${status})`);
      results.push({ activityId, activitySlug, planKey, status, classification, url, detail });
    }
  }

  // ── Summary ──────────────────────────────────────────────────────────────

  const counts = {};
  for (const r of results) counts[r.classification] = (counts[r.classification] || 0) + 1;

  console.log(`\n─────────────────────────────────────────────────────────────`);
  console.log(`稽核結果摘要 (Audit Summary)`);
  console.log(`─────────────────────────────────────────────────────────────`);

  const order = [
    'PASS',
    'GRACEFUL_PLAN_NOT_FOUND',
    'GRACEFUL_PLAN_INACTIVE',
    'GRACEFUL_AMBIGUOUS',
    'FAIL_INVALID_PLAN_FORMAT',
    'FAIL_CAPACITY_VIOLATION',
    'FAIL_500',
  ];
  for (const k of order) {
    if (counts[k]) console.log(`  ${k.padEnd(30)} ${counts[k]}`);
  }
  console.log(`  ${'TOTAL'.padEnd(30)} ${results.length}`);

  const failures = results.filter((r) => r.classification.startsWith('FAIL_'));

  if (failures.length > 0) {
    console.log(`\n[FAIL] ${failures.length} failure(s) detected:`);
    for (const f of failures) {
      console.log(`  ${f.classification} | ${f.activitySlug} / ${f.planKey} | HTTP ${f.status}`);
      console.log(`    ${f.url}`);
      if (f.detail) console.log(`    detail: ${f.detail}`);
    }
  } else {
    console.log(`\n[OK] No FAIL_* results — all probes are PASS or GRACEFUL.`);
  }

  // ── Write reports ─────────────────────────────────────────────────────────

  try {
    mkdirSync(REPORT_DIR, { recursive: true });

    // JSON
    const jsonPath = path.join(REPORT_DIR, `public-booking-audit-${DATE_STAMP}.json`);
    writeFileSync(jsonPath, JSON.stringify({ meta: { baseUrl: BASE_URL, auditDate: AUDIT_DATE, participants: PARTICIPANTS, generatedAt: new Date().toISOString() }, summary: counts, failures: failures.map((f) => ({ activityId: f.activityId, activitySlug: f.activitySlug, planKey: f.planKey, status: f.status, classification: f.classification, url: f.url, detail: f.detail })), results }, null, 2));
    console.log(`\n報告 JSON: ${jsonPath}`);

    // Markdown (Chinese summary + FAIL table)
    const failTable = failures.length === 0
      ? '（無失敗）'
      : [
          '| 分類 | Activity Slug | Plan Key | HTTP | 詳細 |',
          '|------|--------------|----------|------|------|',
          ...failures.map((f) => `| ${f.classification} | ${f.activitySlug} | ${f.planKey} | ${f.status} | ${f.detail || ''} |`),
        ].join('\n');

    const md = `# 公開訂位 V2 稽核報告
**稽核日期：** ${DATE_STAMP}
**稽核目標日期：** ${AUDIT_DATE}
**基礎 URL：** ${BASE_URL}
**參與人數：** ${PARTICIPANTS}

## 摘要

| 分類 | 數量 |
|------|------|
${order.filter((k) => counts[k]).map((k) => `| ${k} | ${counts[k]} |`).join('\n')}
| **合計** | **${results.length}** |

## 失敗清單

${failTable}

## 判斷基準

- **PASS**：HTTP 200，schema 正確，\`capacityLeft ≤ selectedPlan.maxParticipants\`
- **GRACEFUL_PLAN_NOT_FOUND**：HTTP 404，\`code=PLAN_NOT_FOUND\`（待 #883 資料補建）
- **GRACEFUL_PLAN_INACTIVE**：HTTP 404，\`code=PLAN_INACTIVE\`
- **GRACEFUL_AMBIGUOUS**：HTTP 409，\`code=AMBIGUOUS_PLAN\`
- **FAIL_INVALID_PLAN_FORMAT**：HTTP 400 含 \`'Invalid planId format'\`（PR #886 後絕不應出現）
- **FAIL_CAPACITY_VIOLATION**：\`capacityLeft > selectedPlan.maxParticipants\`（PR #886 後絕不應出現）
- **FAIL_500**：任何 5xx 或非預期狀態碼
`;
    const mdPath = path.join(REPORT_DIR, `public-booking-audit-${DATE_STAMP}.md`);
    writeFileSync(mdPath, md);
    console.log(`報告 MD:   ${mdPath}`);
  } catch (err) {
    console.warn(`[WARN] Could not write report files: ${err.message}`);
  }

  process.exit(failures.length > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('[FATAL]', err);
  process.exit(1);
});
