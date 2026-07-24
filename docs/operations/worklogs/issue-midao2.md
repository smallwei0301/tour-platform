# worklog — midao2 導遊後台（接案 CRM）

> 尚未開 GitHub issue；開立後請將本檔改名為 `issueNNNN.md` 並在 issue 留言同步錨點。

## 目前狀態（2026-07-22，Asia/Taipei）

**Plan 1（後端 M1–M3）實作完成**，11/11 任務全數通過逐任務審查（subagent-driven development：每任務獨立實作 → 規格＋品質審查 → 修正 → 再審）。分支 `claude/superpowers-midao-backend-x90czx`，已推送。

- 設計文件（已核可）：`docs/superpowers/specs/2026-07-22-midao2-guide-backend-design.md`
- 實作計畫：`docs/superpowers/plans/2026-07-22-midao2-backend.md`
- SDD 進度 ledger：`.superpowers/sdd/progress.md`（各任務 commit 範圍、審查結論、Minor 累積清單）

## 完成內容

| 層 | 交付 |
|---|---|
| Migration（**未套用生產**） | `20260722100000_midao2_requests_availability.sql`（midao_requests＋可用時間 2 表＋RLS）、`20260722100500_midao2_activity_showcase_columns.sql`（activities 5 欄＋guide_profiles.experience_years） |
| 領域檔（strangler，未碰 db.mjs） | `db-midao-requests.mjs`（狀態機/request_no/列表/摘要）、`db-midao-availability.mjs`（週預設/單日覆寫/月生效）、`db-midao-showcase.mjs`（雙軌可見度/精靈建立/公開頁查詢）、`midao-request-notify.mjs`（LINE 推播 fire-and-forget） |
| 導遊端 API ×10 | `app/api/v2/guide/midao/`：summary、requests（list/manual create/detail/status PATCH）、services（list/create/PATCH）、calendar、availability（defaults GET/PUT、days/[date] PUT） |
| 公開端 API ×3 | `app/api/v2/public/midao/guides/[slug]/`：接案頁、可選日期、送單（rate-limit 5/分/IP＋honeypot＋LINE 推播通知導遊） |
| 測試 | 9 個測試檔 34 tests 全綠＋守門測試（db-mjs-size-guard、issue1407 residue）9/9 綠＋整包 `tsc --noEmit` 乾淨；證據在 `.claude/state/last-checks.json` |

## 實作過程中的重要決議（Plan 2 前端必讀）

1. **weekday 慣例**＝JS `getUTCDay()`（0=Sun…6=Sat），與 `slot-generator.ts` 一致（計畫原文的 0=Mon 公式有誤，已按測試意圖修正）。
2. **`updateMidaoServiceDb` 契約**＝`{ok:true, service}` | `{ok:false, code, message}`（統一二態，非計畫原文的三態）。
3. **行事曆點色**：綠點僅由 `closed_won` 需求或 `status='confirmed'` 站內訂單驅動（`pending_confirmation` 只入 items 不驅動點色）；bookings 以 **Asia/Taipei（+08:00）** 切日與顯示時刻（`taipeiDateOf`/`taipeiTimeOf`）。
4. **`midao_day_overrides` 寫入**：因 partial unique index 無法被 supabase-js `onConflict` 對應，非 custom 時段採先刪後插（非原子，冷啟動量級可接受）。
5. 公開接案頁回應以解構剔除 `guideId`，不含導遊私人欄位。

## 已知限制／追蹤事項（審查累積 Minor）

- Supabase 分支普遍無單元覆蓋（測試全走 in-memory fallback）——含 request_no 23505 重試分支；待 staging 實測補整合驗證。
- migration 無 `.rollback.sql` 伴檔（近期慣例）；`midao_day_overrides` 無 custom_start/end 非空 CHECK。
- `fetchGuideRows` 200 筆/導遊上限（冷啟動可接受，已註解）。
- 送單 `submitLimiter` 為 per-instance 記憶體單例（serverless 各實例各自計數）——與既有 limiters 同慣例，非新風險；honeypot 判斷在 rate-limit 之後（機器人第 6 次起見 429），已知取捨。
- `DATE_RE` 不驗日曆有效性（如 2026-13-45 會過格式檢查）。
- questions label/options 超長採靜默截斷（與 title/tagline 報錯不一致）。
- 公開端 `openPeriods` 不含 custom 時段（僅 custom 開放的日子旅客端顯示全關）——Plan 2 決定呈現方式。
- 需求單 `startTime`/`endTime` 未驗證直通（非法字串會 22007 → 公開端 500 而非 400），與 DATE_RE 同族待補。
- 行事曆 API 回應用 `hasPending`/`hasConfirmed` 布林（非 spec 原文的 `requestDots[]`）——Plan 2 UI 對照此欄位名。
- 需求列表：已在列表頁時點底部「需求」tab 不會重置分頁（URL 與 active tab 短暫不一致）。

## 下一步

1. **最終整條 branch 審查**（進行中）→ 開 PR → CI 綠燈 → merge。
2. **migration 套用生產**：需使用者 `SQL-OVERRIDE` 授權＋照 `docs/operations/migration-apply-ledger-sop.md` 補 ledger（鐵律 2）。
3. **Plan 2（M4–M6）**：midao2 前端五頁＋三步精靈＋公開接案頁 `/g/[slug]`＋登入導向改 `/midao2`＋E2E。屆時對真實 API 撰寫。

---

## Plan 2 前端完成（2026-07-22，Asia/Taipei）

**Plan 2（前端 M4–M6）11/11 任務全數完成**，commit 範圍 `e77b8df..c2e764c`（15 commits，含 T11，分支 `claude/superpowers-midao-backend-x90czx`，已推送，**未開 PR、未 merge**）。

### 頁面清單

| 路徑 | 內容 |
|---|---|
| `/midao2`（layout＋首頁） | 底部五格 tab bar；client 探針打 `GET /api/v2/guide/midao/summary`（401→導轉 `/guide/login?next=/midao2`）；首頁統計卡（新需求/待回覆）、需要你處理卡（複製 LINE 回覆）、最近進度、分享接案頁 CTA |
| `/midao2/requests` | 狀態分頁（全部/新需求/待回覆/已回覆/已完成，`?status=` 白名單校驗）＋排序（未回覆優先/最新優先）＋需求卡 |
| `/midao2/requests/[id]` | 聯絡資訊（LINE/mail）、行程需求卡、特殊需求提示、複製需求摘要、進度 radio（開啟自動 new→pending_reply；點目前狀態不送 PATCH）、複製 LINE 回覆（自動 pending_reply→replied） |
| `/midao2/calendar` | 月導覽＋月格點色（🟠 待確認/🟢 已確認/可接案色條）、當日明細（含站內訂單）、三時段開關（PUT 單鍵 body）、自訂時段新增/刪除、週預設 modal |
| `/midao2/services`＋`/new`＋`/[id]/edit` | 已上架/草稿分頁、服務卡（封面/時長人數/價格/成交方式）；三步精靈（基本資料必填擋步→需求問題→預覽發布）；封面照片壓縮上傳；create 模式草稿/發布二選一、edit 模式儲存變更 |
| `/midao2/me` | 導遊名片、QR、分享連結、年資編輯（`profile-extras` API） |
| `/g/[slug]`（公開接案頁，RSC） | hero＋資訊列＋精選服務卡＋旅客需求表單；slug 不存在→`notFound()` |
| 登入動線 | `/guide/login` 登入成功預設導向 `/midao2`；`next` 白名單含 `/midao2`；舊後台保留互連入口 |

### 測試證據摘要

- **單元/contract**（`.claude/hooks/run-checks.sh --typecheck`）：`midao-copy-templates`、`midao-calendar-grid`、`db-midao-showcase`、`midao2-layout-contract`、`midao2-pages-contract`、`v2-midao-guide-requests-contract`、`v2-midao-public-contract` 共 **32 tests 全綠**；整包 `tsc --noEmit` 乾淨。
- **守門測試**：`db-mjs-size-guard`＋`issue1407-legacy-retirement-residue-guard` 共 **9 tests 全綠**（凍結區/strangler 天花板未破）。
- **E2E**（`npm run test:e2e -w @tour/web -- midao2-backend-flow.spec.ts midao2-public-request.spec.ts`）：**5/5 PASS**——首頁統計卡/需要你處理/底部導覽、需求列表→詳情自動轉待回覆＋radio 更新、行事曆時段開關 PUT、服務列表與精靈第一步驗證、公開頁不存在 slug 顯示 404（soft-404，見下）。
- **lint**：僅既有 1 個 warning（`RootDocument.tsx` 的 `no-head-element`，與本輪無關），0 新增 error。

### 過程中發現並修正的真實 UI/框架 bug

撰寫 `midao2-public-request.spec.ts` 時發現 `/g/[slug]` 對不存在 slug 呼叫 `notFound()` 後，本機 `next dev` 與 `next build && next start`（皆已實測）回傳的 HTTP 狀態碼恆為 **200**（非 404），但頁面內容與 `<meta name="robots" content="noindex">` 正確。追查後定位為專案既有、非本任務新增邏輯造成的框架層限制：

1. **(non-locale) route group 缺 `not-found.tsx`**：Next.js「多重 root layout」規則要求每個頂層 route group 各自要有 `not-found.tsx`，否則 dev 模式下該群組其他頁面觸發 notFound() 時會噴 500（`not-found.tsx doesn't have a root layout`，已在 dev log 重現）。已新增 `apps/web/app/(non-locale)/not-found.tsx`（re-export 頂層 `app/not-found.tsx` 的內容/metadata，不重複維護文案）。
2. **`/g/[slug]` 的 `generateMetadata` 未與頁面元件同步呼叫 `notFound()`**：導致 slug 不存在時仍以通用標題「Midao 接案頁」＋無 noindex 對外呈現（頁面元件的 notFound() 另外觸發，但 metadata 階段已算「正常」）。已補上一致的 `if (!page) notFound();`，現在正確顯示「找不到頁面 | Midao 祕島」標題＋noindex。
3. **HTTP 狀態碼仍是 200 的部分未能在本環境修復**：確認同一 (non-locale) 群組下既有的 `/guides/[slug]/shop`（notFound 用法相同）也有同樣現象——是 Next.js 15 streaming SSR 已知限制（root layout 含 Suspense 邊界如 Analytics/SpeedInsights，一旦開始 flush shell 就無法回頭改寫狀態碼），非本任務新增邏輯所致，也非 middleware rewrite 造成的 soft-404（`/g/[slug]` 根本不在 middleware matcher 內）。E2E 已依專案既有慣例（`issue1595-hidden-locale-guard.spec.ts` 的 soft-404 驗法）改以「內容＋noindex」斷言，不依賴狀態碼；實際 Vercel 部署是否正確回傳 404 列入下方「部署驗收清單」人工複驗（Vercel 邊緣層對此已知 Next.js 議題的處理可能與本機 `next start` 不同）。

以上兩項修正皆為新增/獨立檔案或最小侵入的既有檔案調整，未觸碰凍結區、未動 `middleware.ts`。

---

## Plan 3：方案輕量入接案頁＋行程單一來源＋管理員打通（2026-07-23／24）

計畫檔：`docs/superpowers/plans/2026-07-23-midao2-plans-admin.md`。六個任務全數完成並逐一經審查者核可（進度細節見 `.superpowers/sdd/progress.md`）：

1. **Migration C**（`20260723090000_midao2_request_plan_columns.sql`）：`midao_requests` 加 `plan_id`（FK→`activity_plans`，ON DELETE SET NULL）＋`plan_title_snapshot`。**已於 2026-07-24 經使用者 SQL-OVERRIDE 授權套用生產**（information_schema 驗證兩欄存在），ledger verified 記錄已入 `docs/operations/migration-ledger.json`（commit c9ad840），CI migration gate 綠燈。三個 midao2 migrations 至此全數套用生產。
2. **方案輕量入接案頁**：`planOptions`（active 方案：null/'active' 視為啟用、archived 排除）與 `priceFromTwd`（active 方案最低 basePrice>0，無方案 fallback `price_twd`）進服務形；公開表單「選擇方案」radio 膠囊（可不選）；route 驗證 planId 歸屬（`INVALID_PLAN`）並以伺服器端方案名快照入單；需求詳情與複製文案顯示 `服務：{行程}（{方案}）`。
3. **行程單一來源（行為驗證，非新碼)**：管理後台編輯的行程與 midao2 共用同一張 `activities` 表，`midao_status IS NULL` 時跟隨主站 `status`——管理端改動自動反映到 midao2 商店；導遊自建行程 `midao_status` 獨立控制、保留「發佈到祕島」送審通道。此行為由既有雙軌可見度測試鎖定。
4. **管理員代入 midao2**：admin 導遊詳情頁新增「進入 midao2 後台」（同一支 impersonate API），midao2 端讀 `guide_impersonation` cookie 顯示紫色橫幅＋「結束代入」（DELETE session→清 cookie→回 `/admin/guides`）。既有「進入導遊後台」行為零改動（regression-lock 測試 16/16）。
5. **管理員跨導遊需求單唯讀視圖**：`/admin/midao-requests`（AdminShell 導覽「midao2 需求單」）＋`GET /api/v2/admin/midao/requests?status=`（auth 由 middleware `/api/v2/admin/:path*` 統一把關，route 零 auth 碼，比照既有 v2 admin 前例）；狀態下拉五檔（closed 合併已成交/已完成，卡片狀態章仍分色）。**假設：唯讀即可**（不提供 admin 改狀態），如需操作另開任務。已知限制：limit=100 無分頁、滿百筆無截斷提示（冷啟動可接受）。
6. **全面驗證**：midao 全套 14 測試檔＋守門測試 106/106、`tsc --noEmit` 乾淨、lint 0 errors、E2E `midao2-backend-flow` 4/4＋`midao2-public-request` 1/1。E2E 曾揭露 mock 缺 `priceFromTwd` 令服務列表崩潰——依計畫修 UI 防禦（`priceFromTwd ?? priceTwd` fallback、`planOptions ?? []`），commit c44bced。

---

## 部署驗收清單（使用者部署測試後才進生產）

以下七項需在實際部署環境（非本機 dev/prod 模擬）由使用者人工過，逐項在 QA 報告記錄證據（URL、SHA、Asia/Taipei 時間）：

0. **【前置・已完成】生產套用三個 midao2 migrations**（`20260722100000_midao2_requests_availability.sql`、`20260722100500_midao2_activity_showcase_columns.sql`、`20260723090000_midao2_request_plan_columns.sql`）——均已經 `SQL-OVERRIDE` 授權套用生產並補 ledger verified 記錄，前置條件已滿足。另：驗收送單推播前，測試導遊帳號需已完成 LINE 綁定（`guide_line_mapping`），否則推播 fire-and-forget 靜默略過屬預期行為。

1. **登入導向**：以真實導遊帳號登入 `/guide/login`，確認成功後預設導向 `/midao2`（非舊後台）。
2. **六畫面照截圖走查**：`/midao2`（首頁）、`/midao2/requests`、`/midao2/requests/[id]`、`/midao2/calendar`、`/midao2/services`（含 `/new`、`/[id]/edit`）、`/midao2/me`——逐頁對照原始設計截圖確認版面/文案/互動一致。
3. **`/g/[slug]` 真實送單→LINE 通知→後台出現**：以真實 slug 開啟接案頁、送出旅客需求表單，確認（a）表單送出成功畫面、（b）導遊 LINE 收到推播通知、（c）`/midao2/requests` 列表與 `/midao2`首頁「需要你處理」正確出現該筆新需求。**另請一併確認 `/g/[slug]` 對不存在 slug 的 HTTP 狀態碼**（本機環境觀察到 soft-404＝200，需確認 Vercel 實際部署是否回傳真 404；若仍是 200，屬已知框架限制不阻擋上線，但需記錄供之後追蹤）。
4. **精靈建服務＋封面上傳**：`/midao2/services/new` 走完三步精靈（含封面照片實際上傳），確認建立成功、封面顯示正確、草稿/發布狀態符合預期。
5. **發佈到祕島送審出現在管理後台**：精靈或編輯頁選擇「發布到接案頁」／「發佈到祕島」後，確認服務出現在既有管理後台（`/admin`）的待審/服務列表中，審核流程未受影響。
6. **維護模式下 `/g/[slug]` 行為確認**：觸發 `soft_launch_controls.public_paused`，確認 `/g/[slug]` 的行為符合預期（是否也導向 `/maintenance`，或因不在 middleware matcher 內而不受影響）——若後者，需使用者確認是否為期望行為，非期望則另開任務調整 matcher（**不可在本任務內順手修改 middleware.ts**，屬凍結區）。
7. **登出狀態直開 `/midao2`**：未登入狀態直開 `/midao2` → 應導轉登入頁，登入後回跳 `/midao2`。
8. **行動裝置分享**：`navigator.share` 與 QR 下載在行動裝置（HTTPS）實測；桌機分享應 fallback 複製網址。
9. **維護模式下 `/midao2` 與 `/g/[slug]` 行為**：維護模式（`public_paused`）下確認 `/midao2` 與 `/g/[slug]` 行為（兩者皆不在 middleware matcher 內，預期不受 kill-switch 影響——確認此行為符合營運預期）。
10. **行動 Safari 安全區域**：行動 Safari 底部 tab bar safe-area 顯示正常。
11. **【Plan 3】選方案送單**：在有 active 方案的服務上開 `/g/[slug]`，確認（a）服務卡價格顯示「NT$方案最低價 起」、（b）表單出現「選擇方案」膠囊列（含「先不指定」）、（c）選定方案送單後 `/midao2/requests/[id]` 與複製文案顯示 `服務：{行程}（{方案}）`、（d）帶偽造 planId 的請求被 400 `INVALID_PLAN` 拒絕。
12. **【Plan 3】管理員代入 midao2**：管理後台導遊詳情頁點「進入 midao2 後台」→ 進入該導遊 `/midao2` 且頂端出現紫色「代入中」橫幅；點「結束代入」→ 導遊 session 清除、回到 `/admin/guides`，且再開 `/midao2` 會被導去登入。
13. **【Plan 3】管理員需求單視圖**：`/admin/midao-requests`（導覽「midao2 需求單」）列出跨導遊需求單（含導遊名、服務含方案、狀態章），狀態下拉切換過濾正常；確認頁面純唯讀（無操作按鈕）。
