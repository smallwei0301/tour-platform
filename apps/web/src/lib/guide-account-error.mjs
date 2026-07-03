// admin 後台「編輯導遊帳號」PATCH 的錯誤分類（純函式，方便單測）。
//
// 為什麼需要它：Supabase JS 的寫入錯誤（PostgrestError）是**純物件**
// `{ message, code, details, hint }`，不是 `Error` 實例。route 之前用
// `err instanceof Error ? err.message : 'SERVER_ERROR'`，對 PostgrestError
// 一律落到字面 'SERVER_ERROR'：
//   1. 真正的 DB 訊息被丟掉（admin 只看到無用的 SERVER_ERROR）。
//   2. unique(guide_email) 衝突永遠無法被辨識成 EMAIL_TAKEN，
//      導致「Email 已被其他導遊使用」也顯示成 SERVER_ERROR。
//
// 這支同時吃 PostgrestError（用 Postgres error code 23505 判 unique）
// 與一般 Error，並保證對任何 falsy/非預期輸入都回穩定 shape、不拋例外。
export function classifyGuideAccountUpdateError(err) {
  const code = err && typeof err === 'object' && typeof err.code === 'string' ? err.code : '';
  const rawMessage =
    err && typeof err === 'object' && typeof err.message === 'string' ? err.message : '';
  const message = rawMessage || 'SERVER_ERROR';

  // 23505 = unique_violation（Postgres）；訊息比對為缺 code 時的後備。
  const isUniqueViolation = code === '23505' || /unique|duplicate/i.test(message);
  if (isUniqueViolation) {
    return { code: 'EMAIL_TAKEN', message: '此 Email 已被使用', status: 409 };
  }

  return { code: 'SERVER_ERROR', message, status: 500 };
}
