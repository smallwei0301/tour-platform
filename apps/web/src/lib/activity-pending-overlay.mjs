/**
 * 行程 pending overlay 純函式。
 *
 * 導遊的修改存放於 activities.pending_changes（JSONB），不直接覆蓋 live 欄位 ——
 * 已上架行程在送審期間照常顯示 live 內容（見計劃核心架構決策 #3）。
 *   - applyPendingOverlay：live + pending → 導遊編輯器看到的「進行中」內容。
 *   - buildPendingDiff：live vs pending 逐欄差異 → admin 審核頁的 diff。
 */

function deepEqual(a, b) {
  if (a === b) return true;
  if (a === null || b === null || a === undefined || b === undefined) return a === b;
  if (typeof a !== 'object' || typeof b !== 'object') return false;
  // 陣列/物件以 JSON 序列化做穩定深層比較（行程欄位皆為 JSON-safe 值）。
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}

/**
 * 把 pending_changes 疊在 live 物件上，回傳新物件（不可變，不修改 live）。
 * @param {Record<string, any>} live
 * @param {Record<string, any>|null|undefined} pending
 */
export function applyPendingOverlay(live, pending) {
  const base = { ...(live || {}) };
  if (!pending || typeof pending !== 'object') return base;
  for (const key of Object.keys(pending)) {
    base[key] = pending[key];
  }
  return base;
}

/**
 * 逐欄比較 live 與 pending，只回傳有差異的欄位。
 * @param {Record<string, any>} live
 * @param {Record<string, any>|null|undefined} pending
 * @returns {Array<{ field: string, before: any, after: any }>}
 */
export function buildPendingDiff(live, pending) {
  if (!pending || typeof pending !== 'object') return [];
  const out = [];
  const base = live || {};
  for (const key of Object.keys(pending)) {
    if (!deepEqual(base[key], pending[key])) {
      out.push({ field: key, before: base[key] ?? null, after: pending[key] });
    }
  }
  return out;
}
