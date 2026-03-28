import test from 'node:test';
import assert from 'node:assert/strict';
import { createOrderDb, createRefundRequestDb, createGuideApplicationDb, adminDashboardSummaryDb } from '../../src/lib/db.mjs';

test('admin dashboard summary aggregates queues and KPI', async () => {
  const order = await createOrderDb({
    experienceSlug: 'kaohsiung-chaishan-cave-experience',
    scheduleId: 'sch_chaishan_0410',
    peopleCount: 1,
    contactName: 'Dash User',
    contactPhone: '0900333444',
    contactEmail: 'dash@example.com'
  });
  await createRefundRequestDb({ orderId: order.id, reason: 'user_request' });
  await createGuideApplicationDb({
    fullName: 'Guide Pending',
    phone: '0911000222',
    email: 'guide-pending@example.com',
    city: '台南市',
    bio: '導覽經驗 5 年'
  });

  const summary = await adminDashboardSummaryDb();
  assert.ok(summary.kpi.totalOrders >= 1);
  assert.ok(summary.kpi.pendingRefunds >= 1);
  assert.ok(summary.kpi.pendingGuideApps >= 1);
  assert.ok(Array.isArray(summary.queues.orders));
  assert.ok(Array.isArray(summary.queues.refunds));
  assert.ok(Array.isArray(summary.queues.guides));
});
