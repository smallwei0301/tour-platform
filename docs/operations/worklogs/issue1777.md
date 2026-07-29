# issue1777 — [Payments][P0] 修正結算／部分退款／出款非原子鏈，避免漏帳、重扣與錯誤撥款

> 最後更新：2026-07-29 15:00 Asia/Taipei｜負責 session：claude-fable-5／2026-07-29
> 本輪範圍：**只做檢查與計劃制定，不動任何程式碼**（依 issue #1777 owner 留言：「owner 明確要求本輪停留在 issue 制定／修改，後續將另行指定 agent，因此現在不得自動開工」）。

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
- [ ] AC4 worklog commit／push 至指定分支，並同步進度錨點留言至 issue #1777

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

## 下一步

- 等 owner 將 issue #1777 由 `agent:backlog` 提升至 `agent:now`／`agent:next`／`agent:queued`，並指定執行 agent（建議角色：payment/settlement backend + database transaction specialist，搭配獨立 finance-integrity review）。
- 開工後從 Phase 1 起（純程式碼、無 migration、風險最低、可獨立出 PR）。

## 絕不重做（Do-NOT-redo）

- **四缺口的存在性已確認，不需重查**：sweep 漏投影兩欄（`sweep/route.ts:103`）、全額紅沖（`db.mjs:4613-4622`）、settlement 兩段式（`sweep/route.ts:187-221`／`db-settlement-ops.mjs:86-120`）、confirm 三段式（`db-payouts.mjs:59-116`）。
- **`computeSweepPayoutItem` 的 hold gate 不需改**（`settlement-config.ts:234-241` 已支援四旗標）；Phase 1 只要餵資料進去。
- **`is_disputed`／`is_safety_case` 欄位不需新建**（`20260618_operations_tracking_dispute_safety_flags.sql` 已存在）；`issue1106-*.test.mjs` 中「這兩欄不是 schema 欄位」的註解是過期資訊，勿再據以推論。
- **`getUnsettledOrdersDb` 已確認為死碼**（無生產 caller），不需再花時間追它的呼叫鏈；只需在 Phase 2 決定刪除或標記。
- **不必重跑金流鏈路稽核**：`docs/operations/qa-reports/payment-payout-chain-audit-20260706.md` 已含程式碼逐行＋生產唯讀查證，缺口 3／4 在該報告已獨立記錄（P2／P1-5）。需要生產數字時重新 preview，但鏈路結構結論可直接引用。
- 已完成不重做的舊 issue（issue #1777 內文列舉）：#1637／PR #1644、#1365、#847、#1221、#1284、#449、#1474。

## P0-OVERRIDE 使用紀錄

- 無。本輪未觸碰凍結區，未使用任何 override。
