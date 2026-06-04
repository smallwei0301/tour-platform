# Supabase 備份與還原 Runbook

> 狀態：DRAFT — AI 初版。正式版需 Wei 補充 Supabase 儀表板截圖與實際 restore 演練後更新。
> 建立日期：2026-06-03（refs issue #594）
> 演練追蹤：issue #724（live restore drill）

---

## 1. RTO / RPO 目標（soft-launch 期間）

| 目標 | 定義 | Soft-launch 目標 |
|------|------|------|
| **RPO** (Recovery Point Objective) | 可接受的資料遺失時間上限 | **24 小時**（Supabase 預設每日備份）|
| **RTO** (Recovery Time Objective) | 服務恢復所需時間上限 | **4 小時**（不含資料一致性驗證） |
| **Owner** | 決策者 | Wei |
| **Escalation** | 無法在 RTO 內完成時 | 直接公告服務中斷，等候恢復 |

> ⚠️ Soft-launch 以 Supabase 預設備份（每日快照）為主力。如需更低 RPO，需升級 Supabase Pro+ 方案並啟用 Point-in-Time Recovery。

---

## 2. Supabase 備份機制

### 2.1 自動備份
- Supabase Free/Pro 均提供**每日自動備份**，保留 7 天
- 備份窗口：通常為 UTC 00:00–06:00（確切時間依 Supabase region 決定）
- 備份位置：Supabase Dashboard → Project Settings → Backups
- **不需要任何 cron job 或自行設定** — Supabase 全自動

### 2.2 備份確認步驟
每週一次確認（或 soft-launch 前必做）：
1. 登入 Supabase Dashboard → 進入 tour-platform project
2. Settings → Database → Backups
3. 確認最新備份時間不超過 36 小時
4. 確認備份狀態為 "Completed"（不是 "Failed" 或 "Skipped"）

### 2.3 Point-in-Time Recovery（未來升級選項）
- 需要 Supabase Pro+ 方案
- 可還原到任意時間點（分鐘級精度）
- 適用條件：月訂單量 > 50 筆或發生過真實付款錯誤後考慮升級

---

## 3. 還原操作步驟

> ⚠️ **絕對不要在 production database 直接 restore** — 必須先 restore 到隔離環境。
> ⚠️ 本操作會覆蓋目標資料庫所有資料。確認目標環境正確再執行。

### 3.1 前提條件
- [ ] 確認故障範圍（哪些表受影響，故障發生時間）
- [ ] 選擇適當備份點（故障時間前最近的備份）
- [ ] 確認 RTO 是否允許完整 restore（vs 只 restore 部分表）
- [ ] 通知 Wei（P0 事件，Wei 需批准執行）

### 3.2 Supabase 備份還原操作

**方法 A：Supabase Dashboard 還原（推薦）**
1. Dashboard → Settings → Database → Backups
2. 選擇備份點 → 點擊 "Restore"
3. 選擇 restore 目標：建議先 restore 到新的 Staging project
4. 等待 restore 完成（通常 5–20 分鐘，依資料量）
5. 在 Staging 執行 §4 一致性 smoke check

**方法 B：pg_restore（進階）**
```bash
# 需要 Supabase project password 與 DB connection string
pg_restore --host=<DB_HOST> --port=5432 --username=postgres \
  --dbname=<DB_NAME> --no-owner --no-acl \
  <backup_file.dump>
```
- 注意：先停用 prod app (kill-switch) 避免寫入衝突

### 3.3 Migration 驗證

還原後，驗證 schema 版本：
```sql
-- 查看已套用的 migrations
SELECT * FROM supabase_migrations.schema_migrations 
ORDER BY version DESC 
LIMIT 20;
```

比對 `supabase/migrations/` 目錄中的 migration 清單，確保已套用所有應有的 migration。

---

## 4. 還原後一致性 Smoke Check

> 這些 SQL 查詢只讀取資料，不修改任何表。

### 4.1 關鍵表存在性

```sql
-- 確認核心表存在且有資料
SELECT schemaname, tablename, n_live_tup 
FROM pg_stat_user_tables 
WHERE tablename IN (
  'orders', 'bookings', 'payment_events', 'refund_requests',
  'activity_schedules', 'activity_plans', 'activities', 
  'guide_profiles', 'users', 'guide_availability_rules'
)
ORDER BY tablename;
```

期望：所有表都存在，且 orders/bookings 有大於 0 的 `n_live_tup`。

### 4.2 訂單/付款一致性

```sql
-- 付款訂單應有對應 payment_events
SELECT o.id, o.status, COUNT(pe.id) AS payment_count
FROM orders o
LEFT JOIN payment_events pe ON pe.order_id = o.id
WHERE o.status IN ('paid', 'completed')
GROUP BY o.id, o.status
HAVING COUNT(pe.id) = 0
LIMIT 10;
```

期望：結果為空（所有 paid/completed 訂單都有 payment_events）。

### 4.3 退款一致性

```sql
-- 退款狀態與訂單狀態應一致
SELECT o.id, o.status, rr.status AS refund_status
FROM orders o
JOIN refund_requests rr ON rr.order_id = o.id
WHERE o.status = 'paid' AND rr.status = 'completed'
LIMIT 10;
```

期望：已退款完成的訂單狀態應為 `refunded`（不應是 `paid`）。

### 4.4 Booking V2 場次一致性

```sql
-- activity_schedules 的 plan_id 對照 activity_plans
SELECT 
  COUNT(*) FILTER (WHERE plan_id IS NULL) AS null_plan_count,
  COUNT(*) FILTER (WHERE plan_id IS NOT NULL) AS has_plan_count,
  COUNT(*) AS total
FROM activity_schedules;
```

對照 restore 前的基準值（從 issue #1079 comment 可知 53/61 為 NULL，PR #1135 後預期不同）。

### 4.5 軟上線控制

```sql
-- 確認 kill-switch 狀態正確
SELECT * FROM soft_launch_controls LIMIT 5;
```

期望：`public_paused` 與預期設定一致（restore 後需手動確認這個值是否應該重設）。

---

## 5. Restore 後的服務恢復步驟

1. **Schema drift 修復**：若備份點缺少新 migration，手動執行缺少的 migration SQL
2. **Kill-switch 確認**：確認 `soft_launch_controls.public_paused` 值正確
3. **環境變數確認**：Vercel env 的 `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` 指向正確 DB
4. **API health check**：`curl https://tour-platform-nine.vercel.app/api/health`
5. **Admin smoke**：登入 Admin → 確認訂單列表、活動列表正常載入
6. **Booking smoke**：嘗試建立 draft（使用 ALLOW_MOCK_PAYMENT=1）
7. **監控確認**：如有設定第三方監控（#685），確認 probe 成功

---

## 6. Restore 演練記錄範本

> 填寫後儲存到 `docs/operations/reports/restore-drill-YYYY-MM-DD.md`
> 演練追蹤：issue #724

```markdown
# Supabase Restore 演練記錄

演練日期：
演練者：Wei
備份點選擇：YYYY-MM-DD HH:MM UTC
環境：Supabase Staging project（不是 production）

## 操作記錄
1. [時間] 開始 restore 操作
2. [時間] Restore 完成（耗時：N 分鐘）
3. [時間] 開始一致性 smoke check
4. [時間] Smoke check 完成

## Smoke Check 結果
- [ ] 關鍵表存在性：PASS / FAIL（說明）
- [ ] 訂單/付款一致性：PASS / FAIL（說明）
- [ ] 退款一致性：PASS / FAIL（說明）
- [ ] Kill-switch 狀態：正確 / 需調整
- [ ] API health check：PASS / FAIL

## 問題與改善點
（演練發現的問題，轉化為 backlog issues）
```

---

## 7. 不可在 Production 直接演練的限制

- Supabase Dashboard 的 "Restore" 操作會**完全覆蓋**目標 DB，不可逆
- 演練必須在 Supabase Staging/Dev project 上進行
- 如果沒有 Staging project：在 Supabase 建立新的免費 project → restore 到那裡
- **絕不**直接 restore 到 tour-platform production project

---

## 8. 關聯文件

- 事故應對：`docs/05-business/07-operations-plan/04-incident-response.md`
- 演練追蹤：issue #724（live restore drill）
- 付款結算：`docs/05-business/06-payment-plan/05-settlement-payout-ops-runbook.md`
- 監控設定：`docs/operations/third-party-monitoring-options.md`（issue #685）
