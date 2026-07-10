-- Rollback for 20260710121345_pin_payment_callback_search_path.sql
-- 還原＝取消 search_path 固定（回到可變）。會讓 advisor WARN 0011 再度出現，實務不建議。
ALTER FUNCTION public.fn_process_payment_callback_atomic(uuid, text, text, jsonb, text, text)
  RESET search_path;
