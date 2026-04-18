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

const cfg = {
  minPageView: Number(process.env.GO_NOGO_MIN_PAGE_VIEW || 20),
  minCallback: Number(process.env.GO_NOGO_MIN_PAYMENT_CALLBACK || 5),
  paymentSuccessMinPct: Number(process.env.GO_NOGO_PAYMENT_SUCCESS_MIN_PCT || 95),
  fallbackWarnPct: Number(process.env.GO_NOGO_FALLBACK_WARN_PCT || 10),
  errorWarnPct: Number(process.env.GO_NOGO_ERROR_WARN_PCT || 5),
};

const j = JSON.parse(readFileSync(inputPath, 'utf8'));
const f = j.funnel || {};
const e = j.errors || {};

const pv = Number(f.bookingPageView || 0);
const cb = Number(f.paymentCallbackReceived || 0);
const payPct = Number(f.paymentSuccessRatePct || 0);
const fallbackPct = Number(f.fallbackRateVsV2PageViewPct || 0);
const errorPct = Number(e.errorRateVsPageViewPct || 0);

const rollbackReasons = [];
const holdReasons = [];

if (!Number.isFinite(payPct) || !Number.isFinite(fallbackPct) || !Number.isFinite(errorPct)) {
  holdReasons.push('UNSET_THRESHOLD_OR_INVALID_METRIC');
}
if (pv < cfg.minPageView) holdReasons.push(`LOW_SAMPLE_PAGE_VIEW(${pv}<${cfg.minPageView})`);
if (cb < cfg.minCallback) holdReasons.push(`LOW_SAMPLE_CALLBACK(${cb}<${cfg.minCallback})`);

if (payPct < cfg.paymentSuccessMinPct) rollbackReasons.push(`PAYMENT_SUCCESS_LOW(${payPct}%<${cfg.paymentSuccessMinPct}%)`);
if (fallbackPct > cfg.fallbackWarnPct) rollbackReasons.push(`FALLBACK_RATE_HIGH(${fallbackPct}%>${cfg.fallbackWarnPct}%)`);
if (errorPct > cfg.errorWarnPct) rollbackReasons.push(`ERROR_RATE_HIGH(${errorPct}%>${cfg.errorWarnPct}%)`);

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
  `- min_page_view: ${cfg.minPageView}`,
  `- min_callback: ${cfg.minCallback}`,
  `- payment_success_min_pct: ${cfg.paymentSuccessMinPct}`,
  `- fallback_warn_pct: ${cfg.fallbackWarnPct}`,
  `- error_warn_pct: ${cfg.errorWarnPct}`,
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
