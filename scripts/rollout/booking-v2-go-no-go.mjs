#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync, unlinkSync } from 'node:fs';
import path from 'node:path';

const cwd = process.cwd();
const reportsDir = path.join(cwd, 'docs/operations/reports');
mkdirSync(reportsDir, { recursive: true });

const inputPath = path.join(reportsDir, 'booking-v2-dashboard-latest.json');
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

const cfg = {
  minPageView: parseNumberEnv('GO_NOGO_MIN_PAGE_VIEW', 20),
  minCallback: parseNumberEnv('GO_NOGO_MIN_PAYMENT_CALLBACK', 5),
  paymentSuccessMinPct: parseNumberEnv('GO_NOGO_PAYMENT_SUCCESS_MIN_PCT', 95),
  fallbackWarnPct: parseNumberEnv('GO_NOGO_FALLBACK_WARN_PCT', 10),
  errorWarnPct: parseNumberEnv('GO_NOGO_ERROR_WARN_PCT', 5),
};

const j = JSON.parse(readFileSync(inputPath, 'utf8'));
const f = j.funnel || {};
const e = j.errors || {};

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

const pv = Number(f.bookingPageView);
const cb = Number(f.paymentCallbackReceived);
const payPct = Number(f.paymentSuccessRatePct);
const fallbackPct = Number(f.fallbackRateVsV2PageViewPct);
const errorPct = Number(e.errorRateVsPageViewPct);

const rollbackReasons = [];
const holdReasons = [];

for (const [scope, key] of missingMetrics) {
  holdReasons.push(`MISSING_REQUIRED_METRIC(${scope}.${key})`);
}

if (!cfg.minPageView.ok || !cfg.minCallback.ok || !cfg.paymentSuccessMinPct.ok || !cfg.fallbackWarnPct.ok || !cfg.errorWarnPct.ok) {
  holdReasons.push('INVALID_THRESHOLD_CONFIG');
}

if (!Number.isFinite(payPct) || !Number.isFinite(fallbackPct) || !Number.isFinite(errorPct) || !Number.isFinite(pv) || !Number.isFinite(cb)) {
  holdReasons.push('INVALID_METRIC_VALUE');
}

if (Number.isFinite(pv) && pv < cfg.minPageView.value) holdReasons.push(`LOW_SAMPLE_PAGE_VIEW(${pv}<${cfg.minPageView.value})`);
if (Number.isFinite(cb) && cb < cfg.minCallback.value) holdReasons.push(`LOW_SAMPLE_CALLBACK(${cb}<${cfg.minCallback.value})`);

if (Number.isFinite(payPct) && payPct < cfg.paymentSuccessMinPct.value) rollbackReasons.push(`PAYMENT_SUCCESS_LOW(${payPct}%<${cfg.paymentSuccessMinPct.value}%)`);
if (Number.isFinite(fallbackPct) && fallbackPct > cfg.fallbackWarnPct.value) rollbackReasons.push(`FALLBACK_RATE_HIGH(${fallbackPct}%>${cfg.fallbackWarnPct.value}%)`);
if (Number.isFinite(errorPct) && errorPct > cfg.errorWarnPct.value) rollbackReasons.push(`ERROR_RATE_HIGH(${errorPct}%>${cfg.errorWarnPct.value}%)`);

let decision = 'GO';
if (rollbackReasons.length) decision = 'ROLLBACK WATCH';
else if (holdReasons.length) decision = 'HOLD';

const today = new Date().toISOString().slice(0, 10);
const lines = [
  `# Booking V2 Daily Decision — ${today}`,
  '',
  `Decision: **${decision}**`,
  '',
  '## Inputs',
  `- booking_page_view: ${pv}`,
  `- payment_callback_received: ${cb}`,
  `- payment_success_rate: ${payPct}%`,
  `- fallback_rate_vs_v2_page_view: ${fallbackPct}%`,
  `- error_rate_vs_page_view: ${errorPct}%`,
  '',
  '## Threshold Config',
  `- min_page_view: ${cfg.minPageView.value} (${cfg.minPageView.source})`,
  `- min_callback: ${cfg.minCallback.value} (${cfg.minCallback.source})`,
  `- payment_success_min_pct: ${cfg.paymentSuccessMinPct.value} (${cfg.paymentSuccessMinPct.source})`,
  `- fallback_warn_pct: ${cfg.fallbackWarnPct.value} (${cfg.fallbackWarnPct.source})`,
  `- error_warn_pct: ${cfg.errorWarnPct.value} (${cfg.errorWarnPct.source})`,
  '',
  '## Decision Reasons',
  `- rollback_reasons: ${rollbackReasons.length ? rollbackReasons.join('; ') : 'none'}`,
  `- hold_reasons: ${holdReasons.length ? holdReasons.join('; ') : 'none'}`,
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
