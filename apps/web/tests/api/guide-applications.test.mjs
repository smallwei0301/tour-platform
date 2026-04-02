import test from 'node:test';
import assert from 'node:assert/strict';
import { createGuideApplicationDb, listGuideApplicationsDb, updateGuideApplicationStatusDb } from '../../src/lib/db.mjs';

test('guide application create/list works', async () => {
  const app = await createGuideApplicationDb({
    fullName: 'Andy Candidate',
    phone: '0912000000',
    email: 'guide-candidate@example.com',
    city: '高雄市',
    bio: '我有多年導覽經驗'
  });

  assert.equal(app.status, 'pending');

  const list = await listGuideApplicationsDb({});
  assert.ok(list.some((r) => r.id === app.id));
});

test('guide application approve/suspend works', async () => {
  const app = await createGuideApplicationDb({
    fullName: 'Guide Flow',
    phone: '0912000001',
    email: 'guide-flow@example.com',
    city: '台北市',
    bio: '測試審核流程'
  });

  const approved = await updateGuideApplicationStatusDb({ applicationId: app.id, action: 'approve' });
  assert.equal(approved.status, 'approved');

  const suspended = await updateGuideApplicationStatusDb({ applicationId: app.id, action: 'suspend' });
  assert.equal(suspended.status, 'suspended');
});
