import test from 'node:test';
import assert from 'node:assert/strict';
import { createOrderDb, listMyOrdersDb, getMyOrderDetailDb } from '../../src/lib/db.mjs';

test('me/orders list and detail work on fallback store', async () => {
  const created = await createOrderDb({
    experienceSlug: 'kaohsiung-chaishan-cave-experience',
    scheduleId: 'sch_chaishan_0410',
    peopleCount: 1,
    contactName: 'Wei',
    contactPhone: '0912345678',
    contactEmail: 'wei@example.com'
  });

  const list = await listMyOrdersDb({ contactEmail: 'wei@example.com' });
  assert.ok(Array.isArray(list));
  assert.ok(list.some((o) => o.id === created.id));

  const detail = await getMyOrderDetailDb({ orderId: created.id, contactEmail: 'wei@example.com' });
  assert.equal(detail.id, created.id);
});
