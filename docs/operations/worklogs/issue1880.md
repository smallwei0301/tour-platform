# PR #1880 — Node22 雲端工具鏈與正式證據工作紀錄

> 狀態：source／有限本機 runtime PASS；整體 HOLD。既有 PR #1880 即正確 toolchain 工作錨點，其 Conversation 頂層 issue comment 可完成 D7 的外部留言部分，毋須另建 Issue。2026-10-04 收據更新：父任務已核對下述 merge snapshot CI SUCCESS，並已發送及讀回 #1880 留言；本次文件增量僅在本機準備，尚未 commit／push，整體不因此放行。

## 目標

保存 [PR #1880](https://github.com/smallwei0301/tour-platform/pull/1880) 的 exact 五檔工具鏈證據、失敗歷史與剩餘 gates；不包含下游產品施工。歷史 [PR #1822](https://github.com/smallwei0301/tour-platform/pull/1822) 與 `issue1822.md`／Kanban `t_5c80c12d` 是 host-bound 分區工作，不把其舊範圍或授權套用為本卡完成。已以 Issues API 唯讀確認 #1880 對應本 PR；current-main harness 03 D7／02 §4 要求 worklog＋issue 留言，沒有另建獨立 Issue 的要求。#1882 是下游功能且留言已取消，禁止借用。

## AC 清單

- [x] exact 五檔 source readback 與有限本機驗證有獨立收據。
- [x] 原 FAIL 與 metadata 修復後 PASS 分開記錄。
- [x] 歷史 CI anchor 與實際 checkout SHA 明確區分。
- [x] 已核對 snapshot `c33bf33867b3572c695a36c4b80bfefa7a395674` 的成功 CI／baseline／secret anchors（父任務證據，見日期段落）。
- [x] 既有 80 行文件已發布於 `957679312f1288af8f4a05d43d1e470d942be4a5`，父任務已發送並讀回 #1880 留言。
- [ ] 本次 D6 收據文件增量尚待正常發布；不把本機準備視為已完成遠端同步。
- [ ] ready／merge／Production 的必要授權與驗收；不由本機綠燈放行。

## 已完成（附證據）

### Exact scope 與保全

- old base：`ce45cb7a0539ca5e6314ae4c7ef2d021eca075d5`。
- source：`69c78c3a725fb6037c0c8a7703abdc8f34f73c67`；tree：`963e19fedab36dd946d97dfe0747a89e3cbfc9fa`。
- 原兩個 commits：`2fe58896326105cb4351106ab55edae0cc29e1ea`、`69c78c3a725fb6037c0c8a7703abdc8f34f73c67`；五檔 +127/-8，只有工具鏈腳本、cloud contract、ordinary 分流與 boundary 契約。
- exact 五檔 patch SHA256：`6feff3b36b2d8915adde8133f0f784faf2fb427dd1625c43169e394451f79335`。
- 原 rework `3e9718f17f78ba56562f29846f8442715d831c20`、recovery `da9f1fbd5cc2b373609d0956404a1c91d61a864c`、下游 #1886 base `455b2e0a38cbc970b2f35af6cab5ae5bfe13cb99` 與原 worktrees 保全。

### 本機命令與結果

實跑均經 canonical 入口，使用 `env -i`、`TP_NODE22_ROOT=/workspace/tour-cloud/toolchains/node/22.23.1`、快照自己的 `CLAUDE_PROJECT_DIR`、隔離 TMPDIR/npm cache/config、npm offline/ignore-scripts；沒有下載或安裝。原始完整命令與 TAP 保存在同 executor 的 `/workspace/tour-rework-20261003/upstream1880/runtime-validation/`；這是本機收據位置，不冒稱為 GitHub 可下載 artifact。

```sh
.claude/hooks/run-checks.sh apps/web/tests/unit/tp-node22-cloud-contract.test.mjs apps/web/tests/unit/tp-node22-evidence-runner-runtime-contract.test.mjs apps/web/tests/unit/midao-ordinary-suite-boundary.test.mjs
scripts/toolchain/tp-node22.sh -- npm run typecheck
.claude/hooks/run-checks.sh --all
.claude/hooks/run-checks.sh apps/web/tests/api/issue1293-migration-ledger-gate.test.mjs apps/web/tests/unit/midao-baseline-final-gate.test.mjs apps/web/tests/unit/migration-source-gate.test.mjs
.claude/hooks/run-checks.sh --all
```

| 階段 | 真實結果 |
|---|---|
| toolchain targeted | 9 PASS／0 FAIL，exit 0 |
| 獨立 typecheck | exit 0，`tsc --noEmit` 無 diagnostics |
| archive 首輪 ordinary | 5819 tests／5811 PASS／5 FAIL／3 SKIP，exit 1；保留 FAIL |
| 補 metadata 後原失敗三檔 | 19 PASS／0 FAIL，exit 0 |
| 補 metadata 後 ordinary 一次 | 5820 tests／5817 PASS／0 FAIL／3 SKIP，exit 0 |

五項 FAIL 源於 `git rev-parse --git-common-dir` 在 archive 缺 `.git` 時失敗；包含 ledger CLI 三項、baseline-final-gate 檔案載入與 migration-source-gate CLI。以純本機 `git clone --local --no-hardlinks --no-checkout` 複製真實 metadata，僅在隔離快照設定 detached exact HEAD/index。common-dir 屬快照自身，無 alternates／object hardlinks，原 repo refs／worktrees／status 不变。前後 3123 blobs 全相同；總 test 多一項是原載入失敗檔案恢復收集兩個測試。沒有修測試、加 skip 或偽造 history。

原 toolchain targeted 9/9 與 typecheck 以相同 source/test/runner bytes 合理沿用，metadata 修復後未重跑。runtime-contract 本身不斷言 inner npm exit 0，也不轉出 inner TAP；因此 ordinary／typecheck 結論來自獨立收據，不能由外層 9/9 推定。

收據 SHA256：

- 原 targeted.log：`871a6144ebc7922b7412c0b97dd2735541f341b47b394691bad7264edb86b767`。
- 原 typecheck.log：`10ed2715d5b7949d7aa560504e644c2ad15db1ba7cd5af86c40f5ce3643fe7f1`。
- 原 FAIL ordinary.log：`a1bedb881f4d8fdad8a135865cb06ab0b19a82af54dd9c0a21393e8bca33bf3a`。
- metadata-repair/targeted.log：`f5d16becaf699f2dbe97e40c271045bf903e73e122b165af3e3d403fff728072`。
- metadata-repair/ordinary.log：`bd03af0bea096b457d0a5824cd560730fd9ddff0a2131ec4b05a371ed830b708`。

同一獨立 reviewer `/root/upstream1880_review` 核對 exact 五檔、3123 blobs、獨立 metadata、TAP 與原 refs 保全：source PASS、有限 local runtime PASS、無新增 source finding，overall HOLD。requested `gpt-6.1-sol`／actual UNKNOWN；closure 是原 actor 重新讀證據，不冒稱平台新空白 context。原始 receipt：`metadata-repair/review.md`、`review.json`，歷次 review／取消／scope 拒絕與 preflight 失敗不刪除、不改寫。

### CI anchors 與 D6

[歷史 CI run 36811600426](https://github.com/smallwei0301/tour-platform/actions/runs/36811600426)／[job 110207638522](https://github.com/smallwei0301/tour-platform/actions/runs/36811600426/job/110207638522) success；migration source gate、lint、typecheck、unit、build、ISR、preflight 通過。原始 checkout 是 `7fd6ba1593c3b021fdfcbd703b5b2a20ed00fd27`，即 source 合入舊 base；不是目前 merge CI。

歷史 remote read（保留當時結果）：main `ea75b40fa6e2db145b79a7ecc5f3eb01fdd598db`、head `69c78c3a725fb6037c0c8a7703abdc8f34f73c67`、merge `0cd4f6f5f626757678df2e559acbf93996a27bcf`。main 相對舊 base 僅三個 readiness docs commits。current merge 的 workflow 查詢為空（API 僅 PR-triggered 第一頁）；既有 PR body 記錄 check-runs/statuses 為零。當時無適用的新 run，保持 NOT RUN／pending；此為歷史狀態，不把歷史或本機 PASS 替代 D6。


### 2026-10-04 D6／D7 成功收據補記（父任務查證來源）

以下由父任務於本次 2026-10-04 交接提供，executor 僅落檔，未做 fresh API／網路查證；日期為本次收據補記日期，不臆測各 run 的完成時間。先前發布收據所記 CI／baseline `in_progress` 與 secret `success` 保留為歷史，後續完成結果如下：

| 收據 | 父任務查證結果 | 適用 snapshot／範圍 |
|---|---|---|
| [CI 37141095755／job 111255517003](https://github.com/smallwei0301/tour-platform/actions/runs/37141095755/job/111255517003) | SUCCESS；ordinary 5817 PASS／3 SKIP | checkout `c33bf33867b3572c695a36c4b80bfefa7a395674` |
| [baseline 37141095720／job 111255517169](https://github.com/smallwei0301/tour-platform/actions/runs/37141095720/job/111255517169) | SUCCESS；59 PASS、兩項預期 workflow step skip（不是兩個測試 skip） | checkout 同上；不把 step skip 計入測試數 |
| [secret 37141095716](https://github.com/smallwei0301/tour-platform/actions/runs/37141095716) | SUCCESS | 父任務提供的此批檢查收據；未另宣稱其 checkout |

上述 CI／baseline checkout 的 parents 為 main `ea75b40fa6e2db145b79a7ecc5f3eb01fdd598db` 與 PR head `957679312f1288af8f4a05d43d1e470d942be4a5`。D6 成功證據限定於此已核對 snapshot，不泛化為未執行的新 head／merge candidate CI。

父任務已發送並讀回 [#1880 頂層 milestone comment 5975102898](https://github.com/smallwei0301/tour-platform/pull/1880#issuecomment-5975102898)，因此原「留言尚未發送」狀態已有後續結果；executor 本輪不新增或重送留言。既有文件發布＋此留言構成該里程碑的 D7 證據；本次新增收據尚未發布，不能宣稱此文件增量已遠端同步。

本次只補收據，原 source／test／runner／workflow bytes 不變；不重跑既有測試。後續若發布此文件增量，其新 head／CI 狀態須另行據實核對，不能繼承成「新 CI 已 PASS」，也不為把文件自身最終 SHA 寫回同一文件製造遞迴 commits。本輪禁止 push、Ready、merge、部署及新留言。

## 下一步

- D6：上述已核對 snapshot 的成功 anchors 已補入本機文件；本次文件增量發布及其後續 exact head／CI 核對仍 pending。不得 manual rerun 或為觸發 CI 建空 commit。
- D7：父任務已完成 #1880 留言並讀回，證據見上；本輪不再留言。本次文件收據增量尚待發布。PR body 本身不能替代 issue comment；不另建 Issue，也不對 #1882 留言。
- 文件 branch-target gate 已補證：父任務於 2026-10-03 10:17 PDT（原始觀察時間 17:17 UTC）在[現行 Vercel Environments UI](https://vercel.com/smallwei0301s-projects/tour-platform/settings/environments) 唯讀核對 project `prj_KrrA4UrpyZtEfsQZeSHUJ5zaw4Re`：Production Branch Tracking=`main`、Preview=`All unassigned git branches`、Development=`CLI`、Custom Environments=0。結合既有 deployment `dpl_D9JbDZpGGoq8m2C3T3VgVSqMCZRP` 的 `source=git`、branch=`codex/tour-cloud-node22`、SHA=`69c78c3…`、`target=null`／Preview alias，本分支 normal push 落於 Preview，不推 main 或直接部署。這是父任務提供的現行 UI proof，不冒稱本 executor 成功取得 `get_project` response；先前 `INVALID_ARGUMENT: idOrName: expected string, received undefined` schema 故障保留，不重試。沒有修改設定或擴充 Production 授權。
- #1881 base 是 `codex/tour-cloud-node22`。若日後 normal push 文件至此 branch，會改變 #1881 的 base tip／merge candidate，須重新檢查相依 diff／CI；不 rewrite 下游 #1881→#1883→#1886→#1887。
- ready、merge、Production 授權保持 HOLD；歷史 ready 拒絕不重試。沒有宣稱 ready、merged、deployed 或全 gates PASS。

## 絕不重做（Do-NOT-redo）

- 不重跑相同 source 已通過全套以製造新紀錄；文件 delta 不改產品／test／runner bytes。
- 不重試 #1882 user-cancelled comment、gh PR Forbidden 或 ready 拒絕；不換 actor／接口繞過。
- 不 merge、push main、force push、rewrite、直接部署／重部署、Production 操作、DB／共享 TEST、改憑證／權限／網路設定。核實為 Preview-only 的正常工作分支 push 依 standing permission 處理，不把此條擴張為全面禁止 Preview。
