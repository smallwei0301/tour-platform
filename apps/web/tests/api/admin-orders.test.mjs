import test from 'node:test';
import assert from 'node:assert/strict';
import { createOrderDb } from '../../src/lib/db.mjs';
import { listAdminOrdersFallback } from '../../src/lib/admin.mjs';

test('admin orders includes margin fields', async () => {
  await createOrderDb({
    experienceSlug: 'kaohsiung-chaishan-cave-experience',
    scheduleId: 'sch_chaishan_0410',
    peopleCount: 1,
    contactName: 'Wei',
    contactPhone: '0912345678',
    contactEmail: 'wei@example.com'
  });
  const rows = listAdminOrdersFallback();
  assert.ok(rows.length >= 1);
  assert.equal(typeof rows[0].marginTwd, 'number');
  assert.equal(rows[0].totalTwd - rows[0].costTwd, rows[0].marginTwd);
});
