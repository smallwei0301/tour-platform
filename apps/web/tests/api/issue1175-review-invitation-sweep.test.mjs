// Issue #1175 — review-invitation sweep backend slice (helpers only).
//
// These tests pin the sweep decision engine that the future cron / endpoint
// will integrate. Coverage:
//   - feature flag defaults OFF and only opens on explicit env value
//   - per-order decisions reuse the #1174 eligibility + idempotency helpers
//   - per-order skip reasons stay stable codes (not free text)
//   - run summary collapses decisions into counts only (no PII / order ids)
//   - flag=OFF short-circuits BEFORE eligibility lookup (no log writes, no
//     accidental "I'm checking 2k orders" behavior on a paused deploy)

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  evaluateReviewInvitationSweepCandidates,
  summarizeReviewInvitationSweepRun,
  isReviewInvitationSweepEnabled,
  REVIEW_INVITATION_SWEEP_ENV_VAR,
} from '../../src/lib/post-trip/review-invitation-sweep.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..');

const NOW = '2026-06-04T12:00:00Z';
const ENDED_25H_AGO = '2026-06-03T11:00:00Z';
const ENDED_23H_AGO = '2026-06-03T13:00:00Z';
const SENT_RECORD = { status: 'sent', sent_at: '2026-06-03T13:00:00Z' };
const FAILED_RECORD = { status: 'failed', failed_at: '2026-06-03T13:00:00Z' };

// ---------- feature flag ----------

test('feature flag: defaults OFF when env var is missing', () => {
  assert.equal(isReviewInvitationSweepEnabled({ env: {} }), false);
});

test('feature flag: explicit "1" / "true" / "on" enables it (case insensitive)', () => {
  assert.equal(isReviewInvitationSweepEnabled({ env: { [REVIEW_INVITATION_SWEEP_ENV_VAR]: '1' } }), true);
  assert.equal(isReviewInvitationSweepEnabled({ env: { [REVIEW_INVITATION_SWEEP_ENV_VAR]: 'true' } }), true);
  assert.equal(isReviewInvitationSweepEnabled({ env: { [REVIEW_INVITATION_SWEEP_ENV_VAR]: 'ON' } }), true);
  assert.equal(isReviewInvitationSweepEnabled({ env: { [REVIEW_INVITATION_SWEEP_ENV_VAR]: ' True ' } }), true);
});

test('feature flag: ambiguous / falsey values stay OFF (no silent enable)', () => {
  assert.equal(isReviewInvitationSweepEnabled({ env: { [REVIEW_INVITATION_SWEEP_ENV_VAR]: '0' } }), false);
  assert.equal(isReviewInvitationSweepEnabled({ env: { [REVIEW_INVITATION_SWEEP_ENV_VAR]: 'false' } }), false);
  assert.equal(isReviewInvitationSweepEnabled({ env: { [REVIEW_INVITATION_SWEEP_ENV_VAR]: '' } }), false);
  assert.equal(isReviewInvitationSweepEnabled({ env: { [REVIEW_INVITATION_SWEEP_ENV_VAR]: 'yes' } }), false);
  assert.equal(isReviewInvitationSweepEnabled({ env: { OTHER_FLAG: '1' } }), false);
});

// ---------- sweep candidate decisions ----------

const ELIGIBLE_ORDER = {
  id: 'order-eligible',
  status: 'paid',
  scheduleEndAt: ENDED_25H_AGO,
};
const NOT_FINISHED_ORDER = {
  id: 'order-too-fresh',
  status: 'paid',
  scheduleEndAt: ENDED_23H_AGO,
};
const REFUNDED_ORDER = {
  id: 'order-refunded',
  status: 'refunded',
  scheduleEndAt: ENDED_25H_AGO,
};
const NO_SHOW_ORDER = {
  id: 'order-no-show',
  status: 'no_show',
  scheduleEndAt: ENDED_25H_AGO,
};
const DISPUTED_ORDER = {
  id: 'order-disputed',
  status: 'paid',
  scheduleEndAt: ENDED_25H_AGO,
  hasDispute: true,
};

test('sweep: featureEnabled=false short-circuits every order to FEATURE_FLAG_OFF', () => {
  const r = evaluateReviewInvitationSweepCandidates({
    orders: [ELIGIBLE_ORDER, REFUNDED_ORDER],
    existingInvitationsByOrderId: { 'order-eligible': [SENT_RECORD] },
    now: NOW,
    featureEnabled: false,
  });
  assert.equal(r.featureEnabled, false);
  assert.equal(r.decisions.length, 2);
  for (const d of r.decisions) {
    assert.equal(d.action, 'skip');
    assert.equal(d.reason, 'FEATURE_FLAG_OFF');
  }
});

test('sweep: eligible order with no prior log → send', () => {
  const r = evaluateReviewInvitationSweepCandidates({
    orders: [ELIGIBLE_ORDER],
    existingInvitationsByOrderId: {},
    now: NOW,
    featureEnabled: true,
  });
  assert.equal(r.decisions[0].action, 'send');
  assert.equal(r.decisions[0].code, 'first_send');
});

test('sweep: eligible order with prior sent record → skip with IDEMPOTENCY reason', () => {
  const r = evaluateReviewInvitationSweepCandidates({
    orders: [ELIGIBLE_ORDER],
    existingInvitationsByOrderId: { 'order-eligible': [SENT_RECORD] },
    now: NOW,
    featureEnabled: true,
  });
  assert.equal(r.decisions[0].action, 'skip');
  assert.equal(r.decisions[0].reason, 'IDEMPOTENCY');
  assert.equal(r.decisions[0].code, 'already_sent');
});

test('sweep: eligible order with only failed records → send (retry_after_failure)', () => {
  const r = evaluateReviewInvitationSweepCandidates({
    orders: [ELIGIBLE_ORDER],
    existingInvitationsByOrderId: { 'order-eligible': [FAILED_RECORD] },
    now: NOW,
    featureEnabled: true,
  });
  assert.equal(r.decisions[0].action, 'send');
  assert.equal(r.decisions[0].code, 'retry_after_failure');
});

test('sweep: order < 24h finished → skip with ACTIVITY_NOT_FINISHED_24H', () => {
  const r = evaluateReviewInvitationSweepCandidates({
    orders: [NOT_FINISHED_ORDER],
    existingInvitationsByOrderId: {},
    now: NOW,
    featureEnabled: true,
  });
  assert.equal(r.decisions[0].action, 'skip');
  assert.equal(r.decisions[0].reason, 'ACTIVITY_NOT_FINISHED_24H');
});

test('sweep: refunded order → skip with ORDER_REFUNDED', () => {
  const r = evaluateReviewInvitationSweepCandidates({
    orders: [REFUNDED_ORDER],
    existingInvitationsByOrderId: {},
    now: NOW,
    featureEnabled: true,
  });
  assert.equal(r.decisions[0].reason, 'ORDER_REFUNDED');
});

test('sweep: no_show order → skip with ORDER_NO_SHOW', () => {
  const r = evaluateReviewInvitationSweepCandidates({
    orders: [NO_SHOW_ORDER],
    existingInvitationsByOrderId: {},
    now: NOW,
    featureEnabled: true,
  });
  assert.equal(r.decisions[0].reason, 'ORDER_NO_SHOW');
});

test('sweep: disputed order → skip with ORDER_DISPUTED', () => {
  const r = evaluateReviewInvitationSweepCandidates({
    orders: [DISPUTED_ORDER],
    existingInvitationsByOrderId: {},
    now: NOW,
    featureEnabled: true,
  });
  assert.equal(r.decisions[0].reason, 'ORDER_DISPUTED');
});

test('sweep: cancelled order → skip with ORDER_CANCELLED', () => {
  const r = evaluateReviewInvitationSweepCandidates({
    orders: [{ id: 'order-cancelled', status: 'cancelled', scheduleEndAt: ENDED_25H_AGO }],
    existingInvitationsByOrderId: {},
    now: NOW,
    featureEnabled: true,
  });
  assert.equal(r.decisions[0].action, 'skip');
  assert.equal(r.decisions[0].reason, 'ORDER_CANCELLED');
});

test('sweep: hasDispute=true is the safety-case proxy (complaint/incident → ORDER_DISPUTED skip)', () => {
  // "safety case" in the AC refers to orders with a complaint/incident flag.
  // The data model represents this via operations_tracking.has_complaint,
  // which the route maps to hasDispute: true before calling the decision engine.
  // ORDER_DISPUTED is therefore the canonical skip reason for safety incidents.
  const r = evaluateReviewInvitationSweepCandidates({
    orders: [{ id: 'order-safety', status: 'paid', scheduleEndAt: ENDED_25H_AGO, hasDispute: true }],
    existingInvitationsByOrderId: {},
    now: NOW,
    featureEnabled: true,
  });
  assert.equal(r.decisions[0].action, 'skip');
  assert.equal(r.decisions[0].reason, 'ORDER_DISPUTED',
    'safety incidents (has_complaint=true) map to ORDER_DISPUTED skip reason');
});

test('sweep: orders array missing / non-array → safe-fail empty decisions', () => {
  const r = evaluateReviewInvitationSweepCandidates({
    featureEnabled: true,
    orders: null,
  });
  assert.equal(r.decisions.length, 0);
});

test('sweep: mixed batch produces stable per-order decisions in order', () => {
  const r = evaluateReviewInvitationSweepCandidates({
    orders: [ELIGIBLE_ORDER, REFUNDED_ORDER, NO_SHOW_ORDER, NOT_FINISHED_ORDER],
    existingInvitationsByOrderId: {},
    now: NOW,
    featureEnabled: true,
  });
  assert.deepEqual(
    r.decisions.map((d) => d.action),
    ['send', 'skip', 'skip', 'skip'],
  );
  assert.deepEqual(
    r.decisions.map((d) => d.reason),
    ['ELIGIBLE', 'ORDER_REFUNDED', 'ORDER_NO_SHOW', 'ACTIVITY_NOT_FINISHED_24H'],
  );
});

// ---------- summary ----------

test('summary: counts send vs skip with per-reason skip breakdown (no PII)', () => {
  const decisions = [
    { orderId: 'a', action: 'send', reason: 'ELIGIBLE' },
    { orderId: 'b', action: 'skip', reason: 'ORDER_REFUNDED' },
    { orderId: 'c', action: 'skip', reason: 'ORDER_REFUNDED' },
    { orderId: 'd', action: 'skip', reason: 'ACTIVITY_NOT_FINISHED_24H' },
    { orderId: 'e', action: 'skip', reason: 'IDEMPOTENCY' },
  ];
  const summary = summarizeReviewInvitationSweepRun({ decisions, featureEnabled: true });
  assert.equal(summary.total, 5);
  assert.equal(summary.sendCount, 1);
  assert.equal(summary.skipCount, 4);
  assert.deepEqual(summary.skipReasonCounts, {
    ORDER_REFUNDED: 2,
    ACTIVITY_NOT_FINISHED_24H: 1,
    IDEMPOTENCY: 1,
  });
  assert.equal(summary.featureEnabled, true);
});

test('summary: empty / missing decisions → zeros, never NaN', () => {
  const a = summarizeReviewInvitationSweepRun({});
  assert.deepEqual(
    { total: a.total, sendCount: a.sendCount, skipCount: a.skipCount },
    { total: 0, sendCount: 0, skipCount: 0 },
  );
  const b = summarizeReviewInvitationSweepRun({ decisions: null });
  assert.equal(b.total, 0);
});

test('summary: malformed decision without reason → counted under UNKNOWN (still privacy-safe)', () => {
  const summary = summarizeReviewInvitationSweepRun({
    decisions: [{ orderId: 'x', action: 'skip' }],
    featureEnabled: true,
  });
  assert.equal(summary.skipReasonCounts.UNKNOWN, 1);
});

// ---------- source contract ----------

test('Source: env var name is published as a stable export', () => {
  // The future cron PR will reference REVIEW_INVITATION_SWEEP_ENV_VAR by
  // import (not by raw string), so renaming the env var here propagates
  // automatically. Lock the canonical name.
  assert.equal(REVIEW_INVITATION_SWEEP_ENV_VAR, 'REVIEW_INVITATION_SWEEP_ENABLED');
});

test('Source: sweep module reuses #1174 helpers (does not reimplement eligibility/idempotency)', () => {
  const src = readFileSync(
    join(REPO_ROOT, 'src/lib/post-trip/review-invitation-sweep.mjs'),
    'utf8',
  );
  assert.match(src, /from\s+['"]\.\/review-invitation(\.mjs)?['"]/);
  assert.match(src, /evaluateReviewInvitationEligibility/);
  assert.match(src, /evaluateReviewInvitationIdempotency/);
});

test('Source: sweep module does not log / store / return order email or PII strings', () => {
  const src = readFileSync(
    join(REPO_ROOT, 'src/lib/post-trip/review-invitation-sweep.mjs'),
    'utf8',
  );
  // The decision/summary return shape must remain code-only. If a future
  // change tries to bake email/phone/contact into the helper output (which
  // would then flow into logs), this guard fires.
  assert.doesNotMatch(src, /\bcontact_email\b/);
  assert.doesNotMatch(src, /\btraveler_email\b/);
  assert.doesNotMatch(src, /\bcontact_phone\b/);
  assert.doesNotMatch(src, /\bemail_body\b/);
});

// ---------- route source-contract tests ----------

const ROUTE_PATH = join(
  __dirname,
  '../../app/api/internal/reviews/review-invitation-sweep/route.ts'
);

test('Route: file exists at canonical path', () => {
  // Will throw if file does not exist
  const src = readFileSync(ROUTE_PATH, 'utf8');
  assert.ok(src.length > 0, 'route file must not be empty');
});

test('Route: exports async POST handler', () => {
  const src = readFileSync(ROUTE_PATH, 'utf8');
  assert.match(src, /export\s+async\s+function\s+POST/, 'must export async function POST');
});

test('Route: guards x-internal-token vs INTERNAL_ALERT_TOKEN (same auth as pre-tour-sweep)', () => {
  const src = readFileSync(ROUTE_PATH, 'utf8');
  assert.match(src, /x-internal-token/, 'must check x-internal-token header');
  assert.match(src, /INTERNAL_ALERT_TOKEN/, 'must check INTERNAL_ALERT_TOKEN env var');
  assert.match(src, /401/, 'must return 401 on auth failure');
});

test('Route: checks isReviewInvitationSweepEnabled and returns disabled status when off', () => {
  const src = readFileSync(ROUTE_PATH, 'utf8');
  assert.match(src, /isReviewInvitationSweepEnabled/, 'must call isReviewInvitationSweepEnabled');
  assert.match(src, /disabled/, 'must return disabled status when feature flag is off');
});

test('Route: imports evaluateReviewInvitationSweepCandidates and summarizeReviewInvitationSweepRun', () => {
  const src = readFileSync(ROUTE_PATH, 'utf8');
  assert.match(src, /evaluateReviewInvitationSweepCandidates/, 'must use sweep candidate evaluator');
  assert.match(src, /summarizeReviewInvitationSweepRun/, 'must use sweep run summarizer');
});

test('Route: imports sendReviewInvitation from email lib', () => {
  const src = readFileSync(ROUTE_PATH, 'utf8');
  assert.match(src, /sendReviewInvitation/, 'must call sendReviewInvitation for action=send orders');
});

test('Route: writes delivery log to review_invitations table', () => {
  const src = readFileSync(ROUTE_PATH, 'utf8');
  assert.match(src, /review_invitations/, 'must write to review_invitations delivery log');
});

test('Route: uses service-role client (SUPABASE_SERVICE_ROLE_KEY)', () => {
  const src = readFileSync(ROUTE_PATH, 'utf8');
  assert.match(src, /SUPABASE_SERVICE_ROLE_KEY/, 'must use service-role key for DB writes');
});

test('Route: returns privacy-safe summary (no PII in response)', () => {
  const src = readFileSync(ROUTE_PATH, 'utf8');
  // Response must include summary counts but must NOT directly expose contact_email or PII
  assert.match(src, /sendCount|sent_count|total/, 'response must include counts');
  assert.doesNotMatch(
    src,
    /contact_email.*return|return.*contact_email/,
    'must not return contact_email in response'
  );
});

test('Route: handles missing Supabase env gracefully (no hard crash)', () => {
  const src = readFileSync(ROUTE_PATH, 'utf8');
  // Route must handle case where Supabase is unavailable — check for SUPABASE_URL guard
  assert.match(src, /SUPABASE_URL/, 'must check for SUPABASE_URL env var');
});

test('Route: initiated_by field is set to sweep_cron (not admin_manual)', () => {
  const src = readFileSync(ROUTE_PATH, 'utf8');
  assert.match(src, /sweep_cron|cron/, 'delivery log must mark rows as sweep_cron origin');
});
