-- 僅在所有 admission callers 已撤回／確認不再使用後執行。
-- 不刪 payment/history/event，不復原未知的 #59 index；未授權 Production apply。
BEGIN;
DROP FUNCTION public.fn_admit_initial_payment_attempt(uuid, text, text);
COMMIT;
