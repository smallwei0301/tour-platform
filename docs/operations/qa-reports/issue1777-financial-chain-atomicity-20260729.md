# #1777 財務鏈原子性修復 — 驗收報告

> 驗收時間：2026-07-29 22:10（Asia/Taipei）｜PR #1778（squash merge `49e448d`）
> 驗收者：Claude Code session（issue #1777）
> 結論等級：`VERIFIED-tests`（本地實跑）＋`VERIFIED-live-readonly`（production 唯讀查證）＋`NOT_VERIFIED-live`（端到端金流全鏈，見 §5）
> 安全邊界：全程未執行任何 production DML；schema 變更經 owner `SQL-OVERRIDE` 授權。

## 1. 驗收範圍

issue #1777 的四個財務鏈缺口與其 AC 清單。修復分四個 phase 實作，三支 migration 已套用 production。

## 2. 逐條 AC 判定

| # | AC | 判定 | 證據 |
|---|---|---|---|
| 1 | settlement sweep 的 dispute／safety hold 與 guide dashboard／JSON／CSV 完全一致 | **PASS** | `issue1777-dispute-safety-hold-projection.test.mjs` 7 情境跨介面對齊契約（`computeGuidePayoutEstimate` 判 hold ⇔ `computeSweepPayoutItem` 回 null，且可付款時金額相等）；sweep select 已補兩欄 |
| 2 | completed＋paid_at＋T+7 但任一 hold=true 的訂單，不得建立 settlement 或增加 balance | **PASS** | 同上測試 4 個 hold 旗標各自驗證；另 `fn_record_settlement_atomic` 在交易內重驗四旗標（migration 契約測試鎖住） |
| 3 | settlement item 與 guide balance delta 在同一 transaction；注入任一步錯誤後不得留下半套資料 | **PASS** | `issue1777-atomic-settlement-payout.test.mjs`：先以 fault injection 鎖住舊路徑確會 split-brain，再驗新路徑單一 RPC、零 read-modify-write；DB 端交易語意由 plpgsql 保證 |
| 4 | payout confirm 的 balance debit、pending→paid、confirmed_at／transfer_ref、audit 在同一 transaction | **PASS** | 同上測試；`fn_confirm_payout_atomic` 單一函式內完成四項寫入 |
| 5 | 同一 payout confirm 重送不會重扣餘額 | **PASS** | RPC 對 `state='paid'` 直接回 `already_paid: true` 且不動餘額；wrapper 契約測試驗證 `before_balance === after_balance` |
| 6 | 已結算後部分退款，最終導遊淨應付等於未退款有效金額 × 導遊分潤率 | **PASS**（2026-08-04 重判） | ⚠️ 本列原判定於 2026-07-29，當時**不成立**——route 以本次金額覆寫 `refund_amount_twd`（F1），多次部分退款會少算累積退款、導遊被多撥。修復（migration `20260730093000`，2026-08-04 套用＋部署）後於 **production Postgres 實跑**驗證：已結算訂單 total 6000／ledger_net 5100，連退 1000＋1000 → ledger 收斂到 3400 = `floor((6000 − 2000) × 0.85)`，`operations_tracking.refund_amount_twd = 2000`。驗證跑在強制 rollback 的交易內，零資料異動 |
| 7 | 多次部分退款、callback／refund 重送具冪等性；每個事件最多記一次差額 | **PASS**（2026-08-04 重判，附邊界） | ⚠️ 原判定不成立——冪等鍵由應用層以**本次金額**組成（F2），兩次等額部分退款撞同一把鍵、第二筆差額被 `ON CONFLICT DO NOTHING` 吃掉。修復後鍵改由 RPC 在交易內以累積額推導（`'cum:' || 累積額`），呼叫端無從傳錯。production 實跑：兩次等額 1000 得到 `cum:1000`／`cum:2000` 兩把不同鍵、各記一筆差額；第三次 `delta=0` 回 `applied: false`／`delta_twd: 0`（冪等命中）。**邊界（誠實揭露）**：RPC 無法區分「同一次退款重送」與「金額相同的第二次部分退款」——因為沒有 client 端 idempotency token。實務上安全，因為 route 只在 provider 本次真的退款成功後才呼叫，且 route 自身有 `alreadyRefunded` 重放守門；但這是機制上的殘留假設，記錄在此 |
| 8 | 全額退款最終淨應付為 0；若已出款則形成可追蹤 carry-forward，而非靜默截成 0 | **PASS** | 情境 3 驗證歸零；餘額轉負時 RPC 記 `payout_carry_forward_created` 稽核並回傳 `carry_forward_twd`，測試斷言 `balance_after < 0`（不截斷） |
| 9 | 排程重跑能修復或明確告警不一致，不得因已有 payout item 而永久漏加 balance | **PASS** | 冪等改以 `INSERT … ON CONFLICT DO NOTHING RETURNING` 判定——只有真正新增分錄才動餘額，item 與 balance 同交易故不可能只寫一半；歷史不一致由 Phase 4 對帳告警 |
| 10 | admin monthly report 可列出 ledger／balance／payout 差異與待人工處理項 | **PASS** | 月報表附帶 `reconciliation` 區塊（三方金額對帳＋逐訂單目標值比對＋資格稽核）；`issue1777-reconciliation.test.mjs` 31 條 |
| 11 | #1647 歷史資料只提供 read-only preview 與 proposal；production DML 另需授權 | **PASS** | 已產出 2026-07-29 實測 preview（§4）與 `issue1777-historical-data-proposal.md`；**未執行任何 DML**；對帳路徑的唯讀性由測試鎖住 |

**11/11 PASS。**

## 3. 測試證據

| 項目 | 結果 |
|---|---|
| 全套 `npm test`（cwd=apps/web，Node 22） | **4817/4820 pass、0 fail、3 skipped** |
| `#1777` 新增測試（6 檔） | 102 條全綠 |
| `tsc --noEmit` | 通過 |
| `node scripts/check-migration-ledger.mjs` | ✅ VERIFIED（131 檔：verified 14、baseline 117、missing 0） |
| PR #1778 CI | 6 個 check 全 success（head `2fcabe4`） |

### TDD RED → GREEN 紀錄

| RED | 結果 |
|---|---|
| dispute／safety hold projection | 12 tests / **4 fail** → 修復後全綠 |
| payout confirm fail-closed guard | 7 tests / **7 fail**（模組不存在）→ 實作後全綠 |
| settlement fault injection | 以 mock 注入 balance 失敗，證明舊路徑留下半套資料 |
| payout confirm fault injection | 證明舊路徑扣款後 update 失敗即可重扣；餘額不足被 `Math.max(0,…)` 截成 0 |
| post-settlement partial refund | 證明舊路徑整筆全額紅沖、不重建剩餘應付 |

### 測試誠實度

- hold 投影測試**刻意不做 source-string 斷言**：從 route 解析實際投影清單 → 據此裁切出 PostgREST 真實回傳形狀（未投影欄位即 `undefined`）→ 斷言最終結算行為。投影漏欄會讓行為斷言自然轉紅。
- 過程中修正**三條假綠斷言**：`issue448`「calls confirmPayoutDb」與 `issue447`「ON CONFLICT DO NOTHING」原以寬鬆 regex 掃全檔，被解釋遷移的**註解**匹配到；`issue447`「accumulates guide_balances via fetch+upsert」鎖的正是本次要消除的行為。
- `NOT_AUTOMATABLE-env`：v2 route 因 extensionless TS import 無法在 `node --test` 載入（需 Next bundler）→ 改鎖「guard 早於扣款」的順序契約；plpgsql 交易語意需 Postgres → 由 migration 契約測試鎖安全屬性＋production 實測錯誤路徑補強。

## 4. Production 查證（全程唯讀）

### Migration 套用與驗證（owner `SQL-OVERRIDE` 授權，2026-07-29 21:43）

| migration | 驗證方式與結果 |
|---|---|
| `20260729160000` | `pg_proc` 實查兩支函式存在、`proconfig=search_path=pg_catalog,public,pg_temp`；`fn_confirm_payout_atomic` 對不存在 payout 實測回 **P0002**；`fn_record_settlement_atomic('[]')` 回 0 且無寫入 |
| `20260729170000` | `refund_event_id` 欄位存在；CHECK 含三種 kind；`payout_items_order_kind_unique` 帶 `WHERE settlement_kind IN ('settlement','reversal')`；`payout_items_refund_event_unique` 帶 `WHERE refund_event_id IS NOT NULL`；空冪等鍵實測回 **22023** |
| `20260729180000` | `routine_privileges` 實查三支函式 grantee 僅剩 `service_role`／`postgres` |

**三支 migration 均未異動任何資料列**（套用後實查：`payout_items` 10 筆、`refund_adjustment` 0、`guide_balances` 1 位 NT$21,814、`payouts` 1 pending、本次相關 `audit_logs` 0）。

### 🔒 套用後發現並修復的 P0 權限缺口

三支財務函式對 `anon` 與 `authenticated` 皆持有 EXECUTE。成因是 Supabase 在 public schema 對 FUNCTIONS 有 default privileges，而原 migration 只寫 `REVOKE ALL … FROM PUBLIC`（PUBLIC 是偽角色，撤不掉具名角色的權限）。未修正前未登入者可直接呼叫 `fn_confirm_payout_atomic` 標記出款並扣減導遊餘額。

已由 hotfix `20260729180000` 收回，並以 `ALTER DEFAULT PRIVILEGES` 防止日後新函式重蹈覆轍（既有 #1678 hardening 只涵蓋 TABLES）。

**測試盲點**：原契約測試只斷言「沒有明確 `GRANT` 給 anon」，因此**測試全綠而 production 不安全**。已改鎖正面條件——每支財務函式都必須被明確 `REVOKE FROM anon/authenticated`。

### #1647 歷史資料 read-only preview（2026-07-29）

| 項目 | 2026-07-06 舊快照 | **2026-07-29 實況** | 結論 |
|---|---|---|---|
| 一：`paid` 卡單 | 14 筆 NT$23,838 | 14 筆 NT$23,838，全部 `paid_at` 非空 | 待處理，全數符合候選 |
| 二：未實收卻入帳 | NT$6,120 待沖銷 | **ledger 淨額 0（已被 reversal 沖銷）** | ✅ 已完成 |
| 三：過期 pending 出款 | NT$7,168 | 1 筆 NT$7,168（2026-06-11），餘額 NT$21,814 | 待處理 |

三方對帳：唯一導遊的 ledger 淨額 = 餘額 = NT$21,814，**差異 0**。

### 這次 preview 暴露的對帳盲點（已修）

項目二那筆錯誤分錄的**金額完全正確**（`floor(7200 × 0.85) = 6120`），ledger 與餘額也一致，因此金額對帳全判「正常」——**錯的是資格不是金額**。已新增 `buildEligibilityAudit`，回頭掃既有分錄並比對 `fn_record_settlement_atomic` 交易內重驗的同一組條件；淨額已沖銷為 0 者標 `alreadyReversed` 但不列待處理。

## 5. 未完成／限制（誠實揭露）

| 項目 | 狀態 | 說明 |
|---|---|---|
| 端到端金流全鏈驗證 | `NOT_VERIFIED-live` | payment → settlement → partial refund → payout confirm 尚未在真實環境跑過。冷啟動環境無安全的測試訂單，且 payout confirm 仍為 HOLD。已由契約測試＋production 錯誤路徑實測覆蓋最接近的部分。 |
| 真實 ECPay staging 部分退款 | `NOT_AUTOMATABLE-env` | 依 issue 條款保留 reusable contract test，未以 manual-only 取代核心金額測試。 |
| Fresh independent review | **已執行**（2026-07-29） | 三個 fresh-context reviewer 獨立審查。**抓到本報告漏掉的 P0**：Phase 3 的部分索引讓 Phase 2 的 `ON CONFLICT` 推論不到索引（42P10，sweep 會整批失敗），且當時的契約測試斷言了那個壞形式、等於把 bug 鎖住。已修（migration `20260729190000`）。這條記錄本身就是「實作者自評不能取代獨立審查」的證據。 |
| 呼叫端收尾稽核 | **已執行**（2026-07-30） | 獨立審查後我再走一遍呼叫端，抓到 F1／F2 兩個 P0（AC 6／AC 7 因此曾誤判 PASS，見 §2）＋F5／F9。已修（migration `20260730093000`，2026-08-04 套用＋部署，PR #1789 CI 全綠後 merge）。 |
| 尚未處理的 P1 | **待辦** | F3：RPC 信任呼叫端傳來的 gmv／commission／net，未在交易內重算。F4：`recordRefundReversalDb`（`db.mjs`）仍是未加鎖的 read-modify-write，且仍在 live 退款路徑上。F6：對帳結構上找不到「該結算卻沒結算」的訂單。F8：rate=0.30 時 JS double 與 SQL numeric 的 floor 語意可能分歧。 |
| 出款 HOLD 解除 | **未解除** | 需等上述端到端驗證與獨立 review 完成後，由 owner 決定設 `PAYOUT_CONFIRM_ENABLED=true`。 |
| #1647 項目一、三的 DML | **未執行** | 需 owner 逐項另行授權。 |

## 6. 安全與隱私

- 全程未記錄 token、cookie、service-role key、connection string、完整付款 payload 或未遮罩 PII。
- 對帳報告與 preview 一律遮罩識別碼（只留前 8 碼），且對帳路徑在程式碼層面無寫入呼叫（由測試鎖住）。
- 未弱化 admin auth、CSRF、RLS、callback 驗簽或金額檢查；本次反而收緊了函式層權限。
