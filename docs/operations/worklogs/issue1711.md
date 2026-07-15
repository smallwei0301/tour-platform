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
- S1：PR #1711 update branch 重新觸發 CI → 綠燈後過 Rita gate → merge → 生產站複測 `/en`。
- S2–S5（merge 後另開 issue 施作）：title 品牌後綴去重、`/guides` H1／`/activities` 雙 H1、4 個孤兒頁內部連結、img width/height。完整計畫見 qa-report §6。

## 絕不重做（Do-NOT-redo）
- 工具回報的「sitemap.xml 非法 XML」「robots.txt 未宣告 sitemap」「hreflang `zh-Hant` 格式錯」＝**誤報**，已實測排除，後續稽核不得 re-flag（同 #1321 精神）。
- 36 頁 noindex（/booking/*、/orders、/guide/* 等）＝by-design，不處理。
- PR #1711 架構（雙 root layout＋`(non-locale)` route group＋`RootDocument`）已評估為正確方向，不重做、不拆散。
- 本 session 未改任何應用程式碼（僅新增 skill 檔與文件）；commit 證據仍照鐵律 5 補齊：`run-checks.sh` issue626/829/944-seo＋global-breadcrumb 共 60 pass / 0 fail。

## P0-OVERRIDE 使用紀錄（如有）
- 無。
