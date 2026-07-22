# issue1670 worklog — [Frontend Daily Check] health check failures（runner install 缺口修補）

- Issue: https://github.com/smallwei0301/tour-platform/issues/1670
- Branch: `claude/resolve-open-issues-uiv0ql`

## 判定回顧

- 2026-07-09 ～ 07-18 的失敗全數為 stale checkout provenance 產物（過時分支＋Node 24＋依賴漂移＋過期 fixture），已由連續 5 天（07-16 ～ 07-22）canonical clean 重現確認 main 健康——非產品回歸。
- 唯一未解且連續 5 次被點名的缺口：`scripts/qa/daily-health-check-runner.mjs`（#1707）建立臨時 worktree 後**不裝依賴**，eslint/tsc exit 127、npm test 因無 node_modules 失敗，把健康的 main 誤判 `CHECKS_FAILED`／`productRegressionCandidate: true`。

## 本次修補（2026-07-22）——兩個缺口

**缺口 A：臨時 worktree 不裝依賴（連續 5 次被點名的 exit 127）**
1. guard 通過後、健檢指令前，於臨時 worktree 執行 `npm install --no-audit --no-fund --ignore-scripts`（清除 `NODE_ENV`，避免 production 模式漏裝 devDependencies；`--ignore-scripts` 避免 postinstall 在受限網路被擋——lint/typecheck/test 不需要 postinstall）。
2. 安裝後 `git checkout -- yarn.lock` 還原 lockfile churn，避免污染 worktree。
3. 安裝失敗歸類 `SCAN_INVALID_BASELINE`（reason `dependency_install_failed`＋stderr 尾段），不誤標產品回歸。

**缺口 B（本次實跑新發現）：spawnSync 預設 maxBuffer 1MB 造成 ENOBUFS 誤判**
- 修好缺口 A 後實跑兩次，lint/typecheck 皆 exit 0，但 `npm test` 皆被回報 exit 1；手動在同 SHA 乾淨 worktree 重現卻 4698 tests / 4695 pass / **0 fail**（exit 0）。
- 根因：main 全量測試 TAP 輸出實測 **1,057,460 bytes**，正好在 `spawnSync` 預設 `maxBuffer`（1,048,576 bytes）邊界抖動；超過即 `ENOBUFS`、`status` 變 `null`，`run()` 的 `?? 1` 把它當指令失敗。以最小重現驗證：spawnSync 收 2MB stdout → `status: null, error: ENOBUFS`。
- 修補：`run()` 顯式 `maxBuffer: 64MB`；`spawnError`（如 ENOBUFS）記入結果，與指令真失敗區隔。
4. 健檢指令失敗時 payload 保留 `outputTail`（尾段 3000 字元）＋ `spawnError`，CHECKS_FAILED 不再只有裸 exit code。

## 實跑證據

- Focused tests：`node --test apps/web/tests/unit/issue1670-health-check-runner-install.test.mjs apps/web/tests/unit/issue1671-health-check-provenance.test.mjs` → 9/9 pass（含既有 provenance 契約未破壞）。
- `node scripts/qa/daily-health-check-runner.mjs --dry-run` → `PREFLIGHT_OK`（alignedWithOriginMain true、dirty 0、Node v22.22.2）。
- 完整實跑（缺口 A 修後）：lint exit 0、typecheck exit 0（**127 → 0**）；npm test 被誤報 exit 1 → 由此定位缺口 B。
- 完整實跑（缺口 A＋B 修後）：`CHECKS_PASSED`，見 issue 留言之 JSON。

## 狀態

- [x] runner 修補＋focused tests 綠燈
- [x] 完整實跑證據
- [x] commit + push + issue 留言
- Issue 保持 open 至修補 merge 進 main（daily check 實際改用新 runner）後由 owner/後續 session 關閉。
