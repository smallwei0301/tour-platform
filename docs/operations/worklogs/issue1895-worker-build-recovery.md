# issue1895 — 共用 Next build worker 隔離修復

> 2026-10-16 Asia/Taipei｜獨立 worker 修復候選；不是 Blob 試驗發布或完整驗收

## 目標

追蹤 [PR #1895](https://github.com/smallwei0301/tour-platform/pull/1895) 建置恢復期間識別的共用 build worker 修復。從 main `2eb6df3d665b64569e2a31a43e08e2a95dc81bec` 建立獨立分支候選，產品 delta 僅 `next.config.mjs` 的 `experimental.webpackBuildWorker=true` 與對應 config tests。

明示前置依賴 [Draft #1902](https://github.com/smallwei0301/tour-platform/pull/1902)，head `97336d140114e2125587caba8df771ddd178a907`，尚未 merge。本候選包含其 verifier、unit、歷史 companion 三檔原 bytes；不能稱 main 已包含依賴。這三檔不是本 worker 修復重新實作。

## AC 清單

- [x] 最小 worker config 與 development／production／Sentry／startup fail-closed 測試已存在
- [x] 父代理協調 ownership：本候選只持有 experimental flag 與新 config test；#1895 保有 import／CSP media-src hunks，原 Blob 分支不修改
- [x] 既有五檔候選 targeted 45/45、ordinary 5893 total／5890 PASS／3 SKIP 與獨立審查有分別證據
- [ ] 包含本 companion 的新 exact tree 正式 targeted／check-only／ordinary 與 fresh independent review
- [ ] 工作分支／Draft PR 遠端 exact head/tree 回讀及自然 CI
- [ ] 前置依賴與完整 merge／ISR／release gates；不以 Draft 發布稱完整驗收

## 已完成與保留證據

- 五檔來源 tree `0fff171bbd799f68896f5c2054283d520e8e0d7d`、diff SHA256 `4c5b0176cbf3ec24e914acd5e5dae010910c49c8b49ddc27d8814513b37f101c`。2026-10-15 19:03 UTC fresh independent review targeted 45/45、相關 contracts 11/11；未解 delta findings 0。requested Sol、actual unknown；不冒稱 runtime 身份已驗證。
- 2026-10-15 20:02:34 UTC 該五檔 tree 正式 `run-checks.sh --all` exit 0，5893 total／5890 PASS／0 FAIL／3 既有 SKIP。只過濾環境 UNDICI-EHPA warning，其他 stderr／warning canary 保留；未改測試成員或 skip。
- 更早 worker-only tree `2955f1ea276292bccadecacc4ef1626483e6d8c7` 真 build exit 0、234/234 pages、useBuildWorker=true；application source bytes 相同，但不是本新六檔 tree 重跑 build。
- 舊 ISR／補充 lane 未完成及既有失敗證據保留；不以 build 或 ordinary 代替 ISR、自然 CI 或完整發布驗收。
- verifier 原有 all-only coverage 對被 ordinary 排除的 infrastructure unit 誤列問題不在本次擴修；本候選必須真跑 targeted unit，不能用 ordinary totals 替代。

## 下一步

本文件為驗證前 snapshot；新 tree 結果由該 tree 的獨立審查與 Draft PR exact-head 證據補充，不將舊五檔結果宣稱六檔完整驗收。刷新已超過 30 分鐘的正式 staged evidence、全套回歸與獨立審查後，由父代理核對遠端 main／依賴／ownership 並發布獨立 Draft。#1902 未 merge 本身不阻擋明示依賴的 Draft；完整 merge gate 仍逐項保留。

## 絕不重做

- 不修改 #1895 原 Blob branch、不觸發第三次 Blob sync、不接管 CSP／media import hunks或其原 worklog。
- 不改寫 #1902 三檔歷史 snapshot、不冒稱依賴已 merge。
- 不改 frozen harness、測試邊界、startup guards、lockfiles、模型身份／有效期 gate。
- 不 merge／Production／DB／shared TEST／新憑證／權限／付費資源；不將普通測試稱付款 runtime 驗收。
