# Worklog — 管理者後台編輯行程：既有 QA 顯示與編輯

- Branch：`claude/admin-qa-display-edit-ghmwiz`
- 日期（Asia/Taipei）：2026-07-06

## 需求

管理者後台編輯行程時，既有的 QA（常見問題）沒有顯示到後台；需能顯示既有 QA 並可編輯後儲存修改。

## 根因

- 儲存層 `activities.faq` 自 #342 起一律為 canonical shape `{question, answer}`
  （PUT `/api/admin/activities/[id]` 的 `buildFaqPatch` 會把送進來的 `{q,a}` 或
  `{question,answer}` 都正規化成 `{question, answer}`）。
- 後台編輯頁 `app/admin/activities/[id]/edit/page.tsx` 載入時直接
  `setFaq(d.faq || [])`，未做欄位正規化；而 `FaqEditorCard` 只讀 `item.q` / `item.a`。
- 因此既有 FAQ（`{question, answer}`）灌進編輯器後，`q` / `a` 皆為 undefined →
  問題與回答欄位顯示成空白，看起來像「既有 QA 沒顯示到後台」。
- 對照組：`app/guide/activities/[id]/edit/page.tsx:99` 早已在載入時正規化
  （`x.question || x.q`），管理者頁漏了同樣處理。

## 修正

1. 新增 `apps/web/src/components/admin/activity-form/faq-shape.mjs` 的 `toEditorFaq()`：
   把任一 shape（`{question,answer}` / `{q,a}` / 混合 / 髒資料）統一轉成編輯器用的
   `{q, a}`；非陣列回傳 `[]`，非物件元素濾除。
2. `edit/page.tsx` 兩處載入路徑改用 `toEditorFaq()`：
   - 初次 fetch 帶入既有行程（既有 QA 顯示修復）。
   - `applyImportedActivity()` JSON 匯入。
3. 儲存路徑不變：編輯器 state 仍為 `{q,a}`，`handleSave` 與 FaqEditorCard 的
   「💾 儲存 FAQ」皆送 `faq`，PUT route 的 `buildFaqPatch` 再轉回 canonical
   `{question, answer}` 寫入 → 既有 QA 可編輯後儲存。

## 證據

- `node --test apps/web/tests/unit/admin-faq-editor-shape.test.mjs` → 5 pass
- `.claude/hooks/run-checks.sh apps/web/tests/unit/admin-faq-editor-shape.test.mjs \
   apps/web/tests/api/activity-faq-detail.test.mjs --typecheck` → 11 tests pass、
   `tsc --noEmit` 綠燈（`.claude/state/last-checks.json`）。

## 未觸碰

- 儲存層 / PUT route / DB gateway 不動（既有 canonical 正規化已足夠）。
- 前台詳情頁與 guide 編輯頁本就相容雙 shape，不受影響。
