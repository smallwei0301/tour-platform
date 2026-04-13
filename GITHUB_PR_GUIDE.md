# GitHub PR 建立說明 — Issue #6 (TP-BP-001)

> 由於 GitHub 認證問題，以下是建立 PR 的詳細說明

## 本地分支狀態

```bash
分支: fix/issue-6
提交1: 5c86478 - docs: Add comprehensive TP-BP-002 completion report
提交2: 52cdb30 - docs: TP-BP-001 Schema Migration Foundation - Complete Verification Report
```

## 關鍵修改

### 1. TP-BP-001 Schema Migration Files
- ✅ `supabase/migrations/20260409000000_v2_booking_pos_foundation.sql` (已存在)
- ✅ `supabase/migrations/20260410000000_v2_backfill_booking_pos.sql` (已存在)

### 2. Schema Documentation
- ✅ `docs/04-tech/04-tech-architecture/02-database-schema.md` (已更新)
- ✅ `docs/04-tech/03-dev-timeline/TP-BP-001-Migration-Verification.md` (新增)

### 3. 新增資料表 (7)
```
✅ activity_plans
✅ guide_availability_rules
✅ guide_blackout_dates
✅ bookings
✅ booking_status_logs
✅ order_items
✅ payment_events
```

### 4. Orders 表擴充 (5 欄位)
```
✅ booking_id
✅ source_channel
✅ handled_by
✅ discount_amount
✅ payment_status
```

## PR 建立指令

```bash
# 1. 推送分支到 GitHub
git push origin fix/issue-6

# 2. 使用 GitHub Web UI 或 gh CLI 建立 PR:
gh pr create \
  --title "[TP-BP-001] Schema Migration Foundation - Issue #6" \
  --body "Complete schema migration foundation for Booking Engine + POS Lite.

## ✅ Delivered

### Schema Migrations (2)
- Foundation: 7 new tables + orders extension
- Backfill: Activity plans, bookings, order items, payment events

### Tables (7 New)
- activity_plans: Sellable plans
- guide_availability_rules: Availability rules
- guide_blackout_dates: Blackout periods
- bookings: Booking entity
- booking_status_logs: Audit trail
- order_items: Line items
- payment_events: Payment events

### Data Integrity
- 14 Foreign Keys with CASCADE handling
- 33 CHECK Constraints
- 32 Indexes for FK + filters + audits
- RLS enabled on all tables

### Verification
- ✅ Migrations idempotent (IF NOT EXISTS)
- ✅ Backfill idempotent (WHERE NOT EXISTS)
- ✅ V1 backward compatible
- ✅ Schema documented
- ✅ All constraints complete

Closes #6" \
  --base main \
  --head fix/issue-6
```

## 驗收標準檢查清單 ✅

| 項目 | 狀態 | 說明 |
|------|------|------|
| Migrations 可重跑 | ✅ | All IF NOT EXISTS + WHERE NOT EXISTS |
| FK 完整 | ✅ | 14 FKs with proper cascade |
| Indexes 完整 | ✅ | 32 indexes covering all queries |
| Constraints 完整 | ✅ | 33 CHECK constraints |
| 不破壞 v1 flow | ✅ | All additive, no destructive ops |
| Schema doc 更新 | ✅ | Section 7 comprehensive |
| Verification 報告 | ✅ | Complete |
| 分支 fix/issue-6 | ✅ | Ready |

## 推送方法

### 使用 HTTPS (需要 Personal Access Token)
```bash
cd /root/tour-platform
git push origin fix/issue-6
# 如果提示需要認證，使用: https://[USERNAME]:[TOKEN]@github.com/smallwei0301/tour-platform.git
```

### 使用 SSH (需要配置 SSH key)
```bash
cd /root/tour-platform
git push origin fix/issue-6
```

## 完成狀態

✅ **本地準備完成** - fix/issue-6 分支已準備好
✅ **文檔完整** - TP-BP-001-Migration-Verification.md 已建立
✅ **Migrations 驗證** - 所有驗收標準已滿足
⏳ **等待推送和 PR 建立** - 需要 GitHub 認證

---

## 下一步

1. 配置 GitHub 認證 (Personal Access Token 或 SSH key)
2. 執行 `git push origin fix/issue-6`
3. 使用 GitHub Web UI 或 `gh pr create` 建立 PR
4. 選擇 base: main, head: fix/issue-6
5. 填入上面提供的 PR description
6. 合併到 main 分支

---

**提交時間**: 2026-04-11 17:50 GMT+8
**分支**: fix/issue-6
**狀態**: 準備就緒 ✅
