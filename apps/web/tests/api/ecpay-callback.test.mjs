import test from 'node:test';
import assert from 'node:assert/strict';
import { createOrderDb, processPaymentCallbackDb } from '../../src/lib/db.mjs';
import { experiences, orders, auditLogs, payments } from '../../src/lib/store.mjs';
import { ecpaySimulatePaidReturnUrlPayload } from '../fixtures/ecpay-return-url-payloads.mjs';

test('ecpay callback marks order paid and occupies schedule seats', async () => {
  const order = await createOrderDb({
    experienceSlug: 'kaohsiung-chaishan-cave-experience',
    scheduleId: 'sch_chaishan_0410',
    peopleCount: 2,
    contactName: 'Wei',
    contactPhone: '0912345678',
    contactEmail: 'wei@example.com'
  });

  const exp = experiences.find((e) => e.id === order.experienceId);
  const schedule = exp.schedules.find((s) => s.id === order.scheduleId);
  const before = schedule.bookedCount;

  const beforeSuccessAudit = auditLogs.filter((log) => log.orderId === order.id && log.action === 'payment_callback_succeeded').length;

  const result = await processPaymentCallbackDb({ orderId: order.id, tradeNo: 'MOCK123' });

  assert.equal(result.order.status, 'paid');
  assert.equal(schedule.bookedCount, before + 2);

  const successLogs = auditLogs.filter((log) => log.orderId === order.id && log.action === 'payment_callback_succeeded');
  assert.equal(successLogs.length, beforeSuccessAudit + 1);
  assert.equal(successLogs.at(-1)?.metadata?.source, 'payment/ecpay_callback');
  assert.equal(successLogs.at(-1)?.metadata?.event_type, 'payment_callback_succeeded');
  assert.equal(successLogs.at(-1)?.metadata?.trade_no, 'MOCK123');
});

test('ecpay callback is idempotent for paid order', async () => {
  const order = await createOrderDb({
    experienceSlug: 'kaohsiung-chaishan-cave-experience',
    scheduleId: 'sch_chaishan_0401',
    peopleCount: 1,
    contactName: 'Wei',
    contactPhone: '0912345678',
    contactEmail: 'wei@example.com'
  });

  await processPaymentCallbackDb({ orderId: order.id, tradeNo: 'MOCK124' });

  const successCountAfterFirst = auditLogs.filter((log) => log.orderId === order.id && log.action === 'payment_callback_succeeded').length;
  const replayCountBefore = auditLogs.filter((log) => log.orderId === order.id && log.action === 'payment_callback_replay_noop').length;

  const result = await processPaymentCallbackDb({ orderId: order.id, tradeNo: 'MOCK124' });

  assert.equal(result.scheduleUpdated, false);
  assert.equal(result.order.status, 'paid');

  const successCountAfterReplay = auditLogs.filter((log) => log.orderId === order.id && log.action === 'payment_callback_succeeded').length;
  const replayLogs = auditLogs.filter((log) => log.orderId === order.id && log.action === 'payment_callback_replay_noop');

  assert.equal(successCountAfterReplay, successCountAfterFirst);
  assert.equal(replayLogs.length, replayCountBefore + 1);
  assert.equal(replayLogs.at(-1)?.metadata?.event_type, 'payment_callback_replay_noop');
  assert.equal(replayLogs.at(-1)?.metadata?.source, 'payment/ecpay_callback');
});

test('ecpay callback replay on confirmed order is noop with explicit replay audit', async () => {
  const order = await createOrderDb({
    experienceSlug: 'kaohsiung-chaishan-cave-experience',
    scheduleId: 'sch_chaishan_0410',
    peopleCount: 1,
    contactName: 'Replay Confirmed',
    contactPhone: '0912345678',
    contactEmail: 'replay-confirmed@example.com'
  });

  await processPaymentCallbackDb({ orderId: order.id, tradeNo: 'MOCK126' });

  const row = orders.find((o) => o.id === order.id);
  row.status = 'confirmed';

  const result = await processPaymentCallbackDb({ orderId: order.id, tradeNo: 'MOCK126' });

  assert.equal(result.scheduleUpdated, false);
  assert.equal(result.order.status, 'confirmed');

  const replayLogs = auditLogs.filter((log) => log.orderId === order.id && log.action === 'payment_callback_replay_noop');
  assert.ok(replayLogs.length >= 1);
  assert.equal(replayLogs.at(-1)?.metadata?.order_status, 'confirmed');
});

test('ecpay SimulatePaid=1 fixture is acknowledged without marking order paid or booking seats', async () => {
  const order = await createOrderDb({
    experienceSlug: 'kaohsiung-chaishan-cave-experience',
    scheduleId: 'sch_chaishan_0401',
    peopleCount: 1,
    contactName: 'Simulate Only',
    contactPhone: '0912345678',
    contactEmail: 'simulate@example.com'
  });

  const exp = experiences.find((e) => e.id === order.experienceId);
  const schedule = exp.schedules.find((s) => s.id === order.scheduleId);
  const bookedBefore = schedule.bookedCount;
  const paymentsBefore = payments.length;
  const successAuditsBefore = auditLogs.filter((log) => log.orderId === order.id && log.action === 'payment_callback_succeeded').length;

  const result = await processPaymentCallbackDb(ecpaySimulatePaidReturnUrlPayload({
    CustomField2: order.id,
    orderId: order.id,
    TradeNo: 'SIMULATE-ONLY-001',
  }));

  assert.equal(result.scheduleUpdated, false);
  assert.equal(result.order.status, 'pending_payment');
  assert.equal(schedule.bookedCount, bookedBefore);
  assert.equal(payments.length, paymentsBefore);

  const orderRow = orders.find((o) => o.id === order.id);
  assert.equal(orderRow.status, 'pending_payment');
  assert.equal(orderRow.paidAt, null);

  const successAuditsAfter = auditLogs.filter((log) => log.orderId === order.id && log.action === 'payment_callback_succeeded').length;
  assert.equal(successAuditsAfter, successAuditsBefore);
});

test('ecpay callback rejects owner email mismatch', async () => {
  const order = await createOrderDb({
    experienceSlug: 'kaohsiung-chaishan-cave-experience',
    scheduleId: 'sch_chaishan_0401',
    peopleCount: 1,
    contactName: 'Wei',
    contactPhone: '0912345678',
    contactEmail: 'owner@example.com'
  });

  await assert.rejects(
    () => processPaymentCallbackDb({ orderId: order.id, ownerEmail: 'attacker@example.com', tradeNo: 'MOCK125' }),
    /ownership validation failed/
  );
});

test('ecpay callback remains idempotent under replay collision (different tradeNo)', async () => {
  const order = await createOrderDb({
    experienceSlug: 'kaohsiung-chaishan-cave-experience',
    scheduleId: 'sch_chaishan_0410',
    peopleCount: 1,
    contactName: 'Replay',
    contactPhone: '0912345678',
    contactEmail: 'replay@example.com'
  });

  const exp = experiences.find((e) => e.id === order.experienceId);
  const schedule = exp.schedules.find((s) => s.id === order.scheduleId);
  const before = schedule.bookedCount;

  const [first, second] = await Promise.all([
    processPaymentCallbackDb({ orderId: order.id, tradeNo: 'RACE-A' }),
    processPaymentCallbackDb({ orderId: order.id, tradeNo: 'RACE-B' }),
  ]);

  assert.equal(first.order.status, 'paid');
  assert.equal(second.order.status, 'paid');
  assert.equal(schedule.bookedCount, before + 1);
  assert.ok(first.scheduleUpdated || second.scheduleUpdated);
  assert.ok(!first.scheduleUpdated || !second.scheduleUpdated);
});

test('ecpay callback rejects illegal one-way transition from cancelled', async () => {
  const order = await createOrderDb({
    experienceSlug: 'kaohsiung-chaishan-cave-experience',
    scheduleId: 'sch_chaishan_0410',
    peopleCount: 1,
    contactName: 'Cancel',
    contactPhone: '0912345678',
    contactEmail: 'cancel@example.com'
  });

  const row = orders.find((o) => o.id === order.id);
  row.status = 'cancelled_by_user';

  await assert.rejects(
    () => processPaymentCallbackDb({ orderId: order.id, tradeNo: 'MOCK-CANCEL' }),
    /illegal order status transition/
  );
});

