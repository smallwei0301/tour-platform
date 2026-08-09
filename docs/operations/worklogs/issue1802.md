# issue1802 — 修復 /order/pay 付款路徑缺少旅客確認閘門
> 最後更新：2026-08-09 19:33 Asia/Taipei｜負責 session：Fiora／Kanban t_60772d3c

## 目標
讓既有 `/order/pay?orderId=` → `POST /api/v2/payments/ecpay/create` 付款路徑，對 LINE 詢問單轉換且 `traveler_confirmation_status='pending'` 的 booking 回傳明確 409 閘門錯誤；已確認或非 LINE 詢問單維持既有付款行為。

## AC 清單
- [x] pending + source inquiry booking 經 ECPay create 被擋下，回傳 `TRAVELER_CONFIRMATION_REQUIRED` 與 409。
- [x] confirmed 或非 inquiry booking 不受影響，回歸判斷放行。
- [x] 新增 route wiring／決策回歸測試並通過。
- [x] `timeout 180s npx -y node@22 --test tests/api/issue1802-ecpay-traveler-confirmation-gate.test.mjs tests/api/midao-checkout-confirmation-gate.test.mjs tests/api/issue652-ecpay-create-on-conflict.test.mjs`：28/28 pass。
- [x] `yarn run typecheck`：exit 0（12.85s）。
- [x] `npx -y node@22 "$(command -v yarn)" run lint`：exit 0；1 個既有 warning（`src/components/layout/RootDocument.tsx:36`），0 errors。
- [x] `timeout 300s npx tsc --noEmit`：exit 0。

## 已完成（附證據）
- 2026-08-09：確認專用 worktree `/root/.openclaw/workspace/worktrees/tour-platform/gh1802-payment-gate`，branch `fix/gh1802-order-pay-confirmation-gate`；清除前次嘗試留下的 `yarn.lock` 生成差異，現在只剩本卡 route/test/worklog 異動。
- 2026-08-09：確認 `/api/v2/payments/ecpay/create` 僅 re-export `app/api/payments/ecpay/create/route.ts`；因此閘門接在 legacy handler 即覆蓋 `/order/pay` 實際呼叫路徑。
- 2026-08-09：在原始 route 上執行 regression test 得 3 pass / 3 fail（route wiring/409 三項 RED）；補上 route gate 後 focused 三檔測試 28/28 pass。
- 2026-08-09：gate 位於 `pending_payment` 狀態檢查之後、ECPay credentials 與 `upsertEcpayPaymentAttemptDb` 之前；Supabase 路徑依 `order_id` 讀取 `source_inquiry_id`／`traveler_confirmation_status`，共用 `canCheckoutTravelerConfirmation`，拒絕時回傳 409。

## 下一步
- 交 `tp-reviewer`（Rita）獨立審查，不自我核准；本 session 不 commit、push、merge。

## 絕不重做（Do-NOT-redo）
- 不修改 checkout route、schema/migration、confirmation 狀態機或 `/order/pay` URL 問題；本卡只補 ECPay create payment boundary。
- 不修改 `yarn.lock`、不執行 production SQL、real payment、push、merge、GitHub issue comment/close。

## P0-OVERRIDE 使用紀錄（如有）
- 無；本卡為 P1 payment gate，未取得 P0-OVERRIDE。
