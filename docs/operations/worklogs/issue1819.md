# issue1819 — 旅客確認路由的隔離 CI 觸發補漏
> 最後更新：2026-10-06 16:54 Asia/Taipei｜狀態：窄範圍實作／YAML 解析與 final 回歸已綠，待獨立審查與 Draft CI

## 目標

補齊只修改 `apps/web/app/api/v2/me/booking-confirmations/**` 時，既有 `midao-baseline-e2e` PR runtime lane 未被排入的缺口。本輪只完成 #1819 的 CI enforcement slice，不關閉整個 issue，也不宣稱 canonical 測試分層文件已交付。

原 issue 的「全部 browser specs 都是 mock」「workflow 沒有 real-HTTP chain」描述已過時；當前 workflow 已有 real-auth traveler confirmation browser 與 Package 4 real-HTTP API chain gate。本輪沿用原 job，只增加一條正向 path。

## AC 清單

- [x] `on.pull_request.paths` 增加唯一正向 `apps/web/app/api/v2/me/booking-confirmations/**`，既有 jobs／timeouts／concurrency／permissions／runtime 命令保持原樣
- [x] 既有 workflow source-contract 解析實際 `on.pull_request.paths` 清單的 route-family entry，包含 YAML 的空行／註解／不同 scalar 表達，並拒絕負向 path 排除；不把 comment 或 runtime step 當觸發證據
- [x] baseline 5/5、新增斷言 RED 5/6、最小 source patch GREEN 6/6，且接手後 formal targeted 6/6 PASS
- [x] canonical Node 22.23.1 完整 ordinary、lint、typecheck、migration source gate 通過；保留首次 ordinary 的環境 warning 失敗
- [ ] fresh-context 獨立 reviewer 對 final exact diff read-back、重跑 targeted、逐條驗收；記錄未解 finding
- [ ] 工作分支 commit／push、Draft PR 與 exact-head CI 收據；未綠前不 merge
- [ ] worklog／GitHub issue 里程碑雙寫
- [ ] #1819 剩餘 canonical 測試策略與目錄 routing 文件另案處理，不以這個 trigger 修正當整案完成

## 已完成（附證據）

- 基準為 `main @ 8aac3ddb668b08d13f3039257ad254702f1fa517`；2026-10-06 16:38–16:39 Asia/Taipei 重新 fetch／ls-remote 核對仍為同一 SHA；新分支尚未存在遠端
- 2026-10-06 16:39 Asia/Taipei 查核 15 個 open PR 的完整 changed-filenames：兩個 source 與本 worklog overlap 0；#1887 活動／DB owner 與 #1889 封面 owner 的檔案範圍未動
- source 只改 workflow 一行正向 path＋既有 test；接手時兩檔 patch SHA-256 為 `57a4181d56c145cc027c1665f209c42ba2a8c4c53d7632fc30d47097604ebafd`。第一輪 review 後強化 regex 的歷史兩檔 patch 為 `98d6637c1a376777836ff62023cc593d927f83fdbd00536a47053df53b03563a`；第二輪後停止堆 regex，改用既有 locked `js-yaml 4.1.1` 的真實清單解析，未重做 workflow 實作，未新增依賴或改 manifest／lock
- 本機既有 TDD raw logs 保留：baseline 5 PASS／0 FAIL；RED 5 PASS／1 FAIL（缺 confirmation trigger）；GREEN 6 PASS／0 FAIL，無新增 SKIP
- 2026-10-06 16:37–16:38 Asia/Taipei 執行 `run-checks.sh apps/web/tests/unit/midao-e2e-ci-workflow.test.mjs`：6/6 PASS、exit 0，正式 evidence 已讀回並另存
- 首次 `run-checks.sh --all`：5838 tests／5831 PASS／4 FAIL／3 既有 SKIP；#507 子命令將 `UNDICI-EHPA` 環境 warning 合併入 JSON，四項 JSON.parse 失敗。紅燈 raw log 與 receipt 完整保留，不以後續綠燈覆寫歷史
- 同一 source 重跑 `run-checks.sh --all`，僅以 process-level `NODE_OPTIONS=--disable-warning=UNDICI-EHPA` 排除該特定 warning：5838 tests／5835 PASS／0 FAIL／3 既有 SKIP，exit 0、16.08 秒；未改測試範圍、source、proxy 或網路 guard
- portable infrastructure 額外實跑 188/188 PASS／0 FAIL／0 SKIP，exit 0；此為本機 portable 範圍，不冒稱 host-bound infrastructure 或 DB runtime 通過
- 第一輪 fresh review 對三檔 patch `df9c317004be74a4bd6020cd64857ac0348f6362b24fc2f9ad77482931adb1d2` 找到 1 項 finding，判定 FIX_REQUIRED：原 regex 僅捕捉連續清單，空行／註解之後的負向 confirmation exclusion 可在 repo 外 mutation fixture 假綠。未把 6/6 focused PASS 當獨立 review PASS
- 2026-10-06 16:43 Asia/Taipei 僅修正既有 test 的區塊辨識與負向 scanner，保留第一輪 mutation 失敗；修後 formal targeted 6/6 PASS、exit 0。最終獨立複審與發 PR 前完整 gate 仍待完成
- 2026-10-06 16:46 Asia/Taipei 對第二輪三檔 patch `46116fc3f7382a570326e8ec39d88ff3ca122652a3cf6ebacccb10f12be01f60` 再跑完整 ordinary：5838 tests／5835 PASS／0 FAIL／3 既有 SKIP，exit 0、17.36 秒；portable 188/188 PASS／0 SKIP；測前後完整 staged patch 未變
- 第二輪 review 仍為 FIX_REQUIRED／1 finding：第一輪空行／註解反例已拒絕，但合法 YAML 多空格負向 entry 與 folded scalar 仍可假綠（11 種 mutation 拒絕 9/11）。依 R1 換路徑，停止 regex 追加；既有 lock 中 `@eslint/eslintrc` 已依賴 `js-yaml 4.1.1`，本機已安裝，改解析 YAML 的實際 paths array，正向 pattern 必須存在且每個 element 都須為非 `!` 開頭的 string
- YAML 解析換路徑後 formal targeted 6/6 PASS、exit 0；前兩輪失敗與未知身分均保留，final 獨立驗收仍待完成
- 2026-10-06 16:50 Asia/Taipei repo 外全新隔離目錄僅複製原 root／web manifests、原 lock、當前 workflow／test；以 canonical Node22.23.1 執行 clean `npm ci --ignore-scripts --offline --include=dev --no-audit --no-fund`，從既有 cache 安裝 661 packages／11 秒／exit 0。`js-yaml` 解析來源位於該 clean-install 自己的 node_modules；copied workflow test 6/6 PASS／0 SKIP，lock digest 未變，未靠原 repo 或其他 owner 的 node_modules 偶然解析，也未要求新 network 或 resource
- 2026-10-06 16:53 Asia/Taipei 對 YAML 解析候選三檔 patch `1168d500e8acd811b34dd6c449eeed70e6c85a4b81f9a6b44a20ef64cdd57e1a` 完整重跑 `run-checks.sh --all`：5838 tests／5835 PASS／0 FAIL／3 既有 SKIP，exit 0、16.83 秒；portable infrastructure 188/188 PASS／0 FAIL／0 SKIP，exit 0、4.54 秒，測前後 staged patch 不變。兩檔 final source patch SHA-256 為 `27d2a7d2a9895da6a98e805512d8bd7b7985fbaaa6de353339fc98f35996f2d3`；本次之後只在 worklog 記入實際結果，source 未再修改
- Node 22.23.1 `npm run lint` exit 0：0 error／1 既有 RootDocument warning；`npm run typecheck` exit 0；`node scripts/check-migration-source-gate.mjs --mode source` 為 verified／exit 0
- `scripts/check-docs-sync.sh` exit 0，輸出「No Phase/Sprint keywords found」；此為既有 checker 無可比對項目，不稱全面文件同步
- 既有 `npm ci --ignore-scripts --offline --include=dev --no-audit --no-fund` 安裝 661 packages 的 raw log 保留；`package-lock.json` SHA-256 仍為 `dccba04bc6aacc67936f437c79f2b18a30b285b2cc898acffcf15566a4142cbf`。確認專屬 worktree 無其他 writer 後，另存 npm 造成的 `yarn.lock` 副作用 diff，僅還原該檔，未混入提交
- 本輪 Builder 的真正 before CLI PASS 在後續 spawn 前（before tool chunk `6a774c`）；receipt tool chunk `ed6edc` 為 `TOOL_ORDER_EVIDENCE_RECORDED_NOT_PLATFORM_VERIFIED`。requested `gpt-6.1-sol`、actual `unknown`／identity NOT_VERIFIED；未補造前任缺少的 before 或 actual 身分

## 下一步

- 對完整三檔 final diff 做 fresh Sol review，使用真實 before → dispatch → receipt 順序與 exact digest
- 複核 ownership／遠端 main／final blobs，取得新鮮 formal commit evidence，再發布工作分支與 Draft
- 持續核對該 exact head 的既有 CI，保留各 gate 成功／失敗／未跑與 cleanup 證據；本機 Next build／完整 disposable DB runtime 尚未執行，不以 source-contract 或 ordinary 替代
- 待完整適用 gates 通過再判定 merge；#1819 其餘文件 AC 仍保持 open

## 絕不重做（Do-NOT-redo）

- 不修改 production route／checkout、harness、runner、validator、既有凍結 E2E 或 migration；不擴張到其他 route-family trigger
- 不重新建立已保留的兩檔實作，不把前任／早期失敗與未知 runtime 身分回填為 PASS
- 不再以手寫 regex 解析 YAML paths；兩輪 mutation finding 已證明語法變體可漏判，沿既有 locked parser 換路徑，不縮測試或弱化斷言
- 修改 workflow 本身與未來 confirmation-only PR 會啟動整個既有隔離 runtime job，並消耗原 CI 時間；不是只多跑一個 source test
- Owner 2026-10-06 已批准 #1819 的新增隔離測試觸發與既有等效檢查流程。範圍只含既有一次性 CI Docker DB／GoTrue 假帳號與假資料及清理；無真帳號、外部寄信、真付款、共用 TEST／Production、正式部署、新憑證、網路／權限變更或新付費資源
- 缺 Claude 專用 Edit hook 工具時採已批准等效流程，不宣稱 native hook wiring 已驗證，不弱化原保護與發布 gates
