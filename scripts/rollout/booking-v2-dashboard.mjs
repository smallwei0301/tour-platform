#!/usr/bin/env node
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

function loadEnvFile(filePath) {
  if (!existsSync(filePath)) return;
  const content = readFileSync(filePath, 'utf8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx <= 0) continue;
    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (process.env[key] == null) process.env[key] = value;
  }
}

function pct(num, den) {
  if (!den) return 0;
  return Number(((num / den) * 100).toFixed(2));
}

const cwd = process.cwd();
loadEnvFile(path.join(cwd, '.env'));
loadEnvFile(path.join(cwd, 'apps/web/.env.local'));

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing required env: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const HOURS = Number(process.env.ROLLUP_HOURS || 24);
const END_AT = new Date();
const START_AT = new Date(END_AT.getTime() - HOURS * 60 * 60 * 1000);

const REST_BASE = `${SUPABASE_URL.replace(/\/$/, '')}/rest/v1`;
const COMMON_HEADERS = {
  apikey: SUPABASE_SERVICE_ROLE_KEY,
  Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
};

function iso(v) {
  return encodeURIComponent(v.toISOString());
}

async function countRows(table, filters = []) {
  const qs = ['select=id', ...filters].join('&');
  const url = `${REST_BASE}/${table}?${qs}`;
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      ...COMMON_HEADERS,
      Prefer: 'count=exact',
      Range: '0-0',
    },
  });

  if (!res.ok) {
    throw new Error(`countRows(${table}) failed: ${res.status} ${await res.text()}`);
  }

  const contentRange = res.headers.get('content-range');
  if (!contentRange) return 0;
  const total = Number(contentRange.split('/')[1]);
  return Number.isFinite(total) ? total : 0;
}

async function selectRows(table, columns, filters = [], limit = 1000) {
  const qs = [`select=${encodeURIComponent(columns)}`, ...filters, `limit=${limit}`].join('&');
  const url = `${REST_BASE}/${table}?${qs}`;
  const res = await fetch(url, { headers: COMMON_HEADERS });
  if (!res.ok) {
    throw new Error(`selectRows(${table}) failed: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

async function countEvents(eventName) {
  return countRows('events', [
    `event_name=eq.${encodeURIComponent(eventName)}`,
    `created_at=gte.${iso(START_AT)}`,
    `created_at=lte.${iso(END_AT)}`,
  ]);
}

async function countOrdersByPaymentStatus(status) {
  return countRows('orders', [
    `payment_status=eq.${encodeURIComponent(status)}`,
    `created_at=gte.${iso(START_AT)}`,
    `created_at=lte.${iso(END_AT)}`,
  ]);
}

async function countBookingsStatus(status) {
  return countRows('bookings', [
    `status=eq.${encodeURIComponent(status)}`,
    `created_at=gte.${iso(START_AT)}`,
    `created_at=lte.${iso(END_AT)}`,
  ]);
}

async function countEventByVariant(eventName, variant) {
  const rows = await selectRows(
    'events',
    'properties',
    [
      `event_name=eq.${encodeURIComponent(eventName)}`,
      `created_at=gte.${iso(START_AT)}`,
      `created_at=lte.${iso(END_AT)}`,
    ],
    5000,
  );

  return (rows || []).filter((r) => r?.properties?.rollout_variant === variant).length;
}

async function avgLatencyFromEvents(eventName) {
  const rows = await selectRows(
    'events',
    'properties',
    [
      `event_name=eq.${encodeURIComponent(eventName)}`,
      `created_at=gte.${iso(START_AT)}`,
      `created_at=lte.${iso(END_AT)}`,
    ],
    5000,
  );

  const values = (rows || [])
    .map((r) => Number(r?.properties?.latency_ms))
    .filter((n) => Number.isFinite(n) && n >= 0);

  if (!values.length) return null;
  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  values.sort((a, b) => a - b);
  const p95 = values[Math.floor(values.length * 0.95)] ?? values[values.length - 1];
  return { avgMs: Math.round(avg), p95Ms: Math.round(p95), sample: values.length };
}

async function main() {
  const [
    bookingPageView,
    bookingPageViewLegacy,
    bookingPageViewV2,
    beginCheckout,
    purchaseIntent,
    callbackReceived,
    paymentSucceeded,
    fallbackClicked,
    eventError,
    paidOrders,
    failedOrders,
    completedBookings,
    cancelledBookings,
    slotsLatency,
    draftLatency,
    checkoutLatency,
  ] = await Promise.all([
    countEvents('booking_page_view'),
    countEventByVariant('booking_page_view', 'legacy'),
    countEventByVariant('booking_page_view', 'v2'),
    countEvents('begin_checkout'),
    countEvents('purchase_intent'),
    countEvents('payment_callback_received'),
    countEvents('payment_succeeded'),
    countEvents('booking_v2_fallback_clicked'),
    countEvents('error'),
    countOrdersByPaymentStatus('paid'),
    countOrdersByPaymentStatus('failed'),
    countBookingsStatus('completed'),
    countBookingsStatus('cancelled'),
    avgLatencyFromEvents('available_slots_loaded'),
    avgLatencyFromEvents('booking_draft_created'),
    avgLatencyFromEvents('checkout_initiated'),
  ]);

  const report = {
    generatedAt: END_AT.toISOString(),
    window: { hours: HOURS, startAt: START_AT.toISOString(), endAt: END_AT.toISOString() },
    funnel: {
      bookingPageView,
      bookingPageViewLegacy,
      bookingPageViewV2,
      beginCheckout,
      purchaseIntent,
      paymentCallbackReceived: callbackReceived,
      paymentSucceeded,
      fallbackClicked,
      beginCheckoutRatePct: pct(beginCheckout, bookingPageView),
      purchaseIntentRatePct: pct(purchaseIntent, beginCheckout),
      paymentSuccessRatePct: pct(paymentSucceeded, callbackReceived),
      fallbackRateVsV2PageViewPct: pct(fallbackClicked, bookingPageViewV2),
      // checkout-init success: begin_checkout→purchase_intent proxy until checkout_initiated event is instrumented
      checkoutInitiated: beginCheckout,
      checkoutInitSucceeded: purchaseIntent,
      ...(beginCheckout > 0 ? { checkoutInitSuccessRatePct: pct(purchaseIntent, beginCheckout) } : {}),
    },
    orders: { paid: paidOrders, failed: failedOrders },
    bookings: { completed: completedBookings, cancelled: cancelledBookings },
    errors: {
      eventError,
      errorRateVsPageViewPct: pct(eventError, bookingPageView),
    },
    latency: {
      availableSlots: slotsLatency,
      draftCreate: draftLatency,
      checkoutInit: checkoutLatency,
    },
    notes: [
      'booking_page_view and booking_v2_fallback_clicked are now first-class events.',
      'rollout_variant=legacy|v2 is read from events.properties.rollout_variant.',
      'latency metrics require event.properties.latency_ms instrumentation to be present.',
      'checkoutInitiated/checkoutInitSucceeded use begin_checkout→purchase_intent as a proxy; a dedicated checkout_initiated event would give a more precise signal.',
    ],
  };

  const md = `# Booking V2 Rollout Dashboard Snapshot\n\n` +
`Generated: ${report.generatedAt}\n` +
`Window: last ${HOURS}h (${report.window.startAt} ~ ${report.window.endAt})\n\n` +
`## Funnel\n` +
`- booking_page_view: ${report.funnel.bookingPageView}\n` +
`  - legacy: ${report.funnel.bookingPageViewLegacy}\n` +
`  - v2: ${report.funnel.bookingPageViewV2}\n` +
`- begin_checkout: ${report.funnel.beginCheckout} (${report.funnel.beginCheckoutRatePct}%)\n` +
`- purchase_intent: ${report.funnel.purchaseIntent} (${report.funnel.purchaseIntentRatePct}%)\n` +
`- payment_callback_received: ${report.funnel.paymentCallbackReceived}\n` +
`- payment_succeeded: ${report.funnel.paymentSucceeded} (${report.funnel.paymentSuccessRatePct}%)\n` +
`- booking_v2_fallback_clicked: ${report.funnel.fallbackClicked} (${report.funnel.fallbackRateVsV2PageViewPct}% of v2 page views)\n` +
`- checkout_init_success: ${report.funnel.checkoutInitSucceeded}/${report.funnel.checkoutInitiated} (${report.funnel.checkoutInitSuccessRatePct != null ? report.funnel.checkoutInitSuccessRatePct + '%' : 'N/A — no begin_checkout events'})\n\n` +
`## Orders / Bookings\n` +
`- orders.paid: ${report.orders.paid}\n` +
`- orders.failed: ${report.orders.failed}\n` +
`- bookings.completed: ${report.bookings.completed}\n` +
`- bookings.cancelled: ${report.bookings.cancelled}\n\n` +
`## Errors\n` +
`- events.error: ${report.errors.eventError}\n` +
`- error_rate_vs_page_view: ${report.errors.errorRateVsPageViewPct}%\n\n` +
`## Latency (from events.properties.latency_ms)\n` +
`- available-slots: ${report.latency.availableSlots ? `avg ${report.latency.availableSlots.avgMs}ms / p95 ${report.latency.availableSlots.p95Ms}ms (n=${report.latency.availableSlots.sample})` : 'N/A'}\n` +
`- draft-create: ${report.latency.draftCreate ? `avg ${report.latency.draftCreate.avgMs}ms / p95 ${report.latency.draftCreate.p95Ms}ms (n=${report.latency.draftCreate.sample})` : 'N/A'}\n` +
`- checkout-init: ${report.latency.checkoutInit ? `avg ${report.latency.checkoutInit.avgMs}ms / p95 ${report.latency.checkoutInit.p95Ms}ms (n=${report.latency.checkoutInit.sample})` : 'N/A'}\n\n` +
`## Notes\n` + report.notes.map((n) => `- ${n}`).join('\n') + '\n';

  const reportsDir = path.join(cwd, 'docs/operations/reports');
  mkdirSync(reportsDir, { recursive: true });
  const ts = END_AT.toISOString().replace(/[:.]/g, '-');

  const jsonPath = path.join(reportsDir, `booking-v2-dashboard-${ts}.json`);
  const mdPath = path.join(reportsDir, `booking-v2-dashboard-${ts}.md`);
  const latestJson = path.join(reportsDir, 'booking-v2-dashboard-latest.json');
  const latestMd = path.join(reportsDir, 'booking-v2-dashboard-latest.md');

  writeFileSync(jsonPath, JSON.stringify(report, null, 2));
  writeFileSync(mdPath, md);
  writeFileSync(latestJson, JSON.stringify(report, null, 2));
  writeFileSync(latestMd, md);

  console.log('✅ Booking V2 dashboard snapshot generated');
  console.log(`- ${jsonPath}`);
  console.log(`- ${mdPath}`);
  console.log(`- ${latestJson}`);
  console.log(`- ${latestMd}`);
}

main().catch((err) => {
  console.error('❌ Failed to generate dashboard snapshot');
  console.error(err);
  process.exit(1);
});
