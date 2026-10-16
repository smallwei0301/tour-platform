# issue1658 — current issue priority routing 修正

> 最後更新：2026-10-16 14:26 Asia/Taipei｜requested model：`gpt-6-luna`；runtime actual：unknown｜本機候選，未提交

## 目標

僅修正 `docs/operations/current-issue-priority.md` 將已關閉 #1301、#1336 列為 active routing 的錯誤；不重做整份 live queue refresh。

## AC 清單

- [x] 以 exact main `2d9c5bb410742cd8d045f154d12aa62af1fa269a` 為基準；原檔 Git blob `c0d7616909d9ddfa4daccb944fbe74de6832bad3`、SHA-256 `7158ffbc440018a559ce70824ad6dccbc617822166e8f0dbce3fed00123b6c3a` 已保留；候選目標 SHA-256 `5cc0502e529cf7a813f6c949b90dc21519cef3192755daebeb6a3e97f1ba3183`。
- [x] 以 GitHub live read 核對 #1301 `closed/completed`（2026-06-10）及 #1336 `closed/completed`（2026-07-02）；#1658 仍 open，labels 含 `owner:ai-agent`、`status:ready`、`type:docs`。
- [x] 檢查全部 23 筆 open PR changed filenames；沒有 PR 擁有目標文件。
- [x] 將 #1301、#1336 移出 active routing 與 stale-check loop，並保留為 historical/non-routing 記錄；保留其他既有歷史內容。
- [x] Node 22.23.1 canonical wrapper 驗證通過；既有 `issue657-agent-routing.test.mjs` 6/6、issue1658 定向 routing assertions 7/7 通過。
- [x] v2 兩檔候選完成 bounded independent source review：PASS、未解 findings 0（review report SHA-256 `fdecd7226ed624130142fed4502e09e9cdd98d6bff093841b98f61568b971c05`）；完整 issue1658、CI 與 publication gates 仍 NOT_DONE。

## 已完成（附證據）

- 基準文件與必要 routing/harness 規則已由 exact main 讀取；本次修改限目標文件與本 worklog。測試與 readiness snapshot 僅作唯讀 fixtures，不列入候選 patch。
- #1301 自 P1 active list、safe-next 範例與 stale-check loop 移除；#1336 自 P2 active list 與 stale-check loop 移除。兩者狀態與關閉日期加入 historical/non-routing notes。
- 先前 builder 派工前置檢查通過；其原始紀錄留存於私有證據。requested model 僅為派工資料；無 runtime 身分證據，actual 保持 unknown。
- `tp-node22.sh --check` exit 0，Node 為 `v22.23.1`。wrapper 輸出既有 `UNDICI-EHPA` experimental warnings，未隱藏。
- `node --test apps/web/tests/api/issue657-agent-routing.test.mjs`：6/6 pass；額外檢查 P1/P2 active sections 不含 #1301/#1336、歷史狀態存在、stale-check loop 已移除兩者，並確認 #1265 原文片段保留及 worklog 未含 admission identifiers：7/7 pass。

## 下一步

v3 僅更新本 worklog 記錄 v2 的 bounded source review 結果；完整 issue1658 驗收、CI 與 publication 仍 NOT_DONE，v3 worklog-only delta 待主代理依 small-editor receipt flow review。

## 絕不重做（Do-NOT-redo）

- 不 cherry-pick、merge、重建或沿用舊混合分支／PR #1774；此候選是依 exact main 與 current live issue state 的獨立文件修正。
- 不把限定兩筆狀態核對說成整份 issue queue 已 refresh；其他 active routing 與 snapshot 數字不在本次範圍。
- 不修改 harness、runtime code、測試檔、readiness snapshot 或任何其他候選工作；不做 Git 發布、DB／TEST、Production、credential、network、permission 或付費資源操作。
