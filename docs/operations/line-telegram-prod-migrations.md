# Production migration apply checklist — LINE / Telegram 通知（PR #920）

> 建立：2026-06-15（Asia/Taipei）。對應 PR #920（branch `claude/line-integration-plan-a26p7`，squash `f4689486`）。
> **背景**：PR #920 的程式碼已合併並部署到 Vercel production，但 `supabase/migrations/` 的 DDL **不會**隨 Vercel deploy 自動套用——必須另外對 production Supabase 執行。未套用時，相關 endpoint 會在寫入不存在的表時拋例外（前端顯示「網路錯誤」）。實例：導遊按「綁定 Telegram」回 500，根因即 `telegram_bind_code` 表不存在。

## 1. 需套用的 migration（依執行順序）

| # | 檔案 | 建立的物件 | 用途 | 現在需要？ |
|---|---|---|---|---|
| 1 | `supabase/migrations/20260529_line302_line_user_mapping.sql` | `line_user_mapping` | 旅客 ↔ LINE userId 綁定（Messaging API 旅客推播基礎） | LINE 功能用到時 |
| 2 | `supabase/migrations/20260529_line302_line_webhook_events.sql` | `line_webhook_events` | LINE webhook 投遞冪等（以 webhookEventId 去重） | LINE webhook 啟用時 |
| 3 | `supabase/migrations/20260529_line302_reminder_line_push_channel.sql` | `tour_reminder_log` CHECK 加 `line_push` | pre-tour 提醒新增 LINE 推播 channel | LINE 提醒啟用時 |
| 4 | `supabase/migrations/20260615_line302b_guide_line_mapping.sql` | `guide_line_mapping`、`guide_line_bind_code` | 導遊個人 LINE 綁定（BIND-XXXXXX 一次性碼） | 導遊 LINE 綁定啟用時 |
| 5 | `supabase/migrations/20260615_line302c_telegram_binding.sql` | `telegram_chat_mapping`、`telegram_bind_code`、`telegram_webhook_events` | **Telegram 綁定（導遊/旅客）+ 一次性碼 + webhook 冪等** | **是（綁定流程已上線）** |
| 6 | `supabase/migrations/20260615_line302b_line_bind_code.sql` | `line_bind_code` | **旅客 LINE console 綁定一次性碼（TBIND-XXXXXX，非 LIFF）** | 旅客 LINE console 綁定啟用時 |
| 7 | `supabase/migrations/20260615_notify920_notification_event_settings.sql` | `notification_event_settings`、`notification_event_settings_audit` | **後台通知矩陣（事件×對象×通道勾選）單列設定 + 稽核** | 後台通知矩陣啟用時（未套用時 fallback 視為全開，不致報錯） |

- 每個 migration 皆附 `*.rollback.sql`（同目錄、同檔名）。
- 全部為**冪等 DDL**（`CREATE TABLE IF NOT EXISTS` / `CREATE POLICY IF NOT EXISTS` 模式），重跑安全。
- RLS：三組表皆 service_role-only（鏡像 `line_user_mapping`）。

## 2. 套用方式

### 方式 A — Supabase Dashboard SQL Editor（最快，無需 CLI）
1. Dashboard → 專案 → **SQL Editor** → New query。
2. 依上表順序，逐檔貼上 `BEGIN; … COMMIT;` 內容並 Run（或一次貼多檔，順序維持 1→5）。
3. 成功顯示 `Success. No rows returned`。

### 方式 B — Supabase CLI（推薦長期）
依 `docs/operations/booking-v2-rollback-runbook.md` 的標準 migration 程序執行（`supabase db push` / 受控連線），保留 migration 紀錄。

## 3. 套用後驗證

```sql
-- 三組表都應存在
SELECT table_name FROM information_schema.tables
WHERE table_name IN (
  'line_user_mapping','line_webhook_events',
  'guide_line_mapping','guide_line_bind_code',
  'telegram_chat_mapping','telegram_bind_code','telegram_webhook_events',
  'line_bind_code','notification_event_settings','notification_event_settings_audit'
) ORDER BY table_name;

-- tour_reminder_log 接受 line_push
SELECT pg_get_constraintdef(oid) FROM pg_constraint
WHERE conname = 'tour_reminder_log_channel_check';

-- 綁定情形（測試/稽核用；只含 chat_id + 主鍵，無訊息內容）
SELECT role, subject_id, chat_id, display_name, is_blocked, bound_at
FROM telegram_chat_mapping ORDER BY bound_at DESC;
```

回到 `/guide/profile` 重按「綁定 Telegram」應正常產生深連結（不再「網路錯誤」）。

## 4. 注意

- LINE 三個 push flag（`LINE_MESSAGING_ENABLED` / `LINE_PUSH_ENABLED` / `LINE_GUIDE_PUSH_ENABLED`）預設 OFF，未套用 LINE migration 時不會炸；但啟用前務必先套，否則 webhook ingestion / 綁定會在寫表時失敗（webhook route 吞錯永遠回 200，失敗不易察覺）。
- Telegram migration（#5）為目前綁定流程的硬相依，已優先套用。
- 詳見 `docs/operations/notifications-line-telegram-email.md`（通知系統現況與架構）。
