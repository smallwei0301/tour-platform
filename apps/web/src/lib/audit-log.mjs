/**
 * Issue #1385 — audit log 單一實作。
 * 先前 db.mjs（Supabase insert）、admin.mjs、services.mjs 各有一份複本，
 * 是複製貼上漂移源；此後一律 import 本模組。
 */
import { auditLogs } from './store.mjs';

/** in-memory fallback 寫入（admin.mjs / services.mjs 共用）。 */
export function appendAuditLog({ orderId = null, actor = 'system', action, metadata = {}, createdAt = null }) {
  if (!action) return null;
  const log = {
    id: `aud_${String(auditLogs.length + 1).padStart(6, '0')}`,
    orderId: orderId || null,
    actor,
    action,
    metadata,
    createdAt: createdAt || new Date().toISOString(),
  };
  auditLogs.push(log);
  return log;
}

/** Supabase 寫入（db.mjs 共用）。 */
export async function insertAuditLogDb(supabase, { orderId = null, actor = 'admin', action, metadata = {} }) {
  if (!action) return;
  const payload = {
    order_id: orderId || null,
    actor,
    action,
    metadata,
    created_at: new Date().toISOString(),
  };
  const { error } = await supabase.from('audit_logs').insert(payload);
  if (error) throw new Error(error.message);
}
