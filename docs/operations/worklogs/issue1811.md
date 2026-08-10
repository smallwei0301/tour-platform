# issue1811 — 以 transaction 與 orders.total_twd 固化訂單可付款金額
> 最後更新：2026-08-10 11:20（Asia/Taipei）｜負責 session：Codex／2026-08-10

## 目標
讓基本 Booking、Order、Order item 與 `orders.total_twd` 在單一資料庫 transaction 內全有或全無，成功後以 commit 後重新讀取的持久化總額回應，失敗時不產生可付款或成功通知結果。

## AC 清單
- [ ] AC1 先以公開建立入口／runtime contract 建立真實 RED regression，再做 minimal GREEN；核心證據不是 source-string assertion。
- [ ] AC2 基本合法建立時 Booking、Order、Order item 與 `orders.total_twd` 同時存在且可核對，API 金額等於 commit 後 read-back。
- [ ] AC3 每個可測必要寫入失敗或 transaction 中斷均完整 rollback，不回 Order ID、付款連結或成功通知。
- [ ] AC4 client 提供的總額無法覆寫伺服器計算與持久化總額，Order item 可核對總和等於 `orders.total_twd`。
- [ ] AC5 留下可供 #1812–#1815 重用的 transaction／integration contract，且不提前實作其加購、點數或冪等責任。
- [ ] AC6 targeted、typecheck、完整 suite、isolated review 與 CI 結果均記錄實際 command／SHA；無 production side effect。

## 已完成（附證據）
- 2026-08-10 使用者以 operator 指示開始處理包含 #1810 的後續 open issues；live issue 查核確認 #1811 是 P1、`owner:ai-agent`、`agent:next`，且唯一前置條件為 Epic／規格查核。
- 2026-08-10 規格查核完成：#1810 已建立、#1811 scope／AC／out-of-scope／verification 完整，#1812–#1815 blocked-by 鏈存在；新分支 `agent/issue-1811-order-transaction` 已從合併 #1809 後的 `origin/main` (`a598ff06`) 建立。

## 下一步
- 對 live issue 留下 operator 解鎖與開工錨點，將 `status:blocked` 改為 `status:in-progress`。
- 盤點現行 V2 建單 call graph、Supabase RPC／migration 與 reusable test DB seam，先選定公開 TDD seam，再寫第一個 RED。

## 絕不重做（Do-NOT-redo）
- 不修改凍結的 legacy `/api/orders`／`/api/payments`、既有 migration、middleware、Auth、payment callback 或受保護 E2E。
- 不以 application 逐項補償刪除模擬 transaction；不信任 client total；不在 commit 前發送成功通知或形成付款入口。
- 不處理 #1812 加購、#1813 點數、#1814 Idempotency／併發或 #1815 release E2E 的專屬責任。
- 不套用 production migration、DML、資料修復或真實外部服務。

## P0-OVERRIDE 使用紀錄（如有）
- 無。
