# Blob 媒體可逆試驗 — 2026-10-07
> 最後更新：2026-10-07 20:22 Asia/Taipei｜限定Preview試驗，維持Draft

## 目標
以同平台 Blob＋SHA-256自動比對試驗首頁影片，保留完整原影片及正式部署。限定Preview已完成一次真14檔同步／部署，原正式環境未切換；第二次完整重用、部分browser情境及完整網站rollback仍待驗。

## 最新交付（20:22 Asia/Taipei；application source 75b6）

- [Draft #1895](https://github.com/smallwei0301/tour-platform/pull/1895)：head `75b6f7e8cd14da02893c243643857cfee5b0d91b`、tree `7b3bfb5c34209914efecd2a20c225f5188180db1`、base main `8841776809e576fabf88bdc2046c70003c5a25dc`；22owned paths，fresh16openPR完整paths overlap0，未Ready／merge
- [真Preview](https://tour-platform-3qjw7d179-smallwei0301s-projects.vercel.app/) `dpl_2dC8UDFYtsu5gvNcK4o6yLaNpMC8` READY／target=null／exact75b6。build契約：uploaded2、reused12、excluded14、total30,679,590B；全14實際full SHA／bytes／MIME／Range核過、atomicmanifest/state完成後才排除副本，原Nextbuild及平台emit真完成
- deployed HEAD：14個原本站影片路徑全404、intro poster200、首頁200；media-src恰self＋已批准精確Bloborigin。原Git／本地14影片及原正式deployment／aliases保留
- 真CloudChrome窄驗通過7rail／初始2影片／單codec／原attrs、paused scroll progress0.05993→time ratio0.3821、cave3影片ready4與intro重入2影片/time0、8張WebP已載入。reduced-motion及媒體故障mock因現有瀏覽器控制不支持模擬／攔截仍NOT_VERIFIED-live；new3spec collection不是執行
- current Node22 full ordinary5921 total／5918PASS／0FAIL／3既有SKIP／0cancel＋typecheck真exit0；另focused58／58。只精準過濾UNDICI-EHPA環境warning，未放寬其他警告／ordinary成員；不是完整產品驗收
- [CI37619395373](https://github.com/smallwei0301/tour-platform/actions/runs/37619395373) 與[secret37619395362](https://github.com/smallwei0301/tour-platform/actions/runs/37619395362) 真success。實際checkoutmerge `52e17e57805bb40aa6482af73aa947b79caa884f`，與75b6內容compare files0；lint／type／5921tests／原local-mode build234頁／ISR／preflight成功，preflight重跑不加總
- [既有smoke37619395404](https://github.com/smallwei0301/tour-platform/actions/runs/37619395404) conclusion=success；14cases為13passed＋1flaky重試成功，issue1360 admin-payout空列表首跑localCSRF ECONNRESET原失敗保留、未歸因Blob；不是newworld3已跑
- offline caller-exclusive真素材副本：current prepare→排除→rollback後，全14 SHA／bytes30,679,590B、local state原bytes及poster皆還原；原source不變、外部calls0、mock-only。僅asset-level restore，未執行完整網站rollbackbuild；另份CI localbuild不能拼成網站切回PASS
- source各基準與窄增量分別獨立審查、最後未解0；readiness增量canonical21＋独立mock6 PASS。不冒稱一次重審全部22檔，actualmodelidentity unknown
- 五次真Preview ERROR保留：Node24 gate、未記phase的HTTP、cave.webm post-put GET404、原原因未知RangeFAIL、ecology.webm post-put Range404。只對成功put後sameURL fullGET／Range404共用8attempt／63s退避／單一90s預算；不再PUT、不套lookup，其他錯誤failclosed。真90s同budget中止pendingRangebody／externalcancel證據與最初fixturecancel失敗均保留
- PRopened後Vercelbot引用原READY，未產生第二fullsync。successful full sync目前1；只用本次有用文件更新的一次自然Preview收集0upload／14reuse證據，尚未發生前不預填成功，沒有manualredeploy／空commit
- 下述前期「未push／0次／未啟用」均是dated歷史原文；本次application source後續僅改兩份owned文件，20個code／test／config blobs需核完全不變。文件新head的CI及Preview仍須另收，不冒用75b6舊PASS

## 目前 AC 清單
- [x] 14 個核准影片逐檔 SHA-256／bytes／codec URL manifest
- [x] 同 hash 重用，單檔變更只產生新 immutable URL
- [x] 預設 local 完全不依賴 Blob、token 或網路
- [x] trial 先驗完整 source 與 manifest，再隔離 staging 排除影片；缺 manifest 停止
- [x] codec 先決定再 URL mapping，scroll scrub／poster／active±1 不變
- [x] 回復 staging 實際保有全部 14 影片且逐檔同 hash
- [x] live-wave Node 22 ordinary／type／lint／實際原影片 byte proof；原 Next production build 使用既有公開 CI fixture 成功
- [x] 新增 browser spec 的 canonical Node22 typecheck 與 local／blob-trial 模式 test collection
- [x] browser spec獨立delta review與application source75b6自然CI（不代表new3spec已執行）
- [x] 一次真all14 Preview同步、部署端影片排除、normal browser scrub／cave／重入窄验
- [x] 真14影片current live-path的offline asset-level restore（非完整網站rollback）
- [ ] 第二次完整0upload／14reuse與文件新head CI／artifact
- [ ] reduced-motion／媒體故障new browser cases與所需完整QA、完整網站回復驗收

## 已完成（附證據，以下保留各輪當時的 FAIL／HOLD）
- 從 exact main `8841776809e576fabf88bdc2046c70003c5a25dc` 建立新隔離 workspace，index 初始 clean；14 影片總量 30,679,590 bytes。git archive／tracked source bytes 可读；歷史 object store 有缺失 parent，不能宣稱整個歷史 fsck 完整
- 已讀 CLAUDE／harness／AGENT-EXECUTION 與 frozen guards；所有預計路徑均非 frozen，逐一 file-guard exit 0。無 Claude Edit 專用工具，使用已授權等效流程；未修改治理 guard
- red-first 真 exit 1（缺待實作 module），完成後本輪 9 個 focused tests PASS；mock sync 首次 14 fake upload、重跑 0 upload／14 reuse，单檔變更只新增 1 URL
- 真 source→trial stage→local rollback stage：14 檔／30,679,590 bytes 的 source 與 local rollback 全部逐檔 SHA-256／bytes 相同，trial 全部排除；海報保留；沒有 Blob HTTP upload。初次 staging 因 repo tracked `.vercel` association 拒絕，修成不讀取／不複製 operational metadata 後重跑 PASS
- canonical Node 22 targeted＋既有 camera/scenes：35/35 PASS；typecheck PASS；run-checks 真 exit 0。曾工具審查取消 combined command；唯讀核對只完成 lint、測試沒有啟動，再重試相同 canonical 測試一次成功
- canonical `run-checks.sh --all --typecheck` 真 exit 0：5,898 total／5,895 PASS／0 FAIL／3 SKIP／0 cancelled，typecheck PASS；只精確過濾本環境 `UNDICI-EHPA` warning，不隱藏其他警告
- Node 22 lint 真 exit 0、0 errors／1 既有 RootDocument `<head>` warning
- 原 build 指令真 exit 1：font helper `already-patched` 後，原 startup guard 因缺 GUIDE_SESSION_SECRET／ADMIN_ACCESS_TOKEN／MIDAO_REQUEST_CLAIM_PEPPER 拒絕；沒有填入猜測值、取 production secrets 或弱化 guard
- 最終 ps 無本任務測試／build／tsc／lint process；已釋放單一 heavy slot
- 第一輪 fresh review 對 exact tree `d1f87bc100761cfce3084b29610061b3a41009d5` 真 HOLD：F1/P2，copyFile 在 preflight 後可跟隨 source／destination symlink，非影片會漏到外部 fake bytes 或覆寫外部 fake 檔案；原 reviewer 證據與判定保留，不能發布該候選
- 已修 F1：新增 Linux directory-FD 錨定 helper；逐層 O_DIRECTORY/O_NOFOLLOW，來源 regular-file FD 與 preflight inode／size／mtime／ctime 核對後讀取；目的檔案 O_EXCL/O_NOFOLLOW，生成 state 同樣 exclusive，所有 output 都 FD 重讀核 metadata＋hash；失敗清理也以持有的 owned-stage FD 操作，不沿 symlink 遞迴清外部目錄
- 修後 canonical bounded targeted 39/39 PASS／0 FAIL／0 SKIP；四個真 interleaving injection 均觸發：source symlink、destination ancestor／leaf symlink、generated-state symlink，全部 fail-closed、外部 fake 原檔不變。相同四項負控套原 d1f87bc source 的隔離副本真 exit 1／4 FAIL，未改原審查證據
- 第一輪修後 exact tree `8efa899b00d8ebbf01482c202f2ad0dc75edf5c4` 的 heavy gates 已真跑：ordinary 5,902 total／5,899 PASS／0 FAIL／3 SKIP、typecheck PASS；lint exit 0／1 既有 warning；新實際 14-file FD staging byte proof source=base=local rollback，trial 全排除。仍沒有完整 build/browser/live/deploy 結果
- 第二輪 fresh reviewer 對該 tree 的既有證據：8 tests／5 PASS／3 FAIL／真 exit 1。剩餘 boundary：inventory 的 pathname read 仍可晚跟隨 symlink、sync 可把相同外部假 bytes 交 mock adapter；mkdir 後 stage root 可被替換為其他 regular directory，未核 post-mkdir stat／FD 一致性及空目錄而採用。原報告與 log 保留
- 第二輪 reviewer 被服務安全標記停止，沒有重試其受停止的操作或擴張測試；該獨立 review gate 仍未完成，不能填 PASS／已解 findings
- 第二輪 defensive source fix：inventory／sync 共用一份全 14 檔 FD-protected buffer snapshot，在任何 adapter call 前完整取得，不再次 pathname read。stage root 與新子目錄核 post-mkdir lstat 與 FD inode 一致及當時空目錄（不是原子 creation proof）；已有子目錄必須是本次 owned map；所有 output namespace 必須只有已知 owned files／dirs，未知 regular 資料不寫入或清掉
- 2026-10-07 14:47:48：第二輪修改的三檔 Node22 syntax 真 exit 0；既有 owned tests 39/39 PASS／真 exit 0，未新增測試、未重跑 reviewer 受停止的 8 案。這不是新剩餘 race 的獨立复验，也不代表新 full/type/lint/byte proof 已跑
- F2 source-only fresh review 終局 HOLD／1 P2：在 caller 排他控制 checkout／stage parent／namespace 的限定契約下，普通35案獨立 PASS，未另見功能性 blocking defect；不能稱 dynamic race review PASS
- 本輪修必要契約／註解：API 明確要求 exclusiveControl=true，CLI --exclusive-control；caller 聲明全程無其他 writer。post-mkdir stat／FD／空目錄檢查無法排除 hostile concurrent same-UID replacement，已移除過度 creation-identity 保證
- 此窄修仍待新 exactDiff 允許的 review／正式 gates；保留所有原 HOLD／FAIL 與動態驗證限制
- 沒有 commit／push／PR／deploy。原雲端 Chromium EPERM 仍使 browser gate 未驗，沒有反覆啟動同一已知失敗 runner

## 前期下一步（16:12計劃原文；以最新交付與目前AC為準）
- 新 live-wave exact diff 與新增 browser spec 交獨立審查；不得以實作者自驗代替。既有受停止的 dynamic probes 不重試，驗證範圍保持 ordinary／exclusive checkout 契約
- 指定 public Blob store／Preview-only 連線與實際 origin 已核，live adapter／exact-origin CSP 已寫但未啟用；待 exact-head CI 與兩次受控 Preview 實跑
- 原 build 已用 repo 既有 CI fixture 產生本地 artifact；真 browser、平台最終 artifact 與線上 rollback 尚未驗，不能由 mock／BUILD_ID 推定通過
- 使用者已授權限定 Preview Blob 與精確 origin media-src，parent 已核 store_pEKGELFM9z6nKVFj／https://pekgelfm9z6nkvfj.public.blob.vercel-storage.com；本 candidate 不因連線完成就擴張為 live／部署 PASS

## 絕不重做（Do-NOT-redo）
- 不改原影片、scene registry、camera、font helper、兩個共用 package.json／root lock。next.config 僅新 wave 已授權的精確 Preview media-src
- 不刪 source public 影片，不用早期 .vercelignore 排除上傳輸入
- 不碰 main／production／DB／TEST／憑證／權限，沒有建立或續跑 Work task
- 原 deployment `dpl_8sJCCh4CHCDPxnBaXXJd4XySbQaU` 保持未動；尚未實測線上切回，不宣稱即時 rollback 已驗

## 前期自動 Preview live-wave（當時SOURCE已寫、ACTIVATION未執行）

- branch 固定 `trial/blob-reversible-local`；project `prj_KrrA4UrpyZtEfsQZeSHUJ5zaw4Re`，store `store_pEKGELFM9z6nKVFj`，origin `https://pekgelfm9z6nkvfj.public.blob.vercel-storage.com`
- Root UI 真核 apps/web、include outside-root 開、原 build override `npm run build -w @tour/web`、install `npm install`、Output Directory Next default；本次不改平台設定。branch-only `apps/web/vercel.json` 只指定 wrapper，wrapper保留原 build
- Live 不用 whole-repo staging，僅 caller 獨占的 `/vercel/path<數字>` disposable checkout。exact Preview branch/project/store、Node22、OIDC presence 必須齊；禁止 RW fallback/API origin override。local／Production／其他branch直接原build，零SDK／Blob／刪除
- 官方 npm `@vercel/blob@2.8.1`＋自身 lock／integrity 真核，隔離安裝31packages真exit0、ignore-scripts。不改任何共享package／root lock，沒有token手動處理或新credentials
- SDK傳明確storeId，OIDC由SDK處理；只對核准14檔immutable URL GET比對hash／bytes／type與206 Range。存在則reuse；404才no-overwrite／no-random-suffix put，再實際readback
- 全14 remote readback完成，完整manifest/state以atomic write核回後，才移除這個disposable checkout的14份public副本；不改Git14檔、dot本地14檔或原部署。原build成功後核copy不存在與BUILD_ID／manifest；此檢查不是平台最終artifact驗收的替代
- 任何失敗停止，已排除的disposable copies與local state從captured bytes還原；不silent fallback為成功。原保留deployment與fresh local build回復仍待實測
- `next.config.mjs`僅加入media-src：local self，只有核准trial Preview才附精確origin；其他CSP原規則不變
- 新7個mock SDK／orchestration cases PASS：all14讀回在排除前、第二次14reuse／0put、local byte rollback、local/prod/其他branch不載SDK。結合camera/scenes／原mock與普通stage guards，共44 targeted PASS／exit0（非真Blob或Next build）
- 4個本輪新增F1 dynamic/injection cases不是main baseline；依parent批准，完整原bytes／hash／history保存於trial evidence並移出ordinary runner。沒有重跑受停止8案或新增race probes；保留白名單、static symlink拒絕、nooverwrite、unknownentries、hash等普通controls。dynamic race NOT_RUN／hostile concurrent sameUID不支持
- 2026-10-07 07:42 UTC（15:42 Asia/Taipei）fresh查16個open PR全部changed paths，20個live-wave owned paths無重疊，特別包含next.config／vercel.json；不是由package避開推測。發布前還需parent最新ownership／head核對
- 真 Preview build限定2次：首次upload/readback與第二次idempotence；GET全檔每次約30.7MB Blob transfer，不設持續排程。目前0/2、未upload／push／deploy，Blob live、browser、線上rollback均NOT_RUN

## 本輪 ordinary／原 build 終局與 D4 新 browser gate

- Node 22.23.1 canonical `run-checks.sh --all --typecheck` 真 exit 0：5,907 total／5,904 PASS／0 FAIL／3 既有 SKIP／0 cancelled；這是 ordinary scope，沒有重跑受停止的 dynamic probes，也不是完整產品驗收
- Node22 lint 真 exit 0，0 errors／1 既有 RootDocument warning；實際30,679,590-byte source 的14檔 mock第一輪14put、第二輪0put／14reuse、完整local rollback逐檔hash相同，原Git/source不變
- 2026-10-07 16:03 Asia/Taipei：原 `npm run build -w @tour/web` 真 exit 0，font／Node22／startup guards未改。直接讀 `.github/workflows/ci.yml` 的既有四個公開 CI fixture（DISABLE_SENTRY_BUILD、GUIDE_SESSION_SECRET、ADMIN_ACCESS_TOKEN、MIDAO_REQUEST_CLAIM_PEPPER），沒有存取真credentials。保留先前缺三值的build FAIL，此次成功是新增合法CI條件下的另一次結果
- 本地 `.next/BUILD_ID` 已生成，原14影片仍完整保留；這是local build，不證明Blob trial或平台最終部署artifact
- 依07 playbook §4 client-component規則新增 `e2e/scroll-world-media-trial.spec.ts`，不修改 frozen baseline／shared helpers／package smoke allowlist。3案驗paused/currentTime scrub、active±1／單一codec、reduced-motion/poster/CTA，以及模擬媒體失敗後poster/文案/導軌；可用local或明示blob-trial模式
- 2026-10-07 16:06 Asia/Taipei：canonical Node22 preflight與Playwright `--list` 兩模式各真exit0、均收集3案；collection不是browser PASS。沒有重試同host已知Chromium EPERM；真正browser gate仍NOT_VERIFIED-live
- 新spec file-guard真exit0；重新核16個open PR全部changed paths，新路徑無ownership重疊
- 新spec第一次canonical typecheck真exit2，只有新檔 `test.use({reducedMotion})` 的TS2353（repo fixture型別不接受該屬性）；原FAIL log／exit保留。改成已有型別支持的 `page.emulateMedia` beforeEach後，2026-10-07 16:11:40 Asia/Taipei再跑canonical typecheck真exit0，final ps無heavy。18個原live-wave source blobs／modes逐一與之前已測／已審候選相同；本次增量只新增spec與更新兩份owned文件，仍待fresh delta review
