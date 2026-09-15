# issue1761 — Midao2 原生訂單可見性最小營收切片
> 最後更新：2026-09-14 21:01 Asia/Taipei｜負責 session：Ava / gpt-5.6-terra

## 目標
在既有 Midao shell 新增唯讀「訂單」入口與 `/midao/orders`，只消費 canonical Booking V2 guide projection，不新增資料來源或操作命令。

## AC 清單
- [x] Midao shell 可定義「訂單」入口與 `/midao/orders` 唯讀畫面，消費既有 canonical V2 guide-bookings projection。
- [x] 不新增 API、DB、schema、cache/store、client guide-id filter 或任何 booking/order mutation。
- [x] 以完整 local Playwright 證明導覽、session/ownership boundary、安全欄位、error/retry 與無 mutation request。
- [x] 交 Rita 前 worktree 乾淨、tested HEAD=current HEAD，且變更僅限核准範圍。

## 已完成（附證據）
- 2026-08-31 preflight 已確認非 primary worktree、branch/head 均為 task binding `bcf5db0e537b7545fb5704aa03e0ae085806ea18`；續跑 dirty inventory 與 BATON 相符。
- 已完成 RED→GREEN：初始 route/screen 不存在時 focused contract test exit 1；新增唯讀 route、screen、nav、safe-field/API source contract、Playwright spec 後，focused Node suite 6/6 pass（最新 13:06 Node 22 實跑 exit 0）。
- `MidaoBottomNav` icon map 已由 nav id 對齊 `MidaoNavItem['icon']`。Ava 已補齊 dev dependencies 後，root typecheck exit 0。
- 2026-08-31 13:21 的 ad-hoc preview Next runner 未具 canonical runtime fixture，曾因 `verifyCanonicalGuideSession()` 讀不到 approved/midao/session-version=1 guide projection 而導向登入；此路徑不作為驗收證據。
- 2026-08-31 14:38 Ava 已用 repository-owned `scripts/testing/run-midao-e2e.sh` + `with-midao-local-supabase.mjs` official single-spec lane 取得 Chromium 2/2 PASS，並完成 cleanup（`MIDAO_STAGE=complete`、無殘留 Supabase container/lock）。該 lane 實際驗證 native 導覽、canonical session/ownership fixture、安全欄位、409 read failure/retry，以及僅 GET 無 mutation request。驗證 bytes SHA-256：spec `c250560aa2bea6746fe2bd00e7508228fd4011414e053feca2c116cb2849a5f4`、screen `e5189bd9100944990c21cf617945725a448ea5f06aa034a31a1abcef6a467772`、contract `f5e54c10cd2471304a4102e3564707424aefdcfaefc28bd35a3bef34ec1afe72`；本 run 已重新核對三者皆相符。
- 2026-08-31 14:43 canonical Node 22 重跑 focused Node contracts：6/6 pass、exit 0；`.claude/hooks/run-checks.sh` 對 3 個 focused test files 加 `--typecheck` exit 0；canonical lint exit 0（既有 `RootDocument.tsx` 1 warning，零 error）；`git diff --check` exit 0。
- 2026-08-31 14:44 已建立單一 local commit；其相對 binding base 的 11 個變更檔均在核准範圍內，工作樹乾淨。接續同卡 Rita read-only review。
- 2026-08-31 15:34 在 Rita 指出的 native navigation/session evidence 衝突後，未改動候選產品 bytes，改以同一 exact HEAD `81e60057d8dfedbbdec8e2cc224a48583a2a53b8` 重跑 repository-owned official lane：`NODE22_BIN=/root/.hermes/toolchains/node/22.23.1/bin/node scripts/testing/run-midao-e2e.sh apps/web/e2e/issue1761-midao-orders-workbench.spec.ts` exit 0、Chromium 2/2 PASS、`MIDAO_STAGE=complete`，cleanup 完成。其後 focused Node contracts 6/6、`run-checks.sh <3 paths> --typecheck`、root typecheck 均 exit 0；Node 22 lint exit 0（僅既有 `RootDocument.tsx` 1 warning）。
- 2026-09-14 15:59 前一份 Artifact `10336439975` 與當時 source migration baseline 不一致，保留該失敗實測作為前階段紀錄；本次未沿用其內容。
- 2026-09-14 16:24 第二階段改以 REST 下載 Artifact `10338780485`（`midao-expected-terminal-0d738972c80e6be6976fb6441df46e445a757514`）；API 回讀確認未過期、大小 `112428` bytes、workflow run `34821540121`、exact head `cfa0a4066adcacd21d9b7f3dac4802a6e4d6d223`。fresh task-owned `/tmp/midao-expected-terminal-1876-22566` 的 ZIP 清單恰為四個 canonical 路徑，無絕對路徑、反斜線或 `..`，且 `unzip -t` 無錯誤；逐檔覆蓋 canonical 檔案，未本機生成、未本機 Supabase、未手改 hash/cutoff。複製後 SHA-256：`manifest.json` `0654b47515fd379c8dadff9c1f7992d266dac7cb8ac24d28d368bcb02ba92462`、`catalog.expected-terminal.normalized.json` `c90de008276333903e2800faa062e606d4fdeb8d4187f9057e4f95a6259cc1d0`、`catalog-expected-terminal.sha256` `a16bc5506bf99b1aebe1c0073b45c8f01d76fc76c4ec50dc3b3dacd3182b5e2c`、`expected-terminal-ledger.json` `e0f4017e5a7da8e60a4f27625fc8d0caf2cb395f750fc473cc1e963928df8a52`。
- 同次實跑 `node --test apps/web/tests/unit/midao-expected-terminal-artifact.test.mjs`：4/4 pass（exit 0）；`node scripts/check-migration-source-gate.mjs --mode source`：`migration source gate: verified`（exit 0）；`git diff --check` exit 0。
- 2026-09-14 21:01 在 exact HEAD `e22cec847cab6d236de321b93d5fe3348d0d8ef1` 最小同步三個 stale expected-terminal consumers：final gate 的 transaction/manifest 固定期望依已驗證 canonical expected-terminal ledger 更新為 `59e9c36958ad52304b9be06834d9bfdfb14bcb75210f169157727b48bb38a793`／`0654b47515fd379c8dadff9c1f7992d266dac7cb8ac24d28d368bcb02ba92462`；materializer fixture 採完整 exact post-cutoff manifest，並驗證受信任 published manifest 可 materialize 後 cleanup；existing runner contract 的 suffix 更新為 37 entries（加入兩筆 #1796 migrations），history 總數更新為 167。未啟動 DB 或本機 Supabase。
- 實跑 focused Node suite：final gate 2/2、materializer 11/11、existing runner contract 8/8、expected-terminal artifact 4/4；commit gate `.claude/hooks/run-checks.sh` 合計 25/25 pass（exit 0）。migration source gate `verified`（exit 0），`git diff --check` exit 0。

## 下一步
- 提交並推送本次三個 consumer 同步；回讀 remote branch SHA，讓新 push 自然重跑 CI。無 Production deploy/migration。

## 2026-09-15 下一個受控切片：Midao2 唯讀訂單工作台

### 已核定的規劃與不可變綁定
- fresh `git fetch origin main` 後，`origin/main` 與本規劃 worktree HEAD 均為 `9c1e7b2efaf17b475022fa44b05b8fbf35426075`；worktree 為非 primary 的 `/root/.hermes/worktrees/tour-platform/plan-1761-midao-orders-v1`，branch 為 `planner/issue-1761-midao2-orders-v1`，且開工時乾淨。
- #1761 最新 capability matrix（issue comment `5674384323`）確認：legacy `/midao/orders` 已 covered；`/midao2/orders` 缺失，為唯一選定的 open gap。這不是 legacy 退役授權；legacy `/midao/orders` 必須保留為安全 fallback。
- 現有 `GET /api/v2/guide/bookings`（`apps/web/app/api/v2/guide/bookings/route.ts`）已以 `verifyGuideSession(req)` 與 `activities.guide_id = session.guideId` 決定所有權，且回傳 `{ ok: true, data }`。本切片只讀取該投影，不新增或修改 API、資料庫、schema、RLS、ACL、migration、cache/store 或 client guide-id filter。
- Midao2 通用 `apiGet()` 只接受 `{ success: true, data }`，不能直接用於此既有 `{ ok: true, data }` contract；新頁面必須在自己的 read-only loader 明確驗證既有 `ok` envelope，不能藉此擴大或改寫全域 API helper。

### Builder 的精確變更面與順序
1. 先新增 RED source-contract：`apps/web/tests/ui/issue1761-midao2-orders-workbench-contract.test.mjs`，鎖住 `/midao2/orders` route、Midao2 shell 訂單入口、既有 `/api/v2/guide/bookings` 的 GET/no-store/`ok` envelope、只呈現 `tourTitle`、`scheduleDate`、`partySize`、`status`、`paymentStatus`、`totalTwd`，以及禁止 `guideId`、Supabase、PII 欄位與任何 POST/PUT/PATCH/DELETE。
2. 先新增 RED browser spec：`apps/web/e2e/issue1761-midao2-orders-workbench.spec.ts`。以 `setGuideSession()`、summary/CSRF mock 與 bookings route mock 驗證：Midao2 nav 進入新路由、390x844 與 desktop 都可見安全清單並附 screenshot、資料列不顯示旅客姓名/電話/email、bookings 僅 GET；409/read failure 顯示安全錯誤且重試只再 GET，空結果顯示 empty state。
3. 最小 GREEN：新增 `apps/web/app/(non-locale)/midao2/orders/page.tsx`。僅用既有 `C`、`Card`、`Spinner`、`EmptyState`、`ErrorState`、`Icon` 與 browser `fetch('/api/v2/guide/bookings', { cache: 'no-store' })`；頁內 local type guard 對安全 subset 與 `{ ok: true, data }` 做驗證。401 導至 `/guide/login?next=/midao2/orders`；其他不安全/失敗 envelope 只顯示通用錯誤，retry 只重送 GET。不得建立 item click、detail route 或任何 mutation，因現有 list projection 沒有已核定的 safe detail contract。
4. 修改 `apps/web/app/(non-locale)/midao2/layout.tsx` 的既有 `TABS`：增加 `href: '/midao2/orders'`、label `訂單`、既有 sprite icon `file-text`，沿用 pathname active rule、fixed navigation 與 responsive container。不得改 auth probe、CSRF、impersonation 邏輯或其他 tab destination。

### 驗收與回復邊界
- focused RED 預期新 Node contract 與新 Playwright 先失敗，原因只能是 route/nav/畫面尚不存在；GREEN 後兩者 pass，既有 legacy `apps/web/tests/ui/issue1761-midao-orders-workbench-contract.test.mjs` 與 `apps/web/e2e/issue1761-midao-orders-workbench.spec.ts` 亦保持綠燈，證明 `/midao/orders` fallback 未受影響。
- Builder 必跑 `.claude/hooks/run-checks.sh apps/web/tests/ui/issue1761-midao2-orders-workbench-contract.test.mjs apps/web/tests/ui/issue1761-midao-orders-workbench-contract.test.mjs apps/web/tests/api/issue1761-midao-guide-bookings-read-contract.test.mjs --typecheck`、repository-owned Midao local E2E runner 的新 spec、`npm run lint`、`npm run typecheck`、`git diff --check`；提交前 worktree 必須乾淨且 tested HEAD=current HEAD。
- 回復只移除新 Midao2 route/nav/test bytes；既有 `/midao/orders`、既有 guide-bookings route 與資料模型完全不變。無 Production migration、deploy、DML、payment、notification 或 legacy retirement。

## 絕不重做（Do-NOT-redo）
- 不改 `apps/web/app/api/v2/guide/bookings/route.ts`；此切片只讀取既有 canonical projection。
- pending request 的決策與轉換仍留在 `/midao/requests/[requestRef]`；不新增付款、訊息、redeem、reschedule、review 操作。
- 不以無效 fake guide cookie 取代 canonical Midao session；它在 layout 的 cryptographic/runtime boundary 被正確導向登入頁，不能當 browser pass。

## P0-OVERRIDE 使用紀錄（如有）
- 無。

## 2026-09-15 Builder 實作中（同卡 t_d5a58d25）
- 已依 RED→GREEN 新增 Midao2 `/midao2/orders` 唯讀頁、`file-text`／「訂單」shell tab、source-contract 與 desktop／390x844／401 Playwright 覆蓋；頁面只用 page-local `{ ok: true, data }` loader，不改 canonical route、資料模型或 legacy fallback。
- RED 證據：Node 22 新 contract 在 route/nav 尚不存在時 exit 1；首次 official Midao E2E runner 因 fresh worktree 缺少 `pg` module 於 DB health check 前 exit 1。補齊 local dev dependencies 後，同一 runner 的 RED lane 又在 420 秒無輸出 timeout，結果為 INCONCLUSIVE；依 heavy-lane 規則，本 run 不重跑，待下一個受控 run 對最終 bytes 執行。
- GREEN 證據：Node 22 新 contract 2/2 pass；`.claude/hooks/run-checks.sh` 針對新 Midao2、legacy orders 與 canonical guide-bookings contract 共 6/6 pass，並含 typecheck exit 0。canonical lint launcher exit 0（僅既有 `RootDocument.tsx` 1 warning）。
- 2026-09-15 run 1212 在確認 task-scoped Supabase Docker containers/networks/volumes 與 runner lock 均空後，只啟動一次 repository-owned browser regression lane（Midao2 + legacy orders specs）。runner 已通過 `MIDAO_STAGE=ready`、`on-ready`、`runtime-fixture-ready`，但其 WebServer 對 request 的 3 秒 timeout 持續 retry，最終 exit 1 並進入 `MIDAO_STAGE=cleanup-identity`／`cleanup`；沒有 Chromium verdict 或 screenshot 可宣稱。後續 readback 無 task-scoped Docker residue、無 runner process，且 `git diff --check` exit 0；此為 local runner capability evidence，不是產品 browser failure。
- 2026-09-15 run 1213 對同一候選僅啟動一次 official lane（Midao2 + legacy orders）。它完成 `runtime-fixture-ready` 並取得完整 Playwright output：legacy populated spec 的 full-page screenshot 在既有頁面停滯至 240 秒；新 Midao2 spec 則暴露三個 test-harness 問題——hydration 時 tab locator detach、Next route-announcer 造成全域 `role=alert` strict-mode 衝突、以及 401 assertion 未先等待 canonical GET。這不是 production route/API/schema failure；新 spec 已只在允許路徑內收斂為 hydration-safe nav retry、region-scoped alert、GET poll 後的 401 assertion，並改用 viewport screenshot。最終 bytes 的 Node source contract 2/2 pass、Playwright `--list` 載入 3 個 Midao2 tests、`git diff --check` exit 0；尚未取得新的 Chromium GREEN，故沒有 commit/review。
- 2026-09-15 14:25 CST run 1214 只對新 Midao2 spec 啟動一次 official lane。它完成 `MIDAO_STAGE=runtime-fixture-ready` 並取得 1/3 Chromium pass：390x844 的 failure/retry/empty state 通過；desktop 導覽失敗顯示 Midao2 home summary mock 缺少 `counts` 等既有 page contract，401 則在 `/guide/login` 開發編譯完成前耗盡 URL wait。僅在新 E2E spec 補齊合法 summary fixture，並將導覽／401 assertion 改為等待 navigation commit、給予 cold dev compilation 的 bounded timeout；這是 test-harness 修正，未改產品/API/security bytes。修正後 Node source contract 2/2 pass、Node 22 typecheck exit 0、Playwright `--list` 列出 3/3 tests。因本 run 唯一 browser lane 已經非綠燈，尚未以最終 spec bytes 取得 Chromium GREEN、screenshot 或 `MIDAO_STAGE=complete`，故沒有 commit/review。
- 2026-09-15 run 1215 對 run 1214 的 exact candidate 只啟動一次 repository-owned Midao2-only lane。它到達 `MIDAO_STAGE=runtime-fixture-ready`、所有 cleanup stage，Chromium 結果為 2/3 pass、1 failed（總計 9.1 分鐘）：390x844 retry/empty state 與 401 exact login return path 通過；desktop populated case 因 React dev-mode effect 觸發兩次同為 GET 的 canonical read，而舊測試錯誤要求恰一筆 GET，180 秒後 timeout。沒有 mutation、PII 或 route/security failure。此後只在允許的新 E2E spec 將 desktop assertion 修正為至少一筆 read 且所有觀測方法均為 GET；Node source contract 2/2 pass、以 verification-only `GUIDE_SESSION_SECRET` 執行 Playwright `--list` 為 3/3。修正後最終 spec bytes 尚未取得 fresh Chromium GREEN，故沒有 commit/review。
- 2026-09-15 15:46 CST run 1216 先停止並讀回清空僅 task-local 的 local Supabase Docker residue（containers/network/volume），再以 final E2E SHA-256 `4f6c86a6f6ef187b8a58c986a5bea3db38417bbaac8703f8f67a8a5f2ea2461d` 執行一次 repository-owned Midao2-only Chromium lane。實跑 exit 0，3/3 passed（desktop populated safe projection、390x844 409 failure/retry→empty、401 exact return path），`MIDAO_STAGE=complete`、`cleanup-identity`、`cleanup` 均到達。desktop/mobile screenshots 由 spec 以 Playwright attachments 寫入該 official run；Post-run Docker readback 無 task-labelled container 或 volume。Next cache warning / Fast Refresh full-reload warning 未造成 test failure。

## 2026-09-15 Rita rework：layout 401 return-path scope conflict（HOLD）
- Rita 指出 layout 的 summary auth probe 與 orders canonical read 可並行：前者目前硬編碼 `window.location.assign('/guide/login?next=/midao2')`，可能覆蓋 orders page 的 `/guide/login?next=/midao2/orders`。現行 card 僅允許修改 layout 的 `TABS`，並明確禁止更動 auth probe，因此 Builder 不得自行修正該 production 行為。
- 已先以 TDD 新增 source-contract regression，並用 canonical Node 22 實跑：`scripts/toolchain/tp-node22.sh -- node --test apps/web/tests/ui/issue1761-midao2-orders-workbench-contract.test.mjs` exit 1（3 tests 中 2 pass、1 expected RED）；失敗精確指向 `layout.tsx` 的 hard-coded `/guide/login?next=/midao2`。
- 等待 Planner／Ava 明確擴充或維持 mutation scope；未啟動另一條 heavy Playwright lane，避免在 production fix 尚未獲授權前重跑已驗證的候選。

## 2026-09-15 scope ruling 後 dual-401 驗證（HOLD）
- Ava 已以 same-card scope ruling 核定唯一 production 修正：layout summary probe 僅在初始 pathname 為 `/midao2/orders` 時導向 `/guide/login?next=/midao2/orders`，其餘路徑維持既有 `/midao2` fallback；未改 endpoint、ownership、session、CSRF 或 server/API bytes。
- TDD evidence：強化 source contract 後，Node 22 首次為 2 pass／1 expected RED（舊 root-only redirect）；最小修正後，新 contract 3/3 PASS，三份 focused Node contracts 7/7 PASS，root typecheck exit 0，canonical lint exit 0（僅既有 `RootDocument.tsx` warning），Playwright `--list` 為 3 tests。
- 本 run 唯一 repository-owned Midao2 Chromium lane 實跑為 2/3 PASS；desktop safe projection 與 390x844 retry/empty PASS。新增 dual-401 case 的兩個 GET 均抵達，但測試在兩個 401 response 已由 handler 自動釋放後才註冊 `waitForURL`，遭第二個同 URL navigation abort 回報 `net::ERR_ABORTED`，未取得 final URL verdict。已將 barrier 改為：先等兩個 request 到達、先註冊 exact URL wait、再同時釋放兩個 401；這是測試同步修正，尚未對最終 test bytes 再跑 Chromium。依 controller one-lane rule，本 run 不重跑；FINAL_DUAL_401_BROWSER_BYTES_UNVERIFIED。
- 2026-09-15 run 1223 已對 waiter-first final bytes 執行唯一 repository-owned Midao2-only lane：runner 到達 `MIDAO_STAGE=runtime-fixture-ready` 並完成 cleanup，但 Chromium 仍為 2/3 PASS（desktop populated 與 390x844 retry/empty PASS）。dual-401 在 `page.waitForURL(..., { waitUntil: 'commit' })` 已先註冊後仍回報 `net::ERR_ABORTED; maybe frame was detached?`，故沒有可接受的 final URL verdict；post-run task-local Docker containers/networks/volumes 為空，四個 rework paths hash 未變。本卡 scope receipt 明定此 bounded continuation 不得再啟動 heavy lane，維持 capability HOLD，不能宣稱 browser AC 已完全驗證。
- 2026-09-15 run 1224 依 Ava 最新 same-card continuation，僅將 dual-401 E2E assertion 改為 lifecycle-independent navigation-intent listener：release 前已確認 `/midao2/orders`，listener 僅收 navigation request，release 後驗證精確 `/guide/login?next=/midao2/orders` intent 且不存在 root fallback。對 final bytes 啟動本 run 唯一 repository-owned Midao2-only Chromium lane，exit 0、Chromium 3/3 PASS（desktop safe projection、390x844 409/retry→empty、concurrent dual-401 return path），`MIDAO_STAGE=complete`、`cleanup-identity`、`cleanup` 全部完成。runner 的 next-intl webpack cache warnings 不影響 test verdict；後續仍需對相同 bytes 完成 focused commit checks、hash 與 task-local residue readback 才可 commit/re-review。
