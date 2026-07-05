// @ts-check
/**
 * Issue #1593 — 站內通知的資料存取（strangler：獨立領域檔，不進 db.mjs）。
 *
 * createNotification：掛點寫入（Supabase 或 in-memory fallback），**永不拋錯**——掛點失敗
 * 不得阻斷主流程（留言/改期/訂單狀態）。list/markRead 供旅客鈴鐺。
 */
import { hasSupabaseEnv, getSupabase } from './db.mjs';

const VALID_TYPES = new Set(['message_reply', 'reschedule_result', 'order_status', 'review_invited']);

/**
 * in-memory fallback store（測試用；正式走 Supabase）。
 * @type {Array<{ id: string, user_id: string, type: string, title: string, body: string|null, link_path: string|null, read_at: string|null, created_at: string }>}
 */
const _memNotifications = [];
let _memSeq = 0;

/** 測試用：清空 in-memory。 */
export function __resetMemNotifications() { _memNotifications.length = 0; _memSeq = 0; }

/**
 * 掛點寫入一筆通知。永不拋錯（回 boolean 表是否寫入）。
 * @param {{ userId?: string, type?: string, title?: string, body?: string|null, linkPath?: string|null, now?: string }} input
 * @returns {Promise<boolean>}
 */
export async function createNotification({ userId, type, title, body = null, linkPath = null, now } = {}) {
  try {
    const uid = String(userId || '').trim();
    if (!uid || !VALID_TYPES.has(String(type)) || !String(title || '').trim()) return false;
    const createdAt = now || new Date().toISOString();

    if (!hasSupabaseEnv()) {
      _memNotifications.push({
        id: `ntf_${String(++_memSeq).padStart(6, '0')}`,
        user_id: uid, type: String(type), title: String(title), body, link_path: linkPath, read_at: null, created_at: createdAt,
      });
      return true;
    }
    const supabase = await getSupabase();
    const { error } = await supabase.from('user_notifications').insert({
      user_id: uid, type, title, body, link_path: linkPath, created_at: createdAt,
    });
    return !error;
  } catch {
    return false; // 掛點永不反噬主流程
  }
}

/**
 * 列出使用者通知（新到舊）＋未讀數。
 * @param {{ userId?: string, limit?: number, offset?: number }} input
 * @returns {Promise<{ items: Array<Record<string, unknown>>, unreadCount: number }>}
 */
export async function listNotificationsDb({ userId, limit = 20, offset = 0 } = {}) {
  const uid = String(userId || '').trim();
  if (!uid) return { items: [], unreadCount: 0 };
  const lim = Math.min(100, Math.max(1, Math.trunc(Number(limit) || 20)));
  const off = Math.max(0, Math.trunc(Number(offset) || 0));

  if (!hasSupabaseEnv()) {
    const mine = _memNotifications.filter((n) => n.user_id === uid)
      .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
    return { items: mine.slice(off, off + lim), unreadCount: mine.filter((n) => !n.read_at).length };
  }
  const supabase = await getSupabase();
  const { data } = await supabase.from('user_notifications')
    .select('id, type, title, body, link_path, read_at, created_at')
    .eq('user_id', uid).order('created_at', { ascending: false }).range(off, off + lim - 1);
  const { count } = await supabase.from('user_notifications')
    .select('id', { count: 'exact', head: true }).eq('user_id', uid).is('read_at', null);
  return { items: Array.isArray(data) ? data : [], unreadCount: Number(count) || 0 };
}

/**
 * 標記已讀（ids 為空＝全部標已讀）。冪等。
 * @param {{ userId?: string, ids?: string[], now?: string }} input
 * @returns {Promise<{ updated: number }>}
 */
export async function markNotificationsReadDb({ userId, ids, now } = {}) {
  const uid = String(userId || '').trim();
  if (!uid) return { updated: 0 };
  const readAt = now || new Date().toISOString();
  const idSet = Array.isArray(ids) && ids.length ? new Set(ids.map(String)) : null;

  if (!hasSupabaseEnv()) {
    let updated = 0;
    for (const n of _memNotifications) {
      if (n.user_id !== uid || n.read_at) continue;
      if (idSet && !idSet.has(n.id)) continue;
      n.read_at = readAt; updated += 1;
    }
    return { updated };
  }
  const supabase = await getSupabase();
  let q = supabase.from('user_notifications').update({ read_at: readAt }).eq('user_id', uid).is('read_at', null);
  if (idSet) q = q.in('id', [...idSet]);
  const { data } = await q.select('id');
  return { updated: Array.isArray(data) ? data.length : 0 };
}
