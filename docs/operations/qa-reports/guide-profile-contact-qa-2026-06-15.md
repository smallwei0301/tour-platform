# 認識導遊頁「詢問導遊」inline 訊息 — 驗證報告

- **頁面**：`/guides/[slug]`（認識導遊詳情頁）sidebar CTA、`/guide/dashboard`（導遊後台收件匣）、`/activities/[region]/[slug]`（行程詳情頁）「詢問導遊」
- **本機環境**：`next dev`（Node 22.22）＋ Playwright（chromium headless），fixtures in-memory fallback（無 Supabase 連線）
- **base commit**：`ce2f8a0`（branch `claude/guide-messaging-unresponsive-i6d9zb`，由 main `9ecafae` 衍生）
- **驗證時間**：2026-06-15 (Asia/Taipei)
- **判定**：PASS

## 需求（使用者）

1. 認識導遊頁的「傳送訊息給導遊」按鈕，按下後**先判斷旅客是否登入**：
   - 已登入 → 直接在**此頁面下方就地展開**和行程 QA 一樣的輸入框與送出功能。
   - 訊息**不綁定任何行程**；導遊後台卡片的「行程編號」改顯示為「導遊頁面」。
2. 調查 QA 系統：行程前的 QA 詢問**會寄通知信給導遊嗎？會記錄到導遊後台嗎？**

## 調查結論（行程前 QA）

| 問題 | 結論 | 證據 |
| --- | --- | --- |
| 行程前 QA 會**寄通知信給導遊**嗎？ | **不會** | `app/api/qa/route.ts` POST（line 51–117）只 INSERT `activity_qa`，全程無任何 email／notify／resend 呼叫；`src/lib/email.ts` 也無 QA 相關通知函式。導遊需自行登入後台才看得到。 |
| 行程前 QA 會**記錄到導遊後台**嗎？ | **會** | 旅客 POST `/api/qa` → `activity_qa`（`status=pending_moderation`）；導遊後台 `/guide/dashboard`「❓ 待回答的問題」載入時呼叫 `/api/guide/qa?status=pending_moderation`（撈該導遊行程的 QA）並可回答發布（PATCH `/api/guide/qa/[id]`）。 |

> 備註：目前**沒有**任何 QA email 通知（行程 QA 與本次新增的導遊頁訊息皆然）。若需在旅客送出時主動通知導遊，是另一條 follow-up（需接 `src/lib/email.ts` 寄信管道）。

## 變更（導遊頁 inline 訊息）

重用既有 `activity_qa` pipeline，訊息以 sentinel `activity_id = 'guide:<guideId>'` 儲存，
不綁定行程，但流進**同一個**導遊後台收件匣。

- `src/lib/guide-contact-qa.mjs`（新）：純函式 `buildGuideContactActivityId` / `isGuideContactActivityId` / `parseGuideContactGuideId`（sentinel 組裝、辨識、解析）。
- `src/components/guide/GuideContactQASection.tsx`（新，client component）：按「✉️ 詢問導遊」就地展開 — 已登入顯示輸入框 + 送出（POST `/api/qa`，帶 sentinel activityId），未登入顯示登入提示。
- `app/guides/[slug]/page.tsx`：sidebar CTA 由靜態 `<Link>` 改為渲染 `GuideContactQASection`（帶 `guide.id` / `guide.displayName`）。
- `app/api/guide/qa/route.ts`：查詢 id 清單加入 sentinel（`[...activityIds, guide:<guideId>]`），且導遊無上架行程時不再提早 return —— 確保收得到導遊頁訊息。
- `app/api/guide/qa/[id]/route.ts`：PATCH 擁有權判定改為——sentinel 訊息以內嵌 guideId 比對 `session.guideId`；一般行程 QA 仍走 `activities.guide_id`。
- `app/guide/dashboard/page.tsx`：卡片對 sentinel `activity_id` 顯示「👤 導遊頁面」標籤而非「行程 ID」。

## 逐項證據

| 驗證項目 | 方式 | 結果 |
| --- | --- | --- |
| sentinel helper（build/parse/detect、round-trip） | `tests/unit/guide-contact-qa.test.mjs` | 5/5 PASS |
| 頁面／路由／後台 wiring（含 sentinel 查詢、擁有權、後台顯示「導遊頁面」） | `tests/ui/guide-profile-contact-qa.test.mjs`（source-contract） | 8/8 PASS |
| 未登入點「詢問導遊」→ 展開登入提示、不顯示輸入框 | Playwright（真實 chromium） | PASS |
| 已登入點「詢問導遊」→ 展開輸入框 → 送出 → 等候回覆，且 POST body `activityId` 帶 `guide:` 前綴 | Playwright（真實 chromium） | PASS |
| 行程詳情頁「詢問導遊」錨點仍滾動到 `#section-qa`（不退化） | Playwright（真實 chromium） | PASS |
| `npm run typecheck` | tsc --noEmit | PASS |
| `npm run lint` | eslint | PASS（無 error） |
| `npm test`（全套） | node --test | 3364 pass / 0 fail / 3 skip（既有） |

## 備註

- 本機以 placeholder env 跑 fixtures fallback，未連任何正式資料、未寄信、未動付款／PII。
- `activity_qa.activity_id` 為 `text NOT NULL`，sentinel 形狀直接相容現有 schema，**無需 migration**。
- 在 production，`guide.id` = `guide_profiles.id`，與導遊 session 的 `guideId` 同源，故 sentinel 能精準對應收件匣導遊。
