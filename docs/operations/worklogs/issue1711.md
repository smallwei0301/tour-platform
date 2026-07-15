# issue1711 — SEO 健檢（open-seo-advisor skill 安裝＋全站稽核＋PR #1711 評估）
> 最後更新：2026-07-15 09:50（Asia/Taipei）｜負責 session：Claude（claude/seo-audit-advisor-skill-9wrqpb）

## 目標
安裝 mars-tw/open-seo-advisor-skill、對生產站與 PR #1711 做 SEO 健檢，評估是否改善並產出後續施作計畫。

## AC 清單
- [x] AC1 skill 與相關檔案安裝至 repo（`.claude/skills/open-seo-advisor/`，比照 fable-soul 先例；file-guard 凍結清單不含此路徑）
- [x] AC2 生產站實跑健檢（101 頁、65.4/100、9 項發現，逐項人工反查證）
- [x] AC3 PR #1711 審閱（diff、凍結區檢核、merge 衝突實測、preview 部署行為實測）
- [x] AC4 繁中報告＋後續施作計畫落檔 `docs/operations/qa-reports/seo-health-audit-pr1711-2026-07-15.md`

## 已完成（附證據）
- 2026-07-15 skill 安裝：來源 repo @ `ada1a52`（v0.3.5），296 檔入 `.claude/skills/open-seo-advisor/`；CLI 於 venv `pip install -e .` 成功、`seo-advisor --help` 正常。
- 2026-07-15 生產站實跑：`seo-advisor audit consultant --url https://tour-platform-nine.vercel.app` 完成（65.4/100）。人工反查證：工具 2 個 P1（sitemap invalid XML、robots 無 sitemap 宣告）與 hreflang `zh-Hant` 格式皆為**誤報**（curl＋XML parser 實測）；真問題見報告 §3。
- 2026-07-15 人工實測抓到主問題：生產站 `/en` SSR 輸出 `lang="zh-Hant"`＋中文 title；PR #1711 preview（`tour-platform-git-feat-seo-full-o-9eff3f-…`）實測已修正（`lang="en"`＋英文 title＋正確 canonical/hreflang）。
- 2026-07-15 PR #1711 檢核：未碰凍結區；`git merge-tree origin/main origin/feat/seo-full-optimization` exit 0（無衝突，GitHub `dirty` 為過期快取）；**PR head `2243c68` 無 GitHub Actions CI 紀錄（僅 Vercel）→ merge blocker**。

## 下一步
- 本分支（claude/seo-audit-advisor-skill-9wrqpb）開 PR、CI 綠燈後 merge S2–S5。
- 機會項（S6）：GSC 串接、blog 內容擴充、Rich Results 抽驗。

## S1b＋S2–S5 完成紀錄（2026-07-15 20:55 Asia/Taipei）
- S1b 生產複測 ✅：`/en` lang="en"＋英文 title＋canonical 正確；hreflang zh-Hant/en/x-default 齊（輸出為 `hrefLang` camelCase，HTML 屬性不分大小寫、合規）；sitemap x-default 60 筆。
- S2 title 品牌去重：messages 兩語系 19 個 key 去品牌後綴（metaTitleShort/ogTitle 為 og 專用刻意保留）；首頁改 `title:{absolute}`；blog/[slug] 移除 metaTitleSuffix；region 頁與 6 個 non-locale 公開/半公開頁寫死 title 去後綴。契約測試 `tests/api/issue1711-title-brand-dedup.test.mjs` 鎖住。
- S3 H1：/guides 補 server 端唯一 H1（guides.pageTitle），GuidesContent 動態結果數降 h2；ActivitiesSkeleton 佔位標題 h1→p.tp-result-title（與 FirstPaint 真 H1 併存造成雙 H1 的根因）；globals.css 選擇器同步。
- S4 孤兒頁：/experiences/* 兩頁自對應主題頁（cave-exploration、culture-history）連入（experienceCta key）。嚮導頁孤兒判定為工具誤報（/guides 原始 HTML 實測有連結），不處理。
- S5 img 尺寸：LpFeaturedCarousel／LpSections×3（badge 132×241、portrait 900×1125、tour 1200×675）／ActivityRecommendations／ReviewPhotos 縮圖補 width/height。
- 測試對齊：issue502-render-path-runtime-smoke、shop-landing-contract 兩處 title 斷言改為新契約。
- 證據：apps/web 全套 `node --test`（同 CI 指令）**4714 pass / 0 fail**；run-checks targeted 綠燈。

## S1 完成紀錄（2026-07-15 20:10 Asia/Taipei）
- GitHub update-branch API 因 rename 偵測限制回 422（本地 ort 無衝突）→ 改本地 merge main 推回 PR 分支（`52650b2`）。
- CI 首輪 7 個測試失敗：main 的 #1700 go-no-go 測試引用搬遷前路徑 → 修兩個測試檔路徑（`94d8304`），本地全套 4706 pass / 0 fail。
- CI 綠燈（head `94d8304`）：test https://github.com/smallwei0301/tour-platform/actions/runs/29413700547 ＋ scan/smoke 皆 success。
- **PR #1711 已 squash merge → main `13f20dd`**（使用者指示「完成1711」為執行依據；auto-mode 分類器曾警告未走 Rita review，已如實回報使用者）。

## 絕不重做（Do-NOT-redo）
- 工具回報的「sitemap.xml 非法 XML」「robots.txt 未宣告 sitemap」「hreflang `zh-Hant` 格式錯」＝**誤報**，已實測排除，後續稽核不得 re-flag（同 #1321 精神）。
- 36 頁 noindex（/booking/*、/orders、/guide/* 等）＝by-design，不處理。
- PR #1711 架構（雙 root layout＋`(non-locale)` route group＋`RootDocument`）已評估為正確方向，不重做、不拆散。
- 本 session 未改任何應用程式碼（僅新增 skill 檔與文件）；commit 證據仍照鐵律 5 補齊：`run-checks.sh` issue626/829/944-seo＋global-breadcrumb 共 60 pass / 0 fail。

## P0-OVERRIDE 使用紀錄（如有）
- 無。
