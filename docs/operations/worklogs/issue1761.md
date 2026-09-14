# issue1761 — Midao2 原生訂單可見性最小營收切片
> 最後更新：2026-09-14 15:59 Asia/Taipei｜負責 session：Ava / gpt-5.6-terra

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
- 2026-09-14 15:59 以 REST 下載 Artifact `10336439975`（`midao-expected-terminal-f9b372002b8a3f52d82ee6dc0bddff515412c718`）；API 回讀確認未過期、workflow run `34818212451`、exact head `c44008ecd83c4b6e355d4b9b2004183b45a7910f`。ZIP 僅含四個允許路徑，已驗證無絕對／反斜線／`..` 路徑後逐檔複製並以 SHA-256 read-back 確認來源相同：`manifest.json` `3b297c908fa004d7a6adf145a7a15612fe67e3fc5763493a00d9a093d127029f`、`catalog.expected-terminal.normalized.json` `62370a096f10acbbb8c9a260c570e2991654eb9990cc1a640bd6130b6e1b1d90`、`catalog-expected-terminal.sha256` `2ab4528fa4e0305257061364ec8b86cd41709f992afb0226a25b8199fb1fff77`、`expected-terminal-ledger.json` `a956f5784e5300dad8012a7e5bd9872bc85bd776d0c51d9bff4e1171983254fa`。未本機生成、未本機 Supabase、未手改 hash/cutoff。
- 同次執行 `node --test apps/web/tests/unit/midao-expected-terminal-artifact.test.mjs`：3/4 pass、1 fail。已匯入的 artifact manifest 最後 migration 為 `20260824135300_issue1861_midao_request_claims_bridge.sql`，但此 exact HEAD 的 source 還有兩個 #1796 migrations（`20260914052608...`、`20260914073000...`）；因此 artifact consumer test 的 stale assertion 仍失敗。此差異已由匯入後的實測證明，未以本機 generator 或手改 manifest 規避。

## 下一步
- 提交並推送這個 deterministic artifact import，讓新 exact-head CI 回報 artifact 與 forward-migration manifest 的差異；不做 Production deploy/migration。

## 絕不重做（Do-NOT-redo）
- 不改 `apps/web/app/api/v2/guide/bookings/route.ts`；此切片只讀取既有 canonical projection。
- pending request 的決策與轉換仍留在 `/midao/requests/[requestRef]`；不新增付款、訊息、redeem、reschedule、review 操作。
- 不以無效 fake guide cookie 取代 canonical Midao session；它在 layout 的 cryptographic/runtime boundary 被正確導向登入頁，不能當 browser pass。

## P0-OVERRIDE 使用紀錄（如有）
- 無。
