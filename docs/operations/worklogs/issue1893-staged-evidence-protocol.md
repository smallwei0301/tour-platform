# issue1893 — staged evidence 協議獨立修復

> 更新：2026-10-16 02:23 Asia/Taipei｜負責 session：root 單一 writer｜狀態：本地候選，三檔 exact-tree 驗證／獨立審查及發布尚待

## 目標

將既有已授權的普通 staged-evidence 指令格式修復獨立移植到 main `2eb6df3d665b64569e2a31a43e08e2a95dc81bec`。僅對齊正式 Node22 wrapper、targeted TAP 與 typecheck 指令，不改驗證強度。

來源為 [published 8af541d](https://github.com/smallwei0301/tour-platform/commit/8af541d30d87a67c90b999e8a2ee2788dc74788f) 的兩個指定檔案 hunks。原任務為 [Issue #1893](https://github.com/smallwei0301/tour-platform/issues/1893)，產品工作仍由 [Draft #1894](https://github.com/smallwei0301/tour-platform/pull/1894) 與其[原 worklog](https://github.com/smallwei0301/tour-platform/blob/9a7168ea5591b2cde0b36e15dfc794d24ff7ee2c/docs/operations/worklogs/issue1893.md) 追蹤；本 companion 不接管付款、runner、DB 或產品分支。

## AC 清單

- [x] 兩檔精確 hunks 移植，producer／版本／時效／exit／tree／coverage／heavy／身份檢查不變
- [x] 兩檔版本真 RED→GREEN；targeted、typecheck 與正反 controls 有實跑證據
- [x] 兩檔版本獨立 source 審查 PASS，原始 before→spawn→review→receipt 已保存，actual model 仍 unknown
- [ ] 含本 companion 的三檔 staged tree 正式驗證與 fresh independent review
- [ ] 工作分支／Draft PR、exact-head 自然 CI 與 Issue #1893 里程碑雙寫

## 已完成（附證據）

- 未 commit／push。兩檔 source diff SHA256 `3961797293f1f3de4c59aaaa5f0288ba2bf3bd199b1b743993e7d81caa21a331`；原兩檔 staged tree `6f45a62b2ed58748a1a4e9cefcd2f7918d292904`。此識別不代表包含本文件的新 tree。
- verifier blob `20ff8cd60028a2b8ec88759b7d1abf70609324e2`；unit blob `63b717d0c8466df598d86cdc31ba4b3bdbe324d7`，與來源精確相同。只移植 hunks，未 cherry-pick 整筆混合 commit。
- 2026-10-15 17:09–17:12 UTC：官方 Node22.23.1 完整 artifact digest preflight 通過。先僅套測試真 RED：41 total／27 PASS／14 FAIL；兩行 consumer 修後正式 targeted 41/41、typecheck exit 0、相關 runner contracts 47/47、lint exit 0。
- 原 ordinary 首輪 5889 total／5882 PASS／4 FAIL／3 SKIP；四個 #507 JSON 解析失敗保留。僅精準使用 Node `--disable-warning=UNDICI-EHPA`，#507 7/7 後完整重跑 5889 total／5886 PASS／0 FAIL／3 既有 SKIP；未改 source、skip 或關閉全部 warnings。
- 兩檔獨審 `/root/review_staged_protocol_receipt` 與 implementer 不同，fresh context；requested `gpt-6.1-sol`、actual `unknown`。獨立 targeted 41/41＋typecheck、三模式 canonical run/bundle、22 次非 canonical 負控、runner source 4/4 與 runtime 2/2，未解本次 delta findings 0。
- 兩檔審查 artifact SHA256 `2b2a1d1b89a0783b7ca68cbd573fb23bfd45a71dc450524c81575cd2294747b3`；fresh before record SHA256 `f3bfa65a7eb48f86ecdcab6dfa5f8c4e73f6bb20890bea3a647c44ae54207df7`，post-review receipt exit 0，狀態 `TOOL_ORDER_EVIDENCE_RECORDED_NOT_PLATFORM_VERIFIED`／identity `NOT_VERIFIED`。較早缺完整 spawn trace 的 attestation-only 鏈保留，沒有冒充真工具回執。
- 已知原有 `--all` coverage regex 會把 ordinary runner 排除的 infrastructure unit 列為 covered。此缺陷在 base 與候選均重現，未在本次擴修；ordinary totals 不代表該 unit 已執行。此候選的證據依靠真 targeted 執行，不依靠 all-only bundle。
- 18:23 UTC 恢復時只存在原兩檔 staged，companion 尚未寫入且沒有執行中測試。未把派工或中斷期間當作已完成工作；本文件新增後，舊兩檔審查不能當新三檔 tree 的完整驗收。

## 下一步

在三檔 exact tree 重跑正式 staged checks、完整性與適用回歸，建立新 before→fresh independent review→receipt；全數適用 gate 通過後才提交工作分支及 Draft PR，記錄實際 commit／CI 連結並同步 Issue #1893。當前沒有遠端新 head／CI／app build 或 merge 完成證據。

## 絕不重做（Do-NOT-redo）

- 不修改 #1894 的產品分支或原 issue1893.md，不吸收其 migration、consumer、runner 或其他 source。
- 不更動 Node22、30 分鐘、child/evidence exit、exact tree/blob、coverage、secret、heavy allowlist、模型身份與發布 gate；不借本修復擴修已知 coverage 缺陷。
- 保留原 RED、ordinary warning 失敗、unknown identity 與舊 trace 缺口；不改寫歷史證據，不以舊 tree PASS 代替新 tree 驗收。
- 不執行 DB／TEST／Production、heavy runner、部署、憑證、網路、權限或付費變更；不將 source 通過稱付款 runtime 已修復。
