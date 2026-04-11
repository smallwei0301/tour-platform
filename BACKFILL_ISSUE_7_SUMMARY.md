# TP-BP-002 Backfill Script Implementation

## 📋 任務概述

實現從 V1 order-centric 架構到 V2 booking-centric 架構的安全數據回填。

## ✅ 完成項目

### 1. **Backfill Migration SQL** ✅
- 位置：`supabase/migrations/20260410000000_v2_backfill_booking_pos.sql`
- 功能：
  - **B1**: 為每個 activity 創建預設 `activity_plans`（slug='default'）
  - **B2**: 將所有有 schedule 的 orders 轉換為 bookings（含 status 映射）
  - **B3**: 拆分 orders 為 order_items（activity_booking 項目）
  - **B4**: 創建 payment_events（initiated → paid/failed 序列）
  - **Linkage**: 更新 orders.booking_id 和 orders.payment_status
  - **Audit**: 創建初始 booking_status_logs（每個 booking）

### 2. **Dry-Run & Verification 文件** ✅
- 位置：`scripts/verify-backfill.sql`
- 功能：
  - 7 個驗證模塊（Section 1-7）
  - 檢查數據完整性、status 映射、金額一致性
  - 提供最終匯總報告
  - 所有檢查都有視覺化狀態指示（✅ / ❌ / ⚠️）

### 3. **詳細抽樣報告** ✅
- 位置：`scripts/sample-verification.sql`
- 內容（20+ 筆隨機樣本）：
  - **SAMPLE 1**: 20 筆 bookings 完整溯源（booking → order → activity → plan）
  - **SAMPLE 2**: 10 個 orders 的 order_items 明細拆分
  - **SAMPLE 3**: 10 個 payments 的 event 序列（initiated → paid/failed）
  - **SAMPLE 4**: 20 個 booking 的狀態轉換 audit trail
  - **SAMPLE 5**: 5 項數據品質檢查（participants、金額、price 映射）
  - **SAMPLE 6**: 20 個 activity_plans 使用統計
  - **SAMPLE 7**: 孤立記錄偵測（orphaned records）

### 4. **回滾計畫** ✅
- 位置：`supabase/migrations/20260410000000_v2_backfill_booking_pos.rollback.sql`
- 功能：
  - 安全刪除所有 V2 backfill 記錄
  - 保留所有 V1 原始數據
  - 清除 booking_id / payment_status 欄位
  - 提供清除驗證報告

### 5. **操作指南** ✅
- 位置：`docs/04-tech/06-operational/01-backfill-booking-pos-guide.md`
- 內容：
  - 環境檢查流程
  - 執行步驟（Phase 1-4）
  - 驗收標準
  - 常見問題解決方案

---

## 🔗 數據映射參考

### Status 映射（Orders → Bookings）

| V1 Order Status | V2 Booking Status | 時間戳 |
|-----------------|------------------|--------|
| `pending_payment` | `draft` | — |
| `paid` | `pending_confirmation` | paid_at |
| `confirmed` | `confirmed` | confirmed_at 或 paid_at |
| `completed` | `completed` | completed_at 或 updated_at |
| `cancelled_by_user` | `cancelled` | updated_at |
| `cancelled_by_guide` | `cancelled` | updated_at |
| `refund_pending` | `cancelled` | updated_at |
| `refunded` | `cancelled` | updated_at |

### Payment Status 映射（Payments → Payment Events）

| Payment Status | Events Created |
|----------------|-----------------|
| Any | `initiated` (at payment.created_at) |
| `paid` | `paid` (at payment.paid_at) |
| `failed` | `failed` (at payment.updated_at) |

---

## 📊 預期數據量（典型場景）

基於現有 tour-platform 數據：

| 表 | 預期記錄數 | 說明 |
|----|----------|------|
| activity_plans | ~10-20 | 每個 published activity 一個 default plan |
| bookings | ~50-100 | 從既有 orders（有 schedule） |
| order_items | ~50-100 | 1:1 對應 orders（但可擴展為多 items） |
| payment_events | ~100-200 | 每個 payment 至少 2 個 events |
| booking_status_logs | ~50-100 | 每個 booking 至少 1 個初始 log |

---

## ✅ 驗收檢查清單

執行以下命令驗證回填成功：

```bash
# 1. 跑 dry-run 報表
psql -f scripts/verify-backfill.sql > verify-report.txt

# 2. 檢查重要指標
grep "✅ PASS" verify-report.txt  # 應全部通過

# 3. 檢查抽樣
psql -f scripts/sample-verification.sql > sample-report.txt

# 4. 確認無孤立記錄
grep "orphaned" sample-report.txt  # 應全為 0

# 5. 檢查業務邏輯正確
# - Status 映射無異常（sample-report.txt SAMPLE 1）
# - 金額加總正確（sample-report.txt SAMPLE 2）
# - Event 序列合理（sample-report.txt SAMPLE 3）
```

---

## 🚀 後續步驟

1. ✅ Backfill 回填腳本完成
2. ✅ Dry-run & 驗證腳本完成
3. ⏳ **下一步**：執行回填 → 驗證 → 部署到生產
4. ⏳ 實作 API v2（基於 bookings）
5. ⏳ 遷移前端到新 API

---

**此 PR 包含 TP-BP-002 所有交付物，準備進行 code review。**
