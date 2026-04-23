import test from 'node:test';
import assert from 'node:assert/strict';
import { createOrderDb, getAdminOrderDetailDb, updateAdminOrderDb, applyAdminOrderExceptionDb, listOrderAuditLogsDb } from '../../src/lib/db.mjs';

test('admin can read and update order detail (fallback)', async () => {
  const created = await createOrderDb({
    experienceSlug: 'kaohsiung-chaishan-cave-experience',
    scheduleId: 'sch_chaishan_0410',
    peopleCount: 1,
    contactName: 'Ops User',
    contactPhone: '0912999999',
    contactEmail: 'ops@example.com'
  });

  const before = await getAdminOrderDetailDb({ orderId: created.id });
  assert.equal(before.status, 'pending_payment');

  const updated = await updateAdminOrderDb({
    orderId: created.id,
    status: 'confirmed',
    adminNote: '人工確認：已電話聯繫旅客'
  });

  assert.equal(updated.status, 'confirmed');
  assert.equal(updated.adminNote, '人工確認：已電話聯繫旅客');

  const logs = await listOrderAuditLogsDb({ orderId: created.id });
  const statusLog = logs.find((l) => l.action === 'order_status_update');
  assert.ok(statusLog, 'missing order_status_update audit log');
  assert.equal(statusLog.actor, 'admin');
  assert.equal(statusLog.metadata?.sourceChannel, 'admin_pos');
  assert.equal(statusLog.metadata?.targetOrderId, created.id);
  assert.equal(statusLog.metadata?.before?.status, 'pending_payment');
  assert.equal(statusLog.metadata?.after?.status, 'confirmed');
  assert.equal(statusLog.metadata?.after?.adminNote, '人工確認：已電話聯繫旅客');
});

test('admin note-only update writes audit log (fallback)', async () => {
  const created = await createOrderDb({
    experienceSlug: 'kaohsiung-chaishan-cave-experience',
    scheduleId: 'sch_chaishan_0410',
    peopleCount: 1,
    contactName: 'Ops Note',
    contactPhone: '0912777777',
    contactEmail: 'ops-note@example.com'
  });

  await updateAdminOrderDb({
    orderId: created.id,
    adminNote: '僅補充備註'
  });

  const logs = await listOrderAuditLogsDb({ orderId: created.id });
  const noteLog = logs.find((l) => l.action === 'order_admin_note_update');
  assert.ok(noteLog, 'missing order_admin_note_update audit log');
  assert.equal(noteLog.metadata?.before?.status, 'pending_payment');
  assert.equal(noteLog.metadata?.after?.status, 'pending_payment');
  assert.equal(noteLog.metadata?.after?.adminNote, '僅補充備註');
});

test('admin exception action writes audit log (fallback)', async () => {
  const created = await createOrderDb({
    experienceSlug: 'kaohsiung-chaishan-cave-experience',
    scheduleId: 'sch_chaishan_0410',
    peopleCount: 1,
    contactName: 'Ops Exception',
    contactPhone: '0912888888',
    contactEmail: 'ops-exception@example.com'
  });

  const result = await applyAdminOrderExceptionDb({
    orderId: created.id,
    action: 'adjust_capacity',
    targetScheduleId: 'sch_chaishan_0410',
    newCapacity: 14,
    adminNote: '手動擴容'
  });

  assert.equal(result.action, 'adjust_capacity');

  const logs = await listOrderAuditLogsDb({ orderId: created.id });
  assert.ok(logs.length >= 1);
  assert.equal(logs[0].action, 'adjust_capacity');
});
