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

let _memAddonSeq = 0;

/**
 * 測試用。
 * @param {Array<{ id: string, activity_id: string, name: string, price_twd: number, unit: string, stock: number|null, is_active: boolean, sort_order: number }>} rows
 */
export function __seedMemAddons(rows) { _memAddons.length = 0; _memAddons.push(...rows); }
export function __getMemAddons() { return _memAddons.map((a) => ({ ...a })); }
export function __getMemOrderAddons() { return _memOrderAddons.slice(); }
export function __resetMemOrderAddons() { _memOrderAddons.length = 0; }

const ADDON_UNITS = ['per_person', 'per_group'];

/** 後台編輯用 row 形狀（含 isActive / sortOrder，供編輯器渲染）。 @param {any} a */
function editShape(a) {
  return {
    id: a.id, name: a.name, priceTwd: a.price_twd, unit: a.unit,
    stock: a.stock ?? null, isActive: a.is_active, sortOrder: a.sort_order ?? 0,
  };
}

/**
 * 正規化並驗證後台加購輸入（新增/更新共用）。回 {ok,value} 或 {ok:false,code,message}。
 * @param {any} input
 * @param {boolean} [partial] 更新時允許缺欄（僅驗證有給的欄）
 * @returns {{ ok: true, value: any } | { ok: false, code: string, message: string }}
 */
export function normalizeAddonInput(input, partial = false) {
  const out = /** @type {any} */ ({});
  const has = (/** @type {string} */ k) => input && Object.prototype.hasOwnProperty.call(input, k);

  if (!partial || has('name')) {
    const name = String(input?.name ?? '').trim();
    if (!name) return { ok: false, code: 'INVALID_NAME', message: '加購名稱必填' };
    if (name.length > 60) return { ok: false, code: 'NAME_TOO_LONG', message: '加購名稱最多 60 字' };
    out.name = name;
  }
  if (!partial || has('priceTwd')) {
    const price = Math.trunc(Number(input?.priceTwd));
    if (!Number.isFinite(price) || price < 0) return { ok: false, code: 'INVALID_PRICE', message: '價格需為 ≥0 整數' };
    out.price_twd = price;
  }
  if (!partial || has('unit')) {
    const unit = String(input?.unit ?? '').trim();
    if (!ADDON_UNITS.includes(unit)) return { ok: false, code: 'INVALID_UNIT', message: '計價單位需為每人或每團' };
    out.unit = unit;
  }
  if (!partial || has('stock')) {
    const raw = input?.stock;
    if (raw === null || raw === undefined || raw === '') {
      out.stock = null;
    } else {
      const stock = Math.trunc(Number(raw));
      if (!Number.isFinite(stock) || stock < 0) return { ok: false, code: 'INVALID_STOCK', message: '庫存需為 ≥0 整數或留空（不限）' };
      out.stock = stock;
    }
  }
  if (has('isActive')) out.is_active = input.isActive !== false;
  if (has('sortOrder')) out.sort_order = Math.trunc(Number(input.sortOrder) || 0);
  return { ok: true, value: out };
}

/**
 * 後台：列出某活動「全部」加購項（含停用），供導遊/管理者編輯。
 * @param {string} activityId
 */
export async function listActivityAddonsForEditDb(activityId) {
  const id = String(activityId || '').trim();
  if (!id) return [];
  if (!hasSupabaseEnv()) {
    return _memAddons.filter((a) => a.activity_id === id)
      .sort((a, b) => a.sort_order - b.sort_order).map(editShape);
  }
  const supabase = await getSupabase();
  const { data } = await supabase.from('activity_addons')
    .select('id, name, price_twd, unit, stock, is_active, sort_order')
    .eq('activity_id', id).order('sort_order', { ascending: true });
  return (Array.isArray(data) ? data : []).map(editShape);
}

/** 取某加購項所屬的 activity_id（供 ownership 檢查）。回 null 表示不存在。 @param {string} addonId */
export async function getAddonActivityIdDb(addonId) {
  const aid = String(addonId || '').trim();
  if (!aid) return null;
  if (!hasSupabaseEnv()) {
    const row = _memAddons.find((a) => a.id === aid);
    return row ? row.activity_id : null;
  }
  const supabase = await getSupabase();
  const { data } = await supabase.from('activity_addons').select('activity_id').eq('id', aid).maybeSingle();
  return data ? data.activity_id : null;
}

/**
 * 新增加購項。value 需先過 normalizeAddonInput（非 partial）。回建立後的 editShape。
 * @param {string} activityId
 * @param {any} value
 */
export async function createActivityAddonDb(activityId, value) {
  const id = String(activityId || '').trim();
  const row = {
    activity_id: id, name: value.name, price_twd: value.price_twd, unit: value.unit,
    stock: value.stock ?? null, is_active: value.is_active ?? true, sort_order: value.sort_order ?? 0,
  };
  if (!hasSupabaseEnv()) {
    const created = { id: `addon_${String(++_memAddonSeq).padStart(6, '0')}`, ...row };
    _memAddons.push(created);
    return editShape(created);
  }
  const supabase = await getSupabase();
  const { data, error } = await supabase.from('activity_addons').insert(row)
    .select('id, name, price_twd, unit, stock, is_active, sort_order').single();
  if (error) throw new Error(error.message);
  return editShape(data);
}

/**
 * 更新加購項（patch 已過 normalizeAddonInput partial）。回更新後的 editShape 或 null（不存在）。
 * @param {string} addonId
 * @param {any} patch
 */
export async function updateActivityAddonDb(addonId, patch) {
  const aid = String(addonId || '').trim();
  if (!hasSupabaseEnv()) {
    const row = _memAddons.find((a) => a.id === aid);
    if (!row) return null;
    Object.assign(row, patch);
    return editShape(row);
  }
  const supabase = await getSupabase();
  const { data, error } = await supabase.from('activity_addons').update(patch).eq('id', aid)
    .select('id, name, price_twd, unit, stock, is_active, sort_order').maybeSingle();
  if (error) throw new Error(error.message);
  return data ? editShape(data) : null;
}

/** 刪除加購項。回 true。 @param {string} addonId */
export async function deleteActivityAddonDb(addonId) {
  const aid = String(addonId || '').trim();
  if (!hasSupabaseEnv()) {
    const i = _memAddons.findIndex((a) => a.id === aid);
    if (i >= 0) _memAddons.splice(i, 1);
    return true;
  }
  const supabase = await getSupabase();
  const { error } = await supabase.from('activity_addons').delete().eq('id', aid);
  if (error) throw new Error(error.message);
  return true;
}

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
