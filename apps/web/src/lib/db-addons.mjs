// @ts-check
/**
 * Issue #1591 — 加購資料存取（strangler 領域檔，不進 db.mjs）。
 *
 * listActivityAddonsDb：讀某活動的啟用加購項（旅客選購頁）。
 * persistOrderAddonsDb：把 recomputeOrderAddons 的結果落 order_addons（價格快照）。
 * 計價邏輯在 addon-pricing.mjs（純函式），此檔只負責讀寫。
 */
import { hasSupabaseEnv, getSupabase } from './db.mjs';
import { recomputeOrderAddons } from './addon-pricing.mjs';

/** in-memory fallback（測試 seam）。 */
/** @type {Array<{ id: string, activity_id: string, name: string, price_twd: number, unit: string, stock: number|null, is_active: boolean, sort_order: number }>} */
const _memAddons = [];
/** @type {Array<{ order_id: string, addon_id: string, quantity: number, unit_price_twd: number, subtotal_twd: number }>} */
const _memOrderAddons = [];

/**
 * 測試用。
 * @param {Array<{ id: string, activity_id: string, name: string, price_twd: number, unit: string, stock: number|null, is_active: boolean, sort_order: number }>} rows
 */
export function __seedMemAddons(rows) { _memAddons.length = 0; _memAddons.push(...rows); }
export function __getMemOrderAddons() { return _memOrderAddons.slice(); }
export function __resetMemOrderAddons() { _memOrderAddons.length = 0; }

/**
 * @param {string} activityId
 * @returns {Promise<Array<{ id: string, name: string, priceTwd: number, unit: string, stock: number|null, isActive: boolean }>>}
 */
export async function listActivityAddonsDb(activityId) {
  const id = String(activityId || '').trim();
  if (!id) return [];
  if (!hasSupabaseEnv()) {
    return _memAddons.filter((a) => a.activity_id === id && a.is_active)
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((a) => ({ id: a.id, name: a.name, priceTwd: a.price_twd, unit: a.unit, stock: a.stock, isActive: a.is_active }));
  }
  const supabase = await getSupabase();
  const { data } = await supabase.from('activity_addons')
    .select('id, name, price_twd, unit, stock, is_active')
    .eq('activity_id', id).eq('is_active', true).order('sort_order', { ascending: true });
  return (Array.isArray(data) ? data : []).map((a) => ({
    id: a.id, name: a.name, priceTwd: a.price_twd, unit: a.unit, stock: a.stock, isActive: a.is_active,
  }));
}

/**
 * server 端重算並落訂單加購快照。回 { total, lines }（含各項 error）。
 * @param {{ orderId: string, activityId: string, selections: Array<{ addonId: string, quantity: number }>, peopleCount: number }} input
 * @returns {Promise<{ total: number, lines: Array<{ addonId: string, quantity: number, subtotal: number, error?: string }> }>}
 */
export async function persistOrderAddonsDb({ orderId, activityId, selections, peopleCount }) {
  const defs = await listActivityAddonsDb(activityId);
  // listActivityAddonsDb 已濾出 isActive，recompute 仍會擋 stock/qty/unknown
  const result = recomputeOrderAddons(
    defs.map((d) => ({ id: d.id, priceTwd: d.priceTwd, unit: /** @type {'per_person'|'per_group'} */ (d.unit), stock: d.stock, isActive: d.isActive })),
    selections, peopleCount,
  );
  const okLines = result.lines.filter((l) => !l.error);
  const defById = new Map(defs.map((d) => [d.id, d]));

  const rows = okLines.map((l) => ({
    order_id: orderId, addon_id: l.addonId, quantity: l.quantity,
    unit_price_twd: defById.get(l.addonId)?.priceTwd ?? 0, subtotal_twd: l.subtotal,
  }));

  if (rows.length) {
    if (!hasSupabaseEnv()) {
      _memOrderAddons.push(...rows);
    } else {
      const supabase = await getSupabase();
      await supabase.from('order_addons').insert(rows);
    }
  }
  return result;
}
