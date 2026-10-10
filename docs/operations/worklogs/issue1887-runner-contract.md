# #1887 — current-main runner／字型 helper 契約修復

> 更新：2026-10-07 12:37 Asia/Taipei（04:37 UTC）｜最小 prerequisite 候選，最終 staged coverage／新 exact-diff 審查／發布／CI 尚待，整體仍 HOLD

## 目標

修復 #1887 runner 對 current-main 字型 prebuild 的精確契約，並讓既有 runtime fixture 真正執行既有 helper。
Owner 本輪只將 runner、對應測試與文件交由 Ava 接手；產品其他檔案仍由原 owner 負責，#1886 的重疊成果保留待整合。
本輪基準：PR head `8b2503b65ccfa1393107503f5ec0d474d1c837f5`、main/rules `d12b9a9c7004319d6c4b3e53d161532cbeb4049a`。

## AC 清單

- [x] build script 只接受 current-main 的精確 `node ../../scripts/build/prepare-next-google-font-compat.mjs && next build`，舊 script／替代／fallback／flags／env prefix 等拒絕
- [x] helper 加入 canonical file／固定 SHA-256 契約；missing、tamper、檔案及父目錄 symlink 負向均實跑
- [x] fixture 複製真 helper 與隔離的三個真 Next vendor 檔，實跑 patched／already-patched；來源 vendor bytes 不變
- [x] 保留 network／secret／argv／child／worker／cleanup assertions；vendor missing／version／digest 負向在 next probe 前拒絕
- [x] canonical targeted 64/64＋typecheck PASS；canonical ordinary 5,950 total／5,947 PASS／0 FAIL／3 SKIP＋typecheck PASS；lint PASS
- [x] 原四檔 fresh 獨立 exact-diff 審查 PASS-in-scope，新增 source finding 0；獨立 10/10 實跑通過
- [ ] 同一既有授權 staged-evidence 格式修正的 exact backport 審查與完整 staged coverage、正常 head-locked Draft 發布、新 exact-head CI 與原 merge／release gates

## 已完成（含證據與失敗）

- GitHub compare 核定 merge-base `0ee6cd9596f269de4a11d8797906008841033d10`；以該 base 建立無衝突 head＋main 整合 tree `7fb03d774d757d81886478fadae849e06612629c`。在新隔離目錄逐檔核對 3,158 blobs／modes；原 checkout 保持 `e86e33c746af9b535bd3347a0a9836b64cd038cc` 且 clean。main 的既有 source／文件只做原值整合，本輪產品、helper、offline guard、startup/security guard、E2E spec/config bytes 均未修改。
- before preflight 真 exit 0，持久 PASS 的 generatedAt 為 `2026-10-07T04:02:53.625Z`。其後真 builder dispatch 與 receipt 使用 tool-order 證據；requested `gpt-6.1-sol`、actual `unknown`，sequence 只記錄非平台驗證的工具順序，identity `NOT_VERIFIED`，沒有猜 dispatchedAt 或宣稱 verified。
- 修復前，在整合 package＋helper 上 canonical build preflight 真 exit 1：`CI package contract rejected`；修復後相同精確命令 preflight 真 PASS。helper 固定 SHA-256 `866f34c9f210e88e15003db71fa0753eff7c0939dee800d734a3cfe8c78d6812`；舊 pins 原值保留。
- 04:12:03–04:13:22 UTC：`run-checks.sh --typecheck` 實跑 runtime 14 案＋source 4 案＋真 font compatibility 46 案，64/64 PASS、0 FAIL／SKIP；typecheck PASS。先前 focused CI fixture 5/5 亦 PASS。
- 04:13:35–04:13:55 UTC 首次 `run-checks.sh --all --typecheck` **FAIL**：5,950 total／5,943 PASS／4 FAIL／3 SKIP；typecheck 未被此紅燈命令執行。四案均為既有 issue507 測試把 stdout＋stderr 合併後 JSON.parse，遇到環境注入的 `UNDICI-EHPA` experimental warning。此 FAIL 原樣保存，沒有修改測試或 source 來遷就環境。
- issue507 乾淨 child-env 對照 7/7 只作診斷，不作最終正式證據。後續改用既有環境與 proxy/security 設定，只在原 `NODE_OPTIONS` 後追加 `--disable-warning=UNDICI-EHPA`，精確只處理此 warning code；同七案真 PASS，未用 `NODE_NO_WARNINGS`。
- 04:16:18 UTC 的首次 narrow-warning full 執行在服務 polling 回傳 `automatic approval review was cancelled` 後留下不完整 TAP，無 terminal receipt；exit **UNKNOWN**，不填 PASS。原 incomplete log 保留。04:17:38 UTC 服務恢復重跑前沒有取得前一 process 終止的獨立證明，這項調度限制不隱藏；重跑後 process read-back 未見測試／npm 殘留。
- 04:17:38–04:18:01 UTC，同一 canonical full 命令、同一精確 warning-code suppression，工具真 exit 0：**5,950 total／5,947 PASS／0 FAIL／3 SKIP／0 cancelled**，typecheck PASS。這是後續新證據，不改寫上兩次 FAIL／UNKNOWN。
- 04:18 UTC canonical lint 真 exit 0：0 errors／1 既有 RootDocument warning；ESLintRCWarning 亦保留。真 canonical build **FAIL／exit 1**：runner 契約通過、真 helper 回報 patched，隨後原 `STARTUP_ENV_INVALID` 拒絕缺 `GUIDE_SESSION_SECRET`、`ADMIN_ACCESS_TOKEN`、`MIDAO_REQUEST_CLAIM_PEPPER`；未填入／讀取秘密，未修改 guard 或 mock 字型。
- 本機 raw logs／receipts／manifest／原失敗保存在 `/workspace/shared/tour1887-runner-evidence-20261007`；dispatch 前後回執保存在 `/workspace/shared/tour1887-approved-dispatch-20261007`。以上檔案是本次可讀證據，並非將過去遺失產物重建成歷史 PASS。
- 原四檔獨立審查：baseline tree `7fb03d774d757d81886478fadae849e06612629c` → reviewed tree `f904fcd401c6374cbdfcb4d258c3080b982060f9`，patch SHA-256 `e548293512359b2a86f72608e2105c3033e29baf794d3596bf768a0dfc2daac6`。04:23:13–04:23:47 UTC canonical runtime focused 6/6＋source/settings 4/4 PASS，blocking source findings 0；沒有重跑 full／build／browser，不稱完整驗收。首次 default toolchain path 缺失的真 exit 1 保留；requested／actual 與 logical alias／實際 actor 的 binding 限制亦保留，identity 不宣稱 verified。
- 正常 stage gate 真重現已知 producer/consumer 不合：next font child 46/46 PASS，但原 verifier exit 1，`evidence.cmd does not equal derived expectedEvidenceCmd`。依本輪 04:06:18 UTC Owner 對同一兩行／三指令模式的既有批准，只複用已發布 commit `8af541d30d87a67c90b999e8a2ee2788dc74788f` 的兩個原 blob：verifier `20ff8cd60028a2b8ec88759b7d1abf70609324e2`、unit `63b717d0c8466df598d86cdc31ba4b3bdbe324d7`；不帶入任何付款／baseline 其他修改。
- 原樣 backport 41/41 canonical unit PASS；修後 `--run` 真 exit 0，僅記錄該 unit 的合法 staged entry。兩檔 increment patch SHA-256 `3961797293f1f3de4c59aaaa5f0288ba2bf3bd199b1b743993e7d81caa21a331`；沒有改寫舊 receipts 或放寬版本／30分鐘／exit／exact tree／完整 coverage。這兩檔仍須本分支獨立審查。
- **完整 staged coverage HOLD**：真 index 相對原 PR head 含 current-main 原值帶入的 #1889 E2E；`--all` 的 NPM path coverage 不涵蓋它。foundation plan 的 TDD/evidence protocol §5–8、baseline implementation 全域 §5–7 及 verifier CLI 無 base/ref 或已驗 main evidence 重用入口，不自行改 HEAD 消掉 staged paths，也不偽造 bundle。原 exact heavy E2E wrappers 依賴 pinned local Supabase／Docker；本雲端實查 Docker binary/socket 與 pinned Supabase CLI 均缺失，沒有下載／安裝／fallback。一次性隔離假資料與共用 TEST／Production 的授權範圍分開評估，不能把這項已驗證的 runtime 能力問題籠統稱為缺 Owner 批准。

## 下一步

- 最小必要 prerequisite 路徑已由 controller 核定：另建隔離候選，從原 `8b2503b65ccfa1393107503f5ec0d474d1c837f5` 精確恢復 3,150 blobs／modes，只帶六個已批准 owned 檔，另外複用 main 已合併 #1892 helper 原 bytes 與 app package 的唯一 build 欄位。沒有整批帶入 main 的 #1889／ledger 等無關 source，原整合 tree／失敗／未驗限制完整保留，不倒稱 current-main 整合 PASS。
- 新候選八檔最初 tree `4b21059dcbe743bca863963c3e816e6ea0189230`；所有其他原 PR 產品 bytes／modes 不變。helper SHA 與已審 main 完全相同，package JSON 只有 build 值不同；八個路徑的手動 file-guard 分類皆 exit 0，不證明 Native hook wiring。
- 新候選 04:36:16–04:37:00 UTC canonical `run-checks.sh --all --typecheck` 真 exit 0：**5,897 total／5,894 PASS／0 FAIL／3 SKIP／0 cancelled**，typecheck PASS；原環境只精確過濾 `UNDICI-EHPA`。本次 full 的 typecheck tail 與 lint 有短暫重疊，沒有再啟動第二個 ordinary suite；此時序限制不隱藏。新 lint 真 exit 0、0 errors／1 既有 warning；build 真 exit 1、helper already-patched 後仍由原三項缺憑證 startup guard 拒絕，未填值／弱化 guard。
- 原四檔 review PASS，兩檔 verifier 原樣 backport 亦經不同 actor 在 canonical runner 獨立 41/41 PASS；兩次審查範圍與 tree 分列，不將它們冒稱為新八檔 exact diff 的最終驗收。新 helper／package 依賴與 worklog 仍需 read-back review。
- 真 staged test 範圍現在只有 `tp-node22-evidence-runner-runtime-contract.test.mjs` 與 `midao-staged-evidence-verifier.test.mjs`。最後必須以這兩個 literal path 經 canonical `--run`（預期 14＋41＝55 案＋typecheck）取得同一 tree bundle，再 `--check-only` 真 PASS；不能以 ordinary full 代替 host-bound runtime coverage。
- 原四檔與本次依賴 read-back 審查、最後 source gates 完成後正常 head-locked Draft 發布；current-main 自然 merge candidate 的 CI 及產品／merge／release gates 另行核對，不將最小 source 候選當已驗整合
- 獨立審查與必要 source gates 通過後，正常 fast-forward 更新既有 Draft #1887，核對 actual head/tree，再追新 source candidate 的 CI
- mounted race／unmount／StrictMode／mobile browser、#1886 dependency/ownership 整合、原 CI／merge／release／Production gates 仍需原流程驗證；本輪不宣稱完整產品或 merge 驗收

## 絕不重做（Do-NOT-redo）

- 不刪除／改寫 #1886 或舊 #1887 成果；不把 tooling 修復擴成產品修復
- 不修改 helper、vendor source、guard、E2E pins、鎖檔、凍結檔案；真 vendor 副本只在 owned temp／private dependencies 內使用
- 不以 fixture probe 當真 Next build／browser／DB 證據；原 FAIL、UNKNOWN、skip 與調度限制保留
- 不執行 DB／共用 TEST／Production、憑證、網路或權限變更；本輪沒有 Ready／外部 Codex 啟動／merge／手動部署

## 2026-10-07 D6 CI／五項 issue AC 有界回讀（證據紀錄）

> 證據觀察：2026-10-07 05:18–06:49 UTC；PR 仍為 open／Draft。本節依唯讀 source evidence、五項 AC readback 與 merge-tree readback 追加；紀錄整理時間：2026-10-07 15:14 Asia/Taipei。以下測試只綁各自明列的 SHA，不涵蓋保存本節的後續文件 commit。

### D6：精確測試候選的自然 CI

- PR source head `e1555ec3b98d3ff07256487979b8e26bb46b5fc6`、source tree `6d8b7b14657f6c02eca82a3ab38bea48bafad231`。
- 四個自然 workflow 的 actual checkout 均為 merge candidate `6f4f027b3f321afa770cf37ddf78fdbbe17d2910`、tested tree `1f736ea5ab61b6145dbeddb64f7c2ac8f621f87f`；該候選以當時 base `d12b9a9c7004319d6c4b3e53d161532cbeb4049a` 整合此 source head。四個 workflow 均為 SUCCESS，沒有沿用舊 head 或手動 rerun：
  - [Source CI #37573150017](https://github.com/smallwei0301/tour-platform/actions/runs/37573150017)：5,950 total／5,947 PASS／0 FAIL／3 SKIP；lint／typecheck、helper/build 234/234、ISR／preflight 通過。Preflight 重跑的是同一套 ordinary，不重複計數。
  - [E2E smoke #37573150074](https://github.com/smallwei0301/tour-platform/actions/runs/37573150074)：首輪 14/14 PASS，沒有 flaky／retry；範圍仍是既有 bounded allowlist。
  - [Secret scan #37573150119](https://github.com/smallwei0301/tour-platform/actions/runs/37573150119)：SUCCESS。
  - [Baseline／E2E #37573150013](https://github.com/smallwei0301/tour-platform/actions/runs/37573150013)：infra 190/190、Midao browser 53/53、manual LINE 2/2、legacy login 3/3；Phase4 real-auth 與 Package4 real-HTTP chain SUCCESS，owned cleanup／identity stages 已完成。歷史 #1811 RED 證明 conditional SKIP 與 failure-artifact upload SKIP 不算已執行。
- 同一份 PR comment 的自然 CI 收據：[exact candidate 結果](https://github.com/smallwei0301/tour-platform/pull/1887#issuecomment-6031357613)。以上可作為 **candidate `6f4f027…` 的 D6 CI 綠燈證據**，不等於更新後 current-main 整合候選、完整產品驗收或 merge／release／Production gate 通過。
- Current main `8841776809e576fabf88bdc2046c70003c5a25dc` 相較前次基準只更新 `docs/operations/reports/readiness-live-state-latest.md` 這個既有文件 blob；read-only merge-tree 對照為 3,158/3,159 blobs+modes 相同，候選新 tree `83b74f6664046e31920e73e5c73da5a63b7982b7` 僅有此文件差異。**新 tree CI 為 NOT_RUN，沒有宣稱它已測或綠燈。**

### Issue #1882 五項 AC 的本輪證據與邊界

1. **過期場次／列表與 CTA 一致性：有界 PASS。** Current candidate CI 的 upcoming-schedules 測試 4576–4583 通過，涵蓋過期／已開始排除、滿額行為、全過期時 generic entry，以及 Taipei midnight 列表／CTA 一致。唯讀 Preview river detail 本次選取的日期列與 CTA 沒顯示歷史 April 日期；這只是單一 live sample，不是已控制的正式部署舊資料證明，也不把過去觀察直接歸因到目前產品。
2. **未來方案／名額／URL：所測分支 PASS，scheduleId 分支未驗。** Preview 選 standard plan 與 2026-10-12 顯示剩 8 位，href 為 `/booking/hualien-river-trekking?plan=d1fd0e00-7bbe-4d2d-b258-81c73b7a3c7f&date=2026-10-12`；此生成場次樣本沒有 `scheduleId`。切換 half-day plan 會清掉已選日期，兩個方案 CTA 回到各自 plan-only href；不據此宣稱已驗有 populated scheduleId 的路徑。
3. **凍結時鐘／已開始、未來、台北日界與空 live 回應：純函式／handler 證據 PASS；受控 Chromium runtime NOT_VERIFIED。** 同一 current candidate CI 通過 upcoming helper 8 案、DatePicker SSR civil 7 案、resolver 4 案、真 handler／VM ordering 12 案。另依既有 canonical 路徑對 upcoming 12 與 policy 3 執行時，Chromium 在產品 assertions 前因 socket `EPERM`／`SIGABRT` 無法啟動，兩組 actual exit 1；分類為 `NOT_VERIFIED-runtime`，不是 15 個產品回歸。未重試、未加旗標、未換 binary／digest／allowlist。這些 focused E2E 結果不被 CI 的其他 browser lane 或純函式測試取代。
4. **Client／ISR 邊界：範圍有界，既有依賴保留。** Detail page 對顯示列／初始 CTA 共用 `selectUpcomingSchedules` 輸出，並將同一集合傳入 `DatePlanSection`；client resolver 會在 render 過濾 SSR／live 集合，成功的空 live response 會取代 SSR；detail ISR 為 `revalidate=60`。既有 client ordering/cancellation 與 API V2 cutoff／fallback regression 測試在 current ordinary CI 通過。Legacy API schedules query 仍沒有 absolute start-at floor，cache 也可能在既有 tier 內短暫過期；不宣稱已保證已送出的 HTML 即時過期或 mounted 頁面跨午夜持續更新，亦不刪除既有 legacy fallback。若要求更強的 API／cache 保證，仍是明確有界的依賴。
5. **安全的已部署 exact-commit 瀏覽器：所述桌面 Preview 窄驗 PASS-in-scope。** 自動 Git Preview `dpl_74JaRoJS1JJVoPWZVy8W6fkUzQJx` 為 READY、target `null`、`meta.githubCommitSha=e1555ec3b98d3ff07256487979b8e26bb46b5fc6`。唯讀載入真實 river detail，僅操作方案／日期 UI 選擇並檢視 DOM／href；沒有進 booking、登入、提交表單、下單、付款、手動部署或直接 DB 操作。此桌面樣本未建立 responsive/mobile 視覺證據；最初列出的 cave detail 為 not-found，不歸因於基準或產品修正。

### 仍保留的依賴與流程狀態

- #1886 仍為 Draft，head `455b2e0a38cbc970b2f35af6cab5ae5bfe13cb99`；它的三個 tooling 檔與 #1887 重疊。舊 6 個 runtime assertions 在 #1887 的 14 個案例中保留並擴充；不應盲目把舊三檔合併回來。建議由 controller／owner 記錄 superseded／dependency disposition，保留 #1886 branch 與 artifacts，再對任何聲稱的獨特 assertion 做 exact-delta audit。此為建議，**沒有關閉、轉移 ownership 或合併 PR**。
- mounted reverse completion、error/retry、unmount-late completion 仍是既有 coverage 限制；StrictMode replay 與 persistent mounted midnight 依 controller 指示不自動升格為這五項 AC 的新增強制 gate。不得藉此把缺少的 coverage 說成已通過，也不另造 gate。
- final 8-file independent review PASS-in-scope、source findings 0，及其另行 10/10 run，僅由 [既有 PR comment](https://github.com/smallwei0301/tour-platform/pull/1887#issuecomment-6031156579) 支持；不是 44-file aggregate signoff。Requested Sol，actual model `unknown`；不宣稱 runtime identity 已驗證。
- Production ledger 的歷史 `10 missing` 仍是既有 release HOLD 記錄；本輪沒有重查為當前事實，也不把它改寫成新的 direct source gate。
- 本節只保存 D6 對上述**已測 merge candidate**的收據。截至 2026-10-07 15:14 Asia/Taipei，D7 雙寫仍 pending：本節已整理 repo 側證據，但 Issue #1882 尚未同步本次結果；先前取消的 issue 動作未重試。保存本節的後續文件 commit 必須另記 actual SHA／tree 與自身 CI 狀態，不得倒稱由上述 CI 測過。PR 仍 Draft，未 Ready、未 merge、未手動部署，原 merge／release／Production gates 仍依原流程判定。

### 本節來源

- 唯讀來源收據：`/workspace/shared/tour1887-docs-consolidation-20261007/source-evidence.json`。
- 五項 AC readback：`/workspace/shared/tour1887-runner-evidence-20261007/gate-scout/five-ac-readback.md`。
- Current-main merge-tree readback：`/workspace/shared/tour1887-runner-evidence-20261007/gate-scout/merge-tree-readback-receipt.json`。

## 2026-10-07 ordinary mock CI 補充（尚未發布／未取得 browser 結果）

- Controller Ava 明確限定本次只補 existing `e2e-smoke.yml` 的 ordinary CI 行為證據，不是 canonical host fallback／等效替代或 gate 豁免。現有 managed Chromium 沿用原 workflow 安裝；不修改 `tp-node22.sh`、官方 Node artifact、Chromium host 路徑、spec/config/helper pins、凍結測試或 shared TEST／Production。
- 只在既有 smoke job 增加 upcoming 12 與 policy 3 的順序步驟；兩個原 spec bytes 不变，各自管理 3108 mock fixture 及 cleanup。第二步在第一步成功或失敗後執行，取消則停止；各限 6 分鐘，job 原 20 分鐘上限維持。
- 兩步使用 `env -i`、既有 Node22 PATH、原 Playwright browser cache、`PLAYWRIGHT_NO_WEBSERVER=1`；不傳 caller 的 secrets／CI／NODE_OPTIONS／npm config。只使用 owned 空白 npm user/global configs、offline／ignore-scripts，非零 exit 保留並 cleanup。ordinary 專屬 output 子目錄防止後一步覆蓋前一步的失敗產物，沿原失敗 artifact upload 保存。
- 新增窄 contract test：核對兩步／原 pins／不碰 canonical、以 fake npm sentinel 實跑兩段 shell，驗無敏感環境外洩、非零 exit 與 cleanup、repo `.npmrc` 先拒絕。首次實跑發現 `set -e` 不能保證 `test A && test B` 在 for-loop 中提早停下，2/4 FAIL；修成 explicit if/exit，不放寬測試。原 RED log 保留。
- Node22 canonical `run-checks.sh` 的新四案與既有 #1275 三案合計 7/7 PASS；YAML parse 與兩段 `bash -n` PASS。這些是 shell/source contract，沒有 launch 本機 Chromium，不是 15 案 browser PASS。本次仍待 fresh independent review、正常發布與新 exact candidate 自然 CI 回讀；未啟動 Work、Ready、手動 workflow、merge、部署或 DB。
- #1890／#1894 最新 diff 的 workflow 修改位於 `midao-baseline-e2e.yml`，本次完全不動該檔。Source ownership 維持原 controller；D7、#1886 disposition、canonical 12＋3 NOT_VERIFIED-runtime、完整 acceptance／merge／release HOLD 原樣保留，ordinary CI 即使成功也不得清除此 HOLD。

## 2026-10-07 20:18 Asia/Taipei：Owner 單次接受等效驗證與 D6 收據

### 單次決定與未變的邊界

- Owner 於 12:18:53 UTC（20:18:53 Asia/Taipei）對「是否僅這次接受這份 CI 證據作為等效驗證；原指定環境沒跑的事實保留，批准後仍完成收尾與剩餘發布檢查」明確回覆「接受」。範圍只含 #1887 本次已測的 ordinary CI upcoming12＋policy3，**不形成永久 runtime 豁免、不批准跳過其他 gates 或直接合併**。
- 已接受的 source head=`c2539212b724e870c5676880958087bf1018b1e7`；自然 merge candidate=`0ebb3c4d81e3140352a885d0f78e545bf8c452ea`，parents=`8841776809e576fabf88bdc2046c70003c5a25dc`＋`c2539212…`，tested tree=`993b3bdba375af0070a33e1c5ad56e0747f1a003`。12:20 UTC 再回讀 main/head/candidate 未變。
- ordinary browser 使用 Node22.23.3／npm10.9.9、Playwright Chromium v1208／Chrome145.0.7632.6；原 host 指定 Node22.23.1、官方 artifact／execPath 與 `/usr/bin/chromium`。managed browser來源、shell啟動邊界及每次preflight證據不同，如實保留。原 host 的 socket EPERM／SIGABRT FAIL／NOT_VERIFIED 不改寫為已執行或 PASS。
- 原15個spec、Playwright config、canonical runner、helper/classifier pins與全域規則都沒因本決定修改；原mock、非GET/HEAD拒絕、network／cleanup guards維持。這次接受不涵蓋 DB／共享TEST／Production、憑證、網路或權限變更。

### D6：上述 exact candidate 的四個自然 CI 全部 SUCCESS

- [Source CI 37615310363](https://github.com/smallwei0301/tour-platform/actions/runs/37615310363)，job112772103351：5954 total／5951 PASS／0 FAIL／3 SKIP；lint、typecheck、build234/234、ISR、preflight成功。Preflight重跑同套ordinary，不重複加總。
- [Smoke 37615310319](https://github.com/smallwei0301/tour-platform/actions/runs/37615310319)，job112772103303：原14 PASS；新增 upcoming12/12 PASS（51.8秒）、policy3/3 PASS（29.9秒），首跑、無failed／flaky／retry。兩個supplemental steps與既有spec都真正執行，非source-contract替代。
- [Secret scan 37615310275](https://github.com/smallwei0301/tour-platform/actions/runs/37615310275)，job112772103754：SUCCESS。
- [Baseline 37615310220](https://github.com/smallwei0301/tour-platform/actions/runs/37615310220)，job112772105200：infra190、browser53、manual LINE2、legacy login3 PASS；Phase4／Package4 step success。Redacted數字不猜，歷史1811 RED conditional SKIP與failure-artifact upload SKIP不算實跑。
- 四份原始job log均核對actual checkout=`0ebb3c4…`；GitHub merge-ref再核tree一致。這是**已測c253／0ebb的D6**，不倒填保存本節的後續文件SHA已跑過CI。
- 本次三檔ordinary CI增量有fresh獨立審查PASS-in-scope、blocking finding0，7/7 canonical targeted及獨立fake-npm28/28。此前完整44檔aggregate獨立審查在4865 head為PASS-in-scope、143/143有界檢查PASS；兩份審查範圍分列，不把增量審查冒稱重新實跑完整46檔。Requested Sol、actual unknown。
- Local首輪full 5901 total／5894 PASS／4 FAIL／3 SKIP保留；四FAIL是既有#507將JSON stdout與UNDICI-EHPA stderr串接。只保留原環境並追加精確warning-code filter後，正式same-tree full5901／5898 PASS／0 FAIL／3 SKIP，後段4案＋typecheck exit0，staged check-only PASS。未改#507或壓制其他warning。長typecheck與首輪未事前宣告resource claim的限制保留，沒有倒稱事前獨占。

### 五項 issue AC 與 fresh exact-Preview 範圍

1. 過期／已開始列表和CTA一致排除：原upcoming spec與helper assertions已真PASS；沒有合格場次不復活SSR歷史場次。
2. 未來方案、名額與URL：original 12-case browser已驗有值scheduleId／mobile booking identity及replacement、empty、other-plan、full刷新；公開Preview生成場次樣本只驗plan/date，兩者不混稱。
3. Frozen clock、已開始／未來、LA／Taipei日界與空live：上述12案有實測；Owner已接受本次ordinary runtime證據。Fresh documents跨日不等於persistent-mounted-midnight，後者不新增為本issue強制gate。
4. Client／ISR：成功空live取代SSR、有效方案／日期／名額resolver與handler ordering、V2 cutoff／fallback配對測試PASS；ISR build/start smoke成功。Legacy fallback未刪除，revalidate=60與已送出HTML／cache短暫過期邊界維持，不宣稱更強live保證。
5. 安全部署browser：12:21–12:23 UTC（20:21–20:23 Asia/Taipei）實際開啟[exact c253 Preview溯溪詳情](https://tour-platform-6h58yc3bg-smallwei0301s-projects.vercel.app/activities/pingtung/hualien-river-trekking)，Vercel `dpl_61CebdGrnnUM5RyCEa4w4Pi1rtQh` READY、source=git、target=null。沒有April歷史列表；選10/12週一顯示剩8位，CTA帶正確plan和date=2026-10-12；預覽另一方案再關閉保留原日期。未進booking／登入／提交、未直接探API、未下單／付款或操作DB。

### 依賴／收尾及 release HOLD

- #1886 fresh仍為Draft、head455b2e0a38cbc970b2f35af6cab5ae5bfe13cb99。其3個tooling paths與1887重疊，原6個test-call bodies在新版14案中全部byte-for-byte保留，runner/document擴充經先前aggregate核對；4865→c253完全未改這3檔。Controller已確認此已證明吸收範圍的technical disposition為superseded-by1887；保留原branch／artifacts及open狀態至適當closure gates完成，不把舊3檔盲目merge回來。本段未關閉或合併1886。
- D7目前尚待本次新milestone留言與repo記錄完成雙寫；不把舊取消動作重送或改寫成成功。保存本段的文件增量須獨立審查、正常發布並另查新exact-head CI。
- **Release仍HOLD**：12:25 UTC於actual candidate0ebb的純靜態 `check-migration-ledger.mjs --mode verified --json` 真exit1：168 total、117 baseline-covered、42 verified、9 missing、0 unverified、0 errors。這是fresh結果，取代舊10 missing作為當前計數；沒有查詢／寫入DB或修改ledger。缺項是1811／1812／1813／1814、1760兩項、1796三項。
- 唯讀Vercel核對main884已有READY production deployment（`dpl_8sJCCh4CHCDPxnBaXXJd4XySbQaU`）。Owner於2026-10-04已明確要求Tour正式發布；這份既有授權保留，不重問同一發布意願，但不豁免上項9-missing release gate，也不授權新增DB寫入／憑證／權限動作。Merge前仍須核exact head、完整review、未解finding、ownership／dependency及其Production影響；目前未Ready、未merge、未部署、不關閉1882。
