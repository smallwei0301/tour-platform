# Issue #1911 worklog：寄信契約（Resend 錯誤被記成 sent、空收件人仍呼叫 provider）

## 狀態（2026-10-23，Run `2026-10-23-midao2-r05`）
- 施工完成，獨立審查 PASS。
- 等 PR CI 與 Codex 審查。

## 施工（sonnet）
### `83eff681`
- `sendEmailWithContract` 遇到空收件人時，回 `skipped`／`NO_RECIPIENT`，不呼叫 provider。
  - 空收件人指 `to.trim()` 為空，或 `to` 不是字串。
- Resend 回傳結果有 `result.error`，或缺 `data.id` 時，回 `failed`／`EMAIL_SEND_FAILED`，`retriable:true`。
  - `errorMessage` 只取 `error.message`。
- 新增 `tests/unit/issue1911-email-contract.test.mjs`。
- 兩個既有測試改為注入假 client，不再依賴環境是否有金鑰。
- 驗證：RED 5/7 → GREEN 51/51；突變 4/4 被擋下。

### `9fcd96e0`（rework）
- 起因：審查指出 `email.ts` 897 行，超過 architecture-ratchet 的 863 行上限。
- 處理：契約邏輯拆到 `src/lib/email-delivery/contract.ts`，`email.ts` 回到 861 行。
- 上限沒有放寬；放在子資料夾，也避開了 `src/lib` 頂層檔案數的上限。

## 審查（opus，fresh context）
### 第一次：FIX_REQUIRED，blocking 1
- 問題：ratchet 會讓 CI unit 紅燈。
- 原因：施工時只跑了相關的測試檔，沒有跑全部 unit，所以沒抓到。

### 複審：PASS，blocking 0
- ratchet 4 條全綠。
- 突變 8 項全部被擋下。其中包含「把邏輯搬回 `email.ts`」，ratchet 會轉紅。
- email 測試檔 10 個，58/58 通過，有、無金鑰兩種情況都測過。
- 有假金鑰時預載 fetch 攔截器，確認網路請求 0 次，沒有寄出任何信。
- base 與 HEAD 各跑一次全部 unit，HEAD 沒有新增失敗。
  - 兩邊都有 33 項失敗，全是本機 toolchain／環境造成的既有問題。
  - 兩邊各差一項，原因是並行執行時的 flake；單獨重跑兩次結果一致。

### 呼叫端影響
- 凍結區 ECPay callback、orders cancel、refund-requests 都是 fire-and-forget，失敗只記 log，不改付款或訂單狀態。
- admin 手動寄評價邀請時，失敗會寫 failed 列並回 500。
- 全 app 沒有程式讀取 `retriable`，所以不會觸發自動重試。

## 後續
- 另開 #1923：review-invitation-sweep 不讀 `sendReviewInvitation` 的回傳值，失敗仍記成 sent。這是修正前就存在的問題。
- 單元測試還沒直接涵蓋 `result` 為 null、`to` 不是字串的情況。審查時已用 probe 驗過結果正確，屬 non-blocking。

## CI（PR #1924 head `0523a841`）
- [test](https://github.com/smallwei0301/tour-platform/actions/runs/39912995843/job/120280045090)：success
- [scan](https://github.com/smallwei0301/tour-platform/actions/runs/39912995710/job/120280044547)：success
- `smoke` 和 `browser` 沒有被觸發。這次 diff 沒有動到 midao 或 e2e 路徑，所以這兩條 workflow 的 paths 不包含本 PR 的檔案。

## CI（PR #1924 head `a54d9661`）與 merge
- 新 head 的 CI 都是 success：
  - [test](https://github.com/smallwei0301/tour-platform/actions/runs/39915185794/job/120287058138)
  - [scan](https://github.com/smallwei0301/tour-platform/actions/runs/39915185802/job/120287058163)
- merge 前確認：mergeable=clean、review threads 0、Codex code review 與 security review 都是 0 findings。
- squash merge，commit 為 `9f711f66`，合併時以 `expectedHeadSha=a54d9661` 鎖定 head。
- main 的 CI 都是 success：
  - [test](https://github.com/smallwei0301/tour-platform/actions/runs/39915664717/job/120288570599)
  - [scan](https://github.com/smallwei0301/tour-platform/actions/runs/39915664798/job/120288571024)
- Completion Truth：在 main 上讀回確認——
  - `email-delivery/contract.ts`：`NO_RECIPIENT`、`EMAIL_SEND_FAILED` 都在。
  - `email.ts`：860 行。
- 結案：[#1911 留言](https://github.com/smallwei0301/tour-platform/issues/1911#issuecomment-6360244758) 逐條附 AC 證據，Issue 已關閉（completed）。
- Run r05 已 closeout，狀態 COMPLETE。評分 `GRADED_OBSERVED_V1` 80.9（B）。

## B+ 自檢（r05）
1. **盤點**：部分做了。沒有為本輪另派 scout，改用 r04 LUNA_CLOSURE 對 #1911 做的 main 證據掃描。這是缺口，已記在帳本。
2. **TRIAGE**：做了（opus）。
3. **Terra 施工**：做了（sonnet），含 1 次 rework（ratchet）。
4. **LUNA_CLOSURE**：做了（haiku）。#1911 已關閉；其餘 7 個 Issue 都不是候選。
5. **即時埋點**：做了，readiness 為 LIVE_CAPTURE_READY。
   - 缺口：WIP 事件是在 PR 開立後才補登。
   - 缺口：triage 的時間戳曾經寫得比實際晚，已更正。
6. **收尾**：做了。Completion Truth 5 條都是 VERIFIED。
