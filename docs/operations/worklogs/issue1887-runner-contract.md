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
