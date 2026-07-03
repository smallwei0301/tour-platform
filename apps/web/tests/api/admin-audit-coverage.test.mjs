import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createOrderDb,
  createRefundRequestDb,
  updateAdminRefundStatusDb,
  listOrderAuditLogsDb
} from '../../src/lib/db.mjs';
// #1570：KPI 設定已抽到 db-kpi.mjs
import {
  updateKpiConfigDb,
  listKpiConfigHistoryDb,
  revertKpiConfigDb
} from '../../src/lib/db-kpi.mjs';
import { auditLogs } from '../../src/lib/store.mjs';

test('refund admin actions write audit_logs rows with metadata', async () => {
  const order = await createOrderDb({
    experienceSlug: 'dadadaocheng-walk',
    scheduleId: 'sch_dadaocheng_0402',
    peopleCount: 1,
    contactName: 'Refund Audit',
    contactPhone: '0912000123',
    contactEmail: 'refund-audit@example.com'
  });

  const refund = await createRefundRequestDb({
    orderId: order.id,
    requestId: `req-audit-${Date.now()}`,
    reason: 'user_request'
  });

  for (const action of ['approve', 'reject', 'process', 'complete']) {
    await updateAdminRefundStatusDb({
      refundRequestId: refund.id,
      action,
      adminNote: `note-${action}`
    });
  }

  const logs = await listOrderAuditLogsDb({ orderId: order.id });
  const refundLogs = logs.filter((l) => String(l.action || '').startsWith('refund_'));
  const byAction = new Map(refundLogs.map((l) => [l.action, l]));

  for (const action of ['approve', 'reject', 'process', 'complete']) {
    const row = byAction.get(`refund_${action}`);
    assert.ok(row, `missing refund_${action} audit log`);
    assert.equal(row.actor, 'admin');
    assert.equal(row.metadata?.refundRequestId, refund.id);
    assert.equal(row.metadata?.adminNote, `note-${action}`);
  }
});

test('kpi config update/revert write audit_logs rows', async () => {
  const beforeCount = auditLogs.length;

  const updated = await updateKpiConfigDb({
    commissionRate: 0.19,
    paymentFeeRate: 0.031,
    actor: 'admin',
    note: 'audit coverage test'
  });

  const history = await listKpiConfigHistoryDb();
  const revertTarget = history.find((h) => h.action === 'update' && Number(h.config?.commissionRate) === Number(updated.commissionRate));
  assert.ok(revertTarget, 'missing update history target');

  await revertKpiConfigDb({ versionId: revertTarget.versionId, actor: 'admin' });

  const newLogs = auditLogs.slice(beforeCount);
  const updateLog = newLogs.find((l) => l.action === 'kpi_config_update');
  const revertLog = newLogs.find((l) => l.action === 'kpi_config_revert');

  assert.ok(updateLog, 'missing kpi_config_update audit log');
  assert.equal(updateLog.actor, 'admin');
  assert.ok(updateLog.metadata?.before);
  assert.ok(updateLog.metadata?.after);

  assert.ok(revertLog, 'missing kpi_config_revert audit log');
  assert.equal(revertLog.actor, 'admin');
  assert.equal(revertLog.metadata?.sourceVersionId, revertTarget.versionId);
});
