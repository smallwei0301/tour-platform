# 首頁影片 Blob 可逆試驗與回復程序

> 基準 main：`8841776809e576fabf88bdc2046c70003c5a25dc`｜2026-10-07 Asia/Taipei
> 目前範圍：限定 Preview 已完成一次真實全14檔同步與部署；原 Git 影片與正式部署保留。第二次完整重用、部分瀏覽器情境及完整網站回復驗收仍未完成

## 最新實際結果（2026-10-07 20:22 Asia/Taipei）

以下記錄綁定 application source head `75b6f7e8cd14da02893c243643857cfee5b0d91b`、tree `7b3bfb5c34209914efecd2a20c225f5188180db1`、base main `8841776809e576fabf88bdc2046c70003c5a25dc`。本文件增量只補工程結果，不能把此 head 的 CI 視為後續新 head 已完成。

- [Draft PR #1895](https://github.com/smallwei0301/tour-platform/pull/1895) 已建立，未 Ready／merge；全22 owned paths 與當時16個 open PR完整檔案名查核，overlap0
- [首次成功 Preview](https://tour-platform-3qjw7d179-smallwei0301s-projects.vercel.app/)：`dpl_2dC8UDFYtsu5gvNcK4o6yLaNpMC8`，exact上述 head，READY／target=null。原 Next build 真 exit0，平台 emit 與部署完成；實際 contract 為 `uploaded=2`、`reused=12`、`excludedFiles=14`、`totalBytes=30679590`
- 這個結果建立一次真 all14 full SHA256／bytes／MIME／206 Range核驗、完整 atomic manifest/state與排除一次性建置副本。沒有靠 previous manifest 跳過實際远端核驗；Git／本地原14檔仍在
- 對實際部署做 HEAD：14個原本站 `/videos/world/*.mp4`／`.webm` 全404，原intro poster200／image-webp，首頁 `/` 200。實際 CSP 的 `media-src` 恰為 `self`＋`https://pekgelfm9z6nkvfj.public.blob.vercel-storage.com`，未新增 wildcard。這是部署端資產路徑核验，仍非完整網站驗收
- 真 Cloud Chrome窄驗：7導軌、初始intro/mountain兩影片、同一webm codec與精確Blob hash URL；paused／無autoplay／muted／inline／metadata preload保留。scroll progress `0.05993` 時intro `currentTime/duration=0.3821` 且paused；洞穴切換為river/cave/culture三影片、readyState4，回intro為兩影片／time0，8張WebP已載入
- `reduced-motion` 與媒體故障模擬live browser尚未驗證：現有瀏覽器控制不支持偏好模擬／網路攔截；new world spec的collection／typecheck不替代執行。沒有反覆重試已知無法啟動的本機Chromium
- Current canonical Node22 full ordinary：5921 total／5918 PASS／0 FAIL／3既有 SKIP／0cancel，typecheck及run-checks真exit0。只過濾本環境 `UNDICI-EHPA` warning，其他警告與ordinary成員保留。另有focused58／58；兩者範圍不同，不加總
- [CI 37619395373](https://github.com/smallwei0301/tour-platform/actions/runs/37619395373)、[secret scan 37619395362](https://github.com/smallwei0301/tour-platform/actions/runs/37619395362) 真success。CI實際checkout PR merge `52e17e57805bb40aa6482af73aa947b79caa884f`，與上述head比較為ahead1／files0，內容相同；lint／type／ordinary5921／原local-mode build234頁／ISR／preflight成功。preflight重跑ordinary，不重複加總
- [既有 bounded E2E smoke 37619395404](https://github.com/smallwei0301/tour-platform/actions/runs/37619395404) conclusion=success，14cases中13passed＋1flaky重試成功。`issue1360-admin-payout-management` 空列表首跑在local CSRF請求遇 `ECONNRESET`，原失敗保留、尚未歸因於本試驗；不是new world三案已跑，也不是無retry首跑全過
- 本輪各source基準／窄增量已分別獨立審查，最後readiness增量21個canonical tests＋6個独立in-memory边界案例PASS／未解0；不冒稱單次重審全22檔。actual model identity保持unknown

## 真素材回復證據與尚未完成部分

使用caller獨占、repo外的新副本，放入真14影片30,679,590B與原local state，以current `prepareWorldMediaPreview`、記憶體mock SDK／Response完成全14核驗與副本排除，再呼叫rollback。全14 SHA256／bytes、local state原bytes及poster均還原；原source inventory前後相同，外部calls0、沒有載real SDK，測完清除本次owned副本。

這是**真素材的asset-level restore**；它沒有執行完整網站rollback build。CI的原local-mode build234頁是另外一份證據，不能拼成已執行完整網站切回。原部署 `dpl_8sJCCh4CHCDPxnBaXXJd4XySbQaU` 與原正式aliases保留，本次未執行Production切換。

目前successful full live sync=1。PR建立後Vercelbot引用原READY deployment，沒有觸發第二個sync，故second full reuse仍NOT_RUN。後續只允許已核對／獨立審查的有用文件更新，使用同一trial branch的一次自然Preview驗證0upload／14reuse；以真部署結果記錄，不用空commit或另送manual redeploy。此更新及其新head CI未發生前，不能預填成功。

## 保留的真 Preview失敗與readiness修正

以下五次ERROR完整保留，沒有將較早失敗改為成功：

| 次序 | Deployment | 真失敗階段 |
| --- | --- | --- |
| 1 | `dpl_2ezZnATGZCq1XjEAnT4QtoXYz3aW` | Vercel依既有engines選Node24，trial Node22 gate在SDK前停止 |
| 2 | `dpl_647gvYegvQujZFr42CdauKLgstLD` | Node22 bootstrap成功後public HTTP失敗，當時未記safe status/stage |
| 3 | `dpl_2RDohMiuNpV9dKRRpQPekV7KoXnf` | cave.webm成功put後sameURL full GET404 |
| 4 | `dpl_ES1aNTXLHfPN4KzVk6HkZYmAtXPK` | Range核驗失敗，原pathname/status未知；後來10支32B Range可用不證明原失敗原因 |
| 5 | `dpl_6uZRjiP6tFUNy8hWUeMYgNNFUYcD` | ecology.webm成功put、full hash/MIME核過後sameURL Range404 |

Node24環境只在指定trial context核過後，以固定官方Node22.23.1 archive與原完整digest verifier委派build child；共享engines／平台設定／font helper未改，不宣稱平台functions runtime全部變成Node22。

SDK成功put後，full GET404與sameURL `post-put-readback` Range404共用最多8次完整verification、7段退避合計63秒與單一90秒AbortSignal。每次重新核full hash／MIME與Range；沒有再PUT、overwrite、另設Range90秒或lookup retry。401／403、200忽略Range、foreign URL、其他header／body／prefix錯誤仍立即fail closed；失敗只輸出已核public path／status／fixedstage及safe primitive metadata。

真90秒in-memory實證：Range404後stalled Range body在90,002.7ms由原budget中止，只有1PUT；外部cancel約30ms。最初純mock無live handle造成1PASS／1cancel／exit1的原結果保留；只在test fixture加keepalive模擬socket，product timer未改，recovery2／2 PASS。後續first full sync成功不證明每個readiness重試分支在該次都曾觸發。

### 最終仍待gate

- 第二次真完整sync，確認0uploads／14reused及新部署artifact
- new world spec的reduced-motion／媒體中斷mock browser執行、兩codec與所需完整QA
- 完整網站local回復build／實際回復路徑與逐條驗收
- 後續文件新head的自然CI／適用发布gates；不能沿用75b6舊CI稱新head成功

下列段落是前期source／mock／staging的dated歷史，內文「目前／未啟用／0次」僅適用於各段當時版本，不能覆蓋上述最新真實結果。原FAIL／HOLD與受停止的dynamic验证限制保留。

## 歷史驗證狀態（2026-10-07 16:12 Asia/Taipei）

新 live-wave ordinary：5,907 total／5,904 PASS／0 FAIL／3既有SKIP，typecheck／lint與實際14-file mock→排除→完整local rollback hashproof通過。
原Next production build以repo ci.yml既有公開CI fixture真exit0，產生local BUILD_ID、原14影片完整保留；沒有讀取真credentials／改startup guards。以下歷史build FAIL及review HOLD均保留，不能刪除或以後續局部成果覆蓋。
新獨立browser spec的local／blob-trial模式各收集3案；canonical Node22 typecheck修後exit0，最初TS2353的exit2保留。只有collection／typecheck，沒有實際browser執行證據。
實際Preview（目前0/2）、SDK遠端readback、平台copy排除、真browser與線上rollback仍NOT_RUN；exclusive checkout契約不支持hostile concurrent same-UID actors。

## 試驗設計

- 固定 allowlist：intro、mountain、river、cave、culture、ecology、finale，各 mp4 與 webm，合計 14 檔／30,679,590 bytes
- 從完整 `apps/web/public/videos/world/` 計算 SHA-256 與 bytes；沒有刪除 source 檔案
- URL 使用 `world-media/v1/<scene>/<sha256>.<codec>`；内容變更才新增 pathname，同內容重用既有完整 manifest 的 URL，不能覆寫舊 hash 檔
- manifest 只有 version／精確 store origin／14 個 public URL、pathname、hash、bytes；多餘欄位、credentials、query string、fragment、不同 origin、缺 codec、錯 hash／bytes 一律拒絕
- 相同 manifest 重用證明內容比對相同，不代表遠端影片的存在、HTTP Range、Content-Type 或可播放性已通過實測
- client 先選 mp4／webm，再查對應完整 URL；不對 hashed URL 換副檔名。active±1、單一影片 src、preload metadata、paused currentTime scrub、poster、reduced motion 均保留

## 預設與失敗處理

正式 source 的 `media-trial-state.mjs` 永遠預設 local；不讀 Blob token／env，也不呼叫網路。

trial staging 必須有完整、有效且與當前 source hash 相同的 manifest，驗證成功後才排除 staging 裡的 14 份影片副本。
缺 manifest、缺 codec、錯 origin 或 stale hash 會使 CLI exit 1，不能繼續 build，也不會退回已被排除的本地影片 URL。
runtime 若 state 損壞只保留靜態 poster，此為最後安全網，不是 build 驗證的替代。

staging 必須是 source 外全新路徑，拒絕覆寫既有目錄、source overlap、symlink source。
安全 copy 需要 Linux `/proc/self/fd`、O_DIRECTORY 與 O_NOFOLLOW；不支援的 host 會停止，不退回一般 pathname copy。
inventory／sync 先取得全數 14 檔同一份 FD-protected buffer snapshot，任何讀取失敗均在 adapter 前停止，不二次 pathname read。來源 copy 以持有的 directory／file descriptor 讀取，核對 preflight inode／size／mtime／ctime；目的地以 directory FD 錨定、exclusive/no-follow 新檔写入，生成 state 也走同一邊界。所有 output 以 FD 重讀 metadata/hash，避免只驗影片而漏掉其他 source。
新 stage root／子目錄核 post-mkdir lstat 與 FD inode 一致、當時為空；這不是 mkdir 的原子 creation proof。caller 必須排他控制 source checkout、stage parent、stage namespace，期間沒有其他 writer；API 要求 exclusiveControl=true，CLI 要求 --exclusive-control。這項聲明不能驗證或排除 hostile concurrent same-UID replacement。既有子目錄必須在本次 owned map，成功前驗整個 namespace 無未知資料。失敗清理限本次 owned stage，以 FD 清理，不跟隨 symlink 遞迴刪除外部目錄；若 owned root path 被換掉，報清理未完成而不刪未知替代目錄。
只複製 Git 追蹤與未忽略 source，排除 `.git`、`.vercel` 部署連線、環境憑證、node_modules、既有 build/cache/runtime state；不修改任何部署設定。

## 已實跑的本地證據（含各輪歷史狀態）

1. mock 首次比對 14 檔：14 個記憶體假 upload；完全沒有 Blob HTTP upload
2. 同 source＋上一份 manifest：0 個假 upload／14 個重用，總量 30,679,590 bytes
3. 單檔假內容變更：只有該 codec 新增 immutable URL，其餘 13 個維持原 URL
4. 實際 repository source → trial staging：14 份影片皆未出現在 trial staging，海報與 source 仍在；未複製 `.vercel` association
5. 實際 repository source → local rollback staging：14 份影片逐檔與原 source bytes／SHA-256 完全相同；再次驗原 source 未變
6. 嚴格 manifest、缺檔、malformed、stale、symlink、source overlap、已存在 staging 等負向測試均實跑

第一輪 fresh review 真 HOLD，发现 F1/P2 的 source／destination copy race；該候選不能發布。原審查證據保留。
F1 修後：canonical bounded targeted＋既有 camera/scenes 39/39 PASS；四個 open 邊界的 race injection 均確有觸發，source symlink／destination ancestor 或 leaf／生成 state 都 fail-closed，外部 fake 原檔不變。相同四案套原 source 隔離副本真 4 FAIL，不能把舊 copyFile 方案當安全。
修前 Node 22 命令結果另保留：35/35 targeted、ordinary 5,898 total／5,895 PASS／0 FAIL／3 SKIP、typecheck PASS；lint exit 0、0 errors／1 既有 warning。這些不代表 F1 修後 full gate 已驗。
原 build 真 exit 1，由未改動的 startup guard 拒絕缺少三項 production-profile 值；沒有猜測或取用正式憑證。
第一輪修後 tree 8efa899b 的新 full 真 PASS：5,902 total／5,899 PASS／0 FAIL／3 SKIP，typecheck／lint PASS，實際 14-file staging byte proof PASS。
然而第二輪 fresh review 真發現三項未過測試（8 案／5 PASS／3 FAIL）：inventory/sync late pathname read，以及新 stage root adoption。第二輪 reviewer 被服務安全標記停止；該 review gate 仍 HOLD，沒有重試受停止的操作或新增攻擊測試。
第二輪 defensive source 已改 buffer snapshot 與 post-mkdir inode/FD 一致性／完整 namespace 驗證；既有39案 PASS、三檔 syntax PASS。新剩餘 race 尚未獨立复验，新 full/type/lint/byte proof 尚未重跑，不能把前輪成果稱為這輪已驗。
沒有取得完整 build artifact；同 host 的已知 Chromium EPERM 使真 browser gate 仍未驗。允許的獨立 review／exact-head CI 尚待。

本地證據為 source/mock/staging，不能稱為 Blob live、完成部署、已驗線上切回或完整產品驗收。

## 操作指令

使用 repo canonical Node 22 toolchain。

只比對本地影片，無任何 Blob 依賴：

```sh
scripts/toolchain/tp-node22.sh -- node scripts/media/world-media-sync.mjs
```

純 mock sync，output 必須不存在，不覆寫上一份 immutable manifest：

```sh
scripts/toolchain/tp-node22.sh -- node scripts/media/world-media-sync.mjs --mock --output /tmp/world-media-mock.json
scripts/toolchain/tp-node22.sh -- node scripts/media/world-media-sync.mjs --mock --previous /tmp/world-media-mock.json --output /tmp/world-media-mock-reused.json
```

試驗 staging 範例使用明確 fake origin，只供 mock；不能發布到 Preview：

```sh
scripts/toolchain/tp-node22.sh -- node scripts/media/prepare-world-media-stage.mjs --exclusive-control --stage /tmp/world-media-trial-source --mode blob-trial --origin https://example-trial.public.blob.vercel-storage.com --manifest /tmp/world-media-mock.json
```

完整本地回復 staging，不需 Blob／origin／manifest：

```sh
scripts/toolchain/tp-node22.sh -- node scripts/media/prepare-world-media-stage.mjs --exclusive-control --stage /tmp/world-media-local-rollback-source
```

必須等 staging CLI 真 exit 0 才在該 staging 安裝隔離依賴及執行原 build 指令。
本地回復必須從仍含全數影片的原 source 重建，不能只把已排除影片的 trial build 開關改回 local。

## 前期上線與回復 gate（歷史計劃；最新gate見前文）

目前原部署 `dpl_8sJCCh4CHCDPxnBaXXJd4XySbQaU` 保留；本次没有修改或切換它，也尚未實測線上 rollback。

啟用真正 Preview 前，仍需：

- 建立且核對只連接試驗 Preview 的指定 public Blob store；驗證實際 origin，不能用範例 origin 或 wildcard
- 按既有授權使用該 store 的同步權限；無其他 store、付費額度、production/dev 或權限擴充
- 實作／驗證 real adapter 的 no-overwrite upload、服務回傳 URL、全部 14 檔遠端 hash／bytes／HTTP Range／Content-Type
- 只對該精確 Blob origin 加入 media-src，不能放寬其他 CSP
- 獨立審查、Node 22 適用完整 gates、exact-head CI、真實瀏覽器 scrub／兩 codec／active±1／poster／reduced-motion／中斷與重入 QA
- 產生完整 local rollback build 或核對保留原 deployment 的實際回復路徑，再驗證 preview 切回；未經另外授權不可 production 切換

本 wave 不修改兩個共用 package.json／root lock、font helper、Git既有影片、scene registry、camera、DB／TEST、credentials 或Production。next.config只有已授權的精確trial Preview media-src；SDK使用獨立package/lock。

## 排他控制契約修正

F2 source-only review 的判定是 HOLD／1 個 P2，未宣稱 race review PASS；35 ordinary tests 獨立 PASS。
本輪收斂過度保證，API／CLI 現需 caller 明確聲明 source checkout、stage parent、stage namespace 無並行 writer。
檢查只能核對 post-mkdir stat 與 FD 一致及當時空目錄，不能把後續 lstat 看到的 inode 當成 mkdir creation 的原子證明。
本試驗僅適用 caller 管控的獨占一次性 build checkout；不支持 hostile same-UID filesystem actors，也不以聲明取代獨立審查。

## 前期自動 Preview build artifact 契約（當時未啟用）

Live wrapper由branch-only apps/web/vercel.json接線，僅exact trial branch／Preview／project／store／Node22／managed disposable checkout啟動；其他環境原build、零SDK零刪除。
此live路徑不複製整個repo；保留Git與dot原始影片、原production部署。只有caller獨占的Vercel一次性checkout可排除14份已核public deploy copies。

順序：14-file FD snapshot → SDK自動OIDC（明確storeId，不傳token）→ 每個immutable URL full SHA/bytes/type＋Range readback → 完整atomic public manifest/state核回 → 排除該checkout的14份copy → 原npm build（含原font helper／Node22／startup guards）→ BUILD_ID／完整manifest／copy exclusion核對。
存在的相同hash物件實際readback後reuse，不重傳；不存在才nooverwrite、nosuffix put。錯HTTP／hash／type／Range／SDK URL／auth全部停止，不使用RWtoken或unknownorigin fallback。

ordinary mock已有all14 first14put→second0put／14reuse及byte rollback證據。這仍不是SDK live或實際Next/平台最終artifact證據；需fresh review／ordinary full／type／lint／byte proof，再以exact-head兩次Preview受控實跑核實。每次全檔GET約30.7MB transfer，僅本輪2次，無持續排程。

F1四個新加dynamic/injection probes原bytes/hash/history已保存到trial evidence，經授權移出ordinary runner；不刪歷史FAIL、不改main baseline、不弱化source/unknownfile/nooverwrite guards。dynamic race verification仍NOT_RUN；caller排他控制是操作前置條件，不是hostile同UID不存在的證明。
