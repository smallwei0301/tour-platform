# Soft-launch Monitoring Alert Drill Plan
> 版本：v1
> 日期：2026-05-17
> Owner：Wei
> 引用：#559, #529 (incident response), #504 (evidence pack), #505 (Go/No-Go)

---

## Static Verification Refresh — 2026-05-24

Verified at HEAD SHA `c36c624d939dda04b323ca18baafd3187cc60aa9`. Phase 13 contract tests: all pass (alerting-bus 6/6, failure-detectors 12/12). See evidence skeleton at `docs/operations/drills/2026-05-24-monitoring-alert-drill-production-skeleton.md`.

---

## 1. 靜態程式碼驗證（已完成）

Before running the live drill, verify the alert infrastructure exists in code.

Run these checks and document results:
- `grep -n "recordIncident" apps/web/src/lib/incidents.ts | head -5` — verify function exists
- `grep -rn "recordIncident" apps/web/app/api/ --include="*.ts" | head -10` — verify it's called in routes
- `grep -n "SENTRY_DSN" apps/web/sentry.server.config.ts | head -3` — Sentry config
- Check `supabase/migrations/20260511_phase13_incidents.sql` exists

### Results:

- `recordIncident` function confirmed at `apps/web/src/lib/incidents.ts` line 47 (fire-and-forget, never throws)
- Called in API routes:
  - `app/api/payments/ecpay/callback/route.ts` (line 162)
  - `app/api/payments/ecpay/refund-callback/route.ts` (lines 82, 162)
  - `app/api/internal/alerts/ecpay-failure-sweep/route.ts` (lines 56, 76, 98)
  - `app/api/internal/reminders/pre-tour-sweep/route.ts` (line 20+)
- Sentry config at `apps/web/sentry.server.config.ts`: DSN read from `SENTRY_DSN` or `NEXT_PUBLIC_SENTRY_DSN`; `enabled` gated on env presence
- Migration `supabase/migrations/20260511_phase13_incidents.sql` confirmed present

---

## 2. Production Alert Drill 計畫

### 2.1 安全觸發方式（不產生真實副作用）

**推薦觸發方式 A — Admin soft-launch 控制切換：**
1. Admin 登入 `/admin/soft-launch`
2. 將 `new_booking_paused` 切換 ON（帶 reason："drill test"）
3. 旅客端嘗試下單 → 收到 423 BOOKING_PAUSED
4. 切換 OFF（帶 reason："drill complete"）
5. 驗證 `soft_launch_control_audit` table 有 2 筆紀錄

**推薦觸發方式 B — 直接呼叫 recordIncident API（sandbox）：**
1. 使用 Admin session 呼叫 POST `/api/admin/soft-launch`（控制切換）
2. 查看 Admin Go/No-Go dashboard 顯示 HOLD
3. 不需要真實 ECPay 操作

### 2.2 驗證三個輸出

| 輸出 | 驗證方法 | 期望結果 |
|------|---------|---------|
| Sentry event | Sentry dashboard 查看 issue | 收到事件（若 SENTRY_DSN 已設定）|
| incidents table row | Supabase dashboard 查 incidents table | 有一筆紀錄，metadata 無 secrets |
| 告警通知 | LINE/Telegram/email | 收到 alert（若 channel 已設定）|

### 2.3 Redaction 要求

告警文字、incidents metadata、截圖中不得包含：
- session cookie / token
- 完整 email 或電話
- ECPay credentials
- Supabase service role key

---

## 3. 目前狀態（2026-05-17 HOLD）

| 元件 | 狀態 | 備注 |
|------|------|------|
| `recordIncident()` 程式碼 | ✅ 存在 | `apps/web/src/lib/incidents.ts` |
| Sentry config | ✅ 存在 | 需 SENTRY_DSN env 才啟用 |
| incidents table | ✅ migration 存在 | 需確認已 apply 到 production |
| 告警通知 (LINE) | ⚠️ 需確認 | LINE_CHANNEL_ID/SECRET env 需設定 |
| 實際 drill 執行 | ❌ PENDING | Owner: Wei |

---

## 4. HOLD Condition for Go/No-Go

以下任一項未完成 → Go/No-Go 保持 HOLD：
- [ ] Production Sentry DSN 已設定並測試
- [ ] 至少一次成功的 recordIncident drill（有 timestamp + result）
- [ ] incidents table 確認可寫入
- [ ] 告警通知管道確認可用

---

## 5. Evidence Format

Drill 執行後記錄：
- 執行者：
- 日期：
- 觸發方式：
- Sentry event ID：[遮蔽]
- incidents table row ID：[部分遮蔽]
- 告警收到？是/否
- 截圖：[受控位置路徑，遮蔽敏感資料]
