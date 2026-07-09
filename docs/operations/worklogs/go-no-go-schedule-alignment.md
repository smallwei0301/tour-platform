# Go/No-Go schedule alignment worklog — 真實 GitHub Actions 排程對齊

## 狀態

- 2026-07-09：Anna 在乾淨 worktree 接手。
- Worktree: `/root/.openclaw/workspace/.worktrees/go-no-go-schedule-alignment`
- Branch: `feat/go-no-go-schedule-alignment`

## 目標

把 `/admin/go-no-go` 內的排程管理對齊到 **GitHub Actions 真實 workflow**：

1. 顯示目前 repo 真的存在且有 cron 的 workflow。
2. 每支排程提供白話功能說明、風險分級、停用效果說明。
3. 開關直接走 GitHub workflow enable / disable，而不是 DB kill switch 假開關。
4. 停用時明確說明：workflow 不再執行，因此不會再發 Telegram / Email 通知。

## Root cause / 背景

現況的 `CronJobsPanel.tsx` 是舊方案殘留：

- UI 仍掛在 `/admin/go-no-go`，但 fetch `/api/admin/cron-jobs`；
- repo 內沒有對應 route；
- `src/lib/cron-job-controls.mjs` 是舊的 DB-backed kill switch 設計，只涵蓋 7 支 internal endpoint，
  也無法對上目前 GitHub 上真正 active 的全部 scheduled workflows。

結果就是：後台排程管理和 GitHub Actions 真實排程已經脫節。

## 修正策略

- 新增 `src/lib/go-no-go-schedules.mjs`
  - 以目前 `.github/workflows/*.yml` 有 cron 的 workflow 為 registry 單一來源。
  - 每支定義：workflowPath、workflowName、cron、scheduleZh、labelZh、summaryZh、riskLevelZh、riskReasonZh、disableEffectZh。
  - 透過 GitHub Actions API 讀 live workflow state。
  - 透過 GitHub Actions API 執行 enable / disable。
- 新增 `app/api/admin/cron-jobs/route.ts`
  - `GET`：回傳 registry + live GitHub state merge 後的 jobs。
  - `PATCH`：直接切 GitHub workflow enable / disable。
- 重寫 `app/admin/go-no-go/CronJobsPanel.tsx`
  - 顯示「排程管理 / 真實 GitHub Actions 排程 / 功能說明 / 風險分級 / 狀態 / 開關」。
  - 停用確認文案明確寫出「停用後不會再發 Telegram / Email 通知」。
- 新增 focused tests
  - registry 與 workflow YAML 對齊
  - route contract
  - UI contract / 文案 / endpoint 使用

## Evidence

### RED → GREEN focused tests

```bash
cd apps/web
npx -y node@22 --test \
  tests/api/go-no-go-schedule-registry.test.mjs \
  tests/api/go-no-go-schedule-toggle-route.test.mjs \
  tests/ui/admin-go-no-go-schedule-management.test.mjs
```

Result after implementation: `tests 7`, `pass 7`, `fail 0`.

## 其他檢查

### Typecheck（blocked by repo-wide dependency / env mismatch）

```bash
cd apps/web
npx -y -p typescript@6.0.2 tsc --noEmit
```

Result: 失敗，但錯誤為 repo 既有缺依賴 / 型別環境問題，非本次變更新增：
- `next-intl`
- `zod`
- `@line/liff`
- `qrcode.react`
- `pngjs`
- `pixelmatch`
等 module not found；另有既有 TS 型別錯誤。

### ESLint（blocked by existing config dependency mismatch）

```bash
cd apps/web
ESLINT_USE_FLAT_CONFIG=false node /root/.openclaw/workspace/tour-platform/node_modules/eslint/bin/eslint.js ...
```

Result: `next/core-web-vitals` config 在目前驗證環境無法解析；屬現有 lint harness / dependency 狀態問題，非本次功能邏輯錯誤。

## Live toggle 驗證

原本打算用 GitHub token 做一次 disable → verify → enable round-trip，但 terminal 對外 GitHub 操作被 consent guard 擋下；需使用者明確再授權一次才能做 live state mutation 驗證。

## 安全聲明

未輸出 token / secret / cookie / raw GitHub credential。
