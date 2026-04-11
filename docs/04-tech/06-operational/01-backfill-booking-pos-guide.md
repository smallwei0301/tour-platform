# Backfill Guide: V1 → V2 Booking/POS Migration

**Issue**: [TP-BP-002] Backfill Script for Booking/POS V2  
**Date**: 2026-04-10  
**Status**: Ready for production execution

---

## 📋 概述

本文件指導如何從 V1（MVP order-centric）架構安全回填到 V2（booking-centric）架構。

### 回填覆蓋範圍

| V1 表 | V2 表 | 映射邏輯 |
|------|------|---------|
| `activities` | `activity_plans` | 每個 activity 建立一個預設 plan（`default`） |
| `orders` + `activity_schedules` | `bookings` | 每個有 schedule 的 order 轉換為 booking |
| `orders` | `order_items` | 每個 order 拆分為 line items（活動 + 費用等） |
| `payments` | `payment_events` | 支付狀態轉換為事件序列 |

### 設計原則

1. **冪等性（Idempotent）**：可安全重複執行
2. **無損（Lossless）**：所有既有資料保留，不覆蓋
3. **追蹤（Traceable）**：所有狀態變更有記錄（`booking_status_logs`）
4. **驗證（Verifiable）**：提供 dry-run 報表 + 抽樣檢查

---

## 🛠️ 執行流程

### Phase 1: 環境檢查

```bash
# 確認 V2 foundation migration 已執行
psql -h $SUPABASE_HOST -d postgres -U postgres -c "
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_name = 'activity_plans'
  );"
# 預期返回：t（true）

# 檢查當前 V1 數據量
psql -h $SUPABASE_HOST -d postgres -U postgres -c "
  SELECT 
    (SELECT count(*) FROM activities) as activities,
    (SELECT count(*) FROM orders) as orders,
    (SELECT count(*) FROM payments) as payments
  \gx"
```

### Phase 2: Dry-Run 報表

在執行實際回填前，先跑 dry-run 檢查預計會回填多少記錄。

### Phase 3: 執行 Backfill

運行正式 migration（已包含在 `supabase/migrations/20260410000000_v2_backfill_booking_pos.sql`）。

### Phase 4: 驗證回填結果

執行 `scripts/verify-backfill.sql` 檢查完整性。

---

## ✅ 驗收標準

- ✅ 所有 activities 有對應的 activity_plans
- ✅ 所有有 schedule 的 orders 已轉換為 bookings
- ✅ 訂單金額正確拆分到 order_items
- ✅ 支付狀態轉換為 payment_events 事件序列
- ✅ 抽樣驗證 20+ 筆記錄無異常

---

**交付物已就緒，詳見 Issue #7 相關檔案。**
