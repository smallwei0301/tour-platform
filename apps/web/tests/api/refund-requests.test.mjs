import test from 'node:test';
import assert from 'node:assert/strict';
import { createOrderDb, createRefundRequestDb, getMyOrderDetailDb, listRefundRequestsDb } from '../../src/lib/db.mjs';

test('create refund request updates order status to refund_pending', async () => {
  const order = await createOrderDb({
    experienceSlug: 'kaohsiung-chaishan-cave-experience',
    scheduleId: 'sch_chaishan_0410',
    peopleCount: 1,
    contactName: 'Wei',
    contactPhone: '0912345678',
    contactEmail: 'wei@example.com'
  });

  const refund = await createRefundRequestDb({ orderId: order.id, reason: 'user_request' });
  assert.equal(refund.status, 'requested');

  const detail = await getMyOrderDetailDb({ orderId: order.id });
  assert.equal(detail.status, 'refund_pending');

  const list = await listRefundRequestsDb({ orderId: order.id });
  assert.ok(list.length >= 1);
});

test('duplicate refund request is blocked', async () => {
  const order = await createOrderDb({
    experienceSlug: 'dadadaocheng-walk',
    scheduleId: 'sch_dadaocheng_0402',
    peopleCount: 1,
    contactName: 'Amy',
    contactPhone: '0911222333',
    contactEmail: 'amy@example.com'
  });

  await createRefundRequestDb({ orderId: order.id, reason: 'user_request' });
  await assert.rejects(() => createRefundRequestDb({ orderId: order.id, reason: 'user_request' }), /refund already requested/);
});
