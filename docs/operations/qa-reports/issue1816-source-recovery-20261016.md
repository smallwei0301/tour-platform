# #1816 安全 source／純模擬驗收

時間：2026-10-16 01:07 Asia/Taipei。Issue：https://github.com/smallwei0301/tour-platform/issues/1816 。
基準 SHA：`2eb6df3d665b64569e2a31a43e08e2a95dc81bec`；工作分支：`codex/issue1816-private-confirmation-runtime`。
本報告在 commit 前綁定下列精確 source digest；發布後 commit／PR 與 CI 結果以 Issue thread 追讀紀錄為準。

## 判定與範圍

**PASS-in-scope，AC7 HOLD；Issue 目標是否已直接驗證：no（尚缺完整 browser AC）。**
本次將 conversion、accept、preview 的七個 stores、clock/token providers、seed/reset 與 lifecycle transition 集中至467行 private runtime。Gateway 維持公開 projection 與 Supabase/RPC 編排；沒有 UI、SQL、migration、auth、runner 或治理變更。

初審13個 source/test 檔的 manifest SHA256：`160c0d3807a7586745601ba2a2c1601ec677c1b71f85aae6ec6dd3a34e4ef3af`。
初審 source/test patch SHA256：`4c53304fcbe695390470926055634e7722d4f3a091002c93255d8484a5f8b902`（+1156/-582）。文件不包含在此 source digest 內。
發布前 staged check 發現三個新helper的檔尾多餘空白行，真exit2；先前unstaged檢查沒有涵蓋新檔，失敗保留。最終只各刪1 byte，嚴格證明每檔 `old = new + '\n'`，語意不變。
最終source manifest SHA256：`bb307b749aba70cb8679fe0a3587db89c3549f0e21dc06d1458877f0852ecb4b`；完整source patch SHA256：`1b1c6e4d898bbd23dd84be5d6be884925a0e29800229c23eed323a782599116b`（+1153/-582）。EOF修正與文件增量另作獨審；初審完整read-back仍對初審digest，不冒稱已重新全審最終13檔。

## 獨立審查與實跑

- 最終EOF候選再跑原 `run-checks.sh --all --typecheck`：真exit0，5934 tests／5931 PASS／0 FAIL／3 SKIP／0 cancelled，29.704秒，typecheck成功；見 `release-suite/ordinary-typecheck.log`／`receipt.json`。程序已終局並釋放容量，沒有盲重跑先前失敗作業。
- `/root/final_behavior` 與 `/root/final_architecture` 為不同於實作者 `/root/implement1816` 的 fresh-context actors，均 requested `gpt-6.1-sol`、actual `unknown`。兩者各自完整read-back13檔，PASS-in-scope、未解finding0；before/receipt CLI通過。tool-order證據不是平台runtime身分驗證。
- 行為reviewer：原 `run-checks.sh` 真exit0，134 tests／134 PASS／0 FAIL／0 SKIP。另直接child control、recording各真exit0、2 tests／2 PASS／0 SKIP；測前後hash不變。
- 架構reviewer：21-module靜態import closure、owner closure16、0 cycle；owner不回指gateway。13個Supabase/normalize/projection函式與base逐字相同，五個搬遷函式只含列舉的DTO/clone/seam變換；不聲稱其靜態檢查為測試重跑。
- 施工者最終focused＋typecheck：真exit0，132 PASS／0 FAIL／0 SKIP，`tsc --noEmit`成功。與reviewer134的差異是reviewer另加db size guard，不相加為268個獨立案例。
- Commander原 `.claude/hooks/run-checks.sh --all`：真exit0，5934 tests／5931 PASS／0 FAIL／3 SKIP／0 cancelled，27.257秒。原ordinary選單未改；3個計數skip為兩項缺GitHub token的live drift與一項live QA RLS。真PG conversion suite也按既有環境gate整組skip；未接DB，不把skip稱通過。
- 全部產品測試使用原 `scripts/toolchain/tp-node22.sh`、官方Node v22.23.1，`TP_NODE22_ROOT=/workspace/issue1816-runtime/toolchains/node/22.23.1`；完整archive/files/symlink校驗通過，未改pin。執行環境未提供DB credentials/opt-in。
- `git diff --check`及原`check-docs-sync.sh` exit0；後者只表示README沒有Phase/Sprint關鍵字，不證明全部文件全面同步。

## 原九條 AC

| AC | 判定／直接證據 |
|---|---|
| 1 舊設計行為RED | PASS：完整public conversion→preview→accept→replay oracle先通過，最後zero-events斷言因23筆真consumer Map操作失敗。control exit0，recording exit1；seed-only clone仍同23筆RED。不是source-string或missing-module RED。 |
| 2 無mutable跨module契約 | PASS：同oracle在新實作control/recording均2/2 GREEN；production舊export刪除，兩gateway僅domain operations。 |
| 3 單owner | PASS：七stores/providers/seed/reset/transitions集中；detached inputs/outputs/inspect、data-only reset及provider還原有行為測試，無shadow store。 |
| 4 既有行為不變 | PASS-source：原83 focused皆綠，conversion、double-convert、wrong traveler、expiry/used、accept replay及安全錯誤不變。 |
| 5 preview parity | PASS：17個共享scenario比較memory/fake Supabase完整success/error envelope、期限相等與規則優先序。不是實DB證據。 |
| 6 RPC authority | PASS-source：preview零writes/RPC且不consume；pending後RPC拒絕、expired prediction後RPC成功與memory TOCTOU實驗保留accept權威。 |
| 7 reusable E2E／一般checkout | HOLD／NOT_VERIFIED-live：focused checkout gate綠，但完整Midao browser登入依賴auth/DB。既有純mock smoke只含部分checkout；未另造替代lane或宣稱全部E2E通過。 |
| 8 ratchet／cycle | PASS：既有ratchet與db size guard真綠、未放寬800行；owner467、gateway352/331行，graph與fresh import測試通過。 |
| 9 複雜度集中 | PASS：state traversal、capacity、idempotency與transition在同owner；pure policy/value/error helper不持state，無三份重複runtime或generic Map facade。 |

## 保留的失敗與剩餘 gate

- 早期seed alias候選只能證明fixture ownership，未當AC1。正式新增parent test初次繼承`NODE_TEST_CONTEXT`造成child空跑假綠，原log保留；修正driver協定環境後才取得正式RED，最終固定child tests/pass=2、skip=0，未弱化oracle。
- 初次預設Node root因`/root`無traverse權限exit1；沿既有官方provision到workspace解決，沒有改權限／憑證／網路設定。先前兩次build exit137仍無可歸因證據；本輪未build，cgroup memory.max16GiB、cpu4，本輪full前後oom/oom_kill皆0，不能反推舊失敗。
- 尚待此候選的自然CI（含lint/build等）終局、完整AC7合法測試條件與正式sign-off。本PR只能維持Draft，不Ready、merge、部署或關Issue。
- 未操作真DB、共用TEST、Production、真帳號、寄信、付款、憑證、權限或網路變更；未修改#1887/#1895/#1897/#1900。發佈前核對20個open PR heads與完整path inventory，本15個owned paths無overlap；未據此宣稱其他不可見session已停止。

本環境raw證據在`/workspace/issue1816-evidence/`：`implementation/A-red-corrected.log`、`implementation/frozen-source-manifest.json`、`final-behavior-review.md`、`final-architecture-review.md`、`final-behavior/`、`full-suite/ordinary.log`與`full-suite/receipt.json`。此路徑是本機保留證據，不保證其他環境可讀；本報告保留可公開的結論、範圍和精確digest。
