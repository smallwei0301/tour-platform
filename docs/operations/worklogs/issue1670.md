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


## 2026-10-17 有界恢復（尚未發布／尚未完整驗收）

- 基線：`main@12c6bc05809db8b7bf513842f0a1a45c47eb7960`；只恢復原 `52721a4e88337c84b6b0a93ef5fb121122d5e15c` 的本 runner、專用單測與本 worklog 三檔。上述 2026-07-22 實跑紀錄屬歷史證據，不是本候選的完整驗收。
- 保留：臨時 worktree 安裝依賴、移除 `NODE_ENV`、`--ignore-scripts`、64MB buffer、lockfile 還原與失敗輸出尾段。
- 補正：原始 null exit status、spawnError 與 signal 分開保存。任一檢查有程序層錯誤／signal／無有效整數 exit status，整輪為 `SCAN_INVALID_BASELINE`（`check_execution_failed`、exit 2、非產品回歸）；只有正常完成且真正非零退出才是 `CHECKS_FAILED`（exit 1）。混合結果優先判無效 baseline，仍保留三個結果。
- 還原 `yarn.lock` 失敗判 `lockfile_restore_failed`；安裝後仍有 tracked／untracked dirty 檔判 `postinstall_dirty_worktree`，均中止健檢。安裝失敗優先保留 `dependency_install_failed`，同時保存安裝／還原診斷。worktree 建立失敗亦先中止。
- 本次驗證：Node `v22.23.1`，專用 25 個測試＋既有 provenance 3 個測試，總計 28/28 PASS。新增行為測試於 VM 內注入 fake process／filesystem，沒有執行 runner 的 git、npm install、lint、typecheck 或 npm test 子程序，沒有使用真實 DB／帳號／寄信／付款。
- 原版反例：24 個測試版本套用原 `52721a4e` runner，7 pass／17 fail（含舊 source-contract 尾段位置斷言需配合共用收集器改寫），證明不是僅掃描字串的全綠。
- 完整來源驗證：後續以 GitHub exact-ref recursive tree＋既有本地 object store＋3 個缺少 blob 重新取得全部 3207 個 blob，逐檔驗 Git blob SHA-1；`git write-tree` 等於 main 的 `e56c429cd27d650e824f4c5a98c8a12401c4e4fc`。此為完整來源樹，未重建原始 commit history。
- 正式 targeted gate：於完整來源套用候選後，使用已驗證 Node 22 toolchain 執行 `.claude/hooks/run-checks.sh apps/web/tests/unit/issue1670-health-check-runner-install.test.mjs apps/web/tests/unit/issue1671-health-check-provenance.test.mjs`，exit 0、28/28 PASS，產生正式 last-checks 證據。
- 獨立審查：不同 actor 對原候選 exactDiff `dc5b4eaf59d1d9b747ee8b78c98f5217831482f1d712dc4db0d2097729f977bd` 判 `BOUNDED_PASS`、0 unresolved findings，獨立重跑 28 個 focused＋17 個對抗案例皆 PASS；不代表完整發布驗收。其後只移除 runner 末尾多餘空白行並更新本段證據，無行為變更；該小差異仍需獨立覆核。
- 限制：全量 tests／lint／typecheck／實際 canonical runner／CI 與發布 gates 尚未在本紀錄中判 PASS，不得以 focused 或 bounded audit 代替完整驗收。沒有執行 install 或擴大權限以補足缺口。
- Ownership：沿用原 worklog owner／後續 session 接續；本候選不改其他測試 fixture、不復活 #1774 混合修改。尚未 commit、push、建立 PR、merge 或關 issue。


## 2026-10-19 PR #1906 發布前證據補件

- 本段補充上述凍結快照之後的證據；歷史未完成記錄保留。候選分支為 `ava/issue1670-runner-recovery-20261017`，程式版本為 `4339360ca33fbc837ee4956b61266c5fe914f765`，PR：https://github.com/smallwei0301/tour-platform/pull/1906。
- exact-head CI：https://github.com/smallwei0301/tour-platform/actions/runs/38987097748/job/117260988943。Migration source gate、Web lint、Web typecheck、Web tests、Web build、ISR smoke、Preflight 均 SUCCESS；secret scan：https://github.com/smallwei0301/tour-platform/actions/runs/38987097715/job/117260988972，SUCCESS。
- 獨立 code/security review：https://github.com/smallwei0301/tour-platform/pull/1906#issuecomment-6227472748。兩者皆綁定上述程式 head、completed，has_any_findings=false、has_unresolved_findings=false；不據此推定審查模型身分。
- 2026-10-19 07:59（Asia/Taipei）由補件準備者查核，08:02 獨立覆核：另外 24 個 open PR 對本候選 runner、專用測試、worklog 三檔均無路徑重疊。main 相較本候選原 base `12c6bc05809db8b7bf513842f0a1a45c47eb7960` 僅新增 readiness 報告更新。
- 本次補件僅追加 worklog，不修改程式與測試。以上 CI／review 是程式 head 的歷史證據，不冒充補件後新 head 的結果；合併前仍須回讀新 head 的自然 CI 終局、獨立文件差異審查與未解 findings，將結果同步本 issue／PR。
- 尚未驗證：真實 canonical daily-health runner、外部每日任務改用新版、合併後 main CI 與 Production 驗收。本 PR 合併或 Vercel READY 不代表完整 #1670 已驗收，不關閉 issue。
- 下一步與責任：Ava 核對補件後 exact head、必要 CI／獨立審查／ownership，符合有效授權與 gates 才合併，讀回 main CI 與既有 Vercel 自動 Production 建置／alias 切換結果；外部每日任務切換保持未驗證，不擴大為 DB、憑證、權限或手動部署操作。
