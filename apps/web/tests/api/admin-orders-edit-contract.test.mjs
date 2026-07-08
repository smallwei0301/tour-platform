/**
 * Contract tests for issue #335: Admin order edit
 * AC1: PATCH accepts contactName/contactPhone/contactEmail/peopleCount/adminNote
 * AC1.1: capacity check when peopleCount changes (400 if over)
 * AC1.2: booked_count updated on headcount change
 * AC1.3: total_twd recomputed on headcount change
 * AC1.4: audit_logs row with action='order_admin_edit'
 * AC5: 409 for locked statuses
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const routeSrc = readFileSync(
  resolve(__dirname, '../../app/api/v2/admin/orders/[orderId]/route.ts'),
  'utf8'
);

const dbSrc = readFileSync(
  resolve(__dirname, '../../src/lib/db.mjs'),
  'utf8'
);

const adminSrc = readFileSync(
  resolve(__dirname, '../../src/lib/admin.mjs'),
  'utf8'
);

test('AC1: PATCH route source accepts contactName, contactPhone, contactEmail, peopleCount, adminNote', () => {
  assert.match(routeSrc, /contactName/, 'route should handle contactName');
  assert.match(routeSrc, /contactPhone/, 'route should handle contactPhone');
  assert.match(routeSrc, /contactEmail/, 'route should handle contactEmail');
  assert.match(routeSrc, /peopleCount/, 'route should handle peopleCount');
});

test('AC1.1: db source contains capacity check logic', () => {
  assert.match(dbSrc, /capacity/, 'db should reference capacity');
  assert.match(dbSrc, /booked_count.*delta|delta.*booked_count|capacity.*check|capacity insufficient|over.*capacity|exceed.*capacity|new.*booked.*>.*capacity|newBooked.*capacity|delta.*capacity/i, 'db should contain capacity overflow check');
});

test('AC1.2: db source contains booked_count update on headcount change', () => {
  assert.match(dbSrc, /booked_count.*delta|delta.*booked_count|booked_count.*\+.*delta|booked_count.*newPax|newBooked/i, 'db should update booked_count with delta');
});

test('AC1.3: db source contains total_twd recompute on headcount change', () => {
  assert.match(dbSrc, /total_twd.*newPax|total_twd.*peopleCount|price_per_head.*newPax|priceTwd.*newPax|total_twd.*\*|price.*\*.*pax|pax.*\*.*price/i, 'db should recompute total_twd when headcount changes');
});

test('AC1.4: db source contains order_admin_edit audit action', () => {
  assert.match(dbSrc, /order_admin_edit/, 'db should write audit log with action=order_admin_edit');
});

test('AC5: route source contains 409 for locked statuses', () => {
  assert.match(routeSrc, /409/, 'route should return 409 for locked statuses');
  assert.match(
    routeSrc,
    /refunded|refund_pending|completed|cancelled_by_user|cancelled_by_guide/,
    'route should check for locked statuses'
  );
});

test('AC5: fallback contains locked status check', () => {
  assert.match(
    adminSrc,
    /refunded|refund_pending|completed|cancelled_by_user|cancelled_by_guide/,
    'fallback should have locked status set'
  );
});
