import test from 'node:test';
import assert from 'node:assert/strict';
import { getKpiConfigDb, updateKpiConfigDb, listKpiConfigHistoryDb, revertKpiConfigDb } from '../../src/lib/db-kpi.mjs';
import { createOrderDb, listOperationsTrackingDb } from '../../src/lib/db.mjs';

test('kpi config read/update works in fallback', async () => {
  const before = await getKpiConfigDb();
  assert.equal(typeof before.commissionRate, 'number');

  const updated = await updateKpiConfigDb({
    commissionRate: 0.2,
    paymentFeeRate: 0.04,
    healthyMinContributionTwd: 200,
    healthyAllowException: true
  });

  assert.equal(updated.commissionRate, 0.2);
  assert.equal(updated.paymentFeeRate, 0.04);
  assert.equal(updated.healthyMinContributionTwd, 200);
  assert.equal(updated.healthyAllowException, true);
});

test('operations tracking uses updated kpi config', async () => {
  await createOrderDb({
    experienceSlug: 'dadadaocheng-walk',
    scheduleId: 'sch_dadaocheng_0402',
    peopleCount: 2,
    contactName: 'KPI Test',
    contactPhone: '0912333444',
    contactEmail: 'kpi-test@example.com'
  });

  const rows = await listOperationsTrackingDb();
  const target = rows.find((r) => r.activityName?.includes('大稻埕'));
  assert.ok(target);
  // With commissionRate=0.2 and paymentFeeRate=0.04, net base should be positive for 3000 order.
  assert.ok(target.commissionTwd >= 600);
});

test('kpi config history and revert works in fallback', async () => {
  const before = await getKpiConfigDb();

  const updated = await updateKpiConfigDb({
    commissionRate: 0.18,
    paymentFeeRate: 0.03,
    healthyMinContributionTwd: 150,
    healthyAllowException: false,
    actor: 'admin',
    note: 'temp adjustment'
  });
  assert.equal(updated.commissionRate, 0.18);

  const history = await listKpiConfigHistoryDb();
  assert.ok(history.length >= 2);

  const targetVersion = history.find((h) => h.action === 'update' && h.config?.commissionRate === 0.18);
  assert.ok(targetVersion);

  const revertTo = history.find((h) => Number(h?.config?.commissionRate) === Number(before.commissionRate));
  assert.ok(revertTo);

  const reverted = await revertKpiConfigDb({ versionId: revertTo.versionId, actor: 'admin' });
  assert.equal(typeof reverted.commissionRate, 'number');

  const after = await getKpiConfigDb();
  assert.equal(Number(after.commissionRate), Number(before.commissionRate));
});
