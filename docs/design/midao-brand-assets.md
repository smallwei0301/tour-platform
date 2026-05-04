# Midao Brand Assets

最後更新：2026-05-01

## 資產索引

### 1. Header logo（目前首頁使用中）
- 檔案：`apps/web/public/images/brand/midao-logo.png`
- 用途：首頁左上品牌區 `MidaoLogo.tsx`
- 版本：白色圖樣、透明背景
- 建議呈現：深色或照片型 hero 背景上使用
- 目前首頁尺寸：`64 x 64`（由 `apps/web/app/globals.css` 的 `.midao-brand-mark` 控制）

### 2. 對應元件
- `apps/web/src/components/midao/MidaoLogo.tsx`
- `apps/web/src/components/home/MidaoHome.tsx`
- `apps/web/app/globals.css`

## 使用規則
- 目前此 logo 已做透明背景處理，可直接疊在 hero 圖上。
- 若要再調整顏色，優先保留透明 alpha，不要重新輸出成帶底色圖片。
- 若需更換尺寸，優先改 `.midao-brand-mark`，避免直接縮放原圖造成視覺偏差。

## 備註
- 本版是 UI 對齊用途的首頁品牌資產索引。
- 若未來加入深色版 / 單色墨綠版 / SVG 版，請直接在本檔追加條目，不要覆蓋既有紀錄。
