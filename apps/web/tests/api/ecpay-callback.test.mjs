import test from 'node:test';
import assert from 'node:assert/strict';
import { createOrderDb, processPaymentCallbackDb } from '../../src/lib/db.mjs';
import { experiences } from '../../src/lib/store.mjs';

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

