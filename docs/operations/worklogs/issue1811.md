# issue1811 — 以 transaction 與 orders.total_twd 固化訂單可付款金額
> 最後更新：2026-08-10 11:39（Asia/Taipei）｜負責 session：Codex／2026-08-10

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
- 2026-08-10 live issue 已完成 operator 解鎖：#1811 改為 `agent:now`／`status:in-progress`；#1812–#1815 維持 blocked，不提前施工。
- 2026-08-10 唯讀 call graph／schema／RLS 盤點確認根因：draft route 目前依序提交 booking、order、雙向 link、extras、order item、status log，且忽略多個 late-write error；最新 terminal grants／policy 則要求這些表由 service role 寫入。付款入口會重讀 `orders.total_twd`，因此半完成 order 已具實際付款風險。
- 2026-08-10 TDD seam 拍板為 `POST /api/v2/bookings/draft` 背後的真 PG17/PostgREST transaction contract，加上可注入通知 seam；核心證據鎖 DB authoritative base price、service-role-only ACL、late-write fault rollback 與 commit 後 read-back，不以 source regex 代替。
- 2026-08-10 以 workflow 同版 Supabase CLI `2.87.2` 執行 `supabase migration new issue1811_atomic_booking_order_materialization`，產生 `20260810033421_issue1811_atomic_booking_order_materialization.sql`；未手填 timestamp、未連線或套用 production。空 migration 加入後，`midao-expected-terminal-artifact.test.mjs` 如預期先 RED（manifest 尚缺新 migration）。
- 2026-08-10 RPC contract 拍板：`public.fn_create_booking_draft_atomic` 為 15-arg `SECURITY INVOKER`／固定 `search_path=pg_catalog`／service-role-only；簽章沒有 total，activity、guide、title、booking type、approval 與 base total 全由 active plan＋activity 在 transaction 內派生。status log 屬 required transaction write。
- 2026-08-10 incremental scope 決策：#1811 只把基本 booking/order/activity item/status log 固化為同一交易；既有 extras/points 仍在 commit 後執行，但必須先讀回基本持久化金額，最終 API／通知再讀回 `orders.total_twd`。其原子化分別由 #1812／#1813 接續，worklog 與 PR 不宣稱本票已涵蓋 extras/points。
- 2026-08-10 RED（本機）：`node --test apps/web/tests/unit/issue1811-booking-order-materialization.test.mjs` → `pass 0 / fail 1`，`ERR_MODULE_NOT_FOUND`，證明 atomic → read-back → extras → final read-back → notify 協調器尚不存在；測試同時鎖任一 DB/read-back 失敗時 notify=0。
- 2026-08-10 RED（本機 baseline freshness）：`node --test apps/web/tests/unit/midao-expected-terminal-artifact.test.mjs` → `pass 3 / fail 1`，明確指出 expected-terminal manifest 缺 `20260810033421...sql`。真 PG17/PostgREST 行為測試已通過 `node --check` 與 runner path parser，但本機無 Docker；workflow 已接到 artifact diff gate 前，待 Draft PR 留下 hosted RED。
- 2026-08-10 workflow 接線 contract：`node --test apps/web/tests/unit/midao-e2e-ci-workflow.test.mjs` → `pass 5 / fail 0`。

## 下一步
- 完成 behavior RED 測試並以 hosted PG17/PostgREST 留下函式尚不存在／late-write 未 rollback 的失敗證據。
- 只做讓該 RED 轉綠的 additive RPC、service-role gateway、commit 後 read-back 與 route 最小接線；再刷新 expected-terminal artifacts。

## 絕不重做（Do-NOT-redo）
- 不修改凍結的 legacy `/api/orders`／`/api/payments`、既有 migration、middleware、Auth、payment callback 或受保護 E2E。
- 不以 application 逐項補償刪除模擬 transaction；不信任 client total；不在 commit 前發送成功通知或形成付款入口。
- 不處理 #1812 加購、#1813 點數、#1814 Idempotency／併發或 #1815 release E2E 的專屬責任。
- 不把 RPC 回傳或 route 記憶體中的 total 當 API／通知真值；RPC commit 後 read-back 失敗時 fail closed，接受已完整 materialize 的資料仍存在，重試去重由 #1814 承接。
- 不套用 production migration、DML、資料修復或真實外部服務。

## P0-OVERRIDE 使用紀錄（如有）
- 無。
