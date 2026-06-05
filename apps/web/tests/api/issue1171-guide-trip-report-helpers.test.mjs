// Issue #1171 — backend slice (helpers + migration source contract).
//
// These tests pin the authz and idempotency contracts that a future
// POST /api/v2/guide/trip-reports endpoint and any future admin
// revise flow will share. The migration source-contract section locks
// the table shape and RLS posture so a stale schema gets caught at
// code-review time (cf. #1115 lesson where the SELECT silently
// dropped a column the helper depended on).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  evaluateGuideTripReportSubmissionAuthz,
  evaluateGuideTripReportIdempotency,
} from '../../src/lib/post-trip/guide-trip-report.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..', '..', '..');

const MIGRATION_PATH = join(
  REPO_ROOT,
  'supabase/migrations/20260604_issue1171_guide_trip_reports.sql',
);

const NOW = '2026-06-04T12:00:00Z';
const ENDED_1H_AGO = '2026-06-04T11:00:00Z';
const ENDS_IN_2H = '2026-06-04T14:00:00Z';
const GUIDE_A = 'guide-a-uuid';
const GUIDE_B = 'guide-b-uuid';

// ---------- authz ----------

test('authz: requesting guide owns booking, status confirmed, schedule ended → can submit', () => {
  const r = evaluateGuideTripReportSubmissionAuthz({
    requestingGuideId: GUIDE_A,
    bookingGuideId: GUIDE_A,
    bookingStatus: 'confirmed',
    scheduleEndAt: ENDED_1H_AGO,
    now: NOW,
  });
  assert.deepEqual(r, { canSubmit: true });
});

test('authz: completed booking → can submit', () => {
  const r = evaluateGuideTripReportSubmissionAuthz({
    requestingGuideId: GUIDE_A,
    bookingGuideId: GUIDE_A,
    bookingStatus: 'completed',
    scheduleEndAt: ENDED_1H_AGO,
    now: NOW,
  });
  assert.equal(r.canSubmit, true);
});

test('authz: no_show booking → can still submit (guide reports the no-show)', () => {
  const r = evaluateGuideTripReportSubmissionAuthz({
    requestingGuideId: GUIDE_A,
    bookingGuideId: GUIDE_A,
    bookingStatus: 'no_show',
    scheduleEndAt: ENDED_1H_AGO,
    now: NOW,
  });
  assert.equal(r.canSubmit, true);
});

test('authz: requesting guide != booking guide → NOT_OWNING_GUIDE', () => {
  const r = evaluateGuideTripReportSubmissionAuthz({
    requestingGuideId: GUIDE_B,
    bookingGuideId: GUIDE_A,
    bookingStatus: 'confirmed',
    scheduleEndAt: ENDED_1H_AGO,
    now: NOW,
  });
  assert.equal(r.canSubmit, false);
  assert.equal(r.reason, 'NOT_OWNING_GUIDE');
});

test('authz: bookingStatus cancelled → BOOKING_CANCELLED', () => {
  const r = evaluateGuideTripReportSubmissionAuthz({
    requestingGuideId: GUIDE_A,
    bookingGuideId: GUIDE_A,
    bookingStatus: 'cancelled',
    scheduleEndAt: ENDED_1H_AGO,
    now: NOW,
  });
  assert.equal(r.reason, 'BOOKING_CANCELLED');
});

test('authz: bookingStatus cancelled_by_guide → BOOKING_CANCELLED', () => {
  const r = evaluateGuideTripReportSubmissionAuthz({
    requestingGuideId: GUIDE_A,
    bookingGuideId: GUIDE_A,
    bookingStatus: 'cancelled_by_guide',
    scheduleEndAt: ENDED_1H_AGO,
    now: NOW,
  });
  assert.equal(r.reason, 'BOOKING_CANCELLED');
});

test('authz: isRefunded=true outranks completed booking → BOOKING_REFUNDED', () => {
  const r = evaluateGuideTripReportSubmissionAuthz({
    requestingGuideId: GUIDE_A,
    bookingGuideId: GUIDE_A,
    bookingStatus: 'completed',
    scheduleEndAt: ENDED_1H_AGO,
    now: NOW,
    isRefunded: true,
  });
  assert.equal(r.reason, 'BOOKING_REFUNDED');
});

test('authz: schedule has not ended yet → BOOKING_NOT_ENDED', () => {
  const r = evaluateGuideTripReportSubmissionAuthz({
    requestingGuideId: GUIDE_A,
    bookingGuideId: GUIDE_A,
    bookingStatus: 'confirmed',
    scheduleEndAt: ENDS_IN_2H,
    now: NOW,
  });
  assert.equal(r.reason, 'BOOKING_NOT_ENDED');
});

test('authz: missing requesting / booking guide → MISSING_GUIDE_ID (safe-fail)', () => {
  assert.equal(
    evaluateGuideTripReportSubmissionAuthz({
      bookingGuideId: GUIDE_A,
      bookingStatus: 'confirmed',
      scheduleEndAt: ENDED_1H_AGO,
      now: NOW,
    }).reason,
    'MISSING_GUIDE_ID',
  );
  assert.equal(
    evaluateGuideTripReportSubmissionAuthz({
      requestingGuideId: GUIDE_A,
      bookingStatus: 'confirmed',
      scheduleEndAt: ENDED_1H_AGO,
      now: NOW,
    }).reason,
    'MISSING_GUIDE_ID',
  );
});

test('authz: unparseable scheduleEndAt / now → safe-fail, never canSubmit:true', () => {
  assert.equal(
    evaluateGuideTripReportSubmissionAuthz({
      requestingGuideId: GUIDE_A,
      bookingGuideId: GUIDE_A,
      bookingStatus: 'confirmed',
      scheduleEndAt: 'not-a-date',
      now: NOW,
    }).reason,
    'MISSING_SCHEDULE_END',
  );
  assert.equal(
    evaluateGuideTripReportSubmissionAuthz({
      requestingGuideId: GUIDE_A,
      bookingGuideId: GUIDE_A,
      bookingStatus: 'confirmed',
      scheduleEndAt: ENDED_1H_AGO,
      now: 'not-a-date',
    }).reason,
    'MISSING_NOW',
  );
});

// ---------- idempotency ----------

const SUBMITTED = { status: 'submitted', submitted_at: '2026-06-04T12:00:00Z' };
const REVISED = { status: 'revised', revised_at: '2026-06-04T12:30:00Z' };

test('idempotency: no existing reports → first_submit', () => {
  const r = evaluateGuideTripReportIdempotency({ existingReports: [] });
  assert.deepEqual(r, { allowSubmit: true, code: 'first_submit' });
});

test('idempotency: submitted record exists, no override → already_submitted (blocked)', () => {
  const r = evaluateGuideTripReportIdempotency({ existingReports: [SUBMITTED] });
  assert.equal(r.allowSubmit, false);
  assert.equal(r.code, 'already_submitted');
  assert.match(r.reasonZh, /已提交/);
});

test('idempotency: submitted record + allowResubmit but no reason → revise_blocked_no_reason', () => {
  const r = evaluateGuideTripReportIdempotency({
    existingReports: [SUBMITTED],
    allowResubmit: true,
    resubmitReason: '',
  });
  assert.equal(r.allowSubmit, false);
  assert.equal(r.code, 'revise_blocked_no_reason');
  assert.match(r.reasonZh, /理由/);
});

test('idempotency: submitted record + allowResubmit + non-empty reason → revise_with_reason', () => {
  const r = evaluateGuideTripReportIdempotency({
    existingReports: [SUBMITTED],
    allowResubmit: true,
    resubmitReason: '修正旅客 no-show 狀態',
  });
  assert.deepEqual(r, { allowSubmit: true, code: 'revise_with_reason' });
});

test('idempotency: only revised records (no submitted) → first_submit (legacy edge case)', () => {
  const r = evaluateGuideTripReportIdempotency({ existingReports: [REVISED] });
  assert.equal(r.code, 'first_submit');
});

test('idempotency: existingReports null / non-array → safely empty', () => {
  assert.deepEqual(
    evaluateGuideTripReportIdempotency({ existingReports: null }),
    { allowSubmit: true, code: 'first_submit' },
  );
  assert.deepEqual(
    evaluateGuideTripReportIdempotency({}),
    { allowSubmit: true, code: 'first_submit' },
  );
});

test('idempotency: mixed submitted + revised → submitted wins (blocked)', () => {
  const r = evaluateGuideTripReportIdempotency({
    existingReports: [REVISED, SUBMITTED, REVISED],
  });
  assert.equal(r.code, 'already_submitted');
});

// ---------- migration source contract ----------

test('Migration: guide_trip_reports table is declared with booking_id FK and guide_id FK', () => {
  const sql = readFileSync(MIGRATION_PATH, 'utf8');
  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.guide_trip_reports/);
  assert.match(sql, /booking_id\s+uuid\s+NOT NULL REFERENCES public\.bookings\(id\) ON DELETE CASCADE/);
  assert.match(sql, /guide_id\s+uuid\s+NOT NULL REFERENCES public\.guide_profiles\(id\) ON DELETE CASCADE/);
});

test('Migration: status enum is submitted | revised', () => {
  const sql = readFileSync(MIGRATION_PATH, 'utf8');
  assert.match(sql, /status\s+text[^;]*CHECK \(status IN \('submitted', 'revised'\)\)/);
});

test('Migration: partial unique index enforces one submitted row per booking (idempotency)', () => {
  const sql = readFileSync(MIGRATION_PATH, 'utf8');
  assert.match(
    sql,
    /UNIQUE INDEX IF NOT EXISTS guide_trip_reports_booking_submitted_unique[\s\S]+WHERE status = 'submitted'/,
  );
});

test('Migration: row-level security + service-role-only policy + REVOKE anon/authenticated', () => {
  const sql = readFileSync(MIGRATION_PATH, 'utf8');
  assert.match(sql, /ENABLE ROW LEVEL SECURITY/);
  assert.match(sql, /CREATE POLICY[\s\S]+auth\.role\(\) = 'service_role'/);
  assert.match(sql, /REVOKE ALL ON public\.guide_trip_reports FROM anon, authenticated/);
  assert.match(sql, /GRANT ALL ON public\.guide_trip_reports TO service_role/);
});

test('Migration: no plaintext PII columns (traveler email / phone / payment payload)', () => {
  const sql = readFileSync(MIGRATION_PATH, 'utf8');
  assert.doesNotMatch(sql, /traveler_email\s+text/);
  assert.doesNotMatch(sql, /traveler_phone\s+text/);
  assert.doesNotMatch(sql, /payment_payload\s+text/);
  assert.doesNotMatch(sql, /credit_card/);
});

// ---------- AC5: READ route wiring source-contract ----------
// trip-reports-due/route.ts and post-trip-summary/route.ts must no longer
// contain `submittedAt: null` literal; both must query guide_trip_reports.submitted_at.

const TRIP_REPORTS_DUE_ROUTE = join(
  __dirname,
  '../../app/api/v2/guide/trip-reports-due/route.ts',
);
const POST_TRIP_SUMMARY_ROUTE = join(
  __dirname,
  '../../app/api/v2/admin/orders/post-trip-summary/route.ts',
);

test('AC5: trip-reports-due/route.ts no longer contains submittedAt: null literal', () => {
  const src = readFileSync(TRIP_REPORTS_DUE_ROUTE, 'utf8');
  assert.doesNotMatch(src, /submittedAt:\s*null/);
});

test('AC5: trip-reports-due/route.ts queries guide_trip_reports.submitted_at', () => {
  const src = readFileSync(TRIP_REPORTS_DUE_ROUTE, 'utf8');
  assert.match(src, /guide_trip_reports/);
  assert.match(src, /submitted_at/);
});

test('AC5: post-trip-summary/route.ts no longer contains submittedAt: null literal', () => {
  const src = readFileSync(POST_TRIP_SUMMARY_ROUTE, 'utf8');
  assert.doesNotMatch(src, /submittedAt:\s*null/);
});

test('AC5: post-trip-summary/route.ts queries guide_trip_reports.submitted_at', () => {
  const src = readFileSync(POST_TRIP_SUMMARY_ROUTE, 'utf8');
  assert.match(src, /guide_trip_reports/);
  assert.match(src, /submitted_at/);
});

// ---------- AC6: status flip unit tests ----------
// Given a non-null submittedAt, tripReportStatus() returns 'submitted'
// and the order drops from the overdue list.
// Import at top level via dynamic import resolved at module parse time is not
// possible, so we import inline using async test callbacks.

import { tripReportStatus } from '../../src/lib/post-trip-eligibility.mjs';

test('AC6: tripReportStatus returns submitted when submittedAt is non-null', () => {
  // If submitted 30min after schedule end, status should be 'submitted'
  const result = tripReportStatus({
    scheduleEndAt: '2026-06-04T10:00:00Z',
    submittedAt: '2026-06-04T10:30:00Z',
    now: new Date('2026-06-04T12:00:00Z'),
  });
  assert.equal(result, 'submitted');
});

test('AC6: tripReportStatus returns overdue when submittedAt is null and 24h elapsed', () => {
  const result = tripReportStatus({
    scheduleEndAt: '2026-06-03T10:00:00Z',
    submittedAt: null,
    now: new Date('2026-06-04T12:00:00Z'),
  });
  assert.equal(result, 'overdue');
});

test('AC6: order with non-null submittedAt does not appear in overdue list (eligibility check)', () => {
  // Simulate processing an order: if status is 'submitted', it should not go into overdueTripReports
  const scheduleEndAt = '2026-06-03T10:00:00Z';
  const submittedAt = '2026-06-03T12:00:00Z';
  const now = new Date('2026-06-04T12:00:00Z');

  const reportStatus = tripReportStatus({ scheduleEndAt, submittedAt, now });
  // Should be 'submitted', not 'overdue' — so it won't be pushed to overdueTripReports
  assert.notEqual(reportStatus, 'overdue');
  assert.equal(reportStatus, 'submitted');
});
