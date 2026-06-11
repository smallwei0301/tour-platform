/**
 * Issue #1385 — db.mjs strangler 第一步：
 *   1. audit-log 單一實作（src/lib/audit-log.mjs），db.mjs/admin.mjs/services.mjs 共用
 *   2. admin refund 狀態機抽為純函式 resolveAdminRefundTransition（可離線單測）
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { appendAuditLog, insertAuditLogDb } from '../../src/lib/audit-log.mjs';
import { auditLogs } from '../../src/lib/store.mjs';
import { resolveAdminRefundTransition } from '../../src/lib/refund-transition.mjs';

const NOW = '2026-06-11T12:00:00.000Z';

// ── audit-log 單一實作 ──────────────────────────────────────────────────────

test('appendAuditLog: 寫入 in-memory store，shape 與既有一致', () => {
  const before = auditLogs.length;
  appendAuditLog({ orderId: 'ord_x', actor: 'admin', action: 'unit_test_action', metadata: { a: 1 } });
  assert.equal(auditLogs.length, before + 1);
  const log = auditLogs.at(-1);
  assert.match(log.id, /^aud_\d{6}$/);
  assert.equal(log.orderId, 'ord_x');
  assert.equal(log.actor, 'admin');
  assert.equal(log.action, 'unit_test_action');
  assert.deepEqual(log.metadata, { a: 1 });
  assert.ok(log.createdAt);
});

test('appendAuditLog: 無 action 時 no-op；actor 預設 system', () => {
  const before = auditLogs.length;
  appendAuditLog({ orderId: 'ord_x' });
  assert.equal(auditLogs.length, before, '無 action 不寫入');

  appendAuditLog({ action: 'unit_default_actor' });
  assert.equal(auditLogs.at(-1).actor, 'system');
});

test('insertAuditLogDb: 對 supabase client 寫 audit_logs（snake_case payload）', async () => {
  const inserted = [];
  const fakeSupabase = {
    from(table) {
      return {
        insert: async (payload) => {
          inserted.push({ table, payload });
          return { error: null };
        },
      };
    },
  };
  await insertAuditLogDb(fakeSupabase, { orderId: 'ord_y', actor: 'admin', action: 'x', metadata: { b: 2 } });
  assert.equal(inserted.length, 1);
  assert.equal(inserted[0].table, 'audit_logs');
  assert.equal(inserted[0].payload.order_id, 'ord_y');
  assert.equal(inserted[0].payload.action, 'x');
});

test('單一實作: db.mjs/admin.mjs/services.mjs 不再有 appendAuditLog/insertAuditLogDb 本地定義', () => {
  for (const [file, banned] of [
    ['src/lib/db.mjs', /async function insertAuditLogDb/],
    ['src/lib/admin.mjs', /^function appendAuditLog/m],
    ['src/lib/services.mjs', /^function appendAuditLog/m],
  ]) {
    const src = readFileSync(path.resolve(file), 'utf8');
    assert.ok(!banned.test(src), `${file} 不應再有本地 audit log 實作`);
    assert.match(src, /from '\.\/audit-log\.mjs'/, `${file} 應改用共用模組`);
  }
});

// ── refund 狀態機純函式 ─────────────────────────────────────────────────────

test('resolveAdminRefundTransition: approve/process/complete/reject 的狀態轉移', () => {
  const approve = resolveAdminRefundTransition('approve', { now: NOW, hasPaidAt: true });
  assert.equal(approve.refundStatus, 'approved');
  assert.equal(approve.orderStatus, 'refund_pending');
  assert.equal(approve.refundPatch.approved_at, NOW);
  assert.equal(approve.completesPayment, false);

  const processR = resolveAdminRefundTransition('process', { now: NOW, hasPaidAt: true });
  assert.equal(processR.refundStatus, 'processing');
  assert.equal(processR.orderStatus, 'refund_pending');

  const complete = resolveAdminRefundTransition('complete', { now: NOW, hasPaidAt: true });
  assert.equal(complete.refundStatus, 'refunded');
  assert.equal(complete.orderStatus, 'refunded');
  assert.equal(complete.refundPatch.refunded_at, NOW);
  assert.equal(complete.completesPayment, true, 'complete 應同步 payment_status=refunded');

  const rejectPaid = resolveAdminRefundTransition('reject', { now: NOW, hasPaidAt: true });
  assert.equal(rejectPaid.refundStatus, 'rejected');
  assert.equal(rejectPaid.orderStatus, 'paid');

  // 既有 fallback 行為：未付款訂單被退回 pending_payment（Supabase 分支目前固定
  // hasPaidAt:true 保持零行為變更 — 分歧已另開 issue 追蹤）
  const rejectUnpaid = resolveAdminRefundTransition('reject', { now: NOW, hasPaidAt: false });
  assert.equal(rejectUnpaid.orderStatus, 'pending_payment');
});

test('resolveAdminRefundTransition: 非法 action 擲錯', () => {
  assert.throws(() => resolveAdminRefundTransition('explode', { now: NOW, hasPaidAt: true }), /invalid refund action/);
});

test('接線: db.mjs 與 admin.mjs 的 refund 轉移皆改用 resolveAdminRefundTransition', () => {
  const dbSrc = readFileSync(path.resolve('src/lib/db.mjs'), 'utf8');
  const adminSrc = readFileSync(path.resolve('src/lib/admin.mjs'), 'utf8');
  assert.match(dbSrc, /resolveAdminRefundTransition/, 'db.mjs 應用純函式');
  assert.match(adminSrc, /resolveAdminRefundTransition/, 'admin.mjs fallback 應用純函式');
});
