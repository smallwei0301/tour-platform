import test from 'node:test';
import assert from 'node:assert/strict';
import { createOrderDb, processPaymentCallbackDb } from '../../src/lib/db.mjs';
import { experiences, orders } from '../../src/lib/store.mjs';

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

  const result = await processPaymentCallbackDb({ orderId: order.id, tradeNo: 'MOCK123' });

  assert.equal(result.order.status, 'paid');
  assert.equal(schedule.bookedCount, before + 2);
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
  const result = await processPaymentCallbackDb({ orderId: order.id, tradeNo: 'MOCK124' });

  assert.equal(result.scheduleUpdated, false);
  assert.equal(result.order.status, 'paid');
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

