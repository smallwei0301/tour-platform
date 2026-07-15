# SEO 全站健檢報告＋PR #1711 評估（open-seo-advisor skill 首跑）

> 產出：2026-07-15 09:45（Asia/Taipei）｜生產站：https://tour-platform-nine.vercel.app
> 工具：open-seo-advisor v0.3.5（mars-tw/open-seo-advisor-skill @ `ada1a52`，已安裝至 `.claude/skills/open-seo-advisor/`）
> 實跑指令：`seo-advisor audit consultant --url https://tour-platform-nine.vercel.app --out ./seo-report`
> 掃描規模：101 頁（全部 2xx）｜健康分數：**65.4 / 100**｜9 項發現（2 P1／3 P2／4 P3）
> 稽核 SHA：main = `ac66d47`｜PR #1711 head = `2243c68`

---

## 1. 結論（TL;DR）

1. **工具回報的兩個 P1 都是誤報**（見 §3），實際站況比 65 分好；真正的高影響問題是**「/en 英文頁 SSR 輸出中文 metadata 與 `lang="zh-Hant"`」**——這一項工具掃不出來，但人工實測抓到了，而且 **PR #1711 正是修這個**。
2. **PR #1711 建議繼續推進到 merge**：preview 部署實測已修好英文 SSR 問題、未觸碰任何凍結區檔案、本地 `git merge-tree`（ort，同 GitHub 演算法）對目前 main **0 衝突**（GitHub 顯示的 `dirty` 是過期快取，update branch 即可刷新）。**唯一 blocker：PR head 上沒有任何 GitHub Actions CI 紀錄**（只有 Vercel 部署），依鐵律 6 必須先補 CI 綠燈才可 merge。
3. merge 後仍有一批**中小型真問題**值得排程（§5 計畫）：`/guides` 缺 H1、title 品牌後綴重複、4 個孤兒頁、`/activities` 雙 H1、少數 img 缺尺寸。

---

## 2. 方法

- 依 CLAUDE.md 由 https://github.com/mars-tw/open-seo-advisor-skill 安裝 skill（Consultant Mode 檢核清單：robots/sitemap/canonical/hreflang/title/meta/H1/內部連結/noindex/HTTPS/OG/JSON-LD）。
- CLI 實跑生產站（上方指令），再對每一項發現**人工反向查證**（curl 生產站原始 HTML/robots.txt/sitemap.xml、XML parser 驗證），避免把誤報或 by-design 項目寫進工單。
- PR #1711 以 merge-base `0714e97` 做本地 diff 審閱＋preview 部署（`tour-platform-git-feat-seo-full-o-9eff3f-…vercel.app`）實測。

## 3. 工具發現逐項判定（9 項）

| # | 工具發現 | 級別 | 判定 | 證據／說明 |
|---|---|---|---|---|
| 1 | sitemap.xml 不是合法 XML | P1 | **誤報** | 實測 HTTP 200、13,128 bytes，Python `xml.etree` 解析通過；帶 `xhtml:link` hreflang 命名空間，推測工具 parser 對此支援不足 |
| 2 | 36 頁 noindex | P1 | **by-design** | 名單皆為 `/booking/*`、`/orders`、`/guide/*` 等私有流程頁，本來就該 noindex（與 robots.txt disallow 一致），不需處理 |
| 3 | 32 頁缺 `<h1>` | P2 | **部分成立** | 多數是 noindex 頁（無 SEO 影響）；但 **`/guides` 是可索引頁且實測無 H1**，需修 |
| 4 | 4 組重複 `<title>` | P2 | **部分成立** | `?region=`/`?type=` 濾鏡頁已有 canonical → `/activities`，重複無害；但**全站 title 有品牌後綴重複 bug**：如 `認識導遊 \| Midao 祕島 \| Midao 祕島 — 台灣在地導遊`（頁面 title 自帶品牌＋template 再加一次），需修 |
| 5 | 4 個孤兒頁 | P2 | **成立** | `/experiences/kaohsiung-chaishan-cave-experience`、`/experiences/dadadaocheng-walk`、`/guides/guide-ce95f1d5e229`、`/guides/guide-ca2e7a25565e` 無任何內部連結指向（僅 sitemap 收錄） |
| 6 | 43 頁 hreflang 代碼格式不正確 | P3 | **誤報** | 被 flag 的是 `zh-Hant`——合法 BCP-47（ISO 639-1 + ISO 15924 script），Google 官方文件明列支援；工具只認 `lang` / `lang-REGION` 樣式 |
| 7 | 4 頁 img 缺 width/height | P3 | **成立（小）** | 首頁與 2 個活動頁，CLS 靜態線索 |
| 8 | robots.txt 未宣告 sitemap | P3 | **誤報** | 實測 robots.txt 末行即 `Sitemap: https://tour-platform-nine.vercel.app/sitemap.xml` |
| 9 | 27 頁多個 `<h1>` | P3 | **成立（小）** | `/activities` 實測有 2 個 H1（`全台灣私人導遊行程`＋`全台灣 7 個私人導遊行程`） |

> 工具限制備註：Core Web Vitals、JS 渲染差異、結構化資料驗證未實作（skill roadmap v0.2.0 註明）。JSON-LD 存在性已人工確認：公開頁每頁 2 個 `application/ld+json` 區塊。

## 4. 工具掃不到、人工實測抓到的最大問題（＝PR #1711 的存在理由）

生產站 `/en`（2026-07-15 實測）：

| 信號 | 生產站現況（main） | PR #1711 preview 實測 |
|---|---|---|
| `<html lang>` | `zh-Hant`（錯） | **`en`** ✅ |
| `<title>` | `Midao 祕島 — 找到懂路的人…`（中文） | **`Midao — Hidden Taiwan, by those who know`** ✅ |
| canonical | `…/en` ✅ | `…/en` ✅ |
| hreflang | zh-Hant／en／x-default ✅ | zh-Hant／en／x-default ✅ |

即：英文頁對搜尋引擎而言目前是「中文文件包英文內文」，會被視為與 zh 版重複、無法建立英文索引。PR #1711 的雙 root layout 架構（`app/[locale]/layout.tsx` 持有 `<html lang>`、非 locale 路由搬進 `(non-locale)` 固定中文 root、共用 `RootDocument`）從 SSR 源頭修正，且刻意不碰 `headers()`/`cookies()` 保住 ISR、不碰凍結的 middleware.ts。

## 5. PR #1711 評估

**內容**（5 commits，merge-base `0714e97`，246 檔中絕大多數是 `(non-locale)` route group 的 rename）：

- canonical＋zh-Hant/en/x-default hreflang 落到所有公開 localized 頁；動態 segment 先 `encodeURIComponent`（`buildPublicPath`），阻斷 `?`/`#`/空白/斜線改寫 URL 結構。
- 體驗頁 fail-closed：僅 published 活動輸出公開 SEO 信號，未知/catalog 失敗 → `notFound()`。
- sitemap 重構：每個可見 locale 各出一筆 URL，互列 reciprocal hreflang＋補 `x-default`（修掉現行 sitemap 只有 zh-Hant/en、缺 x-default 的小缺口）。
- 英文 SSR metadata 真實化（上表 preview 驗證通過）＋e2e 守門（`issue1569-english-seo-raw-html`、`issue1569-html-lang-locale`）。
- 附 Phase 2 計畫文件 `docs/plans/2026-07-14-phase2-english-ssr-seo.md`。

**檢核結果**：

| 檢核 | 結果 |
|---|---|
| 凍結區觸碰 | 無（middleware.ts／orders／payments／migrations／受保護 e2e 皆未動）✅ |
| 與 main 衝突 | 本地 `git merge-tree` exit 0、無 CONFLICT——GitHub `mergeable_state: dirty` 為過期快取，分支落後 main 26 commits，update branch 後即可刷新 ✅ |
| CI | ❌ **PR head `2243c68` 無任何 GitHub Actions check run**（僅 Vercel deployment success）。`ci.yml` 有 `on: pull_request`，研判是 push 當下 Actions 未觸發；merge 前必須 update branch／空 commit 重新觸發並取得綠燈（鐵律 6） |
| 行為驗證 | preview 部署實測 `/en`、`/en/activities` SSR 信號全部正確；`/`（zh）不受影響 ✅ |
| 遺留小瑕疵 | preview 上 `/en/activities` title＝`Explore Routes \| Midao 祕島 \| Midao — Local Guides in Taiwan`——品牌後綴重複 bug（§3 #4）在 PR 內仍在，屬既有問題、不擋 merge，另案修 |

**評估結論：值得改善且方向正確，建議收尾後 merge**，不建議重做或拆散。

## 6. 後續施作計畫（建議排序）

| 階段 | 事項 | 內容 | 預估 |
|---|---|---|---|
| **S1（本週）** | PR #1711 收尾 merge | update branch 觸發 CI → 綠燈（含 db-mjs guard 等）→ 依 PR 說明過 Rita gate → merge → 生產站複測 `/en` SSR 信號＋sitemap x-default | 0.5 天 |
| **S2** | title 模板去重 | 頁面層 title 一律不再自帶品牌字串，統一交由 layout `title.template`；影響 zh/en 全站，加契約測試鎖住「title 不得出現兩次品牌」 | 0.5 天 |
| **S3** | H1 修正 | `/guides` 補單一 H1；`/activities` 雙 H1 收斂為一個 H1＋一個 H2 | 0.5 天 |
| **S4** | 孤兒頁內部連結 | `/experiences/*` 從首頁或對應 `/theme/*` 頁連入；查明 2 個 guide profile 為何未出現在 `/guides` 列表（資料或分頁問題），補列表連結 | 0.5–1 天 |
| **S5** | img 尺寸屬性 | 首頁＋活動頁 4 處 img 補 width/height（或 CSS aspect-ratio），降 CLS | 0.5 天 |
| **S6（機會項）** | 觀測與內容 | 串 Google Search Console 驗證索引狀態（冷啟動期尤其重要）；blog 僅 2 篇，依 BRAND_BOOK 語氣擴充在地內容；結構化資料以 Rich Results Test 抽驗 | 持續 |

> S2–S5 均為 `app/[locale]/**`、`src/components/**` 範圍，不涉凍結區；建議都等 S1 merge 後基於新結構施作，避免跟 `(non-locale)` 搬遷打架。

## 7. 附錄

- 工具原始報告（report.md/json/html/beginner）：session scratchpad `seo-report/`（未入版控，數字已摘錄於本文；重跑指令見文首）。
- Skill 安裝位置：`.claude/skills/open-seo-advisor/`（含 CLI，`cd scripts && pip install -e .` 即可重跑）。
- 本次稽核未修改任何應用程式碼。hooks 防線經實測**有武裝**（bash-guard 攔下無測試證據的 commit；註：開機 Edit 煙霧探針當時回傳一般錯誤而非 HARNESS BLOCK，該探針結果與 bash-guard 實際行為矛盾，判定以實際攔截為準）。commit 證據：`run-checks.sh` 4 個 SEO 測試檔 60 pass / 0 fail。
