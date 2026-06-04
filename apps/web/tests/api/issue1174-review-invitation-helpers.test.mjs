// Issue #1174 — backend slice (helpers + migration source contract).
//
// These tests pin the eligibility and idempotency contracts that the
// (future) admin send-review-invitation endpoint and any future cron will
// share. The migration source-contract section also locks the table
// shape and RLS posture so an environment with a stale schema gets
// caught at code-review time, not in production (cf. #1115 silent-fail
// lesson on the activity_schedules SELECT).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  evaluateReviewInvitationEligibility,
  evaluateReviewInvitationIdempotency,
} from '../../src/lib/post-trip/review-invitation.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..', '..', '..');

const MIGRATION_PATH = join(
  REPO_ROOT,
  'supabase/migrations/20260604_issue1174_review_invitations.sql',
);

// ---------- eligibility ----------

const NOW = '2026-06-04T12:00:00Z';
const FINISHED_25H_AGO = '2026-06-03T11:00:00Z';
const FINISHED_23H_AGO = '2026-06-03T13:00:00Z';
const FINISHED_30D_AGO = '2026-05-05T12:00:00Z';

test('eligibility: paid order, activity finished 25h ago → eligible', () => {
  const r = evaluateReviewInvitationEligibility({
    orderStatus: 'paid',
    scheduleEndAt: FINISHED_25H_AGO,
    now: NOW,
  });
  assert.deepEqual(r, { eligible: true });
});

test('eligibility: completed order 30 days ago → eligible', () => {
  const r = evaluateReviewInvitationEligibility({
    orderStatus: 'completed',
    scheduleEndAt: FINISHED_30D_AGO,
    now: NOW,
  });
  assert.deepEqual(r, { eligible: true });
});

test('eligibility: activity finished only 23h ago → ACTIVITY_NOT_FINISHED_24H', () => {
  const r = evaluateReviewInvitationEligibility({
    orderStatus: 'paid',
    scheduleEndAt: FINISHED_23H_AGO,
    now: NOW,
  });
  assert.equal(r.eligible, false);
  assert.equal(r.reason, 'ACTIVITY_NOT_FINISHED_24H');
});

test('eligibility: orderStatus=pending_payment → ORDER_NOT_COMPLETED', () => {
  const r = evaluateReviewInvitationEligibility({
    orderStatus: 'pending_payment',
    scheduleEndAt: FINISHED_25H_AGO,
    now: NOW,
  });
  assert.equal(r.reason, 'ORDER_NOT_COMPLETED');
});

test('eligibility: orderStatus=cancelled → ORDER_CANCELLED (blocked status wins over time gate)', () => {
  const r = evaluateReviewInvitationEligibility({
    orderStatus: 'cancelled',
    scheduleEndAt: FINISHED_25H_AGO,
    now: NOW,
  });
  assert.equal(r.reason, 'ORDER_CANCELLED');
});

test('eligibility: orderStatus=refunded → ORDER_REFUNDED', () => {
  const r = evaluateReviewInvitationEligibility({
    orderStatus: 'refunded',
    scheduleEndAt: FINISHED_25H_AGO,
    now: NOW,
  });
  assert.equal(r.reason, 'ORDER_REFUNDED');
});

test('eligibility: orderStatus=refund_pending → ORDER_REFUNDED (same eligibility outcome)', () => {
  const r = evaluateReviewInvitationEligibility({
    orderStatus: 'refund_pending',
    scheduleEndAt: FINISHED_25H_AGO,
    now: NOW,
  });
  assert.equal(r.reason, 'ORDER_REFUNDED');
});

test('eligibility: orderStatus=no_show → ORDER_NO_SHOW', () => {
  const r = evaluateReviewInvitationEligibility({
    orderStatus: 'no_show',
    scheduleEndAt: FINISHED_25H_AGO,
    now: NOW,
  });
  assert.equal(r.reason, 'ORDER_NO_SHOW');
});

test('eligibility: hasDispute=true outranks even completed paid orders', () => {
  const r = evaluateReviewInvitationEligibility({
    orderStatus: 'completed',
    scheduleEndAt: FINISHED_30D_AGO,
    now: NOW,
    hasDispute: true,
  });
  assert.equal(r.reason, 'ORDER_DISPUTED');
});

test('eligibility: missing scheduleEndAt → MISSING_SCHEDULE_END', () => {
  const r = evaluateReviewInvitationEligibility({
    orderStatus: 'paid',
    scheduleEndAt: null,
    now: NOW,
  });
  assert.equal(r.reason, 'MISSING_SCHEDULE_END');
});

test('eligibility: unparseable timestamps → MISSING_SCHEDULE_END / MISSING_NOW (safe-fail, not 200)', () => {
  assert.equal(
    evaluateReviewInvitationEligibility({
      orderStatus: 'paid',
      scheduleEndAt: 'not-a-date',
      now: NOW,
    }).reason,
    'MISSING_SCHEDULE_END',
  );
  assert.equal(
    evaluateReviewInvitationEligibility({
      orderStatus: 'paid',
      scheduleEndAt: FINISHED_25H_AGO,
      now: 'not-a-date',
    }).reason,
    'MISSING_NOW',
  );
});

// ---------- idempotency ----------

const SENT_RECORD = { status: 'sent', sent_at: '2026-06-03T13:00:00Z' };
const FAILED_RECORD = { status: 'failed', failed_at: '2026-06-03T13:00:00Z' };

test('idempotency: no existing record → first_send', () => {
  const r = evaluateReviewInvitationIdempotency({ existingInvitations: [] });
  assert.deepEqual(r, { allowSend: true, code: 'first_send' });
});

test('idempotency: only failed records → retry_after_failure (allowed)', () => {
  const r = evaluateReviewInvitationIdempotency({
    existingInvitations: [FAILED_RECORD, FAILED_RECORD],
  });
  assert.deepEqual(r, { allowSend: true, code: 'retry_after_failure' });
});

test('idempotency: sent record exists, no override → already_sent (blocked)', () => {
  const r = evaluateReviewInvitationIdempotency({ existingInvitations: [SENT_RECORD] });
  assert.equal(r.allowSend, false);
  assert.equal(r.code, 'already_sent');
  assert.match(r.reasonZh, /已寄出/);
});

test('idempotency: sent record + allowResend=true but no reason → resend_blocked_no_reason', () => {
  const r = evaluateReviewInvitationIdempotency({
    existingInvitations: [SENT_RECORD],
    allowResend: true,
    resendReason: '',
  });
  assert.equal(r.allowSend, false);
  assert.equal(r.code, 'resend_blocked_no_reason');
  assert.match(r.reasonZh, /理由/);
});

test('idempotency: sent record + allowResend=true + non-empty reason → resend_with_override (allowed)', () => {
  const r = evaluateReviewInvitationIdempotency({
    existingInvitations: [SENT_RECORD, FAILED_RECORD],
    allowResend: true,
    resendReason: '旅客回報沒收到信，營運手動重送',
  });
  assert.deepEqual(r, { allowSend: true, code: 'resend_with_override' });
});

test('idempotency: existingInvitations null/non-array safely treated as empty', () => {
  assert.deepEqual(
    evaluateReviewInvitationIdempotency({ existingInvitations: null }),
    { allowSend: true, code: 'first_send' },
  );
  assert.deepEqual(
    evaluateReviewInvitationIdempotency({}),
    { allowSend: true, code: 'first_send' },
  );
});

test('idempotency: failed records mixed with one sent → still blocked (sent wins)', () => {
  const r = evaluateReviewInvitationIdempotency({
    existingInvitations: [FAILED_RECORD, SENT_RECORD, FAILED_RECORD],
  });
  assert.equal(r.code, 'already_sent');
});

// ---------- migration source contract ----------

test('Migration source: review_invitations table is defined and FK orders(id) ON DELETE CASCADE', () => {
  const sql = readFileSync(MIGRATION_PATH, 'utf8');
  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.review_invitations/);
  assert.match(sql, /REFERENCES public\.orders\(id\) ON DELETE CASCADE/);
});

test('Migration source: status enum is sent | failed | suppressed', () => {
  const sql = readFileSync(MIGRATION_PATH, 'utf8');
  assert.match(sql, /status\s+text[^;]*CHECK \(status IN \('sent', 'failed', 'suppressed'\)\)/);
});

test('Migration source: partial unique index enforces one sent row per (order, kind, channel)', () => {
  const sql = readFileSync(MIGRATION_PATH, 'utf8');
  assert.match(
    sql,
    /UNIQUE INDEX IF NOT EXISTS review_invitations_sent_unique[\s\S]+WHERE status = 'sent'/,
    'partial unique index on status=sent is the idempotency guard',
  );
});

test('Migration source: row-level security enabled and service-role-only policy + REVOKE anon/authenticated', () => {
  const sql = readFileSync(MIGRATION_PATH, 'utf8');
  assert.match(sql, /ENABLE ROW LEVEL SECURITY/);
  assert.match(sql, /CREATE POLICY[\s\S]+auth\.role\(\) = 'service_role'/);
  assert.match(sql, /REVOKE ALL ON public\.review_invitations FROM anon, authenticated/);
  assert.match(sql, /GRANT ALL ON public\.review_invitations TO service_role/);
});

test('Migration source: no plaintext PII columns (admin email body, traveler email) are declared', () => {
  const sql = readFileSync(MIGRATION_PATH, 'utf8');
  assert.doesNotMatch(sql, /admin_email\s+text/);
  assert.doesNotMatch(sql, /traveler_email\s+text/);
  assert.doesNotMatch(sql, /\bemail_body\s+text/);
});
