# Midao 新導遊後台設計

> 日期：2026-07-22（Asia/Taipei）
> 設計基準：`origin/main af3963cb48afdf246035bbf746694c7de18cc2ed`
> 狀態：使用者已分段批准；implementation review 修訂中（Epic #1755）
> 範圍：新 `/midao` 導遊後台、LINE inquiry、服務直接發布、全域行事曆、公開接案頁整合
> 不在本文件執行：產品程式、migration 套用、production mutation、入口切換

## 1. 目標

建立獨立的 Midao 導遊後台 `/midao`，在手機 390 × 844 viewport 內對齊七張參考截圖的資訊架構、卡片、導覽與操作節奏；桌面使用同一資訊架構的雙欄／三欄響應式版。

新後台必須串接並保留既有導遊台能力，包括 guide session、活動與方案、預約類型、Booking V2、availability、訂單、付款、訊息、核銷、評論、結算、管理員代入及公開導遊頁。新 UI 不得建立第二套 activities、plans、bookings、orders 或 effective availability 真實來源。

品牌呈現採「參考圖版型＋祕島 Brand Book」：

- 山墨 `#1A2E1F`：主要文字、主按鈕與 active navigation。
- 古紙 `#F4ECD8`／米紙 `#EBE1C7`：頁面與次背景。
- 朝霞 `#C2542E`：待處理、期限與警示，不作大面積主色。
- 苔綠 `#5E7A4F`：確認、可接案與成功狀態。
- 標題依 Brand Book 使用 Noto Serif TC；操作文字保持可讀性與一致層級。

### 1.1 固定視覺參考資產

七張 user-provided reference 固定保存在 repo；產品 runtime 不載入這些圖片：

```text
docs/superpowers/assets/midao-reference/01-home.jpg
docs/superpowers/assets/midao-reference/02-requests.jpg
docs/superpowers/assets/midao-reference/03-request-detail.jpg
docs/superpowers/assets/midao-reference/04-calendar.jpg
docs/superpowers/assets/midao-reference/05-services.jpg
docs/superpowers/assets/midao-reference/06-service-wizard.jpg
docs/superpowers/assets/midao-reference/07-public-page.jpg
```

## 2. 已批准的產品決策

1. 「旅客需求」主體沿用既有 `request` booking：旅客先選服務、日期與人數，導遊批准後旅客付款。
2. 保留 repo 三種 `activity_plans.booking_type`：
   - `scheduled`：依固定場次預約。
   - `request`：需導遊確認。
   - `instant`：即時確認。
3. 新增 `LINE inquiry`。它不是第四種正式 booking 狀態，而是服務可選的成交入口；旅客登入後建立可追蹤 inquiry，再開啟 LINE。
4. 導遊可在 inquiry 詳情補齊方案、日期、時段、人數與報價，建立 `request` booking，產生 24 小時旅客確認連結，再貼回 LINE。
5. 旅客必須登入 Midao 帳號才能建立 inquiry；接受確認連結時必須是同一帳號。
6. 行事曆提供導遊全域可接案時段，適用所有 `instant/request` 方案；方案可繼承、限制或關閉。`scheduled` 只使用固定場次。
7. 快捷時段：上午 08:00–12:00、下午 12:00–18:00、晚上 18:00–22:00；另可新增自訂時段。
8. 手機底部固定五項：首頁、需求、行事曆、服務、我的頁面。其他既有功能集中於「我的頁面」。
9. 公開接案頁 canonical URL 為 `/guides/[slug]`；整合導遊介紹與可預約服務。舊 `/guides/[slug]/shop` 在穩定後永久轉址。
10. 每項服務可設定自訂問題：單選、多選、短答、長答、必填與排序。
11. 新服務不需管理員事前審核；新建及後續修改由導遊直接發布。管理員保留稽核、下架、停權與版本復原能力。
12. 先建立獨立 `/midao` 後台，再按 guide 灰度切換；新舊 UI 可暫時並存，但不可對同一 guide 同時寫入相同領域。

## 3. 非目標

- 不建立公開需求池、多導遊投案、競價或媒合市場。
- 不抓取或保存 LINE 聊天內容。
- 不聲稱 LINE share 能自動開啟特定旅客聊天室。
- 不重寫既有 checkout、ECPay callback 或 payment reconciliation。
- 不讓前端自行計算 effective availability。
- 不在本期新增導遊 SaaS 訂閱方案。
- 不以 iPhone 外框、Dynamic Island 或參考圖的假系統狀態列作產品 UI 驗收。

## 4. 現況與需先收斂的技術債

目前最接近的既有頁面：

- `/guide/dashboard`
- `/guide/bookings`
- `/guide/availability`
- `/guide/schedules`
- `/guide/activities`
- `/guide/profile`
- `/guides/[slug]` 與 `/guides/[slug]/shop`

既有能力可沿用，但新架構必須先處理：

1. Guide API 混用 `/api/guide/**` 與 `/api/v2/guide/**`。
2. V2 response envelope 尚未完全收斂。
3. `/api/v2/guide/bookings/[bookingId]` 的詳情路由實際使用 `orders.id`，但 approval 路由使用真正 `bookings.id`；新 API 必須分離 `bookingId` 與 `orderId`。
4. request approval 目前對 booking、status log 與 order 的多段寫入不是單一 transaction。
5. guide availability preview 與 canonical effective resolver 對部分 season gate 的語意可能不同；新 calendar 不得再新增第三套判斷。
6. 新 DB gateway 必須放領域檔，不得擴張 `src/lib/db.mjs`。

## 5. 資訊架構與七張畫面

### 5.1 共用 App Shell

登入後入口：`/midao`。

底部主導航：

1. 首頁 → `/midao`
2. 需求 → `/midao/requests`
3. 行事曆 → `/midao/calendar`
4. 服務 → `/midao/services`
5. 我的頁面 → `/midao/me`

手機底部導航固定並支援 safe-area；桌面改為左側導覽。管理員代入 banner 位於 shell 最上方，所有子頁共享且不可隱藏。

### 5.2 首頁 `/midao`

對應參考圖「早安，Andy」。

物件與功能：

- `今日接案`：顯示台灣日期與今日摘要。
- `早安，{displayName}`：從 verified guide profile/session projection 取得。
- `新需求` counter：request bookings `guideApprovalStatus=pending` 加 inquiry `status=new`。
- `待回覆` counter：inquiry 或 order message `needsReply=true`。
- `需要你處理`：依序顯示即將逾期 request、未回覆 inquiry、旅客新訊息。
- `查看需求`：開啟獨立需求詳情 route。
- `複製回覆`：依案件狀態取得範本文案並複製。
- `最近進度`：最近三筆案件狀態與 deep link。
- `分享接案頁`：Web Share API；不支援時複製 canonical URL。

既有營收、結算、核銷與完整報表不放手機首屏，移至 `/midao/me`。

### 5.3 需求列表 `/midao/requests`

頁籤：全部、新需求、待回覆、已回覆、已完成。

狀態映射：

- 新需求：request pending approval；inquiry new。
- 待回覆：inquiry/message `needsReply=true`。
- 已回覆：request 已批准等待付款；inquiry 已回覆未轉單。
- 已完成：已成交完成，或取消／婉拒／失效。UI 使用次狀態區分，不把成功與取消塗成同色。

列表卡顯示：旅客稱呼、狀態、服務、主日期、備用日期、人數、語言、收件時間、回覆期限。預設未回覆優先，可切換最近更新或服務日期。

### 5.4 需求詳情 `/midao/requests/[requestRef]`

`requestRef` 是明確 discriminated reference：

- `booking_<uuid>`
- `inquiry_<uuid>`

畫面物件：

- 返回、標題、更多選單。
- 狀態與顯示編號。
- 旅客名稱。
- LINE／Email action。LINE 先複製文案，再嘗試開 share URL；不承諾定位聊天室。
- 行程需求卡：服務、日期、備用日期、人數、兒童、語言、接送、自訂答案、旅客備註。
- 需求提醒：只根據旅客實際提供的受傷、無障礙、飲食、兒童與裝備資訊產生。
- 複製需求摘要。
- request：批准／婉拒。
- inquiry：標記已回覆、補齊資料、轉 request booking。
- 複製 LINE 回覆。

不存在的欄位整列不顯示，不用假資料填版。

### 5.5 行事曆 `/midao/calendar`

物件：月份前後切換、今天、設定可用時間、狀態圖例、月格、當日 agenda、快捷時段、自訂時段。

狀態色：朝霞橘待確認、苔綠已確認、雲霧藍灰可接案、灰色不可用。

日期格顯示日期、案件點與可用時段摘要。點日期後顯示當日 request／booking、旅客、服務、時段與人數。

全域時段是預設；plan restriction、season、blackout、existing booking、external hold、buffer 依序套用。`scheduled` 不使用全域動態規則。

### 5.6 服務列表 `/midao/services`

物件：頁名、新增服務、已上架／草稿頁籤、服務數量、服務卡與編輯按鈕。

服務卡顯示封面、發布狀態、名稱、時長、人數、起價、計價單位與 booking type。價格、時長、人數以 `activity_plans` 為販售 SOT；多方案顯示最低價與範圍。

新 Midao 流程不使用管理員 review badge；既有歷史 review 狀態只在 migration/cutover 清理前作相容提示。

### 5.7 新增／編輯服務

Route：`/midao/services/new`、`/midao/services/[activityId]/edit`。

步驟 1「基本資料」：模板、名稱、60 字一句話、封面、服務時間、人數、地區、語言、參考價格與計價方式。正式 `booking_type` 仍只允許 `scheduled/request/instant`；`LINE inquiry` 是獨立的 `inquiry_enabled` 成交入口開關，不得寫入 `activity_plans.booking_type` enum。

步驟 2「需求問題」：單選、多選、短答、長答、必填、提示、選項與排序；固定日期／人數欄位不可重複建立為自訂題目。

步驟 3「預覽發布」：手機旅客視角預覽、缺漏檢查與直接發布。發布成功後才清除 draft 並回 public URL。後續修改同樣由導遊直接發布。

### 5.8 我的接案頁 `/midao/me/public-page`

後台管理畫面顯示：公開預覽、頭像／hero、姓名、標題、簡介、語言、服務區域、導覽經驗、精選服務、分享、預覽、複製網址、下載 QR Code。

公開 canonical `/guides/[slug]` 整合導遊介紹、published activities/plans 與 booking／LINE inquiry CTA。未發布 profile 匿名 404；本人使用 authenticated preview。

### 5.9 我的頁面 `/midao/me`

收納：公開接案頁、旅客訊息、場次管理、幫手確認、憑證核銷、評論回覆、營收與出款、通知綁定、帳號安全與登出。

## 6. 架構方案

採獨立 `/midao` UI 與 V2 façade，再灰度切換。新舊 UI 共用 canonical command/resolver；不得為 Midao 複製 booking/order/service/availability 儲存模型。

```text
/midao React UI
    ↓
/api/v2/guide/* + /api/v2/public/*
    ↓
resolver / command
    ↓
existing canonical tables + required additive tables
```

統一 API envelope：

```json
{ "success": true, "data": {}, "meta": {} }
```

```json
{ "success": false, "error": { "code": "...", "message": "...", "fieldErrors": {} } }
```

所有時間傳 ISO 8601，顯示與 calendar semantics 固定 `Asia/Taipei`。

## 7. 資料模型

### 7.1 `guide_inquiries`

主要欄位：

```text
id uuid PK
inquiry_no text UNIQUE
traveler_user_id uuid NOT NULL
guide_id uuid NOT NULL
activity_id uuid NOT NULL
activity_plan_id uuid NULL
status: new | opened | replied | ready_to_convert | converted | closed | expired
preferred_date date NULL
backup_date date NULL
start_time_local time NULL
party_size int NULL
language text NULL
pickup_required boolean NULL
traveler_note text NULL
questionnaire_snapshot jsonb NOT NULL
answers jsonb NOT NULL
last_replied_at timestamptz NULL
converted_booking_id uuid NULL UNIQUE
expires_at timestamptz NULL
created_at / updated_at
```

旅客與 guide ID 由 verified session／published service resolver 決定。`converted_booking_id UNIQUE` 防止重複轉單。

### 7.2 `guide_service_drafts`

```text
id uuid PK
guide_id uuid NOT NULL
activity_id uuid NULL
payload jsonb NOT NULL
revision int NOT NULL
last_step int NOT NULL
created_at / updated_at
```

PATCH 必須帶 `expectedRevision`；衝突回 `409 DRAFT_REVISION_CONFLICT`。

### 7.3 `activity_intake_questions`

```text
id uuid PK
activity_id uuid NOT NULL
question_key text NOT NULL
type: single_choice | multi_choice | short_text | long_text
label text NOT NULL
help_text text NULL
required boolean NOT NULL
options jsonb NOT NULL DEFAULT []
sort_order int NOT NULL
is_active boolean NOT NULL
created_at / updated_at
UNIQUE(activity_id, question_key)
```

每服務先限制最多 20 題。單／多選至少兩個選項；文字題不得帶 options。

### 7.4 `booking_intake_responses`

```text
booking_id uuid PK
questionnaire_snapshot jsonb NOT NULL
answers jsonb NOT NULL
created_at
```

動態答案不塞進 `bookings.customer_note`。

### 7.5 `booking_pricing_snapshots`

保存 inquiry 轉 booking 時由導遊提出、旅客將確認的不可變價格依據：

```text
booking_id uuid PK
source: plan_price | inquiry_quote
plan_base_price_twd int NOT NULL
quoted_total_twd int NOT NULL
currency text NOT NULL DEFAULT 'TWD'
party_size int NOT NULL
created_by_guide_id uuid NULL
created_at timestamptz NOT NULL
```

`inquiry_quote` 僅能由 inquiry conversion transaction 建立；checkout/order total 必須從此 server-side snapshot 取得，不接受 traveler request body 覆寫。

### 7.6 `service_publication_versions`

```text
id uuid PK
activity_id uuid NOT NULL
version int NOT NULL
snapshot jsonb NOT NULL
published_by_guide_id uuid NOT NULL
published_at timestamptz NOT NULL
source_draft_id uuid NULL
UNIQUE(activity_id, version)
```

每次直接發布建立 immutable audit snapshot，供管理員稽核與復原。

### 7.7 Booking inquiry 追溯與旅客確認

`bookings` 新增：

```text
source_inquiry_id uuid NULL UNIQUE
traveler_confirmation_status: not_required | pending | confirmed | expired
traveler_confirmation_expires_at timestamptz NULL
```

`booking_confirmation_tokens`：

```text
booking_id uuid UNIQUE
token_hash text UNIQUE
expires_at timestamptz
consumed_at timestamptz NULL
```

只保存 token hash。

### 7.8 Global availability

`guide_availability_rules` 新增明確 scope：

```text
scope_type: global | plan
global → activity_plan_id IS NULL
plan   → activity_plan_id IS NOT NULL
```

方案 policy：

```text
inherit  → 使用全域規則
restrict → 全域規則 ∩ 方案規則
closed   → 不開放動態預約
```

`activity_plans` 新增 `availability_policy` 欄位，enum/check constraint 僅允許 `inherit/restrict/closed`，預設 `inherit`。`scheduled` 方案忽略此欄位並只讀固定 `activity_schedules`。

解析順序：booking type → season → global → plan policy → blackout → booking conflict → external hold → buffer → effective slots。

### 7.9 Backend mode

`guide_profiles.backend_mode`：`legacy | midao`，預設 `legacy`。切換時必須同步 bump guide session version。既有 `guide_token` 三段格式 `guideId:sessionVersion:HMAC` 保持不變；`verifyGuideSession()` 額外回傳 token 內的 `sessionVersion`，Midao page/API guard 再讀 DB 的 canonical `backend_mode + guide_session_version` 並逐次比對，確保舊 session 真正失效。

### 7.10 Notification outbox

```text
id uuid PK
event_name text NOT NULL
aggregate_type text NOT NULL
aggregate_id uuid NOT NULL
payload jsonb NOT NULL
status: pending | processing | delivered | failed
attempt_count int NOT NULL DEFAULT 0
next_attempt_at timestamptz NOT NULL
last_error_code text NULL
created_at / delivered_at
```

payload 不保存不必要 PII；consumer 依 aggregate ID 在送信時重新取得最小通知投影。

### 7.11 Durable idempotency records

重大 mutation 使用 service-role-only `midao_idempotency_records`，不可只在記憶體保存：

```text
id uuid PK
actor_type: guide | admin | traveler | system
actor_id text NOT NULL
command_name text NOT NULL
idempotency_key text NOT NULL
request_hash text NOT NULL
response_status int NOT NULL
response_body jsonb NOT NULL
resource_type text NULL
resource_id uuid NULL
created_at timestamptz NOT NULL
expires_at timestamptz NOT NULL
UNIQUE(actor_type, actor_id, command_name, idempotency_key)
```

同 key＋同 request hash 回第一次 response snapshot；同 key＋不同 hash 回 `409 IDEMPOTENCY_KEY_REUSED`。Response snapshot 必須先去除 confirmation raw token、secret、cookie 與不必要 PII。

### 7.12 Transactional command audit

跨表 Midao commands 使用 service-role-only `midao_audit_events`，不可假設 production 才存在而 repo migration 缺席的 `audit_logs`：

```text
id uuid PK
actor_type: guide | admin | traveler | system
actor_id text NOT NULL
guide_id uuid NULL
action text NOT NULL
resource_type text NOT NULL
resource_id uuid NULL
request_id text NOT NULL
reason text NULL
metadata jsonb NOT NULL DEFAULT '{}'
created_at timestamptz NOT NULL
```

RLS enabled，anon/authenticated無直接讀寫權。Command RPC 在同一 transaction寫 business rows、audit event與outbox；metadata不存 cookie、token、付款資訊或完整旅客 PII。

## 8. API 設計

### 8.1 Home

`GET /api/v2/guide/home`

回 guide 摘要、`newRequests`、`needsReply`、優先案件與最近進度。resolver 合併 request bookings、inquiries、unread order messages 與 guide profile；不建 dashboard snapshot table。

### 8.2 Requests

`GET /api/v2/guide/requests?bucket=&sort=&cursor=&limit=20`

列表回 discriminated union，明列 `kind`、`requestRef`、`bookingId`、`orderId`、`inquiryId`。前端只用 `requestRef` 導航。

`GET /api/v2/guide/requests/{requestRef}` 回統一 projection：identity、traveler、service、request、status、allowedActions、alerts；不得回 `admin_note`。

### 8.3 Request decision

`POST /api/v2/guide/bookings/{bookingId}/commands/decide`

Body：`{ action: "approve" | "reject", note?: string }`。

單一 transaction compare-and-set pending 狀態，更新 booking/order/status log/outbox。重複決策回 `409 REQUEST_ALREADY_DECIDED`。

### 8.4 Inquiry

`POST /api/v2/public/guides/{slug}/inquiries`：要求 traveler session、CSRF、rate limit；驗 published service 與問卷。

`POST /api/v2/guide/inquiries/{inquiryId}/commands/mark-replied`。

`POST /api/v2/guide/inquiries/{inquiryId}/commands/convert`：接受 plan、start/end、party、quotedTotalTwd、guideNote、TTL。回同一 inquiry/booking、確認 URL、到期時間與 LINE 文案；命令必須冪等。

### 8.5 Reply template

`POST /api/v2/guide/requests/{requestRef}/reply-template` 回狀態化文案。client 複製後開 `https://line.me/R/share?text=...`。開 LINE 不自動標記已回覆。

### 8.6 Calendar

`GET /api/v2/guide/calendar?month=YYYY-MM` 回每日 availability segments、markers 與 agenda。

`PUT /api/v2/guide/calendar/days/{date}/availability` 接 segments、custom ranges、expectedRevision；transaction 替換該日 global single-day rules，回新 revision 與 effective preview。

### 8.7 Service drafts and publish

- `POST /api/v2/guide/service-drafts`
- `GET/PATCH/DELETE /api/v2/guide/service-drafts/{draftId}`
- `POST /api/v2/guide/service-drafts/{draftId}/commands/publish`
- `GET /api/v2/guide/services`

Publish transaction 驗證 payload、upsert canonical activity/plans/questions、寫 publication version、清除 draft、寫 outbox，commit 後 revalidate 公開頁。

### 8.8 Public guide and confirmation

`GET /api/v2/public/guides/{slug}` 只回公開投影。

`POST /api/v2/me/booking-confirmations/{token}/accept` 驗 traveler、token、availability 與 capacity；成功後 consume token、確認 booking，導向既有 checkout。

### 8.9 Admin publication recovery

`GET /api/v2/admin/activities/{activityId}/publication-versions`：列出可稽核版本，不回敏感 draft metadata。

`POST /api/v2/admin/activities/{activityId}/commands/restore-publication`：body `{ version: number, reason: string }`；以單一 transaction 將指定 snapshot 發布成一個新版本，不覆寫或刪除歷史版本。

## 9. Transaction、冪等與通知

以下必須是單一 DB transaction：request decision、inquiry conversion、confirmation accept、service publish、day availability replace、service version restore。

重大 mutation 使用 `Idempotency-Key`：同 key 同 body 回第一次結果；同 key 不同 body 回 `409 IDEMPOTENCY_KEY_REUSED`。

通知只在 commit 後透過 outbox fan-out：站內、Email、已綁定 LINE；Telegram保留導遊營運通知。通知失敗不回滾業務 transaction，改標示通知重試中。

## 10. 權限與安全

### Traveler

只能建立／讀自己的 inquiry、接受自己的確認連結與進付款；不能指定 traveler ID、修改導遊報價或讀他人資料。

### Guide

只能操作自己 guide ID 的 requests、inquiries、services 與 availability。所有 command 以 verified session guide ID 查 `resource.id AND resource.guide_id`；ownership 不符統一回 404。

### Admin impersonation

actor 必須區分 guide 與 admin impersonation。既有可見 `guide_impersonation=1` cookie 只負責 banner；另新增 HttpOnly、HMAC-signed actor cookie，payload 為 admin email、target guide ID、issued/expiry。Midao page/API guard 驗證後產生 `actorType=admin`，並把已驗證的 admin email 放入 `actorId`；一般登入為 `actorType=guide`。audit 保存 actor type/ID、guide ID、action、resource、request ID。登出必須清除兩顆 impersonation cookies，shell 永久顯示代入 banner。

### PII

列表只顯示稱呼與遮罩 Email；完整聯絡資訊只由 detail resolver 在 ownership 成功後回傳。PII 不進 query string、analytics、Sentry breadcrumb。公開 resolver排除銀行、通知綁定與私人聯絡欄位。

## 11. 錯誤 UX

- 401：導登入並保存安全 relative next。
- 404：顯示不存在或無權查看。
- 409：重新抓最新資料，保留未送文字，顯示 conflict recovery sheet。
- 422：fieldErrors 對應欄位並捲到第一個錯誤；draft 不清除。
- 429：顯示 retry time。
- 500/503：保留本地 draft，顯示重試；不得誤顯示空資料。

首頁 API 失敗不可顯示假的 `0 筆`；calendar stale 時禁止 mutation；服務發布失敗保留 server draft。

## 12. 檔案架構

### Routes

```text
apps/web/app/(non-locale)/midao/
  layout.tsx
  loading.tsx
  error.tsx
  page.tsx
  requests/page.tsx
  requests/[requestRef]/page.tsx
  calendar/page.tsx
  services/page.tsx
  services/new/page.tsx
  services/[activityId]/edit/page.tsx
  me/page.tsx
  me/public-page/page.tsx
  me/messages/page.tsx
  me/schedules/page.tsx
  me/payouts/page.tsx
  me/reviews/page.tsx
  me/redeem/page.tsx
  me/helpers/page.tsx
  me/settings/page.tsx
```

公開頁與舊 shop 的實際 route-group 檔案：

```text
apps/web/app/[locale]/guides/[slug]/page.tsx
apps/web/app/(non-locale)/guides/[slug]/shop/page.tsx
apps/web/app/(non-locale)/guides/[slug]/shop/book/page.tsx
apps/web/app/(non-locale)/guides/[slug]/shop/orders/page.tsx
```

### Feature components

```text
apps/web/src/features/midao/
  shell/
  ui/
  styles/
  api/
  home/
  requests/
  calendar/
  services/
  profile/
```

每個 feature 拆 screen、cards/editors、API adapter 與 types。Page 只組裝，不直接存取 Supabase。

### API routes

```text
apps/web/app/api/v2/guide/home/route.ts
apps/web/app/api/v2/guide/requests/route.ts
apps/web/app/api/v2/guide/requests/[requestRef]/route.ts
apps/web/app/api/v2/guide/requests/[requestRef]/reply-template/route.ts
apps/web/app/api/v2/guide/bookings/[bookingId]/commands/decide/route.ts
apps/web/app/api/v2/guide/inquiries/[inquiryId]/commands/mark-replied/route.ts
apps/web/app/api/v2/guide/inquiries/[inquiryId]/commands/convert/route.ts
apps/web/app/api/v2/guide/calendar/route.ts
apps/web/app/api/v2/guide/calendar/days/[date]/availability/route.ts
apps/web/app/api/v2/guide/services/route.ts
apps/web/app/api/v2/guide/service-drafts/route.ts
apps/web/app/api/v2/guide/service-drafts/[draftId]/route.ts
apps/web/app/api/v2/guide/service-drafts/[draftId]/commands/publish/route.ts
apps/web/app/api/v2/guide/profile/route.ts
apps/web/app/api/v2/guide/public-page-preview/route.ts
apps/web/app/api/v2/public/guides/[slug]/route.ts
apps/web/app/api/v2/public/guides/[slug]/inquiries/route.ts
apps/web/app/api/v2/me/booking-confirmations/[token]/accept/route.ts
apps/web/app/api/v2/admin/activities/[activityId]/publication-versions/route.ts
apps/web/app/api/v2/admin/activities/[activityId]/commands/restore-publication/route.ts
```

### Domain and DB

```text
apps/web/src/lib/midao/
  request-buckets.mjs
  request-ref.mjs
  inquiry-state-machine.mjs
  inquiry-conversion.ts
  booking-confirmation.ts
  questionnaire-schema.mjs
  service-publication.ts
  availability-segments.mjs
  calendar-projection.ts
  line-reply-template.ts
  backend-mode.mjs
  page-session.ts
  with-guide-route.ts
  home-resolver.ts
  request-list-resolver.ts
  request-detail-resolver.ts
  calendar-resolver.ts
  service-list-resolver.ts
  public-guide-resolver.ts

apps/web/src/lib/
  db-midao-inquiries.mjs
  db-midao-requests.mjs
  db-midao-calendar.mjs
  db-midao-service-drafts.mjs
  db-midao-service-publication.mjs
  db-midao-booking-confirmations.mjs
  db-midao-publication-recovery.mjs
```

禁止把新的 Midao 領域實作寫入 `db.mjs`。若後續 package 需要抽離既有 shop/guide DB 函式，可做 behavior-preserving extraction，並只在 `db.mjs` 保留相容 re-export；抽離前後必須跑既有 contract tests。

## 13. Proposed migrations

```text
20260723000000_midao_backend_mode.sql
20260723001000_midao_notification_outbox.sql
20260723002000_midao_idempotency_records.sql
20260723002500_midao_audit_events.sql
20260723003000_midao_atomic_backend_mode_switch.sql
20260723010000_midao_atomic_booking_approval.sql
20260723020000_midao_service_drafts_and_questions.sql
20260723021000_midao_service_publication_versions.sql
20260723022000_midao_atomic_service_publication.sql
20260723030000_midao_inquiries.sql
20260723031000_midao_booking_intake_pricing_and_confirmation.sql
20260723032000_midao_atomic_inquiry_conversion.sql
20260723040000_midao_global_availability_scope.sql
20260723041000_midao_atomic_day_availability.sql
```

全部 additive，只增不改歷史 migration；時間戳嚴格對齊 package merge 順序，禁止後續 package 補入比已 merge migration 更早的 timestamp。每張新表在所屬 migration 同步建立必要 index、RLS 與最小 grants，不把安全權限延後到另一個 package。每個 command 使用自己的時間戳 migration，後續 package 不修改已 merge 或可能已套用的 command migration。Schema 套用依 repo `SQL-OVERRIDE`、PR、CI 與 ledger SOP。

## 14. 端到端資料流

### 14.1 Home

```text
HomeScreen → GET home → verify guide → homeResolver
→ parallel reads: requests + inquiries + messages + profile
→ counters + priority + recent progress → DTO
```

### 14.2 Create inquiry

```text
public guide page → traveler login → form + questionnaire
→ public inquiry API → published service validation
→ create inquiry + outbox → reply text/share URL
→ copy + open LINE
```

### 14.3 Decide request

```text
request detail → decide command → auth/CSRF/ownership
→ transaction booking + order + log + outbox
→ latest projection → UI status update
```

### 14.4 Convert inquiry

```text
guide fills plan/date/time/party/quote
→ lock inquiry → availability/capacity validation
→ transaction creates request booking + order draft + token + log + outbox
→ inquiry converted → confirmation URL → LINE
→ traveler login/accept → revalidate → checkout
```

### 14.5 Publish service

```text
wizard auto-save → preview → publish command
→ transaction canonical activity + plans + questions + publication version
→ clear draft + outbox → revalidate public pages → public URL
```

### 14.6 Calendar

```text
day segment edit → revision CAS → replace global day rules
→ canonical effective resolver → day projection
→ month grid + agenda update
```

## 15. 新舊後台切換

`guide_profiles.backend_mode`：`legacy | midao`，預設 legacy。

Guide HMAC token 格式保持既有 `guideId:sessionVersion:HMAC`，不新增第四段。`verifyGuideSession()` 回傳已簽章的 `sessionVersion`；`verifyCanonicalGuideSession()`／`withMidaoGuideQuery/Command`／Midao page-session helper 在同一邊界依序檢查 HMAC、DB session version、verification status、`backend_mode`、`MIDAO_BACKEND_ENABLED` 與 mutation kill switch。切 mode 時 bump session version，迫使重新登入。

- Login 與 admin impersonation 查 canonical `backend_mode`，回明確 `redirectTo`。
- Admin 切換使用 `POST /api/v2/admin/guides/[guideId]/backend-mode`；內部 `midao_switch_guide_backend_mode` RPC 同一 transaction lock profile、claim durable idempotency、更新 mode、bump `guide_session_version`、寫 `midao_audit_events` 與 outbox，禁止分段 SQL 更新。Actor 取已驗證 admin email。
- `legacy` 登入 → `/guide/dashboard`。
- `midao` 登入 → `/midao`。
- Midao mutation 只接受 mode=midao。
- Midao guide 呼叫舊 service/plan mutation → `409 BACKEND_MODE_MISMATCH`。
- 舊 read 可暫時共用。

環境 kill switches：

```text
MIDAO_BACKEND_ENABLED
MIDAO_BACKEND_MUTATIONS_ENABLED
```

前者控制入口，後者可緊急停寫但保留讀取。

灰度順序：測試 guide → 內部／合作 guide → 全部 guide。每批對帳 requests、services、calendar slots、booking/order IDs、error rate、截圖與 admin impersonation。

Rollback：停 Midao mutation、guide mode 切回 legacy、bump session version、重新登入。保留 inquiry、booking、order、published service 與 publication versions；不反轉付款。

## 16. 測試與視覺驗收

### Unit

```text
apps/web/tests/unit/midao-request-buckets.test.mjs
apps/web/tests/unit/midao-inquiry-state-machine.test.mjs
apps/web/tests/unit/midao-booking-ref.test.mjs
apps/web/tests/unit/midao-questionnaire-validation.test.mjs
apps/web/tests/unit/midao-availability-segments.test.mjs
apps/web/tests/unit/midao-service-publication-validation.test.mjs
apps/web/tests/unit/midao-line-reply-template.test.mjs
```

### API

```text
apps/web/tests/api/midao-home.test.mjs
apps/web/tests/api/midao-requests.test.mjs
apps/web/tests/api/midao-request-detail.test.mjs
apps/web/tests/api/midao-inquiry-convert.test.mjs
apps/web/tests/api/midao-booking-confirmation.test.mjs
apps/web/tests/api/midao-calendar.test.mjs
apps/web/tests/api/midao-service-drafts.test.mjs
apps/web/tests/api/midao-service-publish.test.mjs
apps/web/tests/api/midao-public-guide.test.mjs
```

每個 mutation測 401、ownership、CSRF、validation、compare-and-set、idempotency、rollback 與 Supabase/in-memory contract。

### E2E

```text
apps/web/e2e/midao-home.spec.ts
apps/web/e2e/midao-requests.spec.ts
apps/web/e2e/midao-calendar.spec.ts
apps/web/e2e/midao-services.spec.ts
apps/web/e2e/midao-public-page.spec.ts
apps/web/e2e/midao-inquiry-conversion.spec.ts
apps/web/e2e/midao-navigation.spec.ts
```

完整 journey：traveler login → inquiry → guide reply → convert → traveler accept → checkout。

### Visual

固定 fixture：home、requests、request detail、calendar、services、service draft、public page。

手機 390 × 844 驗收七頁；桌面 1440 × 1000 驗響應式。比對資訊層級、卡片、間距、按鈕、底部導航、safe-area、圖片裁切、狀態、長文字與 overflow。

## 17. 實作分解

1. Midao shell＋五項導航。
2. Requests read model＋批准／婉拒。
3. LINE inquiry＋轉 booking＋旅客確認。
4. Services wizard＋自訂問卷＋直接發布。
5. Global calendar＋effective availability。
6. 公開接案頁整合＋灰度切換與 legacy retirement。

每個 package 各自完成 TDD、API contract、review、E2E 與 screenshot comparison，再進下一包。

## 18. 上線門檻

- 七頁手機 reference 對齊，桌面響應式可用。
- 所有既有導遊功能可由 Midao shell 抵達。
- request approval、traveler confirmation 與 checkout 完整。
- inquiry 併發轉單只建一筆 booking。
- 服務直接發布可稽核與復原。
- calendar 與 traveler 共用同一 effective resolver。
- bookingId/orderId/inquiryId 明確分離。
- admin impersonation banner 與 actor audit 正確。
- 401/404/409/422/429/500 UX 實測。
- migration integrity、FK、RLS、grants 與 transaction concurrency 通過。
- 驗收證據綁最新 main SHA 與 production deployment SHA。
- production smoke 不使用真人付款。
- soak 期間無新舊後台雙寫漂移。

## 19. Spec 自我審查準則

在進入 implementation plan 前，必須再次確認：

- 文件不存在未決占位標記或未決選項。
- 服務發布政策在所有段落一致為「導遊直接發布及直接更新」。
- LINE inquiry 不被誤寫成正式第四種 booking type。
- `/midao` 是獨立 UI，但 canonical storage 仍共用。
- request/booking/order/inquiry ID 不混用。
- calendar 不建立第三套 availability resolver。
- 新 DB gateway 不進 `db.mjs`。
- migration 全部 additive，production apply 仍需 repo 授權流程。
