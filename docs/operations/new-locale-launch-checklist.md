# 新語系（locale）上線 checklist

> 對應 issue #1595。平台四語系（zh-Hant / en / ja / ko）皆 config-ready，但**只有列入
> `VISIBLE_LOCALES` 的語言會對外開放**；其餘一律回 404（見 `app/[locale]/layout.tsx` guard），
> 避免翻譯未齊的半成品被搜尋引擎收錄。本文件是把一個新語言「開站」的標準步驟。

## 開站前門檻（缺一不可）

1. **翻譯完成度**：`apps/web/messages/<locale>.json` 對齊 `zh-Hant.json` 的所有 key，無缺漏、無殘留 zh 文案（可用 diff key 集合檢查）。
2. **品牌文案**：使用者可見文案符合 `BRAND_BOOK.md`（語氣、專有名詞、CTA 用語）。
3. **動態內容策略**：活動標題／描述等 DB 內容是否有該語言版本？若無，決定 fallback 規則（顯示 zh-Hant 或隱藏該活動），並在 PR 記錄。

## 開站步驟

1. **加入 `VISIBLE_LOCALES`**（`apps/web/src/i18n/routing.ts`）：把該 locale 加進陣列。
   - 這一步會**自動**讓 `[locale]/layout` 放行（不再 404）、`generateStaticParams` 預建該 locale、
     sitemap／hreflang 帶出該語言變體——因為三者都同源於 `VISIBLE_LOCALES`（由 `issue1595-hidden-locale-guard.test.mjs` 鎖定）。
2. **切換器**：`LanguageSwitcher` 依 `VISIBLE_LOCALES` 顯示，無需另改。
3. **`<html lang>`**：確認 `HTML_LANG[<locale>]` 已有正確 BCP-47 值（routing.ts）。
4. **驗證**：
   - `issue1595-hidden-locale-guard.test.mjs` 需同步更新（該 locale 由「未開」移到「已開」的斷言）。
   - e2e：新 locale 頁面 200 且主要區塊有正確翻譯；zh-Hant/en 不回歸。
   - `npm run readiness:snapshot` 若有 locale 覆蓋率指標，一併重生。
5. **GSC**：Google Search Console 提交更新後的 sitemap；觀察新語言 URL 的索引與重複內容告警。

## 回滾

把該 locale 從 `VISIBLE_LOCALES` 移除即回到「未開站、404」狀態（config 仍保留，翻譯不丟失）。
