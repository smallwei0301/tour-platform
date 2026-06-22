# 導遊後台「部分退款入帳消失」live smoke 驗收

- **判定：PASS（live 實測，real Supabase）**
- **分支：** `claude/order-status-annotations-8da27n`
- **驗收環境：** Vercel Preview（與 production 共用同一 Supabase 專案 `pyoderxmpeyqjwkeliiu`）
- **驗收時間：** 2026-06-18 (Asia/Taipei)
- **資料層：** 真實 Supabase（透過 Management API 以 owner 授權 token 連線；本報告不含 token）
- **受測導遊：** `963a3e13-…`（測試帳號）

> 本報告不含密鑰／access token／service-role key／cookie／完整付款 payload／未遮蔽 PII。

---

## 用戶回報

導遊後台儀表板（`/guide/dashboard`）：已完成結帳的訂單，未退部分的「結款金額」沒有
反映到入帳統計。

## Live 診斷（real DB）

逐筆比對受測導遊的訂單 / operations_tracking / payout_items / guide_balances 後，確認
**兩個獨立 bug 疊加**，外加一個正常行為的誤解：

### Bug A — 部分退款訂單被設成 `refunded`，整筆排除（已修，code 已 push）
- 訂單 `…040542`（total 1998、部分退款 1000）live 狀態 `status=refunded`。
- 結算 sweep 只撈 `status='completed'`、儀表板 GMV 只算 `paid/confirmed/completed` →
  整筆排除 → 未退的 998（net ~848）完全不見。
- 修正：`refund-execute` 部分退款不再設 `refunded`，改還原可結算狀態
  （commit `714c170`，`resolvePartialRefundStatus`）。

### Bug B — 導遊端查 operations_tracking 用了不存在的欄位（本輪修）
- 導遊儀表板 / 撥款明細(JSON/CSV) `select` 了 `is_disputed` / `is_safety_case`
  （#1221/#1284 的 payout-hold 旗標），但**從沒有 migration 建立這兩個欄位**。
- 真實 DB 上該 select **整個報錯**（`column is_disputed does not exist`），route 把
  錯誤吞掉（`data ?? []`）→ `refund_amount_twd`（#847 effective gmv）與 hold 在導遊端
  被靜默丟棄。後果：即使 Bug A 修好，儀表板仍顯示**全額**而非**實收**。
- 結算 sweep 不受影響（只查存在欄位），故「儀表板估算」與「實際撥款」會對不上。
- 修正：新增 migration `20260618_operations_tracking_dispute_safety_flags.sql` 補
  `is_disputed` / `is_safety_case`（boolean default false），已套用至 live DB。

### 非 bug — 已正確：未來行程訂單尚未結款
- 「匯款測試 E2E」(paid, 1800) 已正確計入本月營收（16,200／3 筆）。其行程日為
  2026-06-22（未來），結算為「行程結束 + T+7」，故現在尚未撥款屬正常。

---

## 修正後 live 驗證（SQL 複算儀表板邏輯）

對 live 套用：(1) Bug B migration；(2) 將 fixture `…040542` 由 `refunded` 更正為
`completed`（其 tour 日 2026-06-04 已過、無 refund_requested 審計記錄，對應
`resolvePartialRefundStatus(null)=completed`），`payment_status` 維持 `partially_refunded`。

受測導遊 2026-06 儀表板複算結果：

| 訂單 | total | refund | effective | payable_net |
| --- | --- | --- | --- | --- |
| QA Fixture `…040542`（部分退款） | 1998 | 1000 | **998** | **848** |
| 匯款測試 E2E | 1800 | 0 | 1800 | 1530 |
| Ava Preview Smoke | 7200 | 0 | 7200 | 6120 |
| Ava Preview Smoke | 7200 | 0 | 7200 | 6120 |

- **本月營收(effective GMV)：17,198**（修正前 16,200，回補部分退款的 998）
- **本月預計入帳(net)：14,618**（含 040542 的 848）
- Bug B 修正後，`operations_tracking` select 不再報錯，`refund_amount_twd=1000`
  正確被讀取 → 顯示 effective 998 而非全額 1998。

> 040542 現為 `completed` + 過 T+7，下次結算 sweep 會將其 net 848 寫入 payout_items /
> guide_balances（sweep 需 `INTERNAL_ALERT_TOKEN`，未在本 session 觸發；估算已驗）。

---

## 迴歸 / 測試

- 新增 `tests/api/operations-tracking-hold-columns-migration.test.mjs`：鎖定
  guide-facing route 從 operations_tracking select 的欄位都有 migration 涵蓋（防止
  code/schema 再次漂移）。
- Bug A 既有測試：`partial-refund-settlement-status.test.mjs`（commit `714c170`）。
- `npm test` / `typecheck` / `lint`：綠（見 commit）。

## 後續事項

1. **既有 production 資料盤點**：除 fixture 040542 外，若 production 另有「真實」部分退款
   訂單在 Bug A 修復前被設為 `refunded`，需逐筆評估是否回補 `status` 以補撥款。建議用
   `status='refunded' AND payment_status='partially_refunded'` 撈出清單再人工確認。
2. **未付款卻被結算的資料異常（另案）**：發現 `Ava Preview Smoke …1158aa21` 為
   `status=completed` 但 `payment_status=pending`（未付款）卻已進 payout_items。sweep 只
   檢查 `status='completed'`、未檢查 `payment_status='paid'`，會把未付款的 completed 訂單
   結算。與本次入帳問題方向相反（多結非少結），建議另開 issue 評估 sweep 增加付款狀態
   gate。
3. **is_disputed / is_safety_case 寫入端**：欄位已建立、讀取端正常；實際設定這兩個 hold
   的 admin UI/流程（若尚未具備）可另行補上。
