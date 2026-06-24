# 導遊共用行程編輯 + 管理者審核上架 — 驗收報告

- **功能**：導遊與管理者共用同一套行程編輯系統；導遊只能編輯自己的行程，編輯／新建後送審，由管理者核准才套用上架（pending overlay 模型）。
- **分支**：`claude/guide-itinerary-editing-design-q5g8ny`
- **驗收時間**：2026-06-24 10:14 Asia/Taipei
- **Commit SHA**：`3e9aac1`（HEAD，本輪 3 個 feature commit 之頂）
- **環境**：本地 Node 22.22.2 + npm workspaces；無連線 production Supabase（gateway 走 `hasSupabaseEnv()` 真實分支需 Supabase，本地以單測／source-contract 驗證）。
- **判定**：**PASS（後端 / 型別 / 建置 / 單測 / live browser smoke 全綠）。**
- **Browser smoke 補測**：2026-06-24 11:46 Asia/Taipei，本地 `npm run dev`（PORT=3333, NODE_ENV=development）+ Playwright chromium（v1208）真實瀏覽器，`apps/web/e2e/guide-activity-review.spec.ts` → **3/3 passed**。

## 範圍（Phase 1）
- 導遊可編輯自己既有行程、亦可從零建立新行程草稿並送審。
- 送審期間「原版保持上架」：導遊修改另存 `activities.pending_changes`，前台照常顯示 live 內容；管理者核准才把 pending_changes 套用進 live、退回則保留內容讓導遊續修。
- 導遊可編輯全部內容欄位（含活動層級 `priceTwd`）；方案（`activity_plans`，含每方案價格）與場次仍由管理者管理（Phase 2 再開放）。

## 逐條 AC 證據

| # | 驗收項目 | 結果 | 證據 |
|---|---------|------|------|
| 1 | 審核狀態機（submit→pending、approve→套用+清空、reject→changes_requested 保留內容） | ✅ PASS | `node --test apps/web/tests/unit/guide-activity-review-transition.test.mjs` → 4/4 綠 |
| 2 | pending overlay 疊加與 live vs pending diff（含深層比較、不可變） | ✅ PASS | `guide-activity-pending-overlay.test.mjs` → 6/6 綠 |
| 3 | 導遊只能編輯自己行程（guide_id 歸屬，含 null/別人/不存在） | ✅ PASS | `guide-activity-ownership.test.mjs` → 4/4 綠（fake supabase 功能測試） |
| 4 | 欄位白名單剔除 status/guideSlug/guideId/ratingAvg/reviewCount/plans（防權限繞過） | ✅ PASS | `guide-editable-activity-fields.test.mjs` → 5/5 綠 |
| 5 | gateway 接線：ownership 檢查、白名單、衝突偵測欄位、audit log、狀態機、approve 走 `updateActivityDb` 複用映射 | ✅ PASS | `guide-activity-review-gateway-contract.test.mjs` → 6/6 綠 |
| 6 | route 接線：guide 路由先 `verifyGuideSession`＋CSRF＋ownership(404)、FAQ 驗證同 admin、admin 審核 approve/reject＋NOT_PENDING_REVIEW(409)＋核准刷新 ISR、圖片上傳 admin/guide 共用 helper | ✅ PASS | `guide-activity-review-routes-contract.test.mjs` → 6/6 綠 |
| 7 | 型別檢查 | ✅ PASS | `npm run typecheck` 0 error |
| 8 | Lint（Node 22） | ✅ PASS | `npm run lint` 0 error（僅 eslintrc 棄用警告） |
| 9 | 全套單測無回歸 | ✅ PASS | `npm test` → 3729 pass / 0 fail / 3 skip（2721 top-level subtests，299 suites） |
| 10 | production 建置 | ✅ PASS | `npm run build`（NODE_ENV=production＋強密鑰）成功；新路由皆入 manifest（見下） |
| 11 | live browser smoke（導遊行程列表徽章／導遊編輯→送審→審核中橫幅／管理者 diff＋核准） | ✅ PASS | Playwright chromium 真實瀏覽器 `apps/web/e2e/guide-activity-review.spec.ts` → **3/3 passed**（全程 `page.route` mock backend，符合 CLAUDE.md）。涵蓋：(a) 我的行程列表顯示「審核中／已退回，請修改＋退回原因」徽章；(b) 導遊改標題→送出審核→出現「已送出審核」+「前台仍顯示原本已上架的內容」橫幅、`/submit` 被呼叫；(c) 管理者待審頁顯示 title diff（龜山島賞鯨→龜山島賞鯨一日遊）並可核准。修正本輪 spec 兩處脆弱選擇器（標題欄改鎖 placeholder、admin 標題改鎖 heading role），非產品缺陷。 |

### 建置 manifest 驗證（新路由）
```
○ /admin/activity-reviews            4.18 kB
ƒ /api/admin/activity-reviews
ƒ /api/admin/activities/[id]/review
ƒ /api/guide/activities
ƒ /api/guide/activities/[id]
ƒ /api/guide/activities/[id]/submit
ƒ /api/guide/activities/[id]/upload-image
○ /guide/activities                  2.23 kB
ƒ /guide/activities/[id]/edit        6.06 kB
```

## 安全性重點
- 導遊送來的 payload 一律過 `pickGuideEditableFields` 白名單：無法挾帶 `status`（不可自助上下架）、`guideSlug`/`guideId`（不可改歸屬）、`ratingAvg`/`reviewCount`/`plans`。
- 每個 guide route：`verifyGuideSession` → CSRF（middleware + route）→ `guide_id` 歸屬檢查；非擁有者一律回 404（不洩漏存在性）。
- 核准／退回／送審皆寫 audit log（`audit-log.mjs` 單一實作，actor `guide`/`admin`，action `activity_submit`/`activity_approve`/`activity_reject`）；audit 失敗 fail-soft 不阻擋核心動作。
- 衝突偵測：送審記錄 `pending_base_updated_at`，與當前 `updated_at` 比對，管理者審核頁標示「送審後 live 已被改」。

## 已知限制 / 後續（Phase 2）
- 方案（`activity_plans`）與場次仍由管理者管理；導遊自助編方案＋方案價格走審核列為 Phase 2。
- 共享編輯器目前為「同欄位集合＋共用子元件（`ImageUpload` 等）＋共用審核後端」；admin 1678 行編輯頁的「單一元件抽取」（計劃 Phase 0）建議列為後續低風險重構（行為保留、待 admin E2E 綠燈後做），避免本輪動到大檔造成回歸。
- 舊 `/guide/new-activity` 寄信投稿流程保留為備援，是否下架待 owner 決定。
- DB migration `20260624000000_guide_activity_review_overlay.sql` 需於部署環境套用（含 rollback 檔）。

## 不含
本報告不含任何密鑰／cookie／token／service-role key／完整付款 payload／未遮蔽 PII。
