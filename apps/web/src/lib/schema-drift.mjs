// Schema-drift 偵測：判斷某次查詢錯誤是否為「欄位尚未存在」。
// 用於 production 尚未套用較新欄位 migration 時的降級（剝除欄位後重試 / 退回 base select）。
//
// 涵蓋兩種來源：
//  - Postgres undefined_column（多見於 SELECT）：code '42703' / "column ... does not exist"
//  - PostgREST schema cache miss（多見於 INSERT/UPDATE）：code 'PGRST204' /
//    "Could not find the '<col>' column of '<table>' in the schema cache"

export function isMissingColumnError(err) {
  if (!err) return false;
  if (err.code === '42703' || err.code === 'PGRST204') return true;
  const m = err.message || '';
  return /column .* does not exist/i.test(m)
    || /could not find the .* column/i.test(m)
    || /schema cache/i.test(m);
}
