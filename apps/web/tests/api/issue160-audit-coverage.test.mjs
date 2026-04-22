import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createOrderDb,
  cancelOrderDb,
  createRefundRequestDb,
  listOrderAuditLogsDb,
} from '../../src/lib/db.mjs';

test('issue160: createOrderDb writes audit log row', async () => {
  const order = await createOrderDb({
    experienceSlug: 'kaohsiung-chaishan-cave-experience',
    scheduleId: 'sch_chaishan_0410',
    peopleCount: 1,
    contactName: 'Issue160 Create',
    contactPhone: '0912000001',
    contactEmail: 'issue160-create@example.com'
  });

  const logs = await listOrderAuditLogsDb({ orderId: order.id });
  const row = logs.find((l) => l.action === 'order_created');

  assert.ok(row, 'missing order_created audit log');
  assert.equal(row.actor, 'user');
});

test('issue160: cancelOrderDb writes audit log row on user cancellation', async () => {
  const order = await createOrderDb({
    experienceSlug: 'dadadaocheng-walk',
    scheduleId: 'sch_dadaocheng_0402',
    peopleCount: 1,
    contactName: 'Issue160 Cancel',
    contactPhone: '0912000002',
    contactEmail: 'issue160-cancel@example.com'
  });

  const cancelled = await cancelOrderDb({ orderId: order.id, contactEmail: 'issue160-cancel@example.com' });
  assert.equal(cancelled.status, 'cancelled_by_user');

  const logs = await listOrderAuditLogsDb({ orderId: order.id });
  const row = logs.find((l) => l.action === 'order_cancelled_by_user');

  assert.ok(row, 'missing order_cancelled_by_user audit log');
  assert.equal(row.actor, 'user');
});

test('issue160: createRefundRequestDb writes audit log row', async () => {
  const order = await createOrderDb({
    experienceSlug: 'kaohsiung-chaishan-cave-experience',
    scheduleId: 'sch_chaishan_0410',
    peopleCount: 1,
    contactName: 'Issue160 Refund',
    contactPhone: '0912000003',
    contactEmail: 'issue160-refund@example.com'
  });

  const refund = await createRefundRequestDb({
    orderId: order.id,
    requestId: 'issue160-refund-request-1',
    reason: 'user_request',
    contactEmail: 'issue160-refund@example.com'
  });
  assert.equal(refund.status, 'requested');

  const logs = await listOrderAuditLogsDb({ orderId: order.id });
  const row = logs.find((l) => l.action === 'refund_requested');

  assert.ok(row, 'missing refund_requested audit log');
  assert.equal(row.actor, 'user');
});
