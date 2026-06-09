# QA 驗收 — #1294 Booking V2 導遊/旅客 slot range 語意（post-#1291）

**Issue:** #1294 — [QA] Verify post-#1291 Booking V2 guide/traveler slot range semantics in browser
**對應修正:** PR #1291（GH-1289 Slice A+B）— 導遊 availability preview 改用 canonical `generateAvailableSlots()`;分離 plan `duration_minutes` 與 rule `slot_interval_minutes`;導遊 preview chip 與旅客 slot picker 以 `formatSlotRangeLabel()` 顯示完整範圍;新增既有規則 duration/interval mismatch 警告
**執行者:** AI agent（Claude Code）
**分支:** `claude/issue-1294-slot-range-semantics-qa`（基於 `origin/main` `8a9928d`）
**測試時間:** 2026-06-09 15:52（Asia/Taipei）

---

## 結論

**PASS — 導遊/旅客 slot range 語意一致、無回歸。** 新規則 interval 依方案時長預設、preview 顯示完整範圍且無 #1288 時區位移、既有規則 mismatch 警告可見且不阻擋、旅客 picker 與導遊 preview 範圍語意一致。

---

## 環境 / 部署涵蓋

| 項目 | 值 |
|------|----|
| Preview 部署 | `https://tour-platform-nine.vercel.app`，SHA `8a9928d`|
| 含 PR #1291? | **是** — `8caa2f0`（#1291）為 HEAD/部署祖先（`git merge-base --is-ancestor` 通過）|
| 受測頁面 | `/guide/availability`、`/booking/:activityId` |

> 備註:PR #1291 作者註明其共用主機因 inotify/dev-server 限制無法本地跑 Playwright;**本驗收環境無此限制**，已實際以 Playwright 驅動 merged-main bundle（= 部署同一份程式碼）執行，屬 production-equivalent browser 證據。

---

## 驗收標準對應證據

### AC1 — 新規則 interval 依所選方案時長預設（除非手動修改）✅
- **Browser smoke:** `issue1294 … AC1` — 開「新增時段規則」→ 選活動/方案（方案時長 360 分）→ `#avail-interval-minutes` 自動變為 `360`（非初始 60）。
- **來源:** `app/guide/availability/page.tsx:595-602`（`shouldDefaultInterval = !editingRule && !intervalManuallyEdited && planOption.durationMinutes != null`）;手動改 interval 會設 `intervalManuallyEdited`（704）避免覆蓋。

### AC2 — 導遊 preview 顯示完整範圍（formatSlotRangeLabel），無 #1288 時區位移 ✅
- **Browser smoke:** `issue1294 … AC2` — preview 回傳 09:00–15:00 slot → chip 顯示 `09:00 – 15:00`;斷言 `17:00 – 00:00`（#1288 症狀）數量為 0。
- **來源:** `page.tsx:1123` `formatSlotRangeLabel(slot.startAt, slot.endAt, 'Asia/Taipei')`;`formatSlotRangeLabel`（`slot-generator.ts:308-324`）以 `timeZone: 'Asia/Taipei'` 格式化（時區安全）。

### AC3 — 既有規則 duration/interval mismatch 警告可見且不阻擋 ✅
- **Browser smoke:** `issue1294 … AC3` — 既有規則 interval 60 ≠ 方案時長 360 → 點「編輯」→ 警告「時段間隔（60 分鐘）與方案時長（360 分鐘）不一致」可見;`#avail-interval-minutes` 仍可編輯、「儲存」按鈕存在（不阻擋）。
- **來源:** `page.tsx:730-733`（警告僅於 `editingRule` 時顯示，符合「existing-rule」語意）。

### AC4 — 旅客 booking picker 與導遊 preview 範圍語意一致 ✅
- **Browser smoke:** `issue1294 … AC4` — 旅客 booking 頁同一 09:00–15:00 slot → 顯示 `09:00 – 15:00`（與導遊 preview 相同 canonical 標籤）。
- **來源:** `app/booking/[activityId]/page.tsx:1106` 同樣使用 `formatSlotRangeLabel(selectedSlot.startAt, selectedSlot.endAt)`。

### AC5 — buffer/conflict 維持 #1289 fixed-candidate parity（不要求 #1290 dynamic re-emit）✅
- **Focused 測試:** `issue1289-buffer-conflict` 與 `issue1289-preview-canonical-parity`（見下）通過;本驗收不涉入 #1290 dynamic re-emit。

### AC6 — durable Playwright 覆蓋 ✅
- 新增 `apps/web/e2e/issue1294-slot-range-semantics.spec.ts`（AC1–AC4，4 測項，後端 mock，guide 以 format-valid session）→ **4 passed**。環境未受 PR 作者主機之 inotify 限制，故無需 `NOT_AUTOMATABLE`。

### AC7 — 證據隱私安全 ✅
無密碼、cookie、JWT、service-role key、完整付款 payload 或未遮蔽 PII（測試資料皆合成）。

---

## 測試證據

```
# focused 契約/UI 測試（#1289）
node --test apps/web/tests/api/issue1289-buffer-conflict.test.mjs \
            apps/web/tests/api/issue1289-duration-vs-interval.test.mjs \
            apps/web/tests/api/issue1289-preview-canonical-parity.test.mjs \
            apps/web/tests/ui/issue1289-ui-range-display.test.mjs
# tests 25 / pass 25 / fail 0

# 新增 browser smoke（#1294）
npx playwright test e2e/issue1294-slot-range-semantics.spec.ts
# 4 passed
```
`npm run lint` ✅ · `npm run typecheck` ✅。

---

## 判定
**PASS** — #1291 的導遊/旅客 slot range 語意在含該修正的部署上一致且無回歸。
