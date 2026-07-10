#!/usr/bin/env node
/**
 * Audit published activities' public formal plans against Booking V2.
 * Discovery is deliberately catalogue -> public detail -> activity_plans UUIDs:
 * catalogue activity IDs are never valid planId fallbacks.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE_URL = process.env.BASE_URL || 'https://tour-platform-nine.vercel.app';
const PARTICIPANTS = parseInt(process.env.AUDIT_PARTICIPANTS || '1', 10);
const AUDIT_DATE = process.env.AUDIT_DATE || (() => {
  const date = new Date();
  date.setDate(date.getDate() + 30);
  return date.toISOString().slice(0, 10);
})();
const TIMEZONE = 'Asia/Taipei';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPORT_DIR = path.resolve(__dirname, '../docs/operations/reports');
const DATE_STAMP = new Date().toISOString().slice(0, 10);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** @typedef {'PASS'|'GRACEFUL_PLAN_NOT_FOUND'|'GRACEFUL_PLAN_INACTIVE'|'GRACEFUL_AMBIGUOUS'|'NO_ACTIVE_PUBLIC_PLAN'|'FAIL_ACTIVITY_DETAIL'|'FAIL_INVALID_PLAN_FORMAT'|'FAIL_CAPACITY_VIOLATION'|'FAIL_500'} Classification */

export function classify(status, body) {
  if (status >= 500) return 'FAIL_500';
  if (status === 404) {
    const code = body?.error?.code;
    const message = body?.error?.message || '';
    if (code === 'PLAN_NOT_FOUND' || (code === 'NOT_FOUND' && message === 'Activity plan not found')) return 'GRACEFUL_PLAN_NOT_FOUND';
    if (code === 'PLAN_INACTIVE') return 'GRACEFUL_PLAN_INACTIVE';
    return 'FAIL_500';
  }
  if (status === 409) return body?.error?.code === 'AMBIGUOUS_PLAN' ? 'GRACEFUL_AMBIGUOUS' : 'FAIL_500';
  if (status === 400) return String(body?.error?.message || '').includes('Invalid planId format') ? 'FAIL_INVALID_PLAN_FORMAT' : 'FAIL_500';
  if (status === 200) {
    const data = body?.data;
    if (!data) return 'FAIL_500';
    const slots = data.slots || [];
    const maxParticipants = data.selectedPlan?.maxParticipants;
    if (typeof maxParticipants === 'number' && slots.some((slot) => typeof slot.capacityLeft === 'number' && slot.capacityLeft > maxParticipants)) {
      return 'FAIL_CAPACITY_VIOLATION';
    }
    return 'PASS';
  }
  return 'FAIL_500';
}

export async function fetchJson(url, fetchImpl = fetch) {
  try {
    const response = await fetchImpl(url);
    return { status: response.status, body: await response.json().catch(() => null) };
  } catch (error) {
    return { status: 0, body: { error: { message: String(error) } } };
  }
}

export async function fetchPublishedActivities({ baseUrl = BASE_URL, fetchImpl = fetch } = {}) {
  const result = await fetchJson(`${baseUrl}/api/activities`, fetchImpl);
  if (result.status !== 200) throw new Error(`Failed to fetch activities list: ${result.status} ${result.body?.error?.message || ''}`);
  const body = result.body;
  if (Array.isArray(body)) return body;
  if (Array.isArray(body?.data)) return body.data;
  throw new Error('Malformed activities list response');
}

export async function fetchActivityDetail(slug, { baseUrl = BASE_URL, fetchImpl = fetch } = {}) {
  return fetchJson(`${baseUrl}/api/activities/${encodeURIComponent(slug)}`, fetchImpl);
}

export function extractActivePublicPlanIds(detailBody) {
  const plans = detailBody?.data?.plans;
  if (!Array.isArray(plans)) return { error: 'public detail data.plans is not an array' };
  const ids = new Set();
  for (const plan of plans) {
    if (!plan || typeof plan !== 'object') return { error: 'public detail contains malformed plan' };
    const status = String(plan.status || 'active').toLowerCase();
    if (status !== 'active') continue;
    if (!UUID_RE.test(String(plan.id || ''))) return { error: 'public detail active plan has no formal UUID' };
    ids.add(plan.id);
  }
  return { planIds: [...ids] };
}

export async function probeSlots(activityId, planId, { baseUrl = BASE_URL, fetchImpl = fetch } = {}) {
  const params = new URLSearchParams({
    planId,
    dateFrom: AUDIT_DATE,
    dateTo: AUDIT_DATE,
    timezone: TIMEZONE,
    participants: String(PARTICIPANTS),
  });
  const url = `${baseUrl}/api/v2/activities/${encodeURIComponent(activityId)}/available-slots?${params}`;
  const { status, body } = await fetchJson(url, fetchImpl);
  return { url, status, body, classification: classify(status, body) };
}

function isFailure(classification) {
  return classification.startsWith('FAIL_') || classification === 'NO_ACTIVE_PUBLIC_PLAN';
}

export async function auditPublishedActivities({ baseUrl = BASE_URL, fetchImpl = fetch } = {}) {
  const activities = await fetchPublishedActivities({ baseUrl, fetchImpl });
  const results = [];
  for (const activity of activities) {
    const activityId = String(activity?.id || '');
    const activitySlug = String(activity?.slug || '');
    if (!activityId || !activitySlug) {
      results.push({ activityId, activitySlug, planKey: '', status: 0, classification: 'FAIL_ACTIVITY_DETAIL', url: '', detail: 'catalog item missing id or slug' });
      continue;
    }
    const detail = await fetchActivityDetail(activitySlug, { baseUrl, fetchImpl });
    if (detail.status !== 200) {
      results.push({ activityId, activitySlug, planKey: '', status: detail.status, classification: 'FAIL_ACTIVITY_DETAIL', url: `${baseUrl}/api/activities/${encodeURIComponent(activitySlug)}`, detail: detail.body?.error?.message || `HTTP ${detail.status}` });
      continue;
    }
    const discovered = extractActivePublicPlanIds(detail.body);
    if (discovered.error) {
      results.push({ activityId, activitySlug, planKey: '', status: detail.status, classification: 'FAIL_ACTIVITY_DETAIL', url: `${baseUrl}/api/activities/${encodeURIComponent(activitySlug)}`, detail: discovered.error });
      continue;
    }
    if (discovered.planIds.length === 0) {
      results.push({ activityId, activitySlug, planKey: '', status: detail.status, classification: 'NO_ACTIVE_PUBLIC_PLAN', url: `${baseUrl}/api/activities/${encodeURIComponent(activitySlug)}`, detail: 'public detail has no active formal activity_plans UUID' });
      continue;
    }
    for (const planId of discovered.planIds) {
      const probe = await probeSlots(activityId, planId, { baseUrl, fetchImpl });
      results.push({ activityId, activitySlug, planKey: planId, status: probe.status, classification: probe.classification, url: probe.url, detail: probe.body?.error?.message || probe.body?.error?.code || '' });
    }
  }
  return results;
}

function writeReports(results) {
  const counts = {};
  for (const result of results) counts[result.classification] = (counts[result.classification] || 0) + 1;
  const failures = results.filter((result) => isFailure(result.classification));
  const order = ['PASS', 'GRACEFUL_PLAN_NOT_FOUND', 'GRACEFUL_PLAN_INACTIVE', 'GRACEFUL_AMBIGUOUS', 'NO_ACTIVE_PUBLIC_PLAN', 'FAIL_ACTIVITY_DETAIL', 'FAIL_INVALID_PLAN_FORMAT', 'FAIL_CAPACITY_VIOLATION', 'FAIL_500'];
  mkdirSync(REPORT_DIR, { recursive: true });
  const meta = { baseUrl: BASE_URL, auditDate: AUDIT_DATE, participants: PARTICIPANTS, generatedAt: new Date().toISOString() };
  const jsonPath = path.join(REPORT_DIR, `public-booking-audit-${DATE_STAMP}.json`);
  writeFileSync(jsonPath, JSON.stringify({ meta, summary: counts, failures, results }, null, 2));
  const markdownRows = order.filter((key) => counts[key]).map((key) => `| ${key} | ${counts[key]} |`).join('\n');
  const failureRows = failures.length ? failures.map((result) => `| ${result.classification} | ${result.activitySlug} | ${result.planKey || '—'} | ${result.status} | ${result.detail} |`).join('\n') : '（無失敗）';
  const mdPath = path.join(REPORT_DIR, `public-booking-audit-${DATE_STAMP}.md`);
  writeFileSync(mdPath, `# 公開訂位 V2 稽核報告\n\n## 摘要\n\n| 分類 | 數量 |\n|------|------|\n${markdownRows}\n\n## 需處理項目\n\n| 分類 | Activity Slug | Plan UUID | HTTP | 詳細 |\n|------|---------------|-----------|------|------|\n${failureRows}\n`);
  return { counts, failures, jsonPath, mdPath, order };
}

export async function main() {
  console.log('\n公開訂位 V2 稽核 (Public Booking V2 Audit)');
  console.log(`BASE_URL:     ${BASE_URL}`);
  console.log(`AUDIT_DATE:   ${AUDIT_DATE}`);
  console.log(`PARTICIPANTS: ${PARTICIPANTS}`);
  let results;
  try {
    results = await auditPublishedActivities();
  } catch (error) {
    console.error(`[FATAL] Cannot fetch activities: ${error.message}`);
    return 1;
  }
  for (const result of results) console.log(`  ${result.activitySlug} / ${result.planKey || 'no-plan'} … ${result.classification} (HTTP ${result.status})`);
  const { counts, failures, jsonPath, mdPath, order } = writeReports(results);
  console.log('\n稽核結果摘要 (Audit Summary)');
  for (const key of order) if (counts[key]) console.log(`  ${key.padEnd(30)} ${counts[key]}`);
  console.log(`  ${'TOTAL'.padEnd(30)} ${results.length}`);
  console.log(`\n報告 JSON: ${jsonPath}`);
  console.log(`報告 MD:   ${mdPath}`);
  if (failures.length) {
    console.log(`\n[FAIL] ${failures.length} failure(s) require attention.`);
    return 1;
  }
  console.log('\n[OK] All probes are PASS or GRACEFUL.');
  return 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().then((code) => { process.exitCode = code; }).catch((error) => {
    console.error('[FATAL]', error);
    process.exitCode = 1;
  });
}
