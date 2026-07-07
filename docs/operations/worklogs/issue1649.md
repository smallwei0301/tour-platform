# issue1649 — 訂單／退款／金流 v2 全面串接計劃（legacy 殘餘盤點與分階段遷移）
> 最後更新：2026-07-07（Asia/Taipei）｜負責 session：Fable 5／2026-07-07

## 目標
把訂單、退款、payouts、金流所有仍在 legacy 的介接面（Traveler／Admin／Guide／payments／internal）分六個 Phase 全面串接到 v2，計劃全文見 issue #1649。

## AC 清單（總綱層級；各 Phase 開子 issue 時再細化）
- [ ] Phase 1：訂單讀取面 v2 接線（詳情頁接既有 `GET /api/v2/orders/[orderId]`、新增 v2 訂單列表、POS 四支 v2 route 接 UI、清理 client-api.ts 死碼）
- [ ] Phase 2：Traveler 寫入面（cancel／refund-requests／reschedule／messages／payments 查詢）v2 化
- [ ] Phase 3：Admin 訂單維運＋退款鏈 v2 化（refund-execute 518 行搬遷、四段式審核、payouts 五支、三頁 UI 切換）
- [ ] Phase 4：Guide 端 v2 化（bookings/approval/payout monthly/messages/掃碼 UI）
- [ ] Phase 5：金流凍結區收斂（v2 ecpay callback、refund-callback、/order/pay 補付、ecpay/create 退役）——**owner P0-OVERRIDE 前置**
- [ ] Phase 6：internal 契約測試鎖定＋legacy routes 分批退役＋守門測試＋契約文件更新

## 已完成（附證據）
- 2026-07-07 四路唯讀掃描（Traveler／Admin／Guide+payments+internal／文件脈絡）完成，缺口清單以 file:line 落入 issue #1649（基準 main@a75f21ff）。
- 2026-07-07 開立 issue #1649（priority:P1／booking-v2／payments／traveler-booking／owner:mixed）。
- 2026-07-07 本 worklog＋計劃文件 `docs/04-tech/04-tech-architecture/17-order-refund-v2-migration-plan.md` 隨 PR 提交（docs-only；本 session hooks 未武裝，依 harness 00 §0 不觸碰生產碼）。

## 下一步
- owner 對 issue #1649 §D 三個決策點拍板（Phase 5 切換時點／internal 是否搬命名空間／promo-codes 與 LINE 端點歸屬）。
- 拍板後為 Phase 1 開子 issue，並在**hooks 武裝的 session**（repo 目錄內開機）開始實作。

## 絕不重做（Do-NOT-redo）
- 缺口盤點不必重掃：issue #1649 §A 的 file:line 清單即 2026-07-07 main@a75f21ff 快照；後續只需增量比對。
- `GET /api/v2/orders/[orderId]`、`GET /api/v2/bookings/[id]` 已存在且零消費者——Phase 1 直接接線，不要重寫 route。
- v2 POS 四支與 post-trip 三支已有 route＋回歸測試，缺的只是 admin UI 接線。
- ECPay callback 資料模型已 v2 化（`fn_process_payment_callback_atomic` 6-arg，#1637）；Phase 5 只搬路徑與 ReturnURL，不動 RPC 語意；改 RPC 一律 6-arg CREATE OR REPLACE（#1637 P0-2）。
- refund 鏈 db 函式續拆（#1613 遺留）併入 Phase 3，不另開工。

## P0-OVERRIDE 使用紀錄（如有）
- 尚無。Phase 5 開工前需 owner 於對話中回覆 `P0-OVERRIDE: apps/web/app/api/payments/...` 方可觸碰凍結區。
