// 通用「部署順序安全」缺欄位 fallback（#1493 follow-up）。
//
// 當「程式已部署、但對應 migration 還沒套到正式 DB」時，對新欄位的 insert/select
// 會以「column ... does not exist」失敗，連帶把核心流程（下單、訂單列表）整個打掛。
// 這裡提供把**已知可選欄位**在缺漏時優雅剝除/降級的工具——只動 allowlist 內的欄位，
// 絕不剝除必要欄位（真的壞掉仍會浮現）。migration 套用後行為完全不變。
//
// 與 activity-plans-insert-fallback.mjs 的差別：那支只認 activity_plans 的 rich 欄位；
// 這支是給任意表的「部署 lag 可選欄位」用（例如 orders.payment_deadline_at）。

import { extractMissingColumn } from './activity-plans-insert-fallback.mjs';

/**
 * 重試 insert/upsert，缺欄位若在 allowlist 內就剝除再試。
 * @param {(payload:object)=>any} runOperation 回傳 Supabase 查詢（thenable）或 Promise
 * @param {object} payload
 * @param {Iterable<string>} optionalColumns 允許在缺漏時剝除的欄位
 */
export async function applyWithOptionalColumnFallback(runOperation, payload, optionalColumns, options = {}) {
  const maxRetries = options.maxRetries ?? 10;
  const optional = new Set(optionalColumns);
  const droppedColumns = [];
  let attempt = { ...payload };

  for (let i = 0; i <= maxRetries; i++) {
    const { data, error } = await runOperation(attempt);
    if (!error) return { data, error: null, droppedColumns };
    const missing = extractMissingColumn(error);
    if (!missing || !(missing in attempt) || !optional.has(missing)) {
      return { data: null, error, droppedColumns };
    }
    droppedColumns.push(missing);
    delete attempt[missing];
  }
  return {
    data: null,
    error: { code: 'SCHEMA_MISMATCH', message: 'optional-column insert fallback exhausted' },
    droppedColumns,
  };
}

/**
 * 依序嘗試多組 select 字串，遇「缺欄位」就退到下一組；非缺欄位錯誤直接回傳。
 * @param {(select:string)=>any} runSelect 回傳 Supabase 查詢（thenable）或 Promise
 * @param {string[]} selectVariants 由「最完整」到「最精簡」排序
 */
export async function selectWithOptionalColumnFallback(runSelect, selectVariants) {
  let lastError = null;
  for (const select of selectVariants) {
    const { data, error } = await runSelect(select);
    if (!error) return { data, error: null, usedSelect: select };
    if (!extractMissingColumn(error)) return { data: null, error, usedSelect: select };
    lastError = error;
  }
  return { data: null, error: lastError, usedSelect: selectVariants[selectVariants.length - 1] };
}
