# 認識導遊頁（/guides）UI 重設計 — 驗證報告

- **頁面**：`/guides`（認識導遊列表）
- **本機環境**：`next dev`（Node 22）＋ Playwright（chromium headless），fixtures in-memory fallback（無 Supabase 連線）
- **base commit**：`dc604f3`（main）
- **驗證時間**：2026-06-14 13:53 (Asia/Taipei)
- **判定**：PASS

## 需求

依使用者要求重新設計 `/guides` 的卡片 UI：

1. 參照首頁（LP）字體大小與風格。
2. 將每位導遊的照片縮小到原本約 10% 左右，不再讓大圖佔滿整張卡片。

## 變更內容

- `apps/web/app/guides/GuidesContent.tsx`：卡片由「全寬直式大圖＋下方文字」改為**橫向緊湊卡**——左側小尺寸方形頭像（圓角）＋右側資訊欄。
- `apps/web/app/globals.css`：新增 `.tp-guide-list-*` 系列樣式，沿用首頁 LP 視覺語言——
  - 姓名用襯線字（`--tp-serif`，與 `.tp-container h3` 一致），18px。
  - 評分以黃銅金階（`--tp-gold-strong`）強調，地區／語言為苔綠霧色（`--tp-muted`）13px。
  - 專長標籤 12px 金色（`--tp-gold`）、招呼語 13px 斜體霧色，與首頁 `.lp-guide-*` 字級／色階呼應。
  - 「✅ 已驗證」改為頭像右下角小徽章 pill。
  - 桌面 2 欄、≤768px 單欄（`.tp-guide-list-grid`）。

## 照片尺寸縮小驗證（實測 boundingBox）

| 項目 | 舊版 | 新版 | 新/舊面積比 |
| --- | --- | --- | --- |
| 桌面（1280px，2 欄） | 全寬直式圖 ≈ 388×517 | 112×112 thumbnail | ≈ 6.2% |
| 行動（412px，單欄） | 全寬直式圖 ≈ 352×469 | 112×112 thumbnail | ≈ 7.6% |

Playwright 量得 thumbnail `boundingBox` = `{width:112, height:112}`，卡片高度由原本 ~600px 降至 ~198px。照片面積落在原本約 6–8%（符合「縮小到 10% 左右」的訴求，且不再主導版面）。

## 真實 browser smoke（Playwright，實測）

- 列表正確渲染 fixtures 的 3 位導遊（`.tp-guide-list-card` count = 3）。
- 桌面與行動兩種 viewport 截圖皆正常（無破版、無 runtime error overlay）。
- 單卡放大檢視：襯線姓名、金色評分、語言／專長、斜體招呼語、頭像右下「已驗證」徽章、右下「查看導遊簡介 →」連結皆正確顯示。

## 其他綠燈

- `npm run typecheck`：PASS（tsc --noEmit 無錯）。
- `npm run lint`：PASS（無 error）。
- `node --test tests/ui/issue1027-guides-filter-url-persistent.test.mjs`：7/7 PASS（篩選／URL 持久化邏輯未受影響）。

## 備註

- 篩選側欄、排序、搜尋、URL 同步等行為皆未更動，僅重設計結果卡片的視覺呈現。
- 本機以 placeholder `NEXT_PUBLIC_SUPABASE_*`（gitignore 的 `.env.local`）讓 Navbar 的 browser client 不報錯；未連任何正式資料、未寄信、未動付款。
