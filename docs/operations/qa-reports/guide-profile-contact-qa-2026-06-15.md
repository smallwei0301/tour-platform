# 認識導遊頁「傳訊息給導遊」死按鈕修復 — 驗證報告

- **頁面**：`/guides/[slug]`（認識導遊詳情頁）side bar CTA、`/activities/[region]/[slug]`（行程詳情頁）「詢問導遊」
- **本機環境**：`next dev`（Node 22.22）＋ Playwright（chromium headless），fixtures in-memory fallback（無 Supabase 連線）
- **base commit**：`9ecafae`（main）
- **驗證時間**：2026-06-15 (Asia/Taipei)
- **判定**：PASS

## 問題（使用者回報）

認識導遊頁的「傳送訊息給導遊」按鈕按下去沒反應、功能無法使用。

## 根因

`apps/web/app/guides/[slug]/page.tsx` 的 sidebar `<button>傳訊息給導遊</button>` 是死標記：

1. 沒有 `onClick`／連結；且該頁是 **server component**，本來就無法掛 client handler。
2. 站上**訂單前**唯一與導遊互動的諮詢管道是行程詳情頁的「旅客問答」（`activity_qa` ／
   `ActivityQASection`／`/api/qa`），綁定單一行程；並不存在 guide 層級或訂單前的私訊管道
   （`#1411` 站內訊息只在「已成立訂單」內 guide↔traveler 對話）。

同類死按鈕也存在於行程詳情頁的「✉️ 詢問導遊」（同為 server component 內的無 handler `<button>`）。

## 變更

- `app/guides/[slug]/page.tsx`：sidebar CTA 由死 `<button>` 改為 `<Link>`，導向導遊**主行程**
  詳情頁的旅客問答區塊（`buildActivityHref(...) + '#section-qa'`）；導遊無上架行程時退回
  `/activities`。文案改為「✉️ 詢問導遊」，與行程頁一致並如實描述目的地。
- `app/activities/[region]/[slug]/page.tsx`：「✉️ 詢問導遊」由死 `<button>` 改為
  `<a href="#section-qa">` 錨點連結，點擊滾動到旅客問答區塊。

## 逐項證據

| 驗證項目 | 方式 | 結果 |
| --- | --- | --- |
| 死按鈕已移除、改為可導向 Q&A 的連結 | `tests/ui/guide-profile-contact-qa.test.mjs`（source-contract + fixtures 解析 href） | 5/5 PASS |
| 導遊頁點「詢問導遊」→ 行程頁 `#section-qa`，顯示「旅客問答」 | Playwright（真實 chromium） | PASS |
| 行程頁「詢問導遊」錨點滾動到 `#section-qa` | Playwright（真實 chromium） | PASS |
| SSR 實際輸出正確 href | `curl` /guides/andy-lee、/activities/... | 兩頁皆輸出 `#section-qa` 連結 |
| `npm run typecheck` | tsc --noEmit | PASS |
| `npm run lint` | eslint | PASS（無 error） |
| `npm test`（全套） | node --test | 3356 pass / 0 fail / 3 skip（既有） |

## 備註

- 本機以 placeholder env 跑 fixtures fallback，未連任何正式資料、未寄信、未動付款／PII。
- 主行程取 `guide.activities[0]`；多行程導遊預設導向主行程的問答，旅客仍可於頁內切換其他行程提問。
