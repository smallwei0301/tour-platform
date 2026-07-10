-- 固定 fn_process_payment_callback_atomic 的 search_path（修 advisor WARN function_search_path_mutable / 0011）
--
-- 背景：#1564（20260702170000）當初把所有 public 函式的 search_path 固定了，但 #1637
--   （20260706150000）為改 ECPay callback 邏輯 DROP+重建這支 6-arg 函式時未帶 SET search_path，
--   導致它回歸「可變 search_path」。這是 SECURITY DEFINER + 金流 callback 核心函式，
--   可變 search_path 有 search_path 注入/權限提升的疑慮（實際風險低但屬最佳實踐缺口）。
--
-- 修法＝與 #1564 對其他 21 支函式相同：pin search_path = pg_catalog, public, pg_temp。
--   **行為完全不變**（保留 public 於路徑，未 schema-qualify 的 public 物件解析與先前一致）；
--   只固定名稱解析、消除 advisor WARN。冪等（ALTER 可重跑）。簽章來自 live pg_proc 驗證：
--   fn_process_payment_callback_atomic(uuid, text, text, jsonb, text, text)。

ALTER FUNCTION public.fn_process_payment_callback_atomic(uuid, text, text, jsonb, text, text)
  SET search_path = pg_catalog, public, pg_temp;
