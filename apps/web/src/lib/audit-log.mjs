// @ts-check
/**
 * Issue #1385 — audit log 單一實作。
 * 先前 db.mjs（Supabase insert）、admin.mjs、services.mjs 各有一份複本，
 * 是複製貼上漂移源；此後一律 import 本模組。
 */
import { auditLogs } from './store.mjs';

/**
 * in-memory fallback 寫入（admin.mjs / services.mjs 共用）。
 * @param {{ orderId?: string | null, actor?: string, action?: string, metadata?: Record<string, unknown>, createdAt?: string | null }} entry
 * @returns {Record<string, unknown> | null}
 */
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
  // auditLogs 為 in-memory store 陣列（store.mjs 由 seed 推得較窄型別）；此處寬鬆推入。
  auditLogs.push(/** @type {any} */ (log));
  return log;
}

/**
 * Supabase 寫入（db.mjs 共用）。
 * @param {any} supabase - Supabase client（loosely typed；插入 audit_logs 表）
 * @param {{ orderId?: string | null, actor?: string, action?: string, metadata?: Record<string, unknown> }} entry
 * @returns {Promise<void>}
 */
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
