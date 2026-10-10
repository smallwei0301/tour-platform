# issue1898 — 純離線 current 字型輸入 consumer
> 最後更新：2026-10-10 21:30 Asia/Taipei｜Ava 代為實作；actual runtime model unknown

## 目標

將已完整取得的 current 官方字型 pack 接到可重用、只讀的離線 input consumer，提供限定 CSS/font callbacks；不接線 Next build、不改 canonical wrapper、offline guard、pin、產品字型或其他在途 PR 的範圍。

## AC 清單

- [x] 新增唯讀 consumer，無 Next 依賴、網路、下載、寫檔或 env 變更；純模擬 unit test 僅在各自 owned temporary directory 建立與清理合成 fixture
- [x] caller 提供 manifest SHA；manifest/COMPLETE、三 family、URL/檔案全集、hash/size、容器 header/OFL/path/symlink 均核驗後才提供 callbacks
- [x] Node22.23.1 targeted 20/20；真 current pack 3CSS／223woff2／3OFL 全數只讀驗證通過
- [x] fresh 獨立 source 審查、44 boundary probes及真pack重跑通過，0未解 findings；actual model unknown如實保留
- [x] 原 run-checks --all --typecheck：5909 total／5906 PASS／0 FAIL／3既有SKIP／0cancel，typecheck PASS
- [x] source commit／remote exact tree讀回及 Draft PR #1898
- [ ] 此worklog增量獨立審查／發布，並同步PR conversation進度錨點
- [ ] exact head全部適用自然CI終局；原lint/build/ISR/preflight等未予豁免
- [ ] 完整發布／合併gates；目前保持Draft

## 已完成（附證據）

- Source base：`836f3fc372168a8978541e8d728ce9aa99da54f2`；remote source head：`2e1c683dbd557a4ba9fb1252a09b1afd252f121d`；tree：`389c0b91ededc49df43aa96e0c7db9a479bb6a69`。僅新增 `scripts/testing/current-google-font-input.mjs` 與 `apps/web/tests/unit/current-google-font-input.test.mjs`，198行。
- source SHA256：工具 `2ef9df3d5a8ca74c98ade08b95fc36b2e17c1c6cc6ea1be9bcdd9be7d4ef52b4`；test `e5362cb1985d53169a43b5cde9a086008568ae04390c4e24527ba22f7053b563`。內容manifest digest `0a4261c97a1b015d5ff8a34f7ae381f87c68fd0738b80abd0cfee236d1a5c7bb`，完整兩新檔patch digest `aefd83d73264a0103be9a20938ca64a97a9c114ea78ea6bd52a462c2d2cce8fe`；兩種digest定義不同。
- TDD保留missing-module RED actual exit1；module完成後20/20。這是新工具行為驗證，不是既有產品bug重現。
- 完整main checkout、原package-lock（blob `5b905dddfe403d0b28ed8cd7a611116a6149c55b`）與官方npm SRI恢復661 packages。Next真15.5.14；loader `45e38a6da7efde1a8f53c29619af2eb8f202d352119dbc91c7714db07db385f4`、fontkit `8d93c603e18bbb06f66d42c0aa07381d1968ebb2f1efd8727e3057f6d7b0cf53`符合原pin，未修改dependency source。
- 原命令 `.claude/hooks/run-checks.sh apps/web/tests/unit/current-google-font-input.test.mjs` actual exit0。原命令 `.claude/hooks/run-checks.sh --all --typecheck` 2026-10-10 21:25:47 Asia/Taipei actual exit0；新test實際包含在742個ordinary檔案內。官方Node22 artifact完整digest檢查通過；沒有把直接host node當formal入口。
- 真pack manifest SHA `2fb2fee416d43252e7239d1f465a109cdb3ee4d8332d1afa4ea73354d76b58ba`：3CSS／223font／3OFL、10,738,671bytes，前後231檔hash相同。input明確 `historical_equivalence=false`。
- Fresh source獨審20unit＋44boundary＋真pack通過，technical PASS-in-scope、0未解。review report SHA `9c1324d7c93c66a743956bc99e8f3250143ecda3f54341ea4c797320570d30d7`；requested gpt-6.1-sol／actual unknown。before→fresh dispatch順序有實際工具證據，沒有聲稱平台身分已驗證。
- 發布前18個其他open PR heads與完整paths重新核對，兩新檔overlap0；#1886/#1887保護範圍保持原bytes。local source commit `14f1f3e077a67f7cc673553e802ea09118d049e8` 與remote commit不同，但tree全同；remote parent=base已回讀。已建立[Draft PR #1898](https://github.com/smallwei0301/tour-platform/pull/1898)。

## 保留失敗與限制

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
