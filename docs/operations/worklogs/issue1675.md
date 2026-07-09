# Issue #1675 worklog — Admin dashboard 自訂趨勢日期區間 5 天範圍誤產生 6 個日桶

## 狀態

- 2026-07-09：Rita 接手執行 #1675。
- Worktree: `/root/.openclaw/workspace/worktrees/tour-platform/issue-1675-admin-trend-fix`
- Branch: `fix/issue-1675-admin-trend-range-buckets`
- Dynamic workflow manifest: `/tmp/wf_issue1675_1e15bf39/manifest.jsonl`

## Root cause

自訂 `from/to` 以 ISO/UTC 邊界傳入，例如 `T23:59:59.999Z`。原本 trend bucket 正規化使用本地 Asia/Taipei `getFullYear()/getMonth()/getDate()`，會把 UTC day end 推到隔天本地日期，導致 5 天自訂範圍產生 6 個日桶。

## 修正

- `apps/web/src/lib/db.mjs`
- 僅對 custom `from/to` range 使用 UTC day start 與 UTC day increment。
- preset/default range 保留既有本地日邏輯，避免影響 `today` / `7d` / `30d`。
- 變更後 `db.mjs` 行數未超過 strangler ceiling。

## Evidence

### RED

```bash
cd apps/web && npx -y node@22 --test tests/api/admin-dashboard-trend-range.test.mjs
```

Result before fix: `tests 7`, `pass 6`, `fail 1`；custom 5-day range actual `6` buckets.

### GREEN focused

```bash
cd apps/web && npx -y node@22 --test tests/api/admin-dashboard-trend-range.test.mjs
```

Result: `tests 7`, `pass 7`, `fail 0`.

### Focused + guard

```bash
cd apps/web && npx -y node@22 --test tests/api/admin-dashboard-trend-range.test.mjs tests/unit/db-mjs-size-guard.test.mjs
```

Result: `tests 9`, `pass 9`, `fail 0`.

### Lint

```bash
npx -y node@22 scripts/check-lint-node.mjs
cd apps/web && ESLINT_USE_FLAT_CONFIG=false npx -y node@22 ../../node_modules/eslint/bin/eslint.js app src --ignore-pattern '.next/**'
```

Result: exit `0`；只有 ESLintRC deprecation warning。

### Typecheck

```bash
cd apps/web && npx -y node@22 ../../node_modules/typescript/bin/tsc --noEmit
```

Result: exit `0`.

### Full suite

```bash
cd apps/web && GUIDE_SESSION_SECRET='rita-qa-local-strong-guide-session-secret-32plus' NODE_OPTIONS=--max-old-space-size=1024 timeout 300s npx -y node@22 --test tests/**/*.test.mjs
```

Result: `tests 4576`, `suites 355`, `pass 4573`, `fail 0`, `skipped 3`.

## 安全聲明

不記錄 credentials、tokens、cookies、storageState 或 PII。
