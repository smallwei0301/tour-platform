import test from 'node:test';
import assert from 'node:assert/strict';
import { createOrderDb, processPaymentCallbackDb } from '../../src/lib/db.mjs';
import { experiences } from '../../src/lib/store.mjs';

test('createOrderDb reserves schedule seats immediately and callback does not double-book', async () => {
  const exp = experiences.find((e) => e.id === 'exp_chaishan_001');
  const schedule = exp.schedules.find((s) => s.id === 'sch_chaishan_0410');
  const before = schedule.bookedCount;

  const order = await createOrderDb({
    experienceSlug: 'kaohsiung-chaishan-cave-experience',
    scheduleId: 'sch_chaishan_0410',
    peopleCount: 2,
    contactName: 'Wei',
    contactPhone: '0912345678',
    contactEmail: 'wei@example.com'
  });

  assert.equal(schedule.bookedCount, before + 2);

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
