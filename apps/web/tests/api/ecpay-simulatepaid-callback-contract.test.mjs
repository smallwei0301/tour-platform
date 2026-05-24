import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createOrderDb, processPaymentCallbackDb } from '../../src/lib/db.mjs';
import { experiences, orders, payments, auditLogs } from '../../src/lib/store.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROUTE = path.resolve(__dirname, '../../app/api/payments/ecpay/callback/route.ts');

test('ecpay SimulatePaid=1 fixture is a no-op: no paid status, no seat booking, no payment row', async () => {
  const order = await createOrderDb({
    experienceSlug: 'kaohsiung-chaishan-cave-experience',
    scheduleId: 'sch_chaishan_0410',
    peopleCount: 2,
    contactName: 'Simulate Paid',
    contactPhone: '0912345678',
    contactEmail: 'simulate-paid@example.com'
  });

  const exp = experiences.find((e) => e.id === order.experienceId);
  const schedule = exp.schedules.find((s) => s.id === order.scheduleId);
  const beforeBookedCount = schedule.bookedCount;
  const beforePaymentsCount = payments.length;

  const fixture = {
    MerchantID: '3002607',
    MerchantTradeNo: 'SIMULATEPAID001',
    TradeNo: '2605131234567890',
    RtnCode: '1',
    RtnMsg: 'Succeeded',
    SimulatePaid: '1',
    CustomField2: order.id,
    CustomField4: order.contactEmail,
    orderId: order.id,
    tradeNo: '2605131234567890'
  };

  const result = await processPaymentCallbackDb(fixture);

  assert.equal(result.simulated, true);
  assert.equal(result.scheduleUpdated, false);
  assert.equal(result.order.status, 'pending_payment');
  assert.equal(schedule.bookedCount, beforeBookedCount);
  assert.equal(payments.length, beforePaymentsCount);

  const row = orders.find((o) => o.id === order.id);
  assert.equal(row.status, 'pending_payment');
  assert.equal(row.paidAt, null);

  const simulateLogs = auditLogs.filter((log) => log.orderId === order.id && log.action === 'payment_callback_simulate_paid_noop');
  assert.equal(simulateLogs.length, 1);
  assert.equal(simulateLogs.at(-1)?.metadata?.event_type, 'payment_callback_simulate_paid_noop');
  assert.equal(simulateLogs.at(-1)?.metadata?.trade_no, '2605131234567890');
});

test('ecpay callback route contract: simulated callbacks return before success side effects', async () => {
  const src = await fs.readFile(ROUTE, 'utf8');

  assert.match(src, /if \(result\.simulated\) \{/);
  assert.match(src, /payment_callback_simulate_paid_noop/);

  const simulateGuard = src.indexOf('if (result.simulated) {');
  const successEvent = src.indexOf("event_name: 'payment_succeeded'");
  const customerEmail = src.indexOf('void sendPaymentSuccess');
  const adminEmail = src.indexOf('void sendAdminPaymentNotification');

  assert.ok(simulateGuard > -1, 'missing simulated callback guard');
  assert.ok(successEvent > -1, 'missing payment_succeeded event block');
  assert.ok(simulateGuard < successEvent, 'simulated callback guard must run before payment_succeeded tracking');
  assert.ok(simulateGuard < customerEmail, 'simulated callback guard must run before customer success email');
  assert.ok(simulateGuard < adminEmail, 'simulated callback guard must run before admin success notification');
});
