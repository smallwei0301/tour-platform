# Worklog — 後台排程全面降頻至每日 ＋ 前台顯示頻率/最後執行時間

- 分支：`claude/schedule-frequency-daily-of5brf`
- 日期：2026-07-10（Asia/Taipei）
- 需求：把後台「排程管理」面板中所有「每小時」與「每六小時」的排程降頻到每日；前台跟著顯示新頻率，並新增「最後執行時間」。不能直接降頻的排程要改排程編寫邏輯，避免出現盲區。

## 盤點（改版前）

後台面板單一來源 = `apps/web/src/lib/admin/go-no-go-schedules.mjs` 的 `SCHEDULE_REGISTRY`（鏡射 `.github/workflows/*.yml` 的 cron；registry-vs-YAML 由 `tests/api/go-no-go-schedule-registry.test.mjs` 守門）。頻率高於每日者共 4 支：

| Job | 舊 cron | 舊頻率 | 處理方式 |
|---|---|---|---|
| `refund-reconcile` | `0 * * * *` | 每小時 | 直接降頻 → `0 3 * * *`（每日 03:00 UTC／台北 11:00） |
| `readiness-snapshot-refresh` | `0 */6 * * *` | 每 6 小時 | 直接降頻 → `0 5 * * *`（每日 05:00 UTC／台北 13:00） |
| `ecpay-failure-sweep` | `15 * * * *` | 每小時 | 改邏輯後降頻 → `15 3 * * *`（每日 03:15 UTC／台北 11:15） |
| `pre-tour-reminder-sweep` | `0 * * * *` | 每小時 | 改邏輯後降頻 → `0 22 * * *`（每日 22:00 UTC／台北 06:00 晨間） |

其餘 12 支已是每日或每週，不動。

## 需改邏輯的兩支（避免降頻後產生盲區）

1. **ecpay-failure-sweep**（`app/api/internal/alerts/ecpay-failure-sweep/route.ts`）
   - 舊：回看窗固定 60 分鐘，每小時掃 → 剛好無縫涵蓋。
   - 降到每日若不改窗，會出現 23 小時盲區。
   - 改法：回看窗 `60 分鐘` → `24 小時`（1440 分），隨每日排程完整涵蓋、無盲區。門檻維持 `>3`（一天 ≥4 次 callback 失敗才告警）；`window_minutes` metadata 同步更新為 1440。告警最多延後一天。

2. **pre-tour-reminder-sweep**（`app/api/internal/reminders/pre-tour-sweep/route.ts`）
   - 舊：每小時掃，h24 窗 `[now+23h, now+25h)`、h1 窗 `[now+30m, now+90m)`，靠每小時密度無縫覆蓋。
   - 每日排程無法做到「出發前 1 小時」精準送達。
   - 改法（無盲區、雙提醒保留）：改為每日雙視窗、各寬 24 小時：
     - h24（行前一日提醒）：`[now+24h, now+48h)`
     - h1（當日出發提醒）：`[now, now+24h)`
   - 每日一跑即涵蓋整天，兩視窗相接不重不漏；idempotency（`UNIQUE(order_id, reminder_kind, channel)`）確保不重送。
   - h1 文案由「1 小時後出發」改為「當日出發」以誠實反映每日晨間發送的時點（`src/lib/pre-tour-reminder.ts`）。

> 決策備註：原擬以 `AskUserQuestion` 跟 owner 確認 h1 取捨（當日晨間 vs 移除 h1），但工具串流中斷、使用者回覆「Continue」。故採最安全、無盲區、可逆、且保留雙提醒的每日方案並在此記錄，方便日後調整。

## 前台（後台面板 UI）

`app/admin/go-no-go/CronJobsPanel.tsx`
- 「真實 GitHub Actions 排程」欄位讀 registry 的 `scheduleZh`/`cron`，改 registry 後自動顯示新頻率。
- 新增「最後執行」欄：顯示各 workflow 最近一次 run 的時間（Asia/Taipei）＋結論（成功/失敗）＋連結。資料來源＝GitHub Actions runs API（`listCronJobsForAdmin` 併撈近期 runs，於 view model 帶 `lastRun`）。

## 測試

- `tests/api/go-no-go-schedule-registry.test.mjs`：registry cron 需與 YAML 一致 → 兩邊同步更新即綠。
- `tests/api/pre-tour-reminder-contract.test.mjs`：AC3/AC9 斷言舊窗界與 hourly cron → 隨邏輯改動同步更新。
- `tests/api/phase13-failure-detectors-contract.test.mjs`：檢視是否斷言 60 分窗。
- `tests/api/cron-route-wiring.test.mjs`：不受影響（仍呼叫 gate / recordCronRun）。
- 新增/更新：last-run view model 與面板欄位測試。

## 進度

- [x] 4 支 workflow YAML cron 降頻（refund `0 3`、readiness `0 5`、ecpay-failure `15 3`、pre-tour `0 22`）
- [x] `go-no-go-schedules.mjs` registry 同步（cron/scheduleZh/風險說明）＋ last-run view model（`fetchGithubWorkflowRuns`／`pickLatestRunsByPath`／`lastRun`）
- [x] `cron-job-controls.mjs` CRON_JOBS schedule 字串同步
- [x] ecpay-failure-sweep 回看窗改 24h（`windowMs`、`window_minutes`、訊息）
- [x] pre-tour-sweep 雙視窗改 24h（h24 `[+24h,+48h)`、h1 `[0,+24h)`）＋ h1 文案改「當日出發」
- [x] CronJobsPanel 新增「最後執行」欄（Asia/Taipei 時間＋結論 pill＋run 連結）
- [x] 相關測試更新 ＋ run-checks 綠燈（80 tests pass）、typecheck 綠、lint 綠
- [ ] commit / push

## 驗證證據

- `.claude/hooks/run-checks.sh`（7 檔）：80 pass / 0 fail。
- `npm run typecheck`：綠（tsc --noEmit）。
- `npm run lint`：綠（僅 eslintrc 棄用警告）。
