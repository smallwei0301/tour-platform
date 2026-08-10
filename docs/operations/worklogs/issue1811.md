# issue1811 — 以 transaction 與 orders.total_twd 固化訂單可付款金額
> 最後更新：2026-08-10 12:53（Asia/Taipei）｜負責 session：Codex／2026-08-10

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
- 2026-08-10 公開入口 RED 另立 commit `fb486f3f`：同一 hosted runtime 檔會啟動 local Next，實際呼叫 `POST /api/v2/bookings/draft`；在該 commit tree 中 migration 仍為空、route 仍是 sequential writer，因此竄改 total、late-write fault、公開 response／通知抑制與 commit-after nested PostgREST read-back 都會真實失敗，不是 GREEN 後補 source assertion。
- 2026-08-10 minimal GREEN 已完成：additive migration `20260810033421...sql` 新增 service-role-only `SECURITY INVOKER` RPC，在一個 statement transaction 內依序建立 order、booking、reciprocal link、base activity item、initial status log；server 由 active plan 取價，以 bigint 計算並拒絕 int4 overflow，RPC signature 完全沒有 client total。最終 migration SHA-256 為 `4fb09d6863a992c089be849198e13f85537a06f586797cb1ec159a8503372d5c`。
- 2026-08-10 route 已改走新的 `db-booking-order-materialization.mjs` gateway 與協調器：RPC resolve 後另做真 PostgREST nested read-back，核對 booking/order reciprocal IDs、activity/plan continuity、狀態、base item 數學與 persisted `orders.total_twd`；只有 read-back 成功才允許現有 extras seam、第二次 read-back、成功通知及 API ID/amount。基本路徑第二次仍 strict；只有實際產生 add-on／points 金額才暫時放寬，留給 #1812/#1813 收斂。
- 2026-08-10 runtime regression 已擴為五個 required DML seam（order insert、booking insert、order link update、item insert、status log insert）逐一 fault rollback，另以 advisory-lock blocking trigger＋`pg_cancel_backend` 驗證 transaction 中途取消；亦覆蓋 tampered request total、int4 overflow、guest／authenticated traveler FK/audit continuity，以及公開 HTTP fault 時 500 envelope 無 booking/order/payment ID、零持久化 aggregate、零成功 email seam log。所有 DDL/DML 均只允許 exact local `127.0.0.1:54322/postgres` runner。
- 2026-08-10 isolated SQL 與 JS 雙軸預審查完成：SQL transaction／ACL 無 blocker；審查提出的公開 route tracer、真 nested PostgREST execution、transaction cancellation、base-only final strict read-back、persisted activity/plan continuity、overflow、authenticated traveler、loopback guard均已補上。新 gateway **刻意沒有 in-memory writer fallback**：RPC/env 不可用時 fail closed，這是「不得退回非原子 writer」的 safety exception；unit contract 鎖 `BOOKING_DRAFT_RPC_NOT_DEPLOYED`。
- 2026-08-10 pinned Node `22.23.1` 本機證據：新 gateway／協調器＋受影響 route contracts `pass 46 / fail 0`；workflow contract `pass 5 / fail 0`；完整 `npm run typecheck` PASS；完整 `npm run lint` PASS（僅既有 `RootDocument.tsx` `<head>` warning，0 error）。Node 24 曾被 repo guard 拒絕，後續證據一律改用 pinned Node 22，未繞過 guard。
- 2026-08-10 production build：第一次在載入 bundle 前被 startup-env 正確擋下（缺本機 production-only guide/admin secrets）；改用 repo E2E 同型假值後，sandbox 在 build 的外部 network request 階段取消程序，未取得 bundle conclusion。未重複第三次，標記 `NOT_VERIFIED-local-build`；Node 22 typecheck/lint 與 hosted CI build 為最近替代證據。
- 2026-08-10 baseline bootstrap 已 append 第 24 支 post-cutoff migration，fresh history 24→25、existing rehearsal 151→152。Node 22 source contracts `pass 30 / fail 1`；唯一預期 failure 是 committed expected-terminal manifest 尚缺新 migration。四個 terminal artifact 必須由 hosted PG17 兩次 byte-identical build 整組 promotion，未手改或偽造。
- 2026-08-10 operator 明確回覆「授權推薦方案」：核准發布目前分支、建立 Draft PR 並同步 #1810／#1811 詳細里程碑，也核准原子 gateway 採 fail closed，RPC／必要環境不可用時不得退回非原子的 in-memory writer。授權不含 production migration apply、正式資料修改、部署、合併、真實付款或通知。
- 2026-08-10 發布前安全補強：GitHub App 拒絕重新發布 workflow 內既有的 plaintext CI session 假值，因此未繞過 guard，改為每次 hosted run 以 `randomBytes(32)` 產生、mask 並透過 `GITHUB_ENV` 傳遞 ephemeral secret；公開 route tracer 也改用 runtime random guide/admin secrets，且明確覆寫 Resend、Sentry、LINE、Telegram、ECPay 外部作用環境，避免 runner ambient env 造成真實通知／付款副作用。Workflow／gateway／協調器 focused tests `pass 9 / fail 0`、integration syntax、secret scan 與 `git diff --check` 均通過。
- 2026-08-10 依 migration apply ledger SOP 補上同名 `.rollback.sql`：必須另行 owner 授權並先部署不呼叫 RPC 的 app，只撤銷／移除 #1811 function，不修改任何業務資料；governance contract 已納入上述 9 項 focused tests。本輪未執行 rollback、production apply 或 ledger 更新。
- 2026-08-10 Draft PR #1818 初輪 hosted run：PG17 deterministic builder 2 runs 與 artifact upload 成功（transaction `4df58af5…`），anon RLS／secret scan 通過；#1811 runtime 在所有 product assertions 前由 fixture hook 失敗，log 為 `public.users_pkey` duplicate。根因是插入 `auth.users` 後 hosted baseline trigger 已建立同 ID 的 `public.users`，測試再直接 insert；已改為 `ON CONFLICT (id) DO UPDATE` 的 idempotent fixture，產品 RPC／route 未變。另將 workflow step name 的 `#1811` 加引號，避免 YAML 把後段當 comment。修正尚待下一輪 hosted runtime 證實；首輪 artifact 不先 promotion。
- 2026-08-10 Draft PR #1818 第二輪 hosted PG17 證實 fixture 修正與產品 contract：head `ef99b78d`、workflow run `31356708867` 的 `Run #1811 booking-order transaction PostgreSQL and PostgREST runtime contract` 為 success。deterministic builder 兩次輸出相同 transaction `4df58af57813c6a20ee875c4003cac369b8fe29f734c666a8680dcaf455285e9`；只採用該 run 的 artifact `9050902925`，ZIP SHA-256 `2b5e56366f12b6f2ae1dc9de8ab3af233dadbf897a07f83abf42d8da9a346201` 與 GitHub metadata 相符。
- 2026-08-10 expected-terminal 四件組已由 artifact 原樣 promotion，未手改 catalog／manifest／ledger。解壓前確認僅有四個普通檔案、無額外路徑／symlink；transaction verifier 確認 25 筆 history、末筆 `20260810033421`、manifest SHA-256 `e1bb3d427b5337bbee9834e54770f2c7f727b8ff5126f8175624851397044b7f`。promotion 後本機 `midao-expected-terminal-artifact.test.mjs` 為 `pass 4 / fail 0`，migration source contracts 為 `pass 34 / fail 0`，`check-migration-source-gate --mode source` 為 `verified`。尚待 promotion commit 的完整 hosted CI，不提前標 Ready。

## 下一步
- 提交並發布已驗證的 expected-terminal 四件組與本段證據，重跑 hosted full CI／build／baseline browser gates；全部通過且 isolated review 無 blocker 後才可把 Draft 標為 Ready for review。
- 外部發布與安全例外已獲明確授權；依受控 GitHub App 路徑發布 promotion commit，發布前後比對 commit/tree，不合併。
- 新 migration 使 production verified ledger fail closed；production apply／ledger 更新不在本票授權內，維持 HOLD，絕不把 expected-terminal manifest 偽裝成 production apply 證據。

## 絕不重做（Do-NOT-redo）
- 不修改凍結的 legacy `/api/orders`／`/api/payments`、既有 migration、middleware、Auth、payment callback 或受保護 E2E。
- 不以 application 逐項補償刪除模擬 transaction；不信任 client total；不在 commit 前發送成功通知或形成付款入口。
- 不處理 #1812 加購、#1813 點數、#1814 Idempotency／併發或 #1815 release E2E 的專屬責任。
- 不把 RPC 回傳或 route 記憶體中的 total 當 API／通知真值；RPC commit 後 read-back 失敗時 fail closed，接受已完整 materialize 的資料仍存在，重試去重由 #1814 承接。
- 不套用 production migration、DML、資料修復或真實外部服務。

## P0-OVERRIDE 使用紀錄（如有）
- 無。
