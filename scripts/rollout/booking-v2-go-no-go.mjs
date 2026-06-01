#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync, unlinkSync } from 'node:fs';
import path from 'node:path';

const cwd = process.cwd();
// GO_NO_GO_REPORTS_DIR allows tests to isolate I/O to avoid parallel-run races.
const reportsDir = process.env.GO_NO_GO_REPORTS_DIR || path.join(cwd, 'docs/operations/reports');
mkdirSync(reportsDir, { recursive: true });

const inputPath = process.env.GO_NO_GO_INPUT_PATH || path.join(reportsDir, 'booking-v2-dashboard-latest.json');
if (!existsSync(inputPath)) {
  console.error('Missing input:', inputPath);
  process.exit(1);
}

function parseNumberEnv(name, fallback) {
  const raw = process.env[name];
  if (raw == null || raw === '') return { value: fallback, ok: true, source: 'default' };
  const n = Number(raw);
  return { value: n, ok: Number.isFinite(n), source: 'env' };
}

function hasOwn(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj || {}, key);
}

function toNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
}

function pct(num, den) {
  if (!Number.isFinite(num) || !Number.isFinite(den) || den <= 0) return NaN;
  return Number(((num / den) * 100).toFixed(2));
}

function deltaPct(v2, legacy) {
  if (!Number.isFinite(v2) || !Number.isFinite(legacy) || legacy === 0) return NaN;
  return Number((((v2 - legacy) / legacy) * 100).toFixed(2));
}

function fmt(n, suffix = '') {
  return Number.isFinite(n) ? `${n}${suffix}` : 'N/A';
}

const cfg = {
  minPageView: parseNumberEnv('GO_NOGO_MIN_PAGE_VIEW', 20),
  minCallback: parseNumberEnv('GO_NOGO_MIN_PAYMENT_CALLBACK', 5),
  paymentSuccessMinPct: parseNumberEnv('GO_NOGO_PAYMENT_SUCCESS_MIN_PCT', 95),
  checkoutSuccessMinPct: parseNumberEnv('GO_NOGO_CHECKOUT_SUCCESS_MIN_PCT', 90),
  fallbackWarnPct: parseNumberEnv('GO_NOGO_FALLBACK_WARN_PCT', 10),
  errorWarnPct: parseNumberEnv('GO_NOGO_ERROR_WARN_PCT', 5),
};

const j = JSON.parse(readFileSync(inputPath, 'utf8'));
const f = j.funnel || {};
const e = j.errors || {};

// Required decision metrics
const requiredMetrics = [
  ['funnel', 'bookingPageView'],
  ['funnel', 'paymentCallbackReceived'],
  ['funnel', 'paymentSuccessRatePct'],
  ['funnel', 'fallbackRateVsV2PageViewPct'],
  ['errors', 'errorRateVsPageViewPct'],
];

const missingMetrics = requiredMetrics.filter(([scope, key]) => {
  if (scope === 'funnel') return !hasOwn(f, key);
  if (scope === 'errors') return !hasOwn(e, key);
  return true;
});

const pv = toNum(f.bookingPageView);
const cb = toNum(f.paymentCallbackReceived);
const payPct = toNum(f.paymentSuccessRatePct);
const fallbackPct = toNum(f.fallbackRateVsV2PageViewPct);
const errorPct = toNum(e.errorRateVsPageViewPct);

// checkout success metric (required by issue #105 next batch)
let checkoutSuccessPct = toNum(f.checkoutInitSuccessRatePct);
if (!Number.isFinite(checkoutSuccessPct) && hasOwn(f, 'checkoutInitSucceeded') && hasOwn(f, 'checkoutInitiated')) {
  checkoutSuccessPct = pct(toNum(f.checkoutInitSucceeded), toNum(f.checkoutInitiated));
}
if (!Number.isFinite(checkoutSuccessPct)) {
  missingMetrics.push(['funnel', 'checkoutInitSuccessRatePct']);
}

// v2 vs legacy conversion deltas
const bookingPvLegacy = toNum(f.bookingPageViewLegacy);
const bookingPvV2 = toNum(f.bookingPageViewV2);
const beginCheckoutLegacy = toNum(f.beginCheckoutLegacy);
const beginCheckoutV2 = toNum(f.beginCheckoutV2);
const purchaseIntentLegacy = toNum(f.purchaseIntentLegacy);
const purchaseIntentV2 = toNum(f.purchaseIntentV2);

const beginCheckoutRateLegacy = pct(beginCheckoutLegacy, bookingPvLegacy);
const beginCheckoutRateV2 = pct(beginCheckoutV2, bookingPvV2);
const beginCheckoutRateDeltaPct = deltaPct(beginCheckoutRateV2, beginCheckoutRateLegacy);

const purchaseIntentRateLegacy = pct(purchaseIntentLegacy, beginCheckoutLegacy);
const purchaseIntentRateV2 = pct(purchaseIntentV2, beginCheckoutV2);
const purchaseIntentRateDeltaPct = deltaPct(purchaseIntentRateV2, purchaseIntentRateLegacy);

// v2 vs legacy error-rate deltas
const errorRateLegacy = toNum(e.errorRateVsPageViewLegacyPct);
const errorRateV2 = toNum(e.errorRateVsPageViewV2Pct);
const errorRateDeltaPct = deltaPct(errorRateV2, errorRateLegacy);

const rollbackReasons = [];
const holdReasons = [];
const warnings = [];

for (const [scope, key] of missingMetrics) {
  holdReasons.push(`MISSING_REQUIRED_METRIC(${scope}.${key})`);
}

if (!cfg.minPageView.ok || !cfg.minCallback.ok || !cfg.paymentSuccessMinPct.ok || !cfg.checkoutSuccessMinPct.ok || !cfg.fallbackWarnPct.ok || !cfg.errorWarnPct.ok) {
  holdReasons.push('INVALID_THRESHOLD_CONFIG');
}

if (!Number.isFinite(payPct) || !Number.isFinite(fallbackPct) || !Number.isFinite(errorPct) || !Number.isFinite(pv) || !Number.isFinite(cb)) {
  holdReasons.push('INVALID_METRIC_VALUE');
}

if (Number.isFinite(pv) && pv < cfg.minPageView.value) holdReasons.push(`LOW_SAMPLE_PAGE_VIEW(${pv}<${cfg.minPageView.value})`);
if (Number.isFinite(cb) && cb < cfg.minCallback.value) holdReasons.push(`LOW_SAMPLE_CALLBACK(${cb}<${cfg.minCallback.value})`);

if (Number.isFinite(payPct) && payPct < cfg.paymentSuccessMinPct.value) rollbackReasons.push(`PAYMENT_SUCCESS_LOW(${payPct}%<${cfg.paymentSuccessMinPct.value}%)`);
if (Number.isFinite(checkoutSuccessPct) && checkoutSuccessPct < cfg.checkoutSuccessMinPct.value) rollbackReasons.push(`CHECKOUT_SUCCESS_LOW(${checkoutSuccessPct}%<${cfg.checkoutSuccessMinPct.value}%)`);
if (Number.isFinite(fallbackPct) && fallbackPct > cfg.fallbackWarnPct.value) rollbackReasons.push(`FALLBACK_RATE_HIGH(${fallbackPct}%>${cfg.fallbackWarnPct.value}%)`);
if (Number.isFinite(errorPct) && errorPct > cfg.errorWarnPct.value) rollbackReasons.push(`ERROR_RATE_HIGH(${errorPct}%>${cfg.errorWarnPct.value}%)`);

if (!Number.isFinite(beginCheckoutRateLegacy) || !Number.isFinite(beginCheckoutRateV2)) warnings.push('MISSING_DELTA_INPUT(begin_checkout_rate)');
if (!Number.isFinite(purchaseIntentRateLegacy) || !Number.isFinite(purchaseIntentRateV2)) warnings.push('MISSING_DELTA_INPUT(purchase_intent_rate)');
if (!Number.isFinite(errorRateLegacy) || !Number.isFinite(errorRateV2)) warnings.push('MISSING_DELTA_INPUT(error_rate)');

// DATA_QUALITY_WARNING: aggregate traffic exists but variant tags are all zero →
// events are being tracked but rollout_variant is not set (instrumentation gap, not absent traffic)
if (pv > 0 && bookingPvLegacy === 0 && bookingPvV2 === 0) {
  warnings.push('DATA_QUALITY_WARNING(variant_instrumentation_untagged)');
}

let decision = 'GO';
if (rollbackReasons.length) decision = 'ROLLBACK WATCH';
else if (holdReasons.length) decision = 'HOLD';

function parseDateArg(argv) {
  const byFlag = argv.find((a) => a.startsWith('--date='));
  const byEnv = process.env.GO_NOGO_DATE;
  const raw = (byFlag ? byFlag.slice('--date='.length) : byEnv || '').trim();
  if (!raw) return new Date().toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    console.error('Invalid --date / GO_NOGO_DATE, expected YYYY-MM-DD, got:', raw);
    process.exit(1);
  }
  return raw;
}

const today = parseDateArg(process.argv.slice(2));
const lines = [
  `# Booking V2 Daily Decision — ${today}`,
  '',
  `Decision: **${decision}**`,
  '',
  '## Inputs (core)',
  `- booking_page_view: ${fmt(pv)}`,
  `- payment_callback_received: ${fmt(cb)}`,
  `- payment_success_rate_pct: ${fmt(payPct, '%')}`,
  `- checkout_init_success_rate_pct: ${fmt(checkoutSuccessPct, '%')}`,
  `- fallback_rate_vs_v2_page_view_pct: ${fmt(fallbackPct, '%')}`,
  `- error_rate_vs_page_view_pct: ${fmt(errorPct, '%')}`,
  '',
  '## v2 vs legacy conversion deltas',
  `- begin_checkout_rate_legacy_pct: ${fmt(beginCheckoutRateLegacy, '%')}`,
  `- begin_checkout_rate_v2_pct: ${fmt(beginCheckoutRateV2, '%')}`,
  `- begin_checkout_rate_delta_pct: ${fmt(beginCheckoutRateDeltaPct, '%')}`,
  `- purchase_intent_rate_legacy_pct: ${fmt(purchaseIntentRateLegacy, '%')}`,
  `- purchase_intent_rate_v2_pct: ${fmt(purchaseIntentRateV2, '%')}`,
  `- purchase_intent_rate_delta_pct: ${fmt(purchaseIntentRateDeltaPct, '%')}`,
  '',
  '## v2 vs legacy error-rate deltas',
  `- error_rate_legacy_pct: ${fmt(errorRateLegacy, '%')}`,
  `- error_rate_v2_pct: ${fmt(errorRateV2, '%')}`,
  `- error_rate_delta_pct: ${fmt(errorRateDeltaPct, '%')}`,
  '',
  '## Threshold Config',
  `- min_page_view: ${cfg.minPageView.value} (${cfg.minPageView.source})`,
  `- min_callback: ${cfg.minCallback.value} (${cfg.minCallback.source})`,
  `- payment_success_min_pct: ${cfg.paymentSuccessMinPct.value} (${cfg.paymentSuccessMinPct.source})`,
  `- checkout_success_min_pct: ${cfg.checkoutSuccessMinPct.value} (${cfg.checkoutSuccessMinPct.source})`,
  `- fallback_warn_pct: ${cfg.fallbackWarnPct.value} (${cfg.fallbackWarnPct.source})`,
  `- error_warn_pct: ${cfg.errorWarnPct.value} (${cfg.errorWarnPct.source})`,
  '',
  '## Decision Reasons',
  `- rollback_reasons: ${rollbackReasons.length ? rollbackReasons.join('; ') : 'none'}`,
  `- hold_reasons: ${holdReasons.length ? holdReasons.join('; ') : 'none'}`,
  `- warnings: ${warnings.length ? warnings.join('; ') : 'none'}`,
  '',
  '## Policy Alignment',
  '- Uses #103 metrics snapshot as source-of-truth input',
  '- Decision labels aligned with #96/#104 (GO/HOLD/ROLLBACK WATCH)',
  '- If callback/oversell invariants breach externally, override to not-GO regardless of this report',
  '',
];

const datedPath = path.join(reportsDir, `booking-v2-go-no-go-${today}.md`);
const latestPath = path.join(reportsDir, 'booking-v2-go-no-go-latest.md');
writeFileSync(datedPath, lines.join('\n'));
writeFileSync(latestPath, lines.join('\n'));

// retention: keep latest 7 dated files
const files = readdirSync(reportsDir)
  .filter((n) => /^booking-v2-go-no-go-\d{4}-\d{2}-\d{2}\.md$/.test(n))
  .sort()
  .reverse();
for (const old of files.slice(7)) unlinkSync(path.join(reportsDir, old));

console.log('✅ generated', datedPath);
console.log('✅ updated', latestPath);
console.log('decision=', decision);
