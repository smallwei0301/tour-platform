/**
 * Issue #1174 — Send-review-invitation route: idempotency guard + delivery log
 *
 * Source-contract tests (readFileSync + regex) locking down four wiring ACs:
 *
 *  AC1 — After successful send: insert status:'sent' row with order_id,
 *         initiated_by:'admin_manual', sent_at into review_invitations.
 *
 *  AC2 — evaluateReviewInvitationIdempotency is called BEFORE
 *         sendReviewInvitation; when blocked → 409/422 without sending.
 *
 *  AC3 — On failed send: insert status:'failed' row with failed_at and
 *         failure_reason; no raw payload/PII in failure_reason.
 *
 *  AC4 — Service-role client (SUPABASE_SERVICE_ROLE_KEY) used for all
 *         review_invitations reads/writes (not the anon server.ts client).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROUTE_PATH = join(
  __dirname,
  '../../app/api/v2/admin/orders/[orderId]/send-review-invitation/route.ts'
);

const src = readFileSync(ROUTE_PATH, 'utf8');

// ── AC2 — Idempotency guard called BEFORE sendReviewInvitation ─────────────

test('AC2a: route imports evaluateReviewInvitationIdempotency', () => {
  assert.match(
    src,
    /evaluateReviewInvitationIdempotency/,
    'route must import and call evaluateReviewInvitationIdempotency'
  );
});

test('AC2b: idempotency check is called before sendReviewInvitation', () => {
  const idempotencyIdx = src.indexOf('evaluateReviewInvitationIdempotency(');
  const sendIdx = src.indexOf('sendReviewInvitation(');
  assert.ok(idempotencyIdx >= 0, 'expected evaluateReviewInvitationIdempotency call');
  assert.ok(sendIdx >= 0, 'expected sendReviewInvitation call');
  assert.ok(
    idempotencyIdx < sendIdx,
    'evaluateReviewInvitationIdempotency must be called before sendReviewInvitation'
  );
});

test('AC2c: route fetches existing review_invitations rows before the idempotency call', () => {
  const fetchIdx = src.indexOf(".from('review_invitations')");
  const idempotencyIdx = src.indexOf('evaluateReviewInvitationIdempotency(');
  assert.ok(fetchIdx >= 0, "expected .from('review_invitations') fetch");
  assert.ok(idempotencyIdx >= 0, 'expected evaluateReviewInvitationIdempotency call');
  assert.ok(
    fetchIdx < idempotencyIdx,
    "review_invitations fetch must precede the evaluateReviewInvitationIdempotency call"
  );
});

test('AC2d: when idempotency blocks, route returns 409 or 422 with already_sent code', () => {
  assert.match(
    src,
    /already_sent/,
    "route must return 'already_sent' error code when idempotency blocks"
  );
  // Must use 409 or 422 status for the blocked response
  assert.match(
    src,
    /status:\s*(?:409|422)/,
    'blocked idempotency response must use status 409 or 422'
  );
});

// ── AC1 — Delivery log: 'sent' row after successful send ──────────────────

test('AC1a: route inserts into review_invitations after sendReviewInvitation', () => {
  const insertIdx = src.indexOf(".from('review_invitations').insert(");
  const sendIdx = src.indexOf('sendReviewInvitation(');
  assert.ok(insertIdx >= 0, "expected .from('review_invitations').insert(");
  assert.ok(sendIdx >= 0, 'expected sendReviewInvitation call');
  assert.ok(
    sendIdx < insertIdx,
    "sendReviewInvitation must be called before the review_invitations insert"
  );
});

test('AC1b: sent row contains status sent', () => {
  assert.match(
    src,
    /status\s*:\s*['"]sent['"]/,
    "insert must include status: 'sent'"
  );
});

test('AC1c: sent row contains initiated_by admin_manual', () => {
  assert.match(
    src,
    /initiated_by\s*:\s*['"]admin_manual['"]/,
    "insert must include initiated_by: 'admin_manual'"
  );
});

test('AC1d: sent row contains sent_at field', () => {
  assert.match(
    src,
    /sent_at\s*:/,
    "insert must include a sent_at field"
  );
});

test('AC1e: sent row contains order_id field', () => {
  // order_id must appear inside the insert object (after the first insert call)
  const insertIdx = src.indexOf(".from('review_invitations').insert(");
  const afterInsert = src.slice(insertIdx);
  assert.match(
    afterInsert,
    /order_id\s*:/,
    "insert must include order_id field"
  );
});

// ── AC3 — Failure row on failed send ──────────────────────────────────────

test('AC3a: route inserts status failed row when send fails', () => {
  assert.match(
    src,
    /status\s*:\s*['"]failed['"]/,
    "route must insert a status: 'failed' row when send fails"
  );
});

test('AC3b: failure row contains failed_at field', () => {
  assert.match(
    src,
    /failed_at\s*:/,
    "failure row must include failed_at field"
  );
});

test('AC3c: failure row contains failure_reason field', () => {
  assert.match(
    src,
    /failure_reason\s*:/,
    "failure row must include failure_reason field"
  );
});

test('AC3d: failure_reason does not expose raw email payload or contactEmail', () => {
  // Route must NOT pass contactEmail or the full result object as failure_reason.
  // It should use a masked/safe string — check it is not verbatim contactEmail.
  const failureReasonMatch = src.match(/failure_reason\s*:\s*([^\n,}]+)/);
  if (failureReasonMatch) {
    const value = failureReasonMatch[1].trim();
    assert.ok(
      !value.includes('contactEmail') && !value.includes('result.errorMessage'),
      `failure_reason must not expose raw PII like contactEmail; found: ${value}`
    );
  }
});

// ── AC4 — Service-role client for review_invitations operations ───────────

test('AC4a: route uses SUPABASE_SERVICE_ROLE_KEY env var', () => {
  assert.match(
    src,
    /SUPABASE_SERVICE_ROLE_KEY/,
    'route must reference SUPABASE_SERVICE_ROLE_KEY for the service-role client'
  );
});

test('AC4b: SUPABASE_SERVICE_ROLE_KEY appears before from(review_invitations)', () => {
  const keyIdx = src.indexOf('SUPABASE_SERVICE_ROLE_KEY');
  const fromIdx = src.indexOf(".from('review_invitations')");
  assert.ok(keyIdx >= 0, 'expected SUPABASE_SERVICE_ROLE_KEY in source');
  assert.ok(fromIdx >= 0, "expected .from('review_invitations') in source");
  assert.ok(
    keyIdx < fromIdx,
    'SUPABASE_SERVICE_ROLE_KEY must be set up before any from(review_invitations) call'
  );
});

test('AC4c: route imports createClient from @supabase/supabase-js (not only server.ts)', () => {
  assert.match(
    src,
    /@supabase\/supabase-js/,
    'route must import createClient from @supabase/supabase-js for the service-role client'
  );
});
