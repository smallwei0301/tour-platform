# Midao2 單獨介面變更的 smoke 觸發修補

## 目標

延續 #1275 的隔離 smoke lane，讓僅修改 `apps/web/app/(non-locale)/midao2/**` 的 PR 也觸發既有測試。Owner 已明確允許修正既有隔離 CI 的路徑觸發。

## AC

- [x] 僅追加實際 Midao2 route group 路徑，不改 jobs、schedule、permissions、env 或 spec allowlist。
- [x] 正反例確認原版本不匹配、候選匹配，並保持既有路徑與排除相似目錄。
- [x] 不同執行者獨立覆核與重跑 focused 測試。
- [ ] 遠端 exact-head CI 與完整發布驗收。

## 已完成

2026-10-23 10:05 Asia/Taipei，base `abe7e714dd1a75349fc8a576f42295e7e6abf68f`。workflow 原 blob `ec914b5791a73550e9d94266f969be13d3910013`，候選 SHA-256 `3b276fd8289ad77732d51b5f42c6eeb873d6766a840470ae1c8a9ec24c9aa293`。

官方 Node 22.23.1 artifact 經 canonical runner 校驗；focused 9 passed、0 failed，獨立覆核另重跑 9 passed。`run-checks.sh --all`：6012 tests、6009 passed、3 skipped、0 failed。執行環境未傳入正式資料庫或寄信／付款憑證。

獨立審查對此單行差異 scoped PASS、0 unresolved findings。requested model `gpt-6.1-sol`，actual `unknown`，identity `NOT_VERIFIED`；不得宣稱已驗證實際模型或完整正式驗收。派工前檢查與回執順序已記錄，不能以其替代 runtime 身份證據。

ownership：#1918 原 Claude 持有 calendar 產品與 spec，不在本修補內。#1887 同檔只修改 jobs 下方 supplemental steps，與此 on.paths hunk 不重疊；合入前須重新比對。此變更會增加 Midao2-only PR 執行既有 smoke 的機會，不新增 job 或排程。

## 下一步

保存工作分支及 Draft PR，如實揭露未完成驗收；核遠端 exact head CI、依賴、衝突與適用審查，不在 gate 未滿時合併。GitHub 實際服務端觸發尚未由離線匹配測試證實。

## 絕不重做

不重做 #1918 已增加的 calendar spec、不改 #1887 supplemental jobs、不改 DB／Production／秘密／權限、不重跑不相關 CI，不將此路徑修補稱產品正式驗收。
