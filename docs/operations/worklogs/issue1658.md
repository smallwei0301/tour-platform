# issue1658 — current issue priority routing 修正

> 最後更新：2026-10-16 22:46 Asia/Taipei｜原 builder requested model：`gpt-6-luna`；runtime actual：unknown｜PR #1904 合併前證據補記

## 目標

僅修正 `docs/operations/current-issue-priority.md` 將已關閉 #1301、#1336 列為 active routing 的錯誤；不重做整份 live queue refresh。

## AC 清單

- [x] 以 exact main `2d9c5bb410742cd8d045f154d12aa62af1fa269a` 為基準；原檔 Git blob `c0d7616909d9ddfa4daccb944fbe74de6832bad3`、SHA-256 `7158ffbc440018a559ce70824ad6dccbc617822166e8f0dbce3fed00123b6c3a` 已保留；候選目標 SHA-256 `5cc0502e529cf7a813f6c949b90dc21519cef3192755daebeb6a3e97f1ba3183`。
- [x] 以 GitHub live read 核對 #1301 `closed/completed`（2026-06-10）及 #1336 `closed/completed`（2026-07-02）；#1658 仍 open，labels 含 `owner:ai-agent`、`status:ready`、`type:docs`。
- [x] 檢查全部 23 筆 open PR changed filenames；沒有 PR 擁有目標文件。
- [x] 將 #1301、#1336 移出 active routing 與 stale-check loop，並保留為 historical/non-routing 記錄；保留其他既有歷史內容。
- [x] Node 22.23.1 canonical wrapper 驗證通過；既有 `issue657-agent-routing.test.mjs` 6/6、issue1658 定向 routing assertions 7/7 通過。
- [x] v2 兩檔候選完成 bounded independent source review：PASS、未解 findings 0（review report SHA-256 `fdecd7226ed624130142fed4502e09e9cdd98d6bff093841b98f61568b971c05`）；此為當時凍結狀態，後續 CI 與發布進度見下方證據補記；完整 issue1658 驗收仍未完成。

## 已完成（附證據）

- 基準文件與必要 routing/harness 規則已由 exact main 讀取；本次修改限目標文件與本 worklog。測試與 readiness snapshot 僅作唯讀 fixtures，不列入候選 patch。
- #1301 自 P1 active list、safe-next 範例與 stale-check loop 移除；#1336 自 P2 active list 與 stale-check loop 移除。兩者狀態與關閉日期加入 historical/non-routing notes。
- 先前 builder 派工前置檢查通過；其原始紀錄留存於私有證據。requested model 僅為派工資料；無 runtime 身分證據，actual 保持 unknown。
- `tp-node22.sh --check` exit 0，Node 為 `v22.23.1`。wrapper 輸出既有 `UNDICI-EHPA` experimental warnings，未隱藏。
- `node --test apps/web/tests/api/issue657-agent-routing.test.mjs`：6/6 pass；額外檢查 P1/P2 active sections 不含 #1301/#1336、歷史狀態存在、stale-check loop 已移除兩者，並確認 #1265 原文片段保留及 worklog 未含 admission identifiers：7/7 pass。

## 下一步

v3 worklog-only delta 已完成限定獨立審查，最終未解 finding 0；報告 SHA-256 `86f5c207e0ecb1127527050cbf4eb1a4907bc15252c222d577e7c28f025e38d2`。本次僅補合併前證據，不改 routing 內容。

## 日期標示修正（2026-10-16 22:55 Asia/Taipei）

- 回應 PR review 5549491192 的 P2：恢復整份快照原始 Updated 日期 2026-06-10，另列 2026-10-16 僅針對 #1301／#1336 的定向修正，不將其餘舊優先級宣稱為已刷新。
- 補記 head `a08ee3948698bf10d06b5d024b69d07bcec5d117` 的 [CI38918941648](https://github.com/smallwei0301/tour-platform/actions/runs/38918941648) 已 success（lint、typecheck、tests、build、ISR、preflight）；此結果不挪作日期修正後的新 head CI。
- 本次僅兩份文件的日期說明與證據紀錄，仍需獨立差異審查及新 exact-head CI，尚未合併／部署。

## 合併前證據補記（2026-10-16 22:46 Asia/Taipei）

- 原已驗證 head：`f4e2a4630285759a195e7340065f31b67ef4f787`；base main：`2d9c5bb410742cd8d045f154d12aa62af1fa269a`。
- [CI 38862384002](https://github.com/smallwei0301/tour-platform/actions/runs/38862384002) conclusion=`success`；lint、typecheck、tests、build、ISR 與 preflight 通過。
- [Secret scan 38862383852](https://github.com/smallwei0301/tour-platform/actions/runs/38862383852) 通過；[Preview](https://vercel.com/smallwei0301s-projects/tour-platform/H74EKUNPivGNL2vPcNGYr8RZeDLw) 為 Ready。這些是原 head 的結果，不移作此補記 commit 的 CI。
- 22:44 重新核對另外 24 個 open PR，兩個目標文件沒有 ownership 重疊；待執行／執行中的 Tour workflow 均為 0。
- Owner 於 22:43 明確同意本次 #1904 合併所附帶的 midao.com.tw 自動正式站重建／切換；不涵蓋其他 PR、DB、憑證或權限變更。
- 本補記仍須限定獨立審查與新 exact-head CI；兩者通過後才依現行流程合併。合併後另核 main CI、部署終局與正式網址指向，不預先宣稱成功。
- 完整 #1658 AC、全量 queue 更新與其他剩餘範圍仍未完成，不關閉整張 issue。

## 絕不重做（Do-NOT-redo）

- 不 cherry-pick、merge、重建或沿用舊混合分支／PR #1774；此候選是依 exact main 與 current live issue state 的獨立文件修正。
- 不把限定兩筆狀態核對說成整份 issue queue 已 refresh；其他 active routing 與 snapshot 數字不在本次範圍。
- 不修改 harness、runtime code、測試檔、readiness snapshot 或任何其他候選工作；DB／TEST、credential、network、permission 或付費資源操作不在本次範圍；Git 發布與本次合併附帶自動正式部署僅按上述有效批准及完整 gates 執行。

## #1265 限定補修（2026-10-19 Asia/Taipei）

- Owner 本輪另行批准僅修 #1265 過期路由文字；先前 #1904 僅限 #1301／#1336、保留 #1265 原文的決定與測試證據維持歷史，不冒作本輪批准。
- 本輪基準 main：`5d68a11a7e93021e7f7cca8e0f02368f9b9ec764`；該提交相對前 main `b83b8c51dbcb4a806cf9cc6d2f7bd6713a60ea3e` 僅更新自動 readiness snapshot，兩份目標文件未變。
- [#1265 即時來源](https://github.com/smallwei0301/tour-platform/issues/1265)：`closed/completed`，`closed_at=2026-06-10T07:24:43Z`；本次移除 Current top pointer 的 verified-active 範例，並補 historical/non-routing 記錄。
- 保留原 Updated 2026-06-10、2026-10-16 定向註記、既有 worklog 全文與其他 queue 條目；不重做整份 queue refresh，不關閉 #1658。
- 23 個 open PR 的完整 changed filenames 已逐一核對，兩個目標路徑無 ownership 重疊；Node 22.23.1 canonical wrapper `--check` 與 `run-checks.sh apps/web/tests/api/issue657-agent-routing.test.mjs` 通過 6/6；另以候選外定向 assertions 通過 8/8，含修改前反例、歷史與非本輪 queue 不變驗證。僅為 bounded docs 驗證，不取代後續 CI 或全量 #1658 驗收。
- requested model：`gpt-6.1-sol`；actual model：unknown，未宣稱 runtime 身分驗證。
- 僅準備兩檔候選；獨立審查、ownership 與發布 gates 未完成前，不宣稱完整驗收、已發布或可合併。其他排程、程式、DB／TEST、Production、憑證、網路及權限不在本次範圍。

## 2026-10-23 11:19 Asia/Taipei 遠端驗證補記

- PR #1921 已交付並轉 Ready，原已驗證 head `6729107e6f2d1ae04f130de9258236324bd6eaf3`。
- [CI 39893480372](https://github.com/smallwei0301/tour-platform/actions/runs/39893480372) success；Web tests／Preflight 為 6009 pass、3 skip、0 fail，lint/typecheck/build成功。
- [Code／Security 審查](https://github.com/smallwei0301/tour-platform/pull/1921#issuecomment-6356492908) 綁上述 head，均 completed，無 findings／unresolved findings；不代表 actual model 身份已驗證。
- 本次僅補記既有結果；這些結果不移作補記後新 head 的 CI。合併前仍須核新 exact head 的 CI、適用審查、ownership／衝突與必要授權；未合併、未宣稱 Production 驗收。
- 兩份既有docs修正已從保存候選獨立恢復；不含cron測試。focused contracts 9 pass、2個no-token skip，獨立覆核重跑一致。#1658完整範圍仍未結案。
