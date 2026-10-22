# PR #1908 — 移植 VibeAI Agent Run 埋點與 Scorecard 腳本

> 最後更新：2026-10-22 09:10 Asia/Taipei｜狀態：Owner 授權 merge；merge 前最終 head CI 待確認

## 目標

從 `smallwei0301/vibeaico-admin-rebuild@417263410475fcca2b83b71dcf389f75977e2acc` 移植 `run-ledger-v2`、`scorecard-readiness`、`score-run-current` 與其依賴，讓本 repo 可以建立 v4 Run 帳本、即時檢查埋點是否完整、以 OBSERVED_V1 計分。[PR #1908](https://github.com/smallwei0301/tour-platform/pull/1908)，`WORKSTREAM: MODEL_GOVERNANCE`。用法與移植差異見 `docs/metrics/README.md`。

## AC 清單

- [x] 移植的 7 個檔案都標明同一個來源 SHA；`CURRENT_REPOSITORY` 預設為 `smallwei0301/tour-platform`
- [x] VibeAI 的 7 個 Vitest suite 轉成 `node:test` 後斷言不變，另以 `agent-metrics-tour-port.test.mjs` 鎖住移植差異
- [x] CLI 生命週期 init → validate → readiness → score 可執行，且不會覆寫既有帳本
- [x] 修正 `cron-job-controls` 測試的日期時間炸彈（2026-10-20 後必然失敗，與移植無關；Owner 同意併入本 PR）

## 已完成（附證據）

- Commits：`db3fa0a0`（移植）、`970a8f73`（cron 測試修正），base main `6e7fd9b7`
- 本機（官方 Node v22.23.1，`tp-node22.sh` 摘要核對通過）：
  - `run-checks.sh` 跑 `agent-metrics-*` 加 `tour-model-routing`：99/99 PASS
  - `run-checks.sh` 跑 `cron-job-controls` 加 `agent-metrics-*`：95/95 PASS
- 完整 `run-checks.sh --all`（修正前）：5972 total／5968 PASS／3 FAIL／1 SKIP。3 個失敗都與移植無關：
  - cron 時間炸彈：已在本 PR 修正。
  - 兩個「空收件人 → skipped」：本機容器有 `RESEND_API_KEY`，空收件人仍呼叫 Resend，Resend 回錯誤物件，卻被記成 `sent`。沒有寄出任何郵件；這是既有寄信缺陷，未在本 PR 處理。CI 沒有這個金鑰，所以通過。
- head `db3fa0a0` CI：[test 失敗](https://github.com/smallwei0301/tour-platform/actions/runs/39698149528/job/119560510122)，唯一失敗是 cron 時間炸彈
- head `970a8f73` CI 全綠：
  - [test](https://github.com/smallwei0301/tour-platform/actions/runs/39700290203/job/119567597255) success
  - [secret-scan](https://github.com/smallwei0301/tour-platform/actions/runs/39700290224/job/119567597209) success
  - Vercel success
- 2026-10-22 Owner 在對話中授權 merge

## 下一步

- 本 worklog commit 的 head CI 綠燈後 merge，並在 PR 留言記錄 merge commit
- 追蹤（另案）：`sendEmailWithContract` 把 Resend 錯誤回應記成 `sent`；空收件人應在呼叫 provider 前就略過
- 追蹤（另案）：雲端執行環境帶有正式服務金鑰（Supabase service role、Resend），建議改為測試金鑰或移除
