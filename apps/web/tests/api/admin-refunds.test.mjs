import test from 'node:test';
import assert from 'node:assert/strict';
import { createOrderDb, createRefundRequestDb, listAdminRefundRequestsDb, updateAdminRefundStatusDb, getMyOrderDetailDb, createAdminPosRefundEntryDb, updateAdminOrderDb } from '../../src/lib/db.mjs';
import { paymentEvents } from '../../src/lib/store.mjs';

test('admin refund list returns rows', async () => {
  const order = await createOrderDb({
    experienceSlug: 'kaohsiung-chaishan-cave-experience',
    scheduleId: 'sch_chaishan_0410',
    peopleCount: 1,
    contactName: 'Admin Demo',
    contactPhone: '0900000000',
    contactEmail: 'admin-demo@example.com'
  });
  const ref = await createRefundRequestDb({ orderId: order.id, requestId: 'req-admin-refund-list-1', reason: 'user_request' });

  const rows = await listAdminRefundRequestsDb();
  assert.ok(rows.some((r) => r.id === ref.id));
});

test('admin POS refund entry is rerunnable and traceable', async () => {
  const order = await createOrderDb({
    experienceSlug: 'dadadaocheng-walk',
    scheduleId: 'sch_dadaocheng_0402',
    peopleCount: 1,
    contactName: 'POS Refund',
    contactPhone: '0900000009',
    contactEmail: 'pos-refund@example.com'
  });

  await updateAdminOrderDb({ orderId: order.id, status: 'paid', actor: 'admin', sourceChannel: 'admin_pos' });

  const first = await createAdminPosRefundEntryDb({
    orderId: order.id,
    requestId: 'req-admin-pos-refund-1',
    adminNote: 'POS refund entry',
  });
  assert.equal(first.refundStatus, 'refunded');

  const refundedEventsBeforeReplay = paymentEvents.filter((e) => e.eventType === 'refunded');
  assert.equal(refundedEventsBeforeReplay.length >= 1, true);

  const second = await createAdminPosRefundEntryDb({
    orderId: order.id,
    requestId: 'req-admin-pos-refund-1',
    adminNote: 'POS refund entry replay',
  });
  assert.equal(second.refundStatus, 'refunded');

  const refundedEventsAfterReplay = paymentEvents.filter((e) => e.eventType === 'refunded');
  assert.equal(refundedEventsAfterReplay.length, refundedEventsBeforeReplay.length);

  const detail = await getMyOrderDetailDb({ orderId: order.id });
  assert.equal(detail.status, 'refunded');
});

test('admin refund actions update refund and order status', async () => {
  const order = await createOrderDb({
    experienceSlug: 'dadadaocheng-walk',
    scheduleId: 'sch_dadaocheng_0402',
    peopleCount: 1,
    contactName: 'Refund Flow',
    contactPhone: '0900000001',
    contactEmail: 'refund-flow@example.com'
  });
  const ref = await createRefundRequestDb({ orderId: order.id, requestId: 'req-admin-refund-flow-1', reason: 'user_request' });

  const approved = await updateAdminRefundStatusDb({ refundRequestId: ref.id, action: 'approve' });
  assert.equal(approved.status, 'approved');

  const processing = await updateAdminRefundStatusDb({ refundRequestId: ref.id, action: 'process' });
  assert.equal(processing.status, 'processing');

  const completed = await updateAdminRefundStatusDb({ refundRequestId: ref.id, action: 'complete' });
  assert.equal(completed.status, 'refunded');

  const refundedEvents = paymentEvents.filter((e) => e.eventType === 'refunded');
  assert.equal(refundedEvents.length >= 1, true);

  const completedAgain = await updateAdminRefundStatusDb({ refundRequestId: ref.id, action: 'complete' });
  assert.equal(completedAgain.status, 'refunded');

  const refundedEventsAfterReplay = paymentEvents.filter((e) => e.eventType === 'refunded');
  assert.equal(refundedEventsAfterReplay.length, refundedEvents.length);

  const detail = await getMyOrderDetailDb({ orderId: order.id });
  assert.equal(detail.status, 'refunded');
});
