import test from 'node:test';
import assert from 'node:assert/strict';

import { buildAdminPostTripSummary } from '../../src/lib/admin-post-trip-summary.mjs';

test('GH-1254 helper: split-query report rows still categorize overdue/review/payout-hold correctly', () => {
  const now = new Date('2026-06-05T12:00:00.000Z');
  const summary = buildAdminPostTripSummary({
    now,
    orders: [
      {
        id: 'order-overdue',
        status: 'paid',
        booking_id: 'booking-overdue',
        activity_schedules: { end_at: '2026-06-03T08:00:00.000Z' },
        operations_tracking: null,
      },
      {
        id: 'order-review',
        status: 'completed',
        booking_id: 'booking-submitted',
        activity_schedules: { end_at: '2026-06-04T09:00:00.000Z' },
        operations_tracking: { refund_amount_twd: 0, has_complaint: false, has_oversell_issue: false },
      },
      {
        id: 'order-hold',
        status: 'confirmed',
        booking_id: 'booking-hold',
        activity_schedules: { end_at: '2026-06-04T08:00:00.000Z' },
        operations_tracking: { refund_amount_twd: 200, has_complaint: false, has_oversell_issue: false },
      },
      {
        id: 'order-future',
        status: 'paid',
        booking_id: 'booking-future',
        activity_schedules: { end_at: '2026-06-06T08:00:00.000Z' },
        operations_tracking: null,
      },
    ],
    guideTripReports: [
      { booking_id: 'booking-submitted', submitted_at: '2026-06-04T11:00:00.000Z' },
    ],
  });

  assert.deepEqual(summary.overdueTripReports, [
    { orderId: 'order-overdue', scheduleEndAt: '2026-06-03T08:00:00.000Z' },
    { orderId: 'order-hold', scheduleEndAt: '2026-06-04T08:00:00.000Z' },
  ]);
  assert.deepEqual(summary.readyForReviewInvitation, [
    { orderId: 'order-overdue', scheduleEndAt: '2026-06-03T08:00:00.000Z' },
    { orderId: 'order-review', scheduleEndAt: '2026-06-04T09:00:00.000Z' },
  ]);
  assert.deepEqual(summary.payoutOnHold, [
    { orderId: 'order-hold', holdReason: 'refund_pending' },
  ]);
  assert.deepEqual(summary.adminFollowupNeeded, [
    { orderId: 'order-overdue', category: 'guide_report_risk' },
    { orderId: 'order-hold', category: 'guide_report_risk' },
  ]);
  assert.equal(summary.orderCount, 4);
});

test('GH-1254 helper: category filter only narrows followup rows', () => {
  const now = new Date('2026-06-05T12:00:00.000Z');
  const summary = buildAdminPostTripSummary({
    now,
    categoryFilter: 'refund_dispute_safety',
    orders: [
      {
        id: 'order-complaint',
        status: 'completed',
        booking_id: 'booking-complaint',
        activity_schedules: { end_at: '2026-06-03T08:00:00.000Z' },
        operations_tracking: { refund_amount_twd: 0, has_complaint: true, has_oversell_issue: false },
      },
      {
        id: 'order-overdue',
        status: 'paid',
        booking_id: 'booking-overdue',
        activity_schedules: { end_at: '2026-06-03T08:00:00.000Z' },
        operations_tracking: null,
      },
    ],
    guideTripReports: [],
  });

  assert.deepEqual(summary.adminFollowupNeeded, [
    { orderId: 'order-complaint', category: 'refund_dispute_safety' },
  ]);
  assert.deepEqual(summary.overdueTripReports, [
    { orderId: 'order-complaint', scheduleEndAt: '2026-06-03T08:00:00.000Z' },
    { orderId: 'order-overdue', scheduleEndAt: '2026-06-03T08:00:00.000Z' },
  ]);
});
