# issue1898 — 純離線 current 字型輸入 consumer
> 文件續交：2026-10-11｜本輪文件修訂 actor：`/root`；歷史 Ava 實作與 actual runtime model unknown 保留

## 目標

將已完整取得的 current 官方字型 pack 接到可重用、只讀的離線 input consumer，提供限定 CSS/font callbacks；不接線 Next build、不改 canonical wrapper、offline guard、pin、產品字型或其他在途 PR 的範圍。

## AC 清單

- [x] 新增唯讀 consumer，無 Next 依賴、網路、下載、寫檔或 env 變更；純模擬 unit test 僅在各自 owned temporary directory 建立與清理合成 fixture
- [x] caller 提供 manifest SHA；manifest/COMPLETE、三 family、URL/檔案全集、hash/size、容器 header/OFL/path/symlink 均核驗後才提供 callbacks
- [x] 本輪 canonical Node22.23.1 targeted 20/20、exit0；真 current pack 驗證僅為歷史報告，未重新驗證
- [ ] 歷史 fresh source 審查、44 boundary probes、真pack與0 findings 的原 receipts 未取回；未重新驗證，不作本輪 PASS
- [x] D3 採 source-head GitHub CI success；歷史本地 run-checks 全套數字僅作報告保留，不補造 receipts
- [x] source commit／remote exact tree讀回及 Draft PR #1898
- [ ] 此worklog增量獨立審查／發布，並同步PR conversation進度錨點
- [ ] exact head全部適用自然CI終局；原lint/build/ISR/preflight等未予豁免
- [ ] 完整發布／合併gates；目前保持Draft

## 歷史成果報告（非本輪重新驗證）

以下保留原 worklog 的歷史自述、數字與 digest 以免遺失成果。除下方「本輪可讀回證據」明列項目外，RED、SRI／661 packages、44 probes、231 pack hashes、真 pack、舊 reviewer 及本地全套 receipts 均未在本環境取得原始檔，狀態為 `NOT_VERIFIED`；段內「通過／exit0」是歷史報告，不能當本輪 PASS 或 docs 審查。舊路徑、PR 自述與 digest 本身不證明執行。

- Source base：`836f3fc372168a8978541e8d728ce9aa99da54f2`；remote source head：`2e1c683dbd557a4ba9fb1252a09b1afd252f121d`；tree：`389c0b91ededc49df43aa96e0c7db9a479bb6a69`。僅新增 `scripts/testing/current-google-font-input.mjs` 與 `apps/web/tests/unit/current-google-font-input.test.mjs`，198行。
- source SHA256：工具 `2ef9df3d5a8ca74c98ade08b95fc36b2e17c1c6cc6ea1be9bcdd9be7d4ef52b4`；test `e5362cb1985d53169a43b5cde9a086008568ae04390c4e24527ba22f7053b563`。內容manifest digest `0a4261c97a1b015d5ff8a34f7ae381f87c68fd0738b80abd0cfee236d1a5c7bb`，完整兩新檔patch digest `aefd83d73264a0103be9a20938ca64a97a9c114ea78ea6bd52a462c2d2cce8fe`；兩種digest定義不同。
- TDD保留missing-module RED actual exit1；module完成後20/20。這是新工具行為驗證，不是既有產品bug重現。
- 完整main checkout、原package-lock（blob `5b905dddfe403d0b28ed8cd7a611116a6149c55b`）與官方npm SRI恢復661 packages。Next真15.5.14；loader `45e38a6da7efde1a8f53c29619af2eb8f202d352119dbc91c7714db07db385f4`、fontkit `8d93c603e18bbb06f66d42c0aa07381d1968ebb2f1efd8727e3057f6d7b0cf53`符合原pin，未修改dependency source。
- 原命令 `.claude/hooks/run-checks.sh apps/web/tests/unit/current-google-font-input.test.mjs` actual exit0。原命令 `.claude/hooks/run-checks.sh --all --typecheck` 2026-10-10 21:25:47 Asia/Taipei actual exit0；新test實際包含在742個ordinary檔案內。官方Node22 artifact完整digest檢查通過；沒有把直接host node當formal入口。
- 真pack manifest SHA `2fb2fee416d43252e7239d1f465a109cdb3ee4d8332d1afa4ea73354d76b58ba`：3CSS／223font／3OFL、10,738,671bytes，前後231檔hash相同。input明確 `historical_equivalence=false`。
- Fresh source獨審20unit＋44boundary＋真pack通過，technical PASS-in-scope、0未解。review report SHA `9c1324d7c93c66a743956bc99e8f3250143ecda3f54341ea4c797320570d30d7`；requested gpt-6.1-sol／actual unknown。before→fresh dispatch順序有實際工具證據，沒有聲稱平台身分已驗證。
- 發布前18個其他open PR heads與完整paths重新核對，兩新檔overlap0；#1886/#1887保護範圍保持原bytes。local source commit `14f1f3e077a67f7cc673553e802ea09118d049e8` 與remote commit不同，但tree全同；remote parent=base已回讀。已建立[Draft PR #1898](https://github.com/smallwei0301/tour-platform/pull/1898)。

## 本輪可讀回證據

- 原保存 commit `7f4aed54391708911864447af6e05adcd39c2d95` 已從 Git materialize；直接 parent 為 `2e1c683dbd557a4ba9fb1252a09b1afd252f121d`，只新增此文件。原 blob `a906a64515a1eed54a6624e06fc57069dc0d53df`、原 bytes SHA256 `34663155c9f124a75d007fcc415b0776a09858cd3d85106cfb9abfb06bd05f19` 均核對吻合；本輪為證據分級的最小文字修訂，原稿另行保存。
- 本輪工具鏈依既有 provision 腳本取得官方 Node22.23.1 archive，archive／完整檔案／symlink digest 與 canonical `scripts/toolchain/tp-node22.sh --check` 均成功。實作者透過 `.claude/hooks/run-checks.sh apps/web/tests/unit/current-google-font-input.test.mjs` 實跑 20/20、0 FAIL／SKIP、exit0。這不是獨立 reviewer rerun。
- 已以 GitHub exact source-head 查詢重新讀回 [CI run 38055935985／job 114224390126](https://github.com/smallwei0301/tour-platform/actions/runs/38055935985/job/114224390126)：migration source、lint、typecheck、web tests、build、ISR smoke、preflight 均 completed/success；[secret-scan 38055936003](https://github.com/smallwei0301/tour-platform/actions/runs/38055936003) 亦 success。依 harness R2 D3 可用 CI 取代本地全套；此文件增量未改 source，不重跑無關大型測試。這不是 docs-head CI，也不表示 consumer 已接入 build。
- 本輪僅 owned worklog 單檔，沒有新 discovery；small-edit/fileCount=1，不另派 Scout。Tour 容量依本 repo，沒有數字型 BUILD 配額，未借用其他專案 slots；採一般 Sol fresh reviewer，不消耗 premium。原工作分支仍由本任務管理，其他 PR ownership 不轉移。
- 文件候選必須完成真實 before-preflight → fresh `fork_turns=none` 獨立 audit → exactDiff receipt，reviewer 自行 read-back 與 canonical targeted rerun。此候選在審查前定稿，不預填 PASS；完成後將 before／dispatch／receipt、候選 commit 與 CI／Preview 終局記於本 PR conversation 的 D7 錨點，避免把發布後結果倒填進尚未發布的 commit。
- 本輪沒有可用的 Claude Edit hook 掛載證明；只進行文件更新、唯讀 source 檢查與 canonical runner，不宣稱 hooks 已武裝或修改產品碼。branch protection GET 的既有403與空 rulesets 不表示無保護；只允許核對 old head 後 force=false 正常更新，遇拒絕即保留 blocker。

## 保留失敗與限制（以下安裝與 Git 失敗亦為歷史報告）

- npm首次clean environment漏保留平台既有proxy，EAI_AGAIN／exit1；第二次漏保留既有CA，TLS驗證失敗／exit1。第三次保留平台原proxy/CA值後exit0。沒有關TLS、改信任／網路設定或引入credential。`--ignore-scripts`依repo遠端安裝政策保留，不把安裝成功視為完整應用驗收；npm副作用yarn.lock已還原原bytes。
- 首次local commit因未設定author identity而失敗；核對owner既有身分後single-command identity重試成功。gitpush缺write credential而exit128；使用已連接GitHub寫入同blobs/tree並非force建立branch，不把local SHA冒充remote SHA。
- CSS regex只抽取限定response shape的URL，並非完整CSS parser／安全sanitizer。WOFF2只驗container magic/declared length，未驗glyph/family語意；digest不是來源簽章或Google authenticity證明。
- root額外檔不納入資產inventory；empty directory traversal無獨立上限；不保證對抗並發filesystem race。單元負例的通用拒絕斷言不代表每個細分branch均已逐項覆蓋。
- 本工具與currentpack只屬offline input diagnostic。未執行canonical Next build、host-bound專測、DB／共用TEST／Production；不取代#1895 rollback、#1897/#1887產品／baseline／發布gates，也不重設原等待時間。

## 下一步

- 完成此單檔docs增量獨立read-back與doc檢查，發布後在本PR conversation雙寫錨點；此時仍不得宣稱所有gates完成
- 核對新exact head自然CI與所有必要jobs；如失敗保留first-failure並診斷，不skip、不以本地ordinary/type替代完整CI
- 保持Draft，合併或其他操作僅在原完整repo流程與適用授權下進行

## 絕不重做（Do-NOT-redo）

- 不改source兩檔以外的產品字型、wrapper／offline guard／pin、package／lock、#1886/#1887範圍或凍結spec
- 不把current字型pack叫作歷史cache；不把此前adapter probe或本consumer驗證稱canonical build
- 不重跑已知失敗的guard-bypassed build、不透過node npm-cli繞runner、不自行新增credential／network trust
- 不覆寫原source review、RED、npm/Git失敗或舊PR未完成gates；不force push
