# 部分退款（partial refund）落地驗收報告 — staging 實測

- **判定：PASS（核心 P0 已修復並 live 驗證）**
- **PR：** #1473（branch `claude/order-status-annotations-8da27n`）
- **驗收環境：** Vercel Preview（git branch alias）
  `https://tour-platform-git-claude-order-st-b8cb59-smallwei0301s-projects.vercel.app`
- **Deploy / commit：** `0df8175`（deployment `dpl_CdH2pba32AZqiEzx2wkcjr22w6DL`，READY）
- **驗收時間：** 2026-06-18 13:31 (Asia/Taipei)
- **資料層：** 真實 Supabase（preview 與 production 共用同一專案）
- **測試訂單：** 合成測試單 `00000000-0000-4000-8000-000000040542`（cash，total 1998）

> 註：本報告不含任何密鑰／cookie／token／service-role key／完整付款 payload；admin 認證以
> header 帶入，未寫入文件。

---

## 背景：staging 實測抓到單元測試抓不到的 P0

部分退款功能原本 14 個單元測試全綠（`partial-refund-amount.test.mjs` 等），但**真實
Supabase 上「執行退款」一律回 500 `DB_UPDATE_FAILED`**。逐步實測 + 比對 migration 後確認：

`refund-execute` 對 `orders` 寫入三個**不存在於真實 schema** 的欄位：

| 欄位 | 是否有 migration 建立 | 是否有讀取點 |
| --- | --- | --- |
| `orders.refunded_amount` | 無 | 無（純死寫入） |
| `orders.refunded_at` | 無（`refunded_at` 僅存在於 `refund_requests` / `payments`） | 無 |
| `orders.ecpay_refund_trade_no` | 無（任何 migration 皆未定義） | 僅 idempotency 讀，且本就有 fallback |

`db.mjs` 的 in-memory fallback 對任何欄位照單全收，故單元測試綠燈無法反映 production
schema 落差 —— 與 #1376 同類型的 fallback/Supabase 契約落差。`orders` 真實可用欄位僅
`status` 與 `payment_status`（後者於 `20260409_v2_booking_pos_foundation.sql` 新增，
CHECK 已含 `partially_refunded`）。

此外發現**出帳正確性缺口**：導遊撥款結算（`settlement-config.ts` / settlement sweep /
guide payout）讀的是 `operations_tracking.refund_amount_twd`，而非 `orders.refunded_amount`。
原碼即使把欄位補上，部分退款也不會反映到導遊撥款。

---

## 修正內容

1. **移除三個幽靈欄位寫入**（`refund-execute.ts` 兩條路徑 + `route.ts` persistReversal）。
   `orders` 更新一律只寫 `{ status, payment_status, updated_at }`。
2. **退款明細仍持久化於既有欄位**：時間／trade_no 落在 `payments` + `payment_events`
   （ECPay 路徑既有寫入）；回應 body 仍帶 `ecpayRefundTradeNo`。
3. **部分退款金額寫入 `operations_tracking.refund_amount_twd`**（出帳真正讀取的欄位）——
   採針對性 upsert，保留 ops 既有人工欄位（manual_minutes / holds / complaint 等）。
   寫入失敗不阻斷退款回應（provider 端已退成功），改記 incident 供補登。
4. `orders.payment_status` 以 `partially_refunded` / `refunded` / `voided` 區分；
   `persistReversal` 契約新增 `partial` 旗標。

---

## Acceptance criteria 逐條證據

### AC1 — 部分退款不再 500（P0）：PASS（live）
`POST /api/admin/orders/{id}/refund-execute`，body `{"refundAmount":1000,"reason":"…"}`

- 修正前：`HTTP 500 {"code":"DB_UPDATE_FAILED","message":"Could not find the 'refunded_amount' column…"}`
  → 再修一輪後 `… 'refunded_at' column…`
- 修正後：`HTTP 200 {"ok":true,"data":{"refunded":true,"cashOrder":true,"refundedAmount":1000,"partial":true}}`

### AC2 — 訂單狀態轉移：PASS（live）
退款後 `orders.status`：`refund_pending → refunded`（admin orders API 實測）。

### AC3 — 部分退款金額流到導遊出帳：PASS（live）
`GET /api/admin/operations-tracking/csv` 實測該訂單列：

```
orderId,…,status,gmv,…,refundAmountTwd,…,finalContributionTwd,…
00000000-0000-4000-8000-000000040542,…,refunded,1998,…,1000,…,70,…
```

`refundAmountTwd=1000` 已寫入 → effective GMV = 1998 − 1000 = 998，`finalContributionTwd`
隨之反映（70）。確認部分退款真正影響導遊撥款。

### AC4 — `payment_status` 區分部分／全額：PASS（單元 + 原子寫入推證）
`payment_status='partially_refunded'` 與 `status` 在同一筆 atomic update 寫入；該 update
成功（status 已轉 refunded）且 `payment_status` CHECK 約束允許 `partially_refunded`，故值
已落地。值由 `partial-refund-amount.test.mjs` / `issue369-…` 契約測試鎖定。
（admin orders serializer 未對外輸出 `payment_status`，故未提供獨立 GET 證據。）

### AC5 — 向後相容（全額退款）與 void 路徑：PASS（單元）
全額退款 → `payment_status='refunded'`；ECPay 授權未請款 void（Action=N）→ `voided`、
partial 旗標 false；部分金額 + 未請款 → 409 `PARTIAL_REFUND_UNSUPPORTED`（不打 ECPay）。

### 迴歸
- `npm test` 全綠：3614 pass / 0 fail / 3 skip（299 suites）。
- `npm run typecheck`：綠。
- 新增 `tests/api/issue1474-refund-payout-wiring.test.mjs` source-contract，鎖定三個幽靈
  欄位皆不再以物件字面寫入 + `operations_tracking` 線路。

---

## 未涵蓋／後續事項

1. **ECPay 沙盒真實信用卡 Action=R 部分退刷**：公開測試商店（MerchantID 2000132）無法
   自行觸發「請款／關帳」，因此無法在沙盒達到 captured 狀態測 Action=R 部分退刷
   （此為 ECPay 信用卡真實業務限制：同日授權未請款只能全額 void）。preview 已配置沙盒
   憑證（`ECPAY_ENV=stage`），可測付款流與 void(Action=N) 路徑；captured 後的部分退刷
   需正式環境關帳後或 ECPay 提供 captured 測試交易方能 live 驗。
2. **已結算後的部分退款 clawback**：`recordRefundReversalDb` 目前為全額沖銷
   `payout_items`。退款發生在月結 sweep 之前（常見情境）以 `refund_amount_twd` 正確處理；
   退款發生在已結算之後的「部分」沖銷為較深的結算引擎議題，建議另開 issue 評估。
3. **`payment_status` 對外可視性**：admin orders API 未輸出 `payment_status`，後台若需顯示
   部分退款狀態可另補 serializer 欄位。
