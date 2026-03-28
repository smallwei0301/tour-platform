import test from 'node:test';
import assert from 'node:assert/strict';
import { createOrderDb, listOperationsTrackingDb, updateOperationsTrackingDb, operationsTrackingSummaryDb, operationsTrackingCsvDb } from '../../src/lib/db.mjs';

test('operations tracking list/update/summary/csv works in fallback', async () => {
  const created = await createOrderDb({
    experienceSlug: 'kaohsiung-chaishan-cave-experience',
    scheduleId: 'sch_chaishan_0410',
    peopleCount: 2,
    contactName: 'Ops Track',
    contactPhone: '0900111222',
    contactEmail: 'ops-track@example.com'
  });

  let rows = await listOperationsTrackingDb();
  const target = rows.find((r) => r.orderId === created.id);
  assert.ok(target);

  const updated = await updateOperationsTrackingDb({
    orderId: created.id,
    manualMinutes: 35,
    manualCostTwd: 280,
    refundAmountTwd: 0,
    subsidyTwd: 50,
    isRescheduled: true,
    hasComplaint: false,
    hasGuideAdjustment: true,
    hasOversellIssue: false,
    note: '人工跟催 + 導遊改期處理'
  });
  assert.equal(updated.orderId, created.id);
  assert.equal(updated.manualMinutes, 35);

  const summary = await operationsTrackingSummaryDb();
  assert.equal(typeof summary.totalGmv, 'number');
  assert.equal(typeof summary.healthyOrderRate, 'number');

  const csv = await operationsTrackingCsvDb();
  assert.ok(csv.includes('orderId'));
  assert.ok(csv.includes(created.id));
});
