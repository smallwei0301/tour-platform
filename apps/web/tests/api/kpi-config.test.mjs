import test from 'node:test';
import assert from 'node:assert/strict';
import { getKpiConfigDb, updateKpiConfigDb, createOrderDb, listOperationsTrackingDb } from '../../src/lib/db.mjs';

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
