# midao2 導遊後台（接案 CRM）設計文件

- 日期：2026-07-22（Asia/Taipei）
- 狀態：使用者已逐段核可（商業模式、六項關鍵決策、§1 資料模型修正版、§2 API 契約、§3 安全/通知/測試）
- 依據：使用者提供之 7 張手機版 UI 截圖（6 個不同畫面）＋現有導遊後台盤點
- 下一步：以 writing-plans 拆解為實作計畫

---

## 1. 背景與目標

Tour Platform（Midao／祕島）現有導遊後台是「站內預約＋ECPay 金流」導向。本案在其基礎上新增 **midao2 後台**：一套「接案型 CRM」，讓導遊：

1. 分享個人**公開接案頁**（含 QR Code）給旅客；
2. 旅客在接案頁瀏覽服務、**填需求單送出**（不需登入、不經平台金流）；
3. 導遊在 midao2 後台收需求、**在 LINE 上與旅客成交**（平台提供複製用回覆範本），手動更新狀態（確認中→已成交→結束案件）；
4. 行事曆以「日期×時段（上午/下午/晚上/自訂）」管理可接案時間。

進入 midao2 後的 UI 以截圖為準：五格底部導覽（首頁／需求／行事曆／服務／我的頁面），手機優先。

## 2. 已拍板的關鍵決策

| # | 議題 | 決策 |
|---|---|---|
| 1 | 旅客端範圍 | 本次**含**旅客端：新建公開接案頁＋需求單表單（新路由 `/g/[slug]`） |
| 2 | 新舊後台關係 | 並存；**midao2 為登入後主入口**（登入成功導向 `/midao2`），舊後台 `/guide/**` 保留、由 midao2「我的頁面」連回 |
| 3 | 成交方式 | 三種（可直接預約／先確認日期與需求／LINE 詢問）**全走同一套輕量需求單，無金流** |
| 4 | 上架審核 | 接案頁可見度由**導遊自行上架**，無需管理員審核（管理員保留事後下架能力） |
| 5 | 行事曆 | **獨立輕量可用時間表**（日期×時段），不動 availability-v2；行事曆**唯讀疊加**既有站內訂單防撞期 |
| 6 | LINE 深度 | 剪貼簿為主（複製需求摘要／LINE 回覆範本）＋**新需求 LINE 推播通知導遊**（重用既有綁定，fire-and-forget） |
| 7 | 服務定義 | **服務＝既有行程（activities）**，不另開服務新表 |
| 8 | 雙軌可見度 | 接案頁可見度（導遊自行上/下架）與主站市集可見度（既有送審流程）**分軌**；精靈建立的行程保留「發佈到祕島」按鈕走既有送審 |

架構方案：採**方案 A（獨立 midao2 模組）**——新 route 樹＋新 API 命名空間＋獨立領域資料檔，與既有 18 頁導遊後台互不干擾，凍結區零接觸。

## 3. 截圖 → 功能對映（6 畫面）

| 畫面 | 主要物件與行為 |
|---|---|
| 首頁（今日接案） | 問候語＋名字；統計卡「N 筆新需求／N 筆待回覆」（點擊跳需求頁對應分頁）；「需要你處理」最急迫需求卡（查看需求→詳情；複製回覆→組字進剪貼簿）；最近進度清單；分享接案頁 CTA |
| 旅客需求（列表） | 分頁：全部／新需求／待回覆／已回覆／已完成（帶數字）；排序「未回覆優先」；需求卡＝稱呼＋狀態章＋服務名＋日期・人數・語言 |
| 需求詳情 | 編號 `#R20260815001`；LINE／Email icon（開 line.me／mailto 或複製）；行程需求卡（服務/日期含備用/人數含註記/語言/接送）；特殊需求提示框；複製需求摘要；更新進度 radio（確認中/已成交/結束案件）；複製 LINE 回覆主 CTA |
| 行事曆 | 「設定可用時間」＝週預設編輯；月曆三色圖例（待確認橘點/已確認綠點/可接案藍條）；當日明細（案件卡＋上午/下午/晚上三格開關＋自訂時段） |
| 我的服務＋新增服務精靈 | 分頁已上架/草稿；服務卡（封面/狀態/名稱/時長/人數/NT$X 起/成交方式註記/編輯）；三步精靈：①基本資料（模板/名稱/一句話介紹 60 字/封面/時長/人數/區域/語言/參考價格/成交方式三選一）→②需求問題（自訂旅客要回答的問題）→③預覽發布 |
| 我的接案頁 | 名片管理視圖（頭像橫幅/稱號/語言 chips/服務區域/導覽經驗年資/精選服務）；分享接案頁/預覽/複製網址/下載 QR Code |

## 4. 資料模型

### 4.1 `activities` 加欄位（新時間戳 migration；只增不改）

| 新欄位 | 型別 | 用途 |
|---|---|---|
| `midao_status` | text CHECK (`'draft'`/`'published'`)，可 NULL | 接案頁可見度軌。**NULL＝跟隨主站 `status`**（主站 published 自動視為接案頁已上架）；導遊在 midao2 手動上/下架時寫明確值，可與主站狀態互相獨立 |
| `midao_deal_mode` | text CHECK (`'instant_booking'`/`'confirm_first'`/`'line_inquiry'`)，預設 `'confirm_first'` | 成交方式 |
| `midao_questions` | jsonb 預設 `[]` | 自訂需求問題：`[{id, label, type: 'text'\|'single_choice'\|'multi_choice'\|'yes_no', options[], required}]` |
| `languages` | jsonb 預設 `[]` | 導覽語言（行程級） |
| `midao_sort_order` | integer，可 NULL | 接案頁精選服務排序（NULL→依 created_at） |

精靈欄位對映既有欄位：服務名稱→`title`、一句話介紹→`tagline`、封面→`cover_image_url`、服務時間→`duration_minutes`、適合人數→`min_participants`/`max_participants`、服務區域→`region`、參考價格→`price_twd`；`slug` 由標題自動產生（衝突加隨機尾碼）。服務模板只做前端預填，不落欄位。

**雙軌可見度規則**：
- 接案頁可見 ＝ `midao_status='published'` OR（`midao_status IS NULL` AND `status='published'`）。
- 主站市集只看既有 `status`（審核流不變）。精靈建立的行程 `status='draft'`。
- 「發佈到祕島」按鈕呼叫既有 `POST /api/guide/activities/[id]/submit` 進審核，midao2 不新做審核流。
- 服務列表顯示該導遊所有非 archived 行程；「已上架」分頁＝接案頁可見者，其餘入「草稿」。

### 4.2 `midao_requests`（旅客需求單；新表）

| 欄位 | 說明 |
|---|---|
| `id` uuid PK | — |
| `request_no` text UNIQUE | `R`+YYYYMMDD+3 位流水（`R20260815001`）；unique violation 重試 +1，3 次後尾碼隨機 |
| `guide_id` uuid → guide_profiles | 必填，所有查詢強制過濾 |
| `activity_id` uuid → activities（可 NULL）＋`activity_title_snapshot` text | 服務改名/下架不影響歷史單 |
| `traveler_name` text | 稱呼 |
| `traveler_line_id` / `traveler_email` text 可 NULL | **至少一種**（API 層驗證） |
| `preferred_date` date / `backup_date` date NULL | 含備用日期 |
| `preferred_period` text NULL（morning/afternoon/evening）/ `start_time` / `end_time` time NULL | instant_booking 型帶具體起訖 |
| `participants_count` int / `participants_note` text | 「4 位」＋「含 1 位 8 歲兒童」 |
| `language` text / `need_pickup` boolean / `special_note` text（≤500） | — |
| `answers` jsonb | `[{question_id, label, answer}]`（label 快照） |
| `status` text | 狀態機見 4.3 |
| `source` text（`public_page`/`manual`） | 保留導遊手動建單空間 |
| `created_at` / `updated_at` / `status_changed_at` | — |

索引：`(guide_id, status)`、`(guide_id, preferred_date)`。

### 4.3 需求單狀態機

```
new(新需求) → pending_reply(待回覆) → replied(確認中/已回覆) → closed_won(已成交) → closed_done(結束案件)
                                              ↘ closed_done（直接結案）
```

- `new → pending_reply`：導遊首次打開詳情頁時由前端明確 PATCH（不用 GET 偷改）。
- `pending_reply → replied`：按「複製 LINE 回覆」自動帶轉，或 radio 手動設「確認中」。
- 詳情頁 radio 對映：確認中=`replied`、已成交=`closed_won`、結束案件=`closed_done`。
- 列表分頁對映：新需求=`new`、待回覆=`pending_reply`、已回覆=`replied`、已完成=`closed_won`+`closed_done`。
- 允許回退（後端驗證合法轉換集合）；每次變更寫 `status_changed_at`。

### 4.4 可用時間（新表 ×2）

- **`midao_availability_defaults`**：`guide_id, weekday(0-6), period('morning'/'afternoon'/'evening'), is_open`，UNIQUE(guide_id, weekday, period)——「設定可用時間」的週模式。
- **`midao_day_overrides`**：`guide_id, date, period('morning'/'afternoon'/'evening'/'custom'), is_open, custom_start, custom_end`，UNIQUE(guide_id, date, period)（custom 除外）——當日三格開關與自訂時段。
- **生效邏輯**：單日覆寫 > 週預設 > 預設關閉。月曆「可接案」藍條＝當日任一時段生效開放。
- **月曆點色對映**：橘點「待確認」＝當日有未結案需求單（`new`/`pending_reply`/`replied`）；綠點「已確認」＝當日有 `closed_won` 需求單或疊加的既有站內 confirmed 訂單。

### 4.5 `guide_profiles.experience_years`（加欄 migration）

接案頁「導覽經驗 N 年」。接案頁公開條件：導遊 `verification_status='approved'` 且 ≥1 接案頁可見服務；**不加獨立公開開關欄位**（YAGNI，之後有需要再加）。

### 4.6 領域資料檔（strangler 規則：不碰 `db.mjs`）

- `src/lib/db-midao-requests.mjs`：需求單 CRUD、狀態轉換、request_no 產生、summary 統計。
- `src/lib/db-midao-availability.mjs`：週預設/單日覆寫讀寫、月生效展開。
- `src/lib/db-midao-showcase.mjs`：服務列表/可見度矩陣/精靈建立與編輯（讀寫 activities 的 midao 欄位）、公開接案頁查詢。

三檔皆含 in-memory fallback（`hasSupabaseEnv()` seam），配契約測試。

## 5. API 契約

### 5.1 共通規範

- 導遊端 `app/api/v2/guide/midao/**`：`verifyGuideSession(req)` 必過；mutation 加 `validateCsrf`。
- 公開端 `app/api/v2/public/midao/**`：無登入；送單 rate-limit＋honeypot。
- 回應：`{ ok: true, data }` / `{ ok: false, error: { code, message } }`；錯誤碼英文、message 繁中。

### 5.2 導遊端（10 支）

| # | Method 路徑 | 用途 | 請求/回應重點 |
|---|---|---|---|
| 1 | `GET /api/v2/guide/midao/summary` | 首頁 | 回 `{ guideName, counts:{newRequests,pendingReply}, topRequest, recentRequests[] }` |
| 2 | `GET /api/v2/guide/midao/requests` | 需求列表 | query：`status=all\|new\|pending_reply\|replied\|closed`、`sort=unreplied_first\|newest`；回 `{ items[], tabCounts }` |
| 3 | `GET /api/v2/guide/midao/requests/[id]` | 需求詳情 | 回完整需求單（含 answers、聯絡方式、snapshot） |
| 4 | `PATCH /api/v2/guide/midao/requests/[id]` | 狀態更新 | 入 `{ status }`；後端驗證合法轉換；回更新後需求單 |
| 5 | `GET /api/v2/guide/midao/services` | 服務列表 | 回 `{ items:[{activityId,title,tagline,coverImageUrl,durationMinutes,minP,maxP,priceTwd,dealMode,showcasePublished,mainSiteStatus}] }` |
| 6 | `POST /api/v2/guide/midao/services` | 精靈建立 | 入精靈全欄位＋`publish` 旗標；建 activity（`status='draft'`＋`midao_status`） |
| 7 | `PATCH /api/v2/guide/midao/services/[activityId]` | 編輯/上下架 | 同欄位＋`midaoStatus`；封面上傳重用既有 `POST /api/guide/activities/[id]/upload-image`；「發佈到祕島」打既有 submit API |
| 8 | `GET /api/v2/guide/midao/calendar?month=YYYY-MM` | 行事曆 | 回 `{ days:[{date, availability, requestDots[], items:[{type:'midao_request'\|'booking',...}]}] }`；booking 項為既有 bookings 唯讀疊加 |
| 9 | `GET/PUT /api/v2/guide/midao/availability/defaults` | 週預設 | `{ weekdays:[{weekday, morning, afternoon, evening}] }` |
| 10 | `PUT /api/v2/guide/midao/availability/days/[date]` | 單日覆寫 | `{ morning?, afternoon?, evening?, custom?:[{start,end,isOpen}] }` upsert |

「複製需求摘要」「複製 LINE 回覆」由前端以詳情資料組字，不開 API。

### 5.3 公開端（3 支）

| # | Method 路徑 | 用途 | 重點 |
|---|---|---|---|
| 11 | `GET /api/v2/public/midao/guides/[slug]` | 接案頁資料 | 回 guide 名片＋接案頁可見服務（含 questions）；未達公開條件回 404（不洩漏導遊存在與否） |
| 12 | `GET /api/v2/public/midao/guides/[slug]/availability?month=` | 可選日期 | 回 `{ days:[{date, openPeriods[]}] }`；v1 不做需求單自動鎖檔 |
| 13 | `POST /api/v2/public/midao/guides/[slug]/requests` | 送需求單 | 入含 honeypot 欄位 `website`；驗證聯絡方式至少一、activityId 歸屬與可見；rate-limit IP 5 次/分；成功產生 requestNo→寫入→fire-and-forget LINE 推播導遊→回 `{ requestNo }` |

### 5.4 頁面 → API 對映

| Route | 串接 |
|---|---|
| `/midao2` | #1；查看需求→詳情；複製回覆→前端組字；分享接案頁→`/midao2/page` |
| `/midao2/requests` | #2（tab/排序＝query） |
| `/midao2/requests/[id]` | #3＋#4；LINE icon→`https://line.me/R/ti/p/~{lineId}` 或複製；Email→`mailto:` |
| `/midao2/calendar` | #8＋#9＋#10；「設定可用時間」＝週預設 modal |
| `/midao2/services` | #5 |
| `/midao2/services/new` | #6；封面上傳沿用既有 API |
| `/midao2/services/[id]/edit` | #7＋「發佈到祕島」→既有 submit API |
| `/midao2/page` | #11 預覽自己＋`qrcode.react` 產 QR（既有依賴）＋複製 `https://{host}/g/{slug}` |
| `/g/[slug]`（公開） | #11＋#12＋#13；送單成功顯示 requestNo 確認頁 |

### 5.5 Layout 與動線

- `app/(non-locale)/midao2/layout.tsx`：五格底部 tab bar（首頁/需求/行事曆/服務/我的頁面），照 `guide/layout.tsx` 的 safe-area 手法重寫、手機優先、inline-style（與 codebase 一致，不引入 UI framework/Tailwind）。
- 未登入訪問 `/midao2/**` → redirect `/guide/login?next=/midao2`。
- 登入成功 redirect 改為 `/midao2`；midao2「我的頁面」提供「切回傳統後台」連結（`/guide/dashboard`）、個人資料編輯（含 `experience_years`，重用既有 profile API）、登出。
- 導遊後台文案硬編繁中（與既有後台一致）；公開接案頁 v1 亦為繁中（英文版列為後續）。

## 6. 安全

- 導遊端全走 `verifyGuideSession`＋CSRF 雙提交；所有查詢強制 `guide_id = session.guideId`（防越權）。
- 公開送單：IP rate-limit（`rate-limit-distributed`，5 次/分）＋honeypot＋欄位長度上限（specialNote ≤500、answers ≤10KB）。
- 公開 API 不回傳導遊私人資料（Email、LINE 綁定、銀行資訊等）。
- PII：需求單聯絡方式僅導遊本人 session 可讀；log/Sentry 不落 lineId/email。
- 凍結區零接觸：不改 `middleware.ts`。soft-launch 維護模式會一併擋 `/g/[slug]`（fail-safe）；若日後需豁免，另走 P0-OVERRIDE 流程。

## 7. LINE 通知

送單成功後 fire-and-forget：查 `guide_line_mapping`，有綁定即推播「🔔 新需求 #R…：{稱呼}・{服務}・{日期}・{人數}，開啟後台查看」；無綁定或失敗不影響送單，只記 log。重用既有 messaging-bindings 基礎設施，不新增 webhook。

## 8. 錯誤處理

- 公開頁 slug 不存在/未公開 → 404（同一種 404，不洩漏資訊）。
- 送單失敗顯示可重試錯誤、不清空表單。
- `request_no` 衝突重試策略見 4.2。
- 行事曆 bookings 疊加查詢失敗 → degrade 只顯示 midao 資料＋提示，不整頁掛掉。

## 9. 測試策略（鐵律 5）

- **契約/單元**（`node --test`、in-memory fallback 雙軌）：
  - `db-midao-requests`：狀態機合法/非法轉換、request_no 產生與衝突重試、summary 統計。
  - `db-midao-availability`：覆寫>預設>關閉生效矩陣、月展開。
  - `db-midao-showcase`：雙軌可見度規則矩陣（midao_status × status 全組合）。
- **API 測試**：13 支各覆蓋 happy path＋未登入 401＋越權 404/403＋公開送單驗證（缺聯絡方式/honeypot/rate-limit/activity 歸屬）。
- **E2E**（`issueNNNN-midao2-*.spec.ts`；不動受保護 spec）：
  1. 旅客 `/g/[slug]` 送單 → 後台列表出現 → 開詳情自動轉待回覆 → 複製 LINE 回覆轉確認中 → 標已成交 → 行事曆綠點。
  2. 精靈三步建服務 → 接案頁出現；下架 → 消失。
  3. 行事曆開關時段 → 公開頁可選日期同步。
- 流程：開 PR → CI 綠燈 → merge → 逐條 AC → QA 報告入 `docs/operations/qa-reports/`。

## 10. 明確不在本次範圍（YAGNI）

- 站內金流/抽成、站內聊天、LINE 官方帳號自動回覆旅客、需求單自動鎖檔期、接案頁獨立公開開關、公開頁英文版、管理員 midao2 專屬審核後台（管理員沿用既有工具事後下架）、旅客帳號體系（送單免登入）。

## 11. 里程碑切分建議（供 writing-plans 展開)

1. **M1 資料層**：2 個 migration＋3 個領域檔＋契約測試。
2. **M2 導遊端 API**：#1–#10＋API 測試。
3. **M3 公開端 API**：#11–#13＋LINE 推播＋API 測試。
4. **M4 midao2 UI**：layout＋五大頁＋精靈（串 M2）。
5. **M5 公開接案頁 UI**：`/g/[slug]`＋需求表單（串 M3）。
6. **M6 動線收尾**：登入導向、切回舊後台、E2E、QA 報告。
