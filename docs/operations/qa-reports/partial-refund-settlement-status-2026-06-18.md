# 部分退款結算串接修正 — 導遊後台「未退部分」入帳遺失

- **判定：PASS（單元 / 契約 / 重現實測綠燈）＋ live 部分 `NOT_VERIFIED-live`（本 session 無 Supabase 憑證）**
- **分支：** `claude/order-status-annotations-8da27n`
- **驗收時間：** 2026-06-18 (Asia/Taipei)
- **資料層：** 本 session 無 `SUPABASE_URL` / `SERVICE_ROLE_KEY`（in-memory fallback），故 live
  瀏覽器 smoke 標 `NOT_VERIFIED-live`，以純函式 + 契約測試 + 真實結算函式重現為證。

> 本報告不含密鑰／cookie／token／service-role key／完整付款 payload／未遮蔽 PII。

---

## 背景：用戶回報「導遊後台沒看到入帳統計」

承接部分退款功能（#1474）。用戶在導遊後台（`/guide/dashboard`）看不到剛測試成功的
部分退款訂單之入帳／營收。逐層追查導遊出帳鏈後，確認是**部分退款功能上線時遺漏的結算
串接**（非舊有 production 問題）。

### 根因：部分退款把訂單設成 `refunded`，被結算與儀表板整筆排除

| 環節 | 過濾條件 | 對部分退款訂單（status=`refunded`）的結果 |
| --- | --- | --- |
| 結算 sweep `app/api/internal/settlement/sweep/route.ts:90` | `.eq('status','completed')` | **排除** → `computeSweepPayoutItem` 不執行 |
| 導遊儀表板 GMV `app/api/guide/dashboard/route.ts:129,135` | `status in [paid,confirmed,completed]` | **排除** → 營收/預計入帳貢獻 0 |

`refund-execute`（含 #1474）對「部分」退款也把 `order.status` 設成 `refunded`。於是部分
退款訂單**永遠進不了結算池**，未退部分的撥款（結算規則 §4「扣除已退款部分後」/ #847
`computeSweepPayoutItem`）完全消失。

#### 重現（真實結算函式）

訂單 total 1998、部分退款 1000、未退 998：

```
修正前：status='refunded'
  → sweep .eq(status,completed) 通過？ false
  → 儀表板 GMV 通過？ false
  → 導遊實際撥款 0（應為 net 848）、儀表板營收 0（應為 998）
```

`computeSweepPayoutItem` / `computeGuidePayoutEstimate` 本身對部分退款是正確的
（effective = total − refund = 998 → net 848），純粹被上游 `status` 過濾擋掉。

> 註：全額退款不受影響（effective=0 本就不撥款，行為正確）。

---

## 修正（owner 拍板方向 A「部分退款保持可結算」）

1. **部分退款不再寫死 `status='refunded'`**：改還原退款前的可結算狀態
   （`resolvePartialRefundStatus`）。退款前狀態取自 `audit_logs.metadata.previousOrderStatus`
   （訂單進入 `refund_pending` 時即記入，`db.mjs:698`）；讀不到 / 非可結算 → fallback
   `completed`（仍可結算，受 sweep T+7 time gate 保護不會提前撥款）。
2. **`payment_status` 仍記 `partially_refunded`** 以資區分；金額仍寫
   `operations_tracking.refund_amount_twd`（#1474）。
3. **全額退款維持 `refunded`**；ECPay void（授權未請款，一律全額）維持 `refunded`/`voided`。
4. 涵蓋三條執行路徑：cash、ECPay AllRefund（`refund-execute.ts`）、ECPay DoAction Action=R
   （route.ts `persistReversal`）。

### 修正檔案
- `apps/web/src/lib/refund-execute.ts` — 新增 `SETTLEABLE_ORDER_STATUSES` /
  `resolvePartialRefundStatus`；兩條 `executeRefund` 寫入路徑改用之。
- `apps/web/app/api/admin/orders/[orderId]/refund-execute/route.ts` — 讀 `previousOrderStatus`
  計算 `partialTargetStatus`，傳入 `executeRefund` 並用於 `persistReversal` 的 order 更新。

#### 重現（修正後）

```
status 還原 'paid'（payment_status='partially_refunded'）
  → 儀表板 GMV 通過 → 營收 effective 998
  → 完訪轉 completed 後 sweep 撈到 → 導遊撥款 net 848
✅ 未退部分 998 正確流向導遊，儀表板也看得到。
```

---

## 驗證證據

| 項目 | 結果 |
| --- | --- |
| 新增 `tests/api/partial-refund-settlement-status.test.mjs` | PASS（純函式 + executeRefund 三路徑 + route/sweep/dashboard 契約） |
| `partial-refund-amount` / `issue369` / `issue1474` 迴歸 | PASS（全額退款 status 維持 refunded、未受影響） |
| settlement / payout 迴歸（847/447/1284/1360/307/631 等） | PASS |
| `npm test` 全體 | 3624 pass / 0 fail / 3 skip（299 suites） |
| `npm run typecheck` | 綠 |
| `npm run lint` | 綠（僅 eslintrc deprecation warning） |

---

## 未涵蓋／後續事項

1. **Live 瀏覽器 smoke（`NOT_VERIFIED-live`）**：本 session 無 Supabase 憑證，導遊儀表板路由
   無 DB 時提前回傳 0，無法 live 跑。建議在具 preview Supabase 的環境補一次：建立 paid
   訂單 → 申請退款（refund_pending）→ 部分退款 → 確認 `/api/guide/dashboard` 的 `monthGmvTwd`
   反映 effective、完訪 + T+7 後 sweep 撥款 net。
2. **已結算後的部分退款 clawback**：`recordRefundReversalDb` 目前對「已結算」訂單為全額沖銷
   `payout_items`。退款發生在月結 sweep 之前（常見且本修正涵蓋）以 effective 正確處理；
   退款發生在已結算之後的「部分」沖銷仍為較深的結算引擎議題（#1474 報告已記），建議另開
   issue。
3. **儀表板顯示層小議題（非入帳）**：`monthlyBookings` 計數與「近期訂單」清單未過濾狀態
   （含 refunded）。屬顯示語意，與入帳金額無關，未在本次更動。
