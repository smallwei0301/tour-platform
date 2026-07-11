# issue1700 — Admin 手機版排程管理卡片式呈現
> 最後更新：2026-07-11 21:43 CST｜負責 session：Una / tp-builder-ui

## 目標
將 `/admin/go-no-go` 的排程管理在寬度小於 640px 時改為可完整閱讀與操作的 job cards，並維持桌面版既有表格。

## AC 清單
- [ ] 390px 使用獨立 cards，不出現水平捲動的主呈現。
- [ ] Public Booking V2 Audit card 完整顯示工作流、排程、最後執行、風險、狀態與開關。
- [ ] >=640px 保留現有 table 欄位與 toggle。
- [ ] loading、error、缺 GitHub admin token 狀態維持可見。
- [ ] 有可重複執行的 UI/browser 測試與必要的 typecheck、diff 檢查證據。

## 已完成（附證據）
- 2026-07-11 完成 mobile cards 與 desktop table breakpoint：`<640px` 顯示完整 workflow card，`>=640px` 保留既有 table 和 toggle 語意。
- RED：`node --test --test-concurrency=1 tests/ui/issue1700-admin-mobile-cron-cards.test.mjs` 初始因沒有 mobile card 失敗。
- GREEN：`.claude/hooks/run-checks.sh apps/web/tests/ui/issue1700-admin-mobile-cron-cards.test.mjs`（Node 22）3/3 通過；scoped `tsc --noEmit --project /tmp/issue1700-tsconfig.json` 通過；完整 `cd apps/web && npx tsc --noEmit`（1 GiB heap）通過；`git diff --check` 通過。
- Local Next smoke：`scripts/tp_next_local_smoke.py --json --path /admin/go-no-go` 以 polling、512 MiB heap 成功 HTTP 200 且清理完成；未有可供此卡使用的已登入持續 server，因此新增的 mock Playwright spec 留待 review/CI 或 preview 執行。

## 下一步
- 本機 commit 後停在 review-required，等待 Rita 獨立檢視 diff 與執行 Playwright spec。

## 絕不重做（Do-NOT-redo）
- 不修改 `/api/admin/cron-jobs`、workflow registry/YAML、排程或 enable/disable、權限與 CSRF 語意；本卡限定呈現層。

## P0-OVERRIDE 使用紀錄（如有）
- 無。
