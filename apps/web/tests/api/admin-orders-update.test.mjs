import test from 'node:test';
import assert from 'node:assert/strict';
import { createOrderDb, getAdminOrderDetailDb, updateAdminOrderDb } from '../../src/lib/db.mjs';

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
});
