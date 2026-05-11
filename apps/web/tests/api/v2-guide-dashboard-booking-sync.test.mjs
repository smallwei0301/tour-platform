/**
 * P7: Guide dashboard booking sync — contract test
 * Pattern: readFileSync + regex match on source files (no live server).
 * Verifies that the guide dashboard and guide bookings routes exist and
 * contain the booking-sync logic required for Phase 12 observability.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();

const DASHBOARD_ROUTE = path.join(
  ROOT,
  'app/api/guide/dashboard/route.ts'
);

const BOOKINGS_ROUTE = path.join(
  ROOT,
  'app/api/guide/bookings/route.ts'
);

const BOOKING_DETAIL_ROUTE = path.join(
  ROOT,
  'app/api/guide/bookings/[bookingId]/route.ts'
);

test('guide dashboard route exists', () => {
  assert.ok(existsSync(DASHBOARD_ROUTE), `Expected ${DASHBOARD_ROUTE} to exist`);
});

test('guide bookings route exists', () => {
  assert.ok(existsSync(BOOKINGS_ROUTE), `Expected ${BOOKINGS_ROUTE} to exist`);
});

test('guide booking detail route exists', () => {
  assert.ok(existsSync(BOOKING_DETAIL_ROUTE), `Expected ${BOOKING_DETAIL_ROUTE} to exist`);
});

test('guide dashboard route uses guide session auth', () => {
  const src = readFileSync(DASHBOARD_ROUTE, 'utf8');
  assert.match(src, /verifyGuideSession/, 'verifyGuideSession not found — auth missing');
});

test('guide dashboard route fetches bookings via orders table', () => {
  const src = readFileSync(DASHBOARD_ROUTE, 'utf8');
  assert.match(src, /from\('orders'\)/, "orders table query not found in dashboard route");
});

test('guide dashboard route syncs via activity_id to guide', () => {
  const src = readFileSync(DASHBOARD_ROUTE, 'utf8');
  assert.match(src, /guide_id/, 'guide_id reference not found — booking→guide sync logic missing');
  assert.match(src, /activityIds/, 'activityIds not found — guide-scoped booking filter missing');
});

test('guide dashboard route returns monthlyBookings, pendingBookings, upcomingSchedules', () => {
  const src = readFileSync(DASHBOARD_ROUTE, 'utf8');
  assert.match(src, /monthlyBookings/, 'monthlyBookings field missing from response');
  assert.match(src, /pendingBookings/, 'pendingBookings field missing from response');
  assert.match(src, /upcomingSchedules/, 'upcomingSchedules field missing from response');
});

test('guide bookings route filters by guide ownership via activity_id', () => {
  const src = readFileSync(BOOKINGS_ROUTE, 'utf8');
  assert.match(src, /\.in\('activity_id'/, 'activity_id filter not found — guide scoping missing');
  assert.match(src, /guide_id/, 'guide_id reference missing from bookings route');
});

test('guide bookings route supports optional scheduleId filter (booking sync gate)', () => {
  const src = readFileSync(BOOKINGS_ROUTE, 'utf8');
  assert.match(src, /scheduleId/, 'scheduleId filter not found — schedule-level booking sync gate missing');
});

test('guide bookings route returns sync fields: status, paymentStatus, scheduleDate', () => {
  const src = readFileSync(BOOKINGS_ROUTE, 'utf8');
  assert.match(src, /status/, 'status field missing from bookings route');
  assert.match(src, /paymentStatus/, 'paymentStatus field missing from bookings route');
  assert.match(src, /scheduleDate/, 'scheduleDate field missing from bookings route');
});

test('guide booking detail route enforces guide ownership verification', () => {
  const src = readFileSync(BOOKING_DETAIL_ROUTE, 'utf8');
  assert.match(src, /guide_id.*session\.guideId|session\.guideId.*guide_id/s,
    'guide ownership check not found in booking detail route');
});

test('guide booking detail route returns schedule sync data', () => {
  const src = readFileSync(BOOKING_DETAIL_ROUTE, 'utf8');
  assert.match(src, /activity_schedules/, 'activity_schedules join missing — schedule sync data absent');
  assert.match(src, /bookedCount/, 'bookedCount field missing — capacity sync incomplete');
});
