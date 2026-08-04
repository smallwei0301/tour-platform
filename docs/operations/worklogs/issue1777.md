# issue1777 — [Payments][P0] 修正結算／部分退款／出款非原子鏈，避免漏帳、重扣與錯誤撥款

> 最後更新：2026-07-29 22:30 Asia/Taipei｜負責 session：claude-fable-5／2026-07-29
> 本輪範圍：查核 → 計劃 → Phase 1–4 實作 → migration 套用並驗證 → PR #1778/#1779 merged → AC 11/11 sign-off。**DML 仍未授權**：未執行任何資料寫入、未動真實出款/退款。剩餘：端到端全鏈驗證、fresh independent review。

## 目標

把已分別修好的 payment／refund／settlement／payout 接成一條可重跑、可對帳、任何一步失敗都不會只寫一半的財務鏈；本輪先完成現況查核與分期修改計劃。

## 查核基準

- 分支：`claude/1777-check-modify-plan-ylztm1`
- repo commit：`0e8c7823881e71570cac46955f4145696ae15656`（與 issue #1777 指定基準一致）
- 查核方式：逐檔 read + grep 現碼比對 issue 所列四個缺口；**未執行任何 production 查詢或 DML**

## AC 清單（本輪 worklog 自身的驗收）

- [x] AC1 issue #1777 所列四個未完成缺口，逐一以現碼證據（檔案:行號）確認成立或推翻
- [x] AC2 產出分期修改計劃，對齊 owner 已拍板的決策 A～D
- [x] AC3 明確標示 production 授權邊界（本輪與後續皆未取得 production 寫入授權）
- [x] AC4 worklog commit／push，並同步進度錨點留言至 issue #1777（分支：#1778 merged 後改用 follow-up 分支，因 merged PR 不可重用且鐵律 10 禁 force-push）

---

## 一、檢查結果：四個缺口全部屬實

### 缺口 1 — dispute／safety hold 未投影進正式結算 ✅ 屬實

| 項目 | 證據 |
|---|---|
| sweep 未取兩欄 | `apps/web/app/api/internal/settlement/sweep/route.ts:103` — select 只投影 `operations_tracking(refund_amount_twd, has_complaint, has_oversell_issue)` |
| 欄位早已存在 | `supabase/migrations/20260618_operations_tracking_dispute_safety_flags.sql`（含同名 `.rollback.sql`） |
| hold gate 本身支援四旗標 | `apps/web/src/lib/settlement-config.ts:234-241` — `computeSweepPayoutItem` 已把 `is_disputed`／`is_safety_case` 傳進 `isPayoutOnHold` |
| 導遊端讀滿四旗標 | `apps/web/src/lib/settlement-config.ts:177-183` — `computeGuidePayoutEstimate` 讀 `is_disputed`／`is_safety_case` |

**失效機制**：hold gate 有能力擋，但 sweep 沒把兩欄餵進來，`opsTracking?.is_disputed === true` 在 `undefined` 下恆為 false，dispute／safety hold **從未觸發**。結果是導遊 dashboard 顯示 `payment_dispute`／`safety_review` hold、實際 sweep 仍照常入帳，跨介面語意不一致。

**stale test**：`apps/web/tests/api/issue1106-settlement-sweep-hold-projection.test.mjs:70-75` 反向斷言「sweep route 不得 select `is_disputed`／`is_safety_case`」，理由寫在該檔 `:19-20`「those are not schema columns」——此假設在 20260618 migration 之後已過期，因此**錯誤行為仍可測試全綠**。該測試同時是 source-string 測試（以 regex 比對 route 原始碼字串，`:36-43`），正好落在 issue 要求改善的「測試不可只驗 source string」範圍。

### 缺口 2 — 已結算後再部分退款，會把原結算整筆全額紅沖 ✅ 屬實

| 項目 | 證據 |
|---|---|
| 固定全額反轉 | `apps/web/src/lib/db.mjs:4613-4622` — `recordRefundReversalDb` 以原 settlement 的 `-gmv_twd／-commission_twd／-net_twd` 建 reversal 列，完全不看本次退款金額 |
| 冪等鍵只容一正一反 | `db.mjs:4626` upsert `onConflict: 'order_id,settlement_kind'`；`settlement_kind` 只有 `settlement`／`reversal` 兩值 |
| sweep 不會重建剩餘應付 | `sweep/route.ts:72-81, 114` — 先撈全部 `payout_items.order_id` 成 Set，任何已有 payout item 的訂單直接排除 |
| 呼叫端 | `apps/web/app/api/v2/admin/orders/[orderId]/refund-execute/route.ts:172, 352, 466` |

**失效機制**：#1474 已把退款金額寫進 `operations_tracking.refund_amount_twd`（`refund-execute/route.ts:71, 77`），但那只影響**尚未結算**訂單的 effective GMV 計算；**已結算**訂單走的是全額紅沖路徑，導遊剩餘應收被截成 0，而非 owner 決策 B 的 `max(0, 總額 − 累積退款) × 分潤率`。多次部分退款更沒有可靠模型——第二次退款會因 `(order_id, 'reversal')` 已存在而被 `ignoreDuplicates` 吃掉。

### 缺口 3 — settlement 寫入不是單一交易 ✅ 屬實

| 項目 | 證據 |
|---|---|
| sweep route 兩段式 | `sweep/route.ts:187-194`（upsert payout_items）→ `:196-221`（逐 guide fetch balance → 加 delta → upsert） |
| gateway 同型 | `apps/web/src/lib/db-settlement-ops.mjs:86-120` — `recordSettlementDb` 相同的 read-modify-write |

**失效機制**：payout item 成功、balance 更新失敗時，重跑會因 `sweep/route.ts:114` 的「已有 payout item 就排除」而永久跳過該訂單 → **餘額永久漏加**。且 `guide_balances` 是以 JS 讀出後回寫整個 `balance_twd`（非 SQL 層 `balance = balance + delta`），sweep × 紅沖 × payout confirm 併發時必然 lost update。

### 缺口 4 — 確認出款不是單一交易 ✅ 屬實

| 項目 | 證據 |
|---|---|
| 三段獨立呼叫 | `apps/web/src/lib/db-payouts.mjs:77-83`（扣 balance）→ `:85-97`（pending→paid）→ `:99-113`（audit log） |
| 餘額不足被靜默吞掉 | `db-payouts.mjs:75` — `Math.max(0, (balance?.balance_twd ?? 0) - payout.total_twd)`，餘額不足時截成 0 而非拒絕 |
| 呼叫端 | `apps/web/app/api/v2/admin/payouts/[payoutId]/confirm/route.ts:27-31`（v2 命名空間，不在凍結區） |

**失效機制**：扣款成功但 payout update 失敗時，payout 仍是 `pending`，餘額卻已被扣；重試會**再扣一次**。audit log 位於最後，失敗時前兩步已生效且無紀錄。

### 缺口 5 — 歷史 production 資料（#1647 追蹤）

本輪**未重驗**舊 snapshot 數字（14 筆 paid 卡單、未實收 NT$6,120、過期 pending payout NT$7,168）——issue 明訂「必須先重新 read-only preview，不能直接用舊 snapshot 執行 DML」，而本輪未取得也未使用任何 production 查詢。列入 Phase 4 待辦。

### 補充觀察（issue 未列，但同源）

- **`getUnsettledOrdersDb` 是死碼且內含壞子查詢**：`apps/web/src/lib/db-settlement-ops.mjs:62-76` 仍在用 `.not('id', 'in', supabase.from('payout_items').select('order_id'))`——正是 #1365 在 sweep route 修掉的 PostgREST 不支援子查詢寫法（`sweep/route.ts:64-71` 有完整註解）。grep 全 repo 確認**無任何生產呼叫端**（只有 `db.mjs:1611` re-export 與三個 source-string 測試引用），與既有稽核報告 P2 結論一致。Phase 2 收斂 writer 時應刪除或明確標記，避免日後誤接回造成 500 與錯誤結算。
- **`recordRefundReversalDb` 仍留在 `db.mjs`**：`db.mjs:4555` 起約 200 行。`confirmPayoutDb`／`cancelPayoutDb`／`createPayoutDb` 已搬至 `db-payouts.mjs`（`db.mjs:4553` re-export 維持匯入路徑）。依 strangler 硬規則（#1385／#1570），Phase 3 改寫時應落新領域檔而非原地擴充——`db.mjs` 有行數天花板 guard，只能降不能升。
- **commission／net 各自 `Math.floor`，殘差歸平台**：`settlement-config.ts:243-244`。這是 by-design（既有稽核報告 P2 已註明「對帳時 `gmv ≠ commission + net` 屬預期」）。Phase 3 計算差額 adjustment 與 Phase 4 對帳時**必須沿用同一 floor 語意**，否則會產出假差異告警。

### 與既有稽核報告的交叉印證

`docs/operations/qa-reports/payment-payout-chain-audit-20260706.md`（#1637 稽核，2026-07-06，repo SHA `8f376f6`，含生產唯讀查證）已獨立記錄本次四缺口中的兩項，可直接引用不必重查：

| 本次缺口 | 該報告對應條目 |
|---|---|
| 缺口 3（settlement 非原子） | §2.3 P2「`guide_balances` 為 read-modify-write 非原子（sweep vs confirm 並發 lost-update 風險）」 |
| 缺口 4（confirm 非原子／靜默截斷） | §2.3 P1-5「confirm 只扣舊快照（`db-payouts.mjs:75` `Math.max(0,...)` 靜默吞差額）」 |

該報告另提供本計劃需要的兩項事實：

- **sweep 排程來源**：GitHub Actions cron，每日 02:00 UTC（§2.3）。這是 Phase 2 部署順序硬規則的依據——sweep 會自動執行，migration 未套用前不得 merge 呼叫端切換。
- **#1647 歷史數字出處**：§3 生產快照（2026-07-06 唯讀）——14 筆 `paid` 零結算、`guide_balances` NT$21,814（內含 P1-4 未實收的 NT$6,120）、1 筆 pending payout NT$7,168（2026-06-11 懸置）。**此為 2026-07-06 快照，Phase 4 執行前必須重新 read-only preview，不得沿用。**

---

## 二、修改計劃（供後續指定 agent 執行；本輪不實作）

### 共通約束（每個 phase 都適用）

- 新的資料存取函式**一律開領域檔**，禁止寫進 `db.mjs`（strangler 硬規則；CI 有 `tests/unit/db-mjs-size-guard.test.mjs` 行數天花板）。
- migration **只增不改**，時間戳命名＋同名 `.rollback.sql`；schema 變更走 migration 檔 → PR → CI 綠燈 → `SQL-OVERRIDE` 授權 → 補 ledger（`docs/operations/migration-apply-ledger-sop.md`）。
- 改 gateway 函式必須同步 in-memory fallback＋契約測試（harness/07 §3）。
- 每次 commit 觸碰程式碼前 `.claude/hooks/run-checks.sh <targeted tests>` 綠燈，worklog 記 exact command 與 pass/fail/skip 數。
- 新 API 一律落 `app/api/v2/**`；`app/api/{orders,payments}/**` 等凍結區碰都不碰。

### Phase 1 — 先封住錯誤出款（純程式碼，無 migration，可最先出 PR）

1. **RED**：新增 `apps/web/tests/api/issue1777-dispute-safety-hold-projection.test.mjs`——**行為測試**（mock supabase client 餵一筆 `is_disputed: true` 的 completed 訂單），斷言不產生 payout item、不產生 balance delta。現行程式應為紅。
2. 修 `sweep/route.ts:103` 的 select 加入 `is_disputed, is_safety_case`，並同步擴充 `:132-135` 的 `Order` type。`computeSweepPayoutItem` **不需改動**（已支援四旗標）。
3. 改寫 stale test `issue1106-settlement-sweep-hold-projection.test.mjs:70-75`：反轉斷言為「必須投影兩欄」，並補一條**跨介面對齊契約測試**——同一組 opsTracking 輸入下，`computeGuidePayoutEstimate` 判定 hold ⇔ `computeSweepPayoutItem` 回 null。這條契約直接對應 AC「guide 顯示 hold 時，實際 sweep 也不得入帳」。
4. **payout confirm fail-closed guard**（決策 A，維持 HOLD）：在 `app/api/v2/admin/payouts/[payoutId]/confirm/route.ts` 前段加 gate。建議沿用既有 `apps/web/src/lib/cron-job-controls.mjs` 的 admin kill-switch 模式（新增 job key，預設 disabled），未明確開啟時回 503＋明確錯誤碼，避免另造一套開關。

### Phase 2 — 原子 settlement 與 payout confirm（migration＋RPC；決策 C）

1. **新 migration**（時間戳＋rollback，範式參照 `supabase/migrations/20260706150000_issue1637_callback_rpc_unify_auto_confirm.sql` 的 plpgsql 原子 RPC；`search_path` pin 參照 `20260710121345_pin_payment_callback_search_path.sql`）：
   - `fn_record_settlement_atomic(...)`：交易內 `SELECT … FOR UPDATE` 鎖 → eligibility recheck（四 hold 旗標＋`paid_at`＋T+N）→ insert `payout_items` → `guide_balances` delta（SQL 層加減，非 read-modify-write），同成同敗。重跑時若 payout item 已存在但 balance 與 ledger sum 不符，**做修復而非跳過**——直接對應 AC「不得因已有 payout item 而永久漏加 balance」。
   - `fn_confirm_payout_atomic(p_payout_id, p_confirmed_by, p_transfer_ref)`：鎖 payout row → 驗 `state='pending'` → 扣 balance（**餘額不足 RAISE EXCEPTION，不得 `max(0)` 靜默截斷**）→ `pending→paid` ＋ `confirmed_at`／`transfer_ref` → audit insert，全部單一交易。重送同一 payout 回「already paid」且不重扣。
2. **新領域檔** `apps/web/src/lib/db-settlement-atomic.mjs`：RPC wrapper ＋ `hasSupabaseEnv()` in-memory fallback 同步實作 ＋ 契約測試。
3. **切換呼叫端**：`sweep/route.ts`、`payouts/[payoutId]/confirm/route.ts` 改走 RPC。
   **部署順序硬規則**：migration PR 先行、經 `SQL-OVERRIDE` 授權套用並補 ledger 後，才 merge 呼叫端切換 PR——否則 production 會呼叫不存在的 RPC。payout confirm 因 Phase 1 已 HOLD 無風險；**sweep 由 GitHub Actions cron 每日 02:00 UTC 自動執行，必須嚴格遵守順序**，否則隔日排程即整批 500。
4. **RED**（先行）：fault-injection 測試——mock client 令 balance 步驟失敗，證明現行 split-brain（缺口 3）；令 payout update 失敗，證明現行可重扣（缺口 4）。GREEN 後同組測試改驗 RPC 版的原子性與冪等重送。

### Phase 3 — 正確的退款 adjustment（決策 B）

1. **新 migration**：讓 `payout_items` 支援多筆差額列——新增 `settlement_kind='refund_adjustment'` 與 `refund_event_id`（或等價 idempotency key）欄位；唯一鍵改為部分索引：`(order_id, settlement_kind)` 僅約束 `settlement`／`reversal`，adjustment 改以 `(order_id, refund_event_id)` 唯一。
2. **`fn_apply_refund_adjustment_atomic`**：以退款事件為冪等鍵。交易內計算目標最終淨應付 `max(0, total − 累積退款) × active rate`，與該訂單 ledger 現值比較，**只追加本次差額列**＋對應 balance delta。全額退款 → 最終淨應付歸 0；若該筆已實際出款 → 建立可追蹤的 carry-forward 列（AC 明訂「不得靜默截成 0」）。
   **整數規則必須在 SQL 端對齊 `settlement-config.ts:243-244`**：commission 與 net 各自 `Math.floor`、殘差歸平台，因此 `gmv ≠ commission + net` 是預期而非錯誤。差額 = 目標值 − ledger 現值，兩端都要用同一套 floor 語意計算，否則多次部分退款會累積捨入漂移。
3. `refund-execute/route.ts` 改呼叫 adjustment RPC，取代現行全額紅沖路徑。`recordRefundReversalDb` 的去留（保留相容或標 deprecated）由該 PR 的 review 決定；若保留，須確保不再被生產路徑呼叫。
4. **RED**（先行）：post-settlement 部分退款測試，證明現行整筆紅沖且不重建剩餘應付。**GREEN 需覆蓋四情境並得到同一最終淨應付**：結算前退款／結算後部分退款／結算後全額退款／退款重送。

### Phase 4 — 對帳與歷史修復 proposal（read-only）

1. **Privacy-safe 對帳報告**：可掛入既有 `apps/web/src/lib/accounting/db-report.mjs`（#1637 月結報表已在此），逐 guide 比對 ledger sum（`payout_items` 各 kind 淨和）vs `guide_balances` vs pending／paid `payouts` vs `refund_amount_twd` 推得的有效金額，輸出差異清單與待人工處理項，供 admin monthly report 呈現。
2. **#1647 三項歷史資料**：production **read-only** preview script（只輸出彙總或遮罩識別碼）＋逐項 DML proposal（影響筆數、rollback／compensation path）。
   - 14 筆舊 paid 卡單：只處理 provider 已收款、行程資料完整、狀態轉移合法者。
   - 未實收 NT$6,120：原則沖銷；若已實際付出則改 carry-forward 回收並留會計理由。
   - 過期 pending payout NT$7,168：先完成餘額對帳 → cancel 舊快照 → 依正確餘額重產。
   **執行需 owner 逐次另行明確授權，本計劃不含執行。**

### 驗證方式（每 phase 皆同）

- 指令：`.claude/hooks/run-checks.sh apps/web/tests/api/issue1777-*.test.mjs <所觸碰的既有測試>`（必要時加 `--typecheck`），worklog 記 exact command 與 pass/fail/skip 數。
- TDD：每個缺口先 RED（證明現行錯誤行為）再 GREEN；migration 附 fresh-install schema test ＋ rollback test。
- 真 ECPay staging 不可自動化者標 `NOT_AUTOMATABLE-env`，並保留最接近的 reusable contract／integration test；不得以 manual-only 取代核心金額測試。
- 每 phase 獨立 PR → CI conclusion=success（連結記入本 worklog）→ 獨立 finance-integrity review（檢查：安全、帳務不變量、migration 可回滾、測試非 source-string-only）。

---

## 三、授權邊界（引用 issue #1777 owner 留言，2026-07-29）

**已授權**：issue／spec refinement、程式與 migration／rollback proposal、TDD RED→GREEN、staging／fixture／production-equivalent 驗證、production **read-only** preview 與 privacy-safe evidence、建立 PR（不得自行 merge）。

**尚未授權**：production migration apply、production DML／backfill／balance adjustment、真實 refund、真實 payout confirm／cancel／regenerate，以及任何會改動真實訂單、付款、退款、結算、導遊餘額或出款單的操作。上述皆須逐次提出 preview、影響範圍、rollback／compensation plan，取得 owner 另行明確授權。

## 已完成（附證據）

- 2026-07-29 完成四缺口現碼查核（基準 commit `0e8c7823881e71570cac46955f4145696ae15656`），四項全部屬實，證據見上表；另補兩項同源觀察（`getUnsettledOrdersDb` PostgREST 子查詢寫法、`recordRefundReversalDb` 仍在 `db.mjs`）。
- 2026-07-29 產出四階段修改計劃，對齊 owner 決策 A～D。
- 本輪**未修改任何程式碼、未執行任何 production 查詢或 DML、未跑測試**（無程式碼異動，故無 run-checks 證據需求）。
- 2026-07-29 worklog commit `acb6f9e` push 至 `claude/1777-check-modify-plan-ylztm1`；進度錨點留言同步至 issue：<https://github.com/smallwei0301/tour-platform/issues/1777#issuecomment-5114307673>（鐵律 7 雙寫完成）。未開 PR。

## Phase 1 執行紀錄（2026-07-29，owner 於對話中指示「開始執行程式碼修改」）

### 異動清單

| 檔案 | 變更 |
|---|---|
| `apps/web/app/api/internal/settlement/sweep/route.ts` | select 補 `is_disputed, is_safety_case`；抽出 `OpsTrackingRow` 型別並註明四旗標須與導遊端一致 |
| `apps/web/src/lib/payout-confirm-guard.mjs`（新增） | fail-closed 出款開關；預設擋，僅 `PAYOUT_CONFIRM_ENABLED` 精確為 `"true"` 放行 |
| `apps/web/app/api/v2/admin/payouts/[payoutId]/confirm/route.ts` | HOLD gate 置於 route 最前，早於 Supabase client 建立與 `confirmPayoutDb`；HOLD 回 503＋`PAYOUT_CONFIRM_ON_HOLD` |
| `apps/web/tests/api/issue1777-dispute-safety-hold-projection.test.mjs`（新增） | 12 條：投影→資料形狀→結算行為的因果鏈＋7 情境跨介面對齊契約 |
| `apps/web/tests/api/issue1777-payout-confirm-fail-closed.test.mjs`（新增） | 9 條：guard 行為 6 條＋route 順序契約 3 條 |
| `apps/web/tests/api/issue1106-settlement-sweep-hold-projection.test.mjs` | 反轉過期反向斷言（原「不得 select 兩欄」→「必須 select」），並更新 scope note |

### RED → GREEN 證據

- **RED**：`issue1777-dispute-safety-hold-projection` 12 tests／**4 fail**（`is_disputed`、`is_safety_case` 兩條＋對應的跨介面對齊兩條）；`issue1777-payout-confirm-fail-closed` 7 tests／**7 fail**（guard 模組不存在）。
- **GREEN**：`.claude/hooks/run-checks.sh --typecheck`（10 檔）→ **180/180 pass、0 fail、0 skip**，`tsc --noEmit` 通過。
- 擴大迴歸（含 `issue1365-*`）**273/273 綠**。
- commit `464483d`，已推送。

### 計劃執行中的一項修正

計劃原寫「建議沿用既有 `cron-job-controls.mjs` kill-switch 模式」，實作時發現**不可行**：`isCronJobEnabled`（`cron-job-controls.mjs:127-130`）是**刻意 fail-open**（「排程連續性優先於後台可用性」），語意與金流出款所需的 fail-closed 完全相反；且 payout confirm 是 admin 手動 API 而非排程 job，登記進 `CRON_JOBS` registry 會讓後台排程清單出現不存在的工作。故改為獨立的 `payout-confirm-guard.mjs`，env-based、無 migration、預設擋下。

### 測試誠實度說明

- hold 投影測試**刻意不做 source-string 斷言**：從 sweep route 解析實際投影欄位清單 → 據此裁切出 PostgREST 真實回傳形狀（未投影欄位即 `undefined`）→ 斷言最終結算行為。投影漏欄會讓行為斷言自然轉紅。
- confirm route **無法在 `node --test` 內實際執行**（route.ts 使用 extensionless TS import，Node ESM 解析不了，需 Next bundler——這也是 repo 內既有 route 契約測試一律走原始碼分析的原因）。標 `NOT_AUTOMATABLE-env`，改鎖「guard 早於 `createClient` 與 `confirmPayoutDb`」的順序契約；核心判定邏輯已由 6 條行為測試覆蓋。

### Phase 1 對應的 AC 進度

- [x] settlement sweep 的 dispute／safety hold 與 guide dashboard／JSON／CSV 完全一致（7 情境對齊契約鎖住）
- [x] completed＋paid_at＋T+7 但任一 hold=true 的訂單，不得建立 settlement 或增加 balance
- [x] payout confirm fail-closed guard（production 維持 HOLD）
- 其餘 AC 屬 Phase 2–4 範圍，未動。

## Phase 2–4 執行紀錄（2026-07-29，owner 指示「進入 Phase 2，完成所有 phase 再開 PR」）

### Phase 2 — 原子 settlement 與 payout confirm（commit `61be654`）

| 檔案 | 變更 |
|---|---|
| `supabase/migrations/20260729160000_issue1777_atomic_settlement_and_payout_confirm.sql`（＋rollback） | `fn_record_settlement_atomic`、`fn_confirm_payout_atomic` |
| `apps/web/src/lib/settlement/db-settlement-atomic.mjs`（新增） | RPC wrapper，唯一 writer；RPC 缺席時 fail-closed |
| `sweep/route.ts`、`payouts/[payoutId]/confirm/route.ts` | 改走 RPC，移除所有 read-modify-write |

關鍵設計：
- **冪等以 ledger 為準**：`INSERT … ON CONFLICT DO NOTHING RETURNING`，只有真正插入新分錄才動餘額，重跑不重複累加。
- **餘額以 SQL 層增減**（`balance_twd + delta`），不再整列覆寫 → 消除 lost update。
- **交易內重驗資格**（completed／已實收／四個 hold 旗標／未全額退款）：JS 讀取後才被標記爭議的訂單會落在 `rejected` 而非入帳。
- **餘額不足 RAISE**，不再 `Math.max(0, …)` 靜默截斷。
- T+N 時間閘門仍由呼叫端計算（需要 booking／schedule 的 start_at 回退邏輯，且不會秒級反轉；在 SQL 重複實作反而有分歧風險）——已在 migration 註解說明。

### Phase 3 — 退款差額 adjustment（commit `77bb178`）

| 檔案 | 變更 |
|---|---|
| `supabase/migrations/20260729170000_issue1777_refund_adjustment_ledger.sql`（＋rollback） | `refund_adjustment` 分錄型別、`refund_event_id` 冪等鍵、部分索引、`fn_apply_refund_adjustment_atomic` |
| `db-settlement-atomic.mjs` | `applyRefundAdjustmentAtomicDb`、`buildRefundEventId` |
| `refund-execute/route.ts` | 在 `refund_amount_twd` 寫入**成功之後**呼叫 adjustment |

**設計取捨（與原計劃不同，已驗證更安全）**：計劃原寫「取代 `recordRefundReversalDb`」。實作時評估發現該函式與 order 狀態機、修復路徑（`route.ts:172` 的 repair 分支依賴其 `reversed`／`repaired` 回傳）深度耦合，直接拆除風險高。改採**「把 ledger 調整到目標值」**：差額 = 目標 − ledger 現值。效果更好——不論前置狀態如何（含既有的全額紅沖）都收斂到正確的最終淨應付，並自動補回被紅沖過頭的部分，且天然冪等。代價是 ledger 會同時留下 reversal 與 adjustment 兩列，最終淨額正確且可追蹤；完全移除 reversal 路徑留待後續另案。

**冪等鍵**：`${orderId}:cum:${累積退款額}`。同次退款重送得同鍵（不重複記帳），二次部分退款因累積額不同得新鍵（各記一次差額）——不需外部事件 id。

### Phase 4 — 對帳與歷史 proposal（commit `b6e608b`）

| 檔案 | 變更 |
|---|---|
| `src/lib/accounting/reconciliation.mjs`（新增） | 純函式：逐導遊、逐訂單對帳與結論彙整 |
| `src/lib/accounting/db-reconciliation.mjs`（新增） | 唯讀資料存取 |
| `report-service.mjs` | 月報表附帶 `reconciliation` 區塊；對帳失敗不影響月報主體 |
| `scripts/admin/issue1777-reconciliation-preview.mjs`（新增） | privacy-safe read-only preview，含 #1647 三項 |
| `docs/operations/issue1777-historical-data-proposal.md`（新增） | 三項的 DML proposal、rollback／compensation path、執行紀律 |

不變量：`期望餘額 = Σ ledger 淨額 − Σ 已付出款`；訂單層 `ledger 淨額 = floor(max(0, total − 累積退款) × (1 − 分潤率))`。
**唯讀由測試鎖住**：`db-reconciliation` 與 preview script 皆不得出現 `insert/update/upsert/delete/rpc`，避免日後有人在報表裡順手加「自動修復」。

### 架構 ratchet 修正（commit `eaa99e1`）

全套測試暴露兩個 `architecture-ratchet-guard` 違規，均照規範修正而非放寬天花板：
- `src/lib` 頂層檔案數 → 兩個新模組移入 `src/lib/settlement/` 子資料夾
- 直讀 `process.env` → 新增 `src/config/payout-env.mjs` getter（未觸碰凍結區的 `security-env.mjs`／`startup-env.mjs`）

### 測試總計

| 測試檔 | 條數 |
|---|---|
| `issue1777-dispute-safety-hold-projection` | 12 |
| `issue1777-payout-confirm-fail-closed` | 9 |
| `issue1777-atomic-settlement-payout` | 13 |
| `issue1777-refund-adjustment` | 20 |
| `issue1777-reconciliation` | 23 |
| `issue1777-migration-contract` | 13 |
| **合計** | **90** |

**全套 `npm test`：4798/4802 pass、3 skipped。**

### 曾經的唯一紅燈（已於 2026-07-29 21:43 套用 migration 後消除）

`issue #1293 — migration ledger gate` 一度 HOLD，這是 fail-safe 設計正確運作：migration 尚未套用時 ledger 無 `verified` record。**當時刻意不謊報 verified**；待 owner 授權套用並實際驗證後才補 record，gate 隨即轉綠。詳見下方「Migration 套用紀錄」。

## Migration 套用紀錄（2026-07-29 21:43 Asia/Taipei，owner 於對話中授權「SQL-OVERRIDE 授權」）

依 `docs/operations/migration-apply-ledger-sop.md` 四步驟執行。專案 `pyoderxmpeyqjwkeliiu`（tour platform）。

### 套用前唯讀檢查

三支目標函式皆不存在；`payout_items_order_kind_unique` 為全表唯一索引；CHECK 僅允許 `settlement`／`reversal`；`refund_event_id` 欄位不存在——與 migration 假設完全吻合。

### 套用與驗證

| migration | 結果 | 驗證 |
|---|---|---|
| `20260729160000`（Phase 2） | success | `pg_proc` 實查兩支函式存在且 `proconfig=search_path=pg_catalog,public,pg_temp`；`fn_confirm_payout_atomic` 對不存在 payout 回 **P0002**；`fn_record_settlement_atomic('[]')` 回 0 且無寫入 |
| `20260729170000`（Phase 3） | success | `refund_event_id` 欄位存在；CHECK 已含三種 kind；`payout_items_order_kind_unique` 帶 `WHERE settlement_kind IN ('settlement','reversal')`；`payout_items_refund_event_unique` 帶 `WHERE refund_event_id IS NOT NULL`；空冪等鍵回 **22023** |
| `20260729180000`（hotfix） | success | `routine_privileges` 實查三支函式 grantee 僅剩 `service_role`／`postgres` |

### ⚠️ 套用後發現並修復的 P0 安全缺口

套用 Phase 2／3 後實查發現：**三支財務函式對 `anon` 與 `authenticated` 皆持有 EXECUTE**。

- **成因**：Supabase 在 public schema 對 FUNCTIONS 有 default privileges，而兩支 migration 只寫了 `REVOKE ALL … FROM PUBLIC`。PUBLIC 是偽角色，撤不掉已明確授予具名角色的權限。
- **風險**：未登入者可直接呼叫 `fn_confirm_payout_atomic` 把 payout 標為 paid 並扣減導遊餘額，或以 `fn_apply_refund_adjustment_atomic` 竄改 ledger。
- **修復**：新增 `20260729180000` hotfix，三支函式 `REVOKE ALL FROM anon, authenticated, public` 並重新授權 `service_role`；另以 `ALTER DEFAULT PRIVILEGES` 撤銷兩角色對 FUNCTIONS 的預設 EXECUTE，避免下一支金流函式重蹈覆轍（既有 #1678 hardening 只涵蓋 TABLES）。
- **測試盲點**：原契約測試只斷言「沒有明確 `GRANT` 給 anon」，因此**測試全綠而 production 不安全**。已改鎖正面條件——每支財務函式都必須被明確 `REVOKE FROM anon/authenticated`。**「沒有寫 GRANT」不等於「沒有權限」。**

### 資料影響（鐵律 2 回報義務）

**三支 migration 均未異動任何資料列。** 套用後實查：

| 項目 | 值 |
|---|---|
| `payout_items` 總列數 | 10（與 #1637 稽核 2026-07-06 快照一致） |
| `payout_items`：`refund_adjustment` 分錄 | 0 |
| `payout_items`：`refund_event_id` 非空 | 0 |
| `guide_balances` | 1 位導遊，合計 NT$21,814（快照一致） |
| `payouts` pending／paid／cancelled | 1 / 0 / 0（快照一致） |
| 本次相關 `audit_logs` | 0 |

### Ledger（SOP 步驟 4）

已補三筆 `verified` record。gate 由 HOLD 轉綠：**migration 檔 131：verified 14、baseline 117、missing 0、unverified 0**。

### 套用後全套測試

`npm test`：**4809/4812 pass、0 fail、3 skipped**（原本唯一的 ledger gate 紅燈已消除）。

## 收尾（2026-07-29 22:30 Asia/Taipei）

### 已完成

| 項目 | 結果 |
|---|---|
| PR #1778 | CI 6 checks 全綠 → **merged**（`49e448d`） |
| PR #1779（收尾） | CI 3 checks 全綠 → **merged**（`1b80d42`） |
| Migration 套用 | 三支已套用並驗證，ledger 補三筆 `verified`，gate 綠 |
| Production 部署 | commit `49e448d` 的 production deployment **READY**。**順序正確**——migration 21:43 先套用、程式碼隨後上線，明天 02:00 UTC sweep 會呼叫已存在的 RPC |
| AC sign-off | **11/11 PASS**，逐條證據見驗收報告與 issue 留言 |
| 驗收報告 | `docs/operations/qa-reports/issue1777-financial-chain-atomicity-20260729.md` |
| #1647 read-only preview | 三項實測完成（見下） |

### 收尾階段發現的兩件事

**1. 對帳有真實盲點（已修，PR #1779）**

訂單 `1158aa21…`（NT$7,200、`paid_at IS NULL`、平台從未實收）曾被結算成 net 6120。它的**金額完全正確**（`floor(7200 × 0.85) = 6120`），ledger 與餘額也一致，因此逐導遊與逐訂單的金額對帳全部判「正常」。**錯的不是金額，是資格。**

已新增 `buildEligibilityAudit`（`src/lib/accounting/reconciliation.mjs`）：回頭掃既有分錄，比對的正是 `fn_record_settlement_atomic` 在交易內重驗的那組條件。淨額已被 reversal 沖銷為 0 者標 `alreadyReversed` 但不列待處理——帳已平，列出來只是雜訊。`buildReconciliationReport` 的 `ok` 現在也要求資格無誤。

**2. #1647 項目二已完成，與舊快照不同**

| 項目 | 2026-07-06 舊快照 | **2026-07-29 實測** | 結論 |
|---|---|---|---|
| 一：`paid` 卡單 | 14 筆 NT$23,838 | 14 筆 NT$23,838，**全部 `paid_at` 非空** | 仍待處理，全數符合候選 |
| 二：未實收卻入帳 | NT$6,120 待沖銷 | **ledger 淨額 0** | ✅ **已完成**（`20260622120000` 已沖銷） |
| 三：過期 pending 出款 | NT$7,168 | 1 筆，餘額 NT$21,814 足夠 | 仍待處理 |

三方對帳：唯一導遊 ledger 淨額 = 餘額 = NT$21,814，**差異 0**。

## 下一步（剩餘兩項，issue 暫不關閉）

1. **端到端全鏈驗證**（目前 `NOT_VERIFIED-live`）：payment → settlement → partial refund → payout confirm，含重送與 fault injection。冷啟動環境無安全的測試訂單，且出款仍 HOLD，故未執行。
2. **Fresh independent review**：issue Verification 明列需獨立審查（安全／帳務不變量／migration 可回滾／測試不可只驗 source string）。**驗收報告由實作者撰寫，不能取代獨立審查。**

完成上述兩項後才可：

3. **解除出款 HOLD**：設 `PAYOUT_CONFIRM_ENABLED=true`。在此之前未設定即為擋下狀態，無需額外操作。
4. **#1647 項目一、三**：依 `docs/operations/issue1777-historical-data-proposal.md` 重新 preview → 逐項取得 owner 授權 → 執行 → 留證。

## 絕不重做（Do-NOT-redo）

- **四缺口的存在性已確認，不需重查**：sweep 漏投影兩欄（`sweep/route.ts:103`）、全額紅沖（`db.mjs:4613-4622`）、settlement 兩段式（`sweep/route.ts:187-221`／`db-settlement-ops.mjs:86-120`）、confirm 三段式（`db-payouts.mjs:59-116`）。
- **`computeSweepPayoutItem` 的 hold gate 不需改**（`settlement-config.ts:234-241` 已支援四旗標）；Phase 1 只要餵資料進去。
- **`is_disputed`／`is_safety_case` 欄位不需新建**（`20260618_operations_tracking_dispute_safety_flags.sql` 已存在）；`issue1106-*.test.mjs` 中「這兩欄不是 schema 欄位」的註解是過期資訊，勿再據以推論。
- **`getUnsettledOrdersDb` 已確認為死碼**（無生產 caller），不需再花時間追它的呼叫鏈；只需在 Phase 2 決定刪除或標記。
- **不必重跑金流鏈路稽核**：`docs/operations/qa-reports/payment-payout-chain-audit-20260706.md` 已含程式碼逐行＋生產唯讀查證，缺口 3／4 在該報告已獨立記錄（P2／P1-5）。需要生產數字時重新 preview，但鏈路結構結論可直接引用。
- **Phase 1 已完成，不要重做**（commit `464483d`）：sweep 兩欄投影、`payout-confirm-guard.mjs`、issue1106 斷言反轉、issue1777 兩個測試檔。
- **不要把 payout confirm guard 改接 `cron-job-controls`**：該模組是刻意 fail-open，用在出款上語意相反；已評估並排除。
- **不要嘗試在 `node --test` 內直接載入 v2 route.ts**：extensionless TS import 使 Node ESM 解析失敗，需 Next bundler；已驗證，改用順序契約。
- 已完成不重做的舊 issue（issue #1777 內文列舉）：#1637／PR #1644、#1365、#847、#1221、#1284、#449、#1474。

## P0-OVERRIDE 使用紀錄

- 無。本輪未觸碰凍結區，未使用任何 override。

---

## 退款鏈修復（2026-07-30，接續獨立審查）

獨立審查的三個 fresh-context reviewer 抓出 ON CONFLICT P0 之後，我把**呼叫端**再走一遍。
Phase 3 的 RPC 本身是對的，錯在 `refund-execute/route.ts` 餵給它的值——這一段原本
沒有任何測試覆蓋（route 是 `.ts`、測試是 `.mjs` 無 TS loader，只能寫 source-string
測試；而字串全都在，傳的值錯）。

### F1（P0）累積退款額被覆寫而非累加

```
route.ts:71  .update({ refund_amount_twd: refundAmountTwd, updated_at: now })
```

`refundAmountTwd` 是**本次**金額。NT$2,000 訂單先退 500 再退 500 → 欄位停在 500
（實際已退 1,000）→ sweep 的 effective GMV 多算 500 → 導遊多領 `floor(500 × 0.85) = 425`。
且該寫入是應用層 read-modify-write，兩筆併發退款會 lost update——正是 #1777 要消滅的模式。

### F2（P0）冪等鍵以「本次金額」組成

```
route.ts:507  refundEventId: buildRefundEventId(orderId, opsRefundTwd)
```

`buildRefundEventId` 的 docstring 寫「累積退款總額」，但 route 傳的是本次金額。
兩次等額部分退款（500、500）算出同一把鍵 → 第二筆差額分錄被
`ON CONFLICT DO NOTHING` 吃掉 → ledger 只調整一次。

**為什麼測試沒抓到**：`issue1777-refund-adjustment.test.mjs` 只驗 helper 在「餵累積額」
時的語意（`buildRefundEventId('o-1', 3000) ≠ ('o-1', 5000)`），從未斷言呼叫端傳了什麼。
這是本輪最該記住的一條：**契約測試若不覆蓋呼叫端傳值，等於沒測**。

### F5（P1）`delta=0` 早退跳過 carry-forward 稽核

舊版在 `v_delta = 0` 時直接 `RETURN`，早於「餘額轉負 → 記 carry-forward」的檢查。
若上游 `recordRefundReversalDb` 已整筆紅沖（ledger 淨額已為 0、餘額已被扣成負數），
本函式算出 target=0／previous=0／delta=0 → 早退 → **完全沒有 `payout_carry_forward_created`**。
已經付出去的錢沒有可追蹤的回收紀錄。

### 順帶修掉的一個潛在解析風險

舊版 `RETURNS TABLE (order_id uuid, …, refund_event_id text)` 讓 plpgsql 變數與資料表
欄位同名，而 `ON CONFLICT (order_id, refund_event_id)` 的 inference specification 是以
**運算式**解析的——同名變數會被代換成參數 placeholder。該路徑要「已結算訂單 + 差額≠0」
才會走到，production 至今 `refund_adjustment` 為 0 筆，因此從未觸發。新版改
`RETURNS jsonb`，函式體內不再有與欄位同名的變數，整類問題消失。

### 修法

責任搬進 DB 交易內，呼叫端只說「本次退了多少」：

| 檔案 | 變更 |
|---|---|
| `supabase/migrations/20260730093000_issue1777_refund_delta_accumulation.sql`（＋rollback） | 簽章 `(uuid, text, text)` → `(uuid, integer, text)`；舊簽章 `DROP`（避免 PostgREST 多載歧義 PGRST203）；`operations_tracking.refund_amount_twd += delta` 移入同一把 `orders FOR UPDATE`；冪等鍵改由交易內累積額推導（`'cum:' || 累積額`）；負 delta `RAISE`；carry-forward／超額稽核改為全路徑檢查並以 `refund_event_id` 去重；`RETURNS jsonb` |
| `apps/web/src/lib/settlement/refund-payout-sync.mjs`（新） | `readCumulativeRefundTwd`、`checkRefundWithinRemaining`（純函式）、`syncRefundToPayoutLedger` |
| `apps/web/src/lib/settlement/db-settlement-atomic.mjs` | 移除 `buildRefundEventId`；`applyRefundAdjustmentAtomicDb` 改收 `refundDeltaTwd`，拒絕負數／非整數 |
| `apps/web/app/api/v2/admin/orders/[orderId]/refund-execute/route.ts` | 刪 `recordOperationsRefundAmount`；改呼叫 `syncRefundToPayoutLedger`；**新增呼叫 provider 前的「剩餘可退」把關**；incident 訊息改為誠實說明「累積額與 ledger 同交易、失敗代表兩者皆未寫入」 |

### 順帶關掉的一個新缺口（F9）

`resolveRefundAmount`（`refund-execute.ts`）只驗 `refundAmount ≤ total`，沒扣掉已退部分。
NT$1,000 訂單連退兩次 800 都會通過驗證，累積 1,600 > 總額——而錢已經從 provider 出去了。
新增的把關擋在**呼叫 provider 之前**，且只在「已有累積退款」時介入（純加法變更，首次退款
的錯誤碼與行為不變）；累積額讀取失敗時放行並記 incident——擋掉所有退款的代價高於這個
競態風險，且 RPC 端仍會對超額累積留下 `refund_exceeds_order_total` 稽核作為後手。

### 為什麼要新開一支 `.mjs`

route 是 `.ts`，本 repo 沒有 TS test loader，因此 route 只能寫 source-string 測試——
而 F1／F2 正是 source-string 測試看不見的那一類。把決策邏輯搬到可 `import` 的模組後，
才能用**行為測試**斷言「實際傳給 RPC 的參數」（`assert.deepEqual(args, {...})`＋
「不得出現 `p_refund_event_id`」）。

### 測試

新增 `apps/web/tests/api/issue1777-refund-chain-accumulation.test.mjs`（20 個 case），
含一組並列 oracle：`makeBrokenAppWorld`（修復前）vs `makeFixedRpcWorld`（修復後），
以數字證明「兩次 500 → 導遊多領 425」與修復後收斂到 850。

改動既有測試（機制變了、不變量沒變，均在檔內註明原因）：
- `issue1777-refund-adjustment.test.mjs`：移除 `buildRefundEventId` 那組（helper 已刪），
  wrapper 契約改為 `p_refund_delta_twd`
- `issue1474-refund-payout-wiring.test.mjs`：#1474 的不變量（金額必須落到出帳讀的欄位）
  不變，守門改鎖「route 委派到唯一 writer」＋「route 不得自行 update 該欄位」
- `issue1777-migration-contract.test.mjs`：新增 migration 入列；新增「最終生效版本」
  describe（migration 只增不改，掃全部檔案會被舊的壞版本假綠——與 ON CONFLICT 那次同一教訓）

**實跑證據**（`.claude/hooks/run-checks.sh --typecheck …`，2026-07-30 20:38 CST）：
**230 pass / 0 fail / 0 skipped**，`tsc --noEmit` 綠燈，`npm run lint` 0 errors。

### 一個自己踩到的坑（記給下一輪）

route 的說明註解裡引用了錯誤寫法當反例（`.update({ refund_amount_twd: … })`），
結果我自己的守門斷言咬到自己的註解 → **假紅**。修法：字串守門一律先剝註解
（`tsCode()`）。這與 2026-07-29 那次「斷言咬到 migration 註解 → 假綠」是同一個坑的兩面。

### 狀態

- ⏳ **migration 尚未套用 production**：需新的 `SQL-OVERRIDE` 授權（前一次已過期清除）。
  在套用前，`applyRefundAdjustmentAtomicDb` 傳 `p_refund_delta_twd` 會打不到舊簽章
  → wrapper fail-closed 拋 `SETTLEMENT_RPC_NOT_DEPLOYED` → 退款仍成功、帳務同步中止並記
  incident。**因此部署順序必須是 migration 先、程式碼後**（與 Phase 2 同一條規則）。
- ⚠️ **AC 6／AC 7 的 PASS 判定要撤回**：驗收報告與 issue 留言當時判 PASS，但 F1／F2 讓
  「多次部分退款的最終淨應付正確」與「退款重送冪等」實際上不成立。修復套用並驗證後才能重判。
- 緩解因素：production `refund_adjustment` 目前 0 筆，payout confirm 仍 HOLD。

### Migration 套用與驗證（2026-08-03 13:03 Asia/Taipei）

`20260730093000` 已套用 production（`SQL-OVERRIDE`：使用者「SQL-OVERRIDE，繼續完成」）。

**結構驗證**：`pg_proc` 實查僅存 `fn_apply_refund_adjustment_atomic(uuid,integer,text)` 一個簽章
（舊 `(uuid,text,text)` 已消失，無多載歧義）、`returns=jsonb`、`prosecdef=false`、
`proconfig` 仍 pin `search_path=pg_catalog, public, pg_temp`、`proacl={postgres,service_role}`
——**DROP + CREATE 後 anon 沒有回流**（Supabase 的 default privileges 會在新建函式時再放行一次，
本 migration 的顯式 `REVOKE` 擋住了）。

**端到端功能驗證（零寫入）**：在結尾 `RAISE EXCEPTION` 的 `DO` block 內執行，讓整個交易中止，
以拋出的例外訊息當證據。對已結算訂單 `466e6b29`（total 6000／ledger_net 5100）連續呼叫：

| 呼叫 | `refund_event_id` | `cumulative_refund_twd` | `target_net_twd` | `delta_twd` | `applied` |
|---|---|---|---|---|---|
| delta=1000 | `cum:1000` | 1000 | 4250 | −850 | true |
| delta=1000 | **`cum:2000`** | **2000** | 3400 | −850 | true |
| delta=0 | `cum:2000` | 2000 | 3400 | 0 | **false** |

交易內實查 `operations_tracking.refund_amount_twd = 2000`、`adjustment_rows = 2`。

**兩次等額退款得到兩把不同的鍵，且累積額正確相加** —— F1／F2 的修復在真實 Postgres 上成立。
第三次 `delta=0` 冪等命中，證明對帳重跑安全。

**資料影響：無。** rollback 後實查與套用前快照逐項一致：`payout_items` 10 列、
`refund_adjustment` 0 列、`refund_event_id` 非空 0 列、`guide_balances` 合計 21,814、
`operations_tracking` 有退款 3 筆、測試訂單無 ops 列、`payouts` 1 pending／0 paid、
`actor='verify-1777'` 的 `audit_logs` 0 筆。

### PR #1789 曾誤判為「CI 停擺」——實為 merge conflict（2026-08-04 訂正）

**先前記載有誤，在此更正。** 我一度判定「GitHub Actions 自 2026-08-02T09:52Z 起全 repo 停擺」，
並據此請 owner 去查帳務／額度。**那是錯的。**

錯在取樣：我只看了 `ci.yml` 與 `secret-scan.yml` 的 run 紀錄，而這兩支只在 push／PR 時觸發；
`main` 自 08-02 之後沒有人推過（最新一筆是 bot 的 `[skip ci]` snapshot），所以「沒有 run」是
預期結果，不是故障。把「沒被觸發」讀成「無法觸發」。

排程 workflow 其實照常運作，這是決定性反證（排程不依賴 PR 作者或 merge 狀態）：

| workflow | 最近一次 | 結果 |
|---|---|---|
| `settlement-sweep` | 2026-08-03T03:05:49Z | success |
| `booking-v2-daily-go-no-go` | 2026-08-03T02:18:46Z | success |
| `unpaid-expiry-sweep` | 2026-08-03T18:30:50Z | success |

（`synthetic-health-probe` 自 06-29 起無 run 也非故障——其 `schedule:` 已刻意退役，
改用外部 UptimeRobot，只留 `workflow_dispatch`。）

**真正原因**：PR #1789 有 merge conflict。

```
CONFLICT (content): Merge conflict in docs/operations/migration-ledger.json
```

PR #1788（`docs: 對齊 #1758 production migration ledger`）在 `main` 上往 ledger 陣列尾端
append 記錄，本分支也往同一個陣列尾端 append —— 兩邊都 append，必衝突。

**機制（值得記住）**：`pull_request` 事件的 workflow 跑在 GitHub 產生的 merge ref
（`refs/pull/<n>/merge`）上。合併衝突時該 ref 建不出來，**workflow 完全不會被觸發**——
不是失敗、不是排隊，是連 run 都不存在（`list_workflow_runs` 對該分支回 `total_count: 0`）。
PR 上只看得到 Vercel 的 check，因為 Vercel 是外部 app，跑的是 head commit，不需要 merge ref。
API 上唯一的線索是 `mergeable_state: "dirty"`。

這也解釋了為何早先的 `git merge-tree --write-tree` 檢查回報 CLEAN：那是對照舊的 `origin/main`
（`4099f90`），#1788 的 ledger 變更當時還沒進來。

**教訓**：判定「CI 停擺」前，先確認排程 workflow 是否照跑；PR 沒有任何 check 時先看
`mergeable_state`，而不是先懷疑平台。

**修法**：合併 `origin/main`，衝突解為保留兩邊記錄（main 28 筆 ＋ 本分支 2 筆 = 30 筆，
JSON 驗證通過、ledger gate 測試綠）。推送後 CI 立即觸發，直接證實診斷。
