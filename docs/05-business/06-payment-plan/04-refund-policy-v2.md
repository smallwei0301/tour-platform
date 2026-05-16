# 退款政策 v2 — Source of Truth

> 版本：v2
> 狀態：**已拍板（2026-05）**
> 實作來源：`supabase/migrations/20260512_issue309_refund_policy_v2.sql`
> 關聯 issues：#309, #316, #381
> 引用方：#319（CS SOP）、#402（付款/退款 evidence）、#504（evidence pack）、#505（Go/No-Go）、#531（安全/redaction）

---

## 1. 旅客自行取消退款比例（已拍板）

| 取消時間 | 退款比例 | cutoff_hours |
|---------|---------|-------------|
| 出發前 7 天以上 | **100%** | ≥ 168h |
| 出發前 3–7 天 | **70%** | ≥ 72h, < 168h |
| 出發前 72 小時內 | **0%** | < 72h |

> 以上比例以「訂單金額」計算，不含平台手續費（由平台吸收，見第 5 節）。

---

## 2. 改期規則（已拍板）

- 每張訂單最多改期 **1 次**
- 必須在出發前 **72 小時以上** 提出
- 改期後的新出發日須在原出發日起 **90 天內**
- 改期不影響退款資格（若改期後再取消，以原始出發日計算退款比例）

---

## 3. 導遊 / 平台取消（已拍板）

- 原則：**全額退款（100%）**
- 視情況加送補償優惠或下次使用折扣（由 Admin 決定，非自動）

---

## 4. 不可抗力（Force Majeure）（已拍板）

適用情況：
- 政府命令（government_order）
- 颱風（typhoon）
- 地震（earthquake）
- 主辦方取消（organizer_cancel）

處理原則：**全額退款** 或 **改期擇一**（以旅客選擇為主）。

---

## 5. 手續費吸收（已拍板）

- ECPay 退款手續費由**平台吸收**，不從旅客退款金額中扣除。
- 部分退款（70% 情境）以訂單金額乘以比例後整數計算，餘數由平台處理。

---

## 6. 爭議單 SLA（已拍板）

- 旅客提出爭議後，平台客服 **2 個工作天**內初步回覆。
- 需人工審查時，訂單標記為 `refund_pending`，最長 **5 個工作天**作出決定。
- 結果通知旅客後，退款 **3–5 個工作天**到帳。

---

## 7. Admin 人工 Override（已拍板）

- Admin 可在 Admin 後台對任意訂單手動執行退款或部分退款。
- Override 須填寫原因，系統自動記錄操作者、時間、金額與理由。
- Override 不受時間比例限制，但需 Admin 角色。

---

## 8. 旅客可見文案對齊

旅客端退款政策說明應與本文件一致：

- 活動頁「購買須知」→ 顯示時間區間與退款比例（7d+ 100%、3-7d 70%、<=72h 0%）
- 訂單頁退款申請 → 顯示「退款申請已送出，金額將退回原付款工具（通常 3-5 個工作天）」
- `/legal/refund` → 應引用本文件規則

---

## 9. 關聯實作

| 元件 | 路徑 |
|------|------|
| DB schema + seed | `supabase/migrations/20260512_issue309_refund_policy_v2.sql` |
| TypeScript 退款計算 | `apps/web/src/lib/refund-policy.ts` |
| 旅客退款申請 API | `apps/web/app/api/me/orders/[orderId]/refund-requests/route.ts` |
| Admin 退款執行 | `apps/web/app/api/admin/orders/[orderId]/refund-execute/route.ts` |
| ECPay 退款 callback | `apps/web/app/api/payments/ecpay/refund-callback/route.ts` |
| 歷史回補工具 | `scripts/admin/backfill-refund-status.mjs` |
| 對帳輪詢 cron | `scripts/cron/refund-reconcile.mjs` |

---

## 10. Evidence 引用

本文件為 #504（evidence pack）與 #505（Go/No-Go）中「退款政策」欄位的引用點。
CS SOP（#319）的退款話術應以本文件第 6 節爭議 SLA 為依據。
