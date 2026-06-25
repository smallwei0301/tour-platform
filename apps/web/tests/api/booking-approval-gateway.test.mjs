// 三種預約模式 — decideBookingApprovalDb 契約測試。
// in-memory 分支：透過 db.mjs gateway 直接實測（含 seed seam）。
// Supabase 分支：source-contract 鎖定欄位更新、booking_status_log、order 連動取消。

import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

// 強制 in-memory path
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

import {
  decideBookingApprovalDb,
  listGuidePendingApprovalsDb,
  __seedV2BookingForTest,
  __resetV2BookingStoreForTest,
} from '../../src/lib/db.mjs';

const dbSrc = readFileSync(path.resolve('src/lib/db.mjs'), 'utf8');

beforeEach(() => __resetV2BookingStoreForTest());

test('in-memory approve: pending request → approved, booking stays draft', async () => {
  __seedV2BookingForTest({ id: 'bk1', guide_id: 'g1', booking_type: 'request', status: 'draft', guide_approval_status: 'pending', order_id: 'o1' });
  const result = await decideBookingApprovalDb({ bookingId: 'bk1', guideId: 'g1', action: 'approve' });
  assert.equal(result.status, 'draft');
  assert.equal(result.guideApprovalStatus, 'approved');
  assert.equal(result.orderId, 'o1');
});

test('in-memory reject: pending request → rejected + booking cancelled', async () => {
  __seedV2BookingForTest({ id: 'bk2', guide_id: 'g1', booking_type: 'request', status: 'draft', guide_approval_status: 'pending', order_id: 'o2' });
  const result = await decideBookingApprovalDb({ bookingId: 'bk2', guideId: 'g1', action: 'reject', note: '當天額滿' });
  assert.equal(result.status, 'cancelled');
  assert.equal(result.guideApprovalStatus, 'rejected');
});

test('in-memory ownership: other guide cannot decide (BOOKING_NOT_FOUND)', async () => {
  __seedV2BookingForTest({ id: 'bk3', guide_id: 'g1', booking_type: 'request', status: 'draft', guide_approval_status: 'pending' });
  await assert.rejects(
    () => decideBookingApprovalDb({ bookingId: 'bk3', guideId: 'someone-else', action: 'approve' }),
    /BOOKING_NOT_FOUND/,
  );
});

test('in-memory double decision rejected (NOT_PENDING_APPROVAL)', async () => {
  __seedV2BookingForTest({ id: 'bk4', guide_id: 'g1', booking_type: 'request', status: 'draft', guide_approval_status: 'approved' });
  await assert.rejects(
    () => decideBookingApprovalDb({ bookingId: 'bk4', guideId: 'g1', action: 'approve' }),
    /NOT_PENDING_APPROVAL/,
  );
});

test('in-memory non-request plan not approvable (NOT_APPROVABLE)', async () => {
  __seedV2BookingForTest({ id: 'bk5', guide_id: 'g1', booking_type: 'instant', status: 'draft', guide_approval_status: 'not_required' });
  await assert.rejects(
    () => decideBookingApprovalDb({ bookingId: 'bk5', guideId: 'g1', action: 'approve' }),
    /NOT_APPROVABLE/,
  );
});

test('in-memory pending-approval list only shows pending+draft for the guide', async () => {
  __seedV2BookingForTest({ id: 'p1', guide_id: 'g1', booking_type: 'request', status: 'draft', guide_approval_status: 'pending' });
  __seedV2BookingForTest({ id: 'p2', guide_id: 'g1', booking_type: 'request', status: 'draft', guide_approval_status: 'approved' });
  __seedV2BookingForTest({ id: 'p3', guide_id: 'g2', booking_type: 'request', status: 'draft', guide_approval_status: 'pending' });
  const list = await listGuidePendingApprovalsDb({ guideId: 'g1' });
  assert.deepEqual(list.map((r) => r.bookingId), ['p1']);
});

// ── Supabase 分支：source-contract ───────────────────────────────────────────

test('Supabase branch updates guide_approval_status + writes booking_status_log', () => {
  const fnStart = dbSrc.indexOf('export async function decideBookingApprovalDb');
  const fnSrc = dbSrc.slice(fnStart, fnStart + 4000);
  assert.match(fnSrc, /guide_approval_status:\s*decision\.nextGuideApprovalStatus/);
  assert.match(fnSrc, /guide_approval_decided_at:/);
  assert.match(fnSrc, /\.eq\('guide_approval_status', 'pending'\)/, 'optimistic guard on pending');
  assert.match(fnSrc, /from\('booking_status_logs'\)/);
  assert.match(fnSrc, /actor_role:\s*'guide'/);
});

test('Supabase branch reject cascades order cancel (cancelled_by_guide, pending_payment only)', () => {
  const fnStart = dbSrc.indexOf('export async function decideBookingApprovalDb');
  const fnSrc = dbSrc.slice(fnStart, fnStart + 4000);
  assert.match(fnSrc, /status:\s*'cancelled_by_guide'/);
  assert.match(fnSrc, /\.eq\('status', 'pending_payment'\)/);
});

test('Supabase branch decides via shared decideApproval pure fn', () => {
  const fnStart = dbSrc.indexOf('export async function decideBookingApprovalDb');
  const fnSrc = dbSrc.slice(fnStart, fnStart + 4000);
  assert.match(fnSrc, /decideApproval\(/);
});
