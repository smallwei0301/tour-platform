// @ts-check
/**
 * Issue #1591 — 加購（add-on）計價（純函式）。
 *
 * server 端以 DB 價格快照重算加購小計與訂單加購總額（不信任前端金額）。純函式收 addon
 * 定義與選購數量，回各項小計與總額；同時做庫存/下架/數量防呆。不碰 DB／不需 migration。
 */

/**
 * @typedef {{ id: string, priceTwd: number, unit?: 'per_person'|'per_group', stock?: number|null, isActive?: boolean }} AddonDef
 * @typedef {{ addonId: string, quantity: number }} AddonSelection
 */

/**
 * 單項小計：per_person 乘人數、per_group 不乘人數。
 * @param {AddonDef} def
 * @param {number} quantity
 * @param {number} peopleCount
 * @returns {number}
 */
export function addonLineSubtotal(def, quantity, peopleCount) {
  const price = Math.max(0, Math.trunc(Number(def?.priceTwd) || 0));
  const qty = Math.max(0, Math.trunc(Number(quantity) || 0));
  const people = Math.max(1, Math.trunc(Number(peopleCount) || 1));
  const unit = def?.unit === 'per_group' ? 'per_group' : 'per_person';
  return unit === 'per_group' ? price * qty : price * qty * people;
}

/**
 * 重算整筆訂單的加購：回 { lines, total }；遇下架/庫存不足/未知 addon 以 error 標記該項。
 * @param {AddonDef[]} defs - DB 快照的 addon 定義
 * @param {AddonSelection[]} selections - 前端選購
 * @param {number} peopleCount
 * @returns {{ total: number, lines: Array<{ addonId: string, quantity: number, subtotal: number, error?: string }> }}
 */
export function recomputeOrderAddons(defs, selections, peopleCount) {
  const byId = new Map((Array.isArray(defs) ? defs : []).map((d) => [d.id, d]));
  const lines = [];
  let total = 0;

  for (const sel of Array.isArray(selections) ? selections : []) {
    const qty = Math.trunc(Number(sel?.quantity) || 0);
    const def = byId.get(sel?.addonId);
    if (!def) { lines.push({ addonId: sel?.addonId, quantity: qty, subtotal: 0, error: 'unknown_addon' }); continue; }
    if (def.isActive === false) { lines.push({ addonId: def.id, quantity: qty, subtotal: 0, error: 'addon_inactive' }); continue; }
    if (qty <= 0) { lines.push({ addonId: def.id, quantity: 0, subtotal: 0, error: 'invalid_quantity' }); continue; }
    if (def.stock != null && qty > def.stock) { lines.push({ addonId: def.id, quantity: qty, subtotal: 0, error: 'insufficient_stock' }); continue; }
    const subtotal = addonLineSubtotal(def, qty, peopleCount);
    total += subtotal;
    lines.push({ addonId: def.id, quantity: qty, subtotal });
  }

  return { total, lines };
}
