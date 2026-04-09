# Tour Platform MVP Database Schema

> 目的：定義 MVP 階段足夠支撐交易流程的資料結構。
> 更新日期：2026-04-10
>
> **V2 更新 (2026-04-10)**: 新增 Booking Engine + POS Lite 相關資料表，詳見 Section 7。

---

## 1. 設計原則

- 先支撐 MVP 主流程：上架、下單、付款、退款、履約、評價
- 避免過早為未來功能過度正規化
- 所有核心狀態要可追蹤
- 敏感資料（KYC、銀行資料）需與公開資料分離

---

## 2. 核心資料表

### 2.1 users
平台使用者主表。

| 欄位 | 型別 | 必填 | 說明 |
|------|------|------|------|
| id | uuid | Y | PK |
| email | text | Y | unique |
| password_hash | text | N | 若採 email/password |
| name | text | Y | 使用者姓名 |
| phone | text | N | 電話 |
| avatar_url | text | N | 頭像 |
| role | text | Y | `traveler` / `guide` / `admin` |
| status | text | Y | `active` / `suspended` |
| created_at | timestamptz | Y | 建立時間 |
| updated_at | timestamptz | Y | 更新時間 |

**索引**
- unique(email)
- index(role)

---

### 2.2 guide_profiles
導遊公開資料。（含 migration 007 新增的 self-service auth 欄位）

| 欄位 | 型別 | 必填 | 說明 |
|------|------|------|------|
| id | uuid | Y | PK |
| user_id | uuid | Y | FK -> users.id |
| display_name | text | Y | 導遊顯示名稱 |
| bio | text | Y | 自介 |
| region | text | Y | 主要地區 |
| languages | jsonb | Y | 如 `["zh-TW", "en"]` |
| specialties | jsonb | N | 主題標籤 |
| profile_photo_url | text | N | 導遊照片 |
| verification_status | text | Y | `pending` / `approved` / `rejected` / `suspended` |
| id_verified | boolean | Y | KYC 是否完成 |
| guide_license_verified | boolean | Y | 執照是否驗證 |
| rating_avg | numeric(3,2) | N | 評分平均 |
| review_count | integer | Y | 評價數 |
| created_at | timestamptz | Y | 建立時間 |
| updated_at | timestamptz | Y | 更新時間 |
| **invite_token** | text | N | UUID 邀請碼（一次性，24 小時有效）migration 007 |
| **invite_token_expires_at** | timestamptz | N | 邀請碼到期時間 migration 007 |
| **guide_password_hash** | text | N | SHA-256 + salt 密碼雜湊 migration 007 |
| **guide_session_version** | integer | Y | Session 版本號（預設 1，登出全部裝置時 +1）migration 007 |

**索引**
- unique(user_id)
- index(region)
- index(verification_status)
- index(invite_token) WHERE invite_token IS NOT NULL（migration 007）

---

### 2.3 guide_applications
導遊申請與 KYC 審核記錄。

| 欄位 | 型別 | 必填 | 說明 |
|------|------|------|------|
| id | uuid | Y | PK |
| user_id | uuid | Y | FK -> users.id |
| display_name | text | Y | 申請時名稱快照 |
| bio | text | Y | 自介 |
| region | text | Y | 地區 |
| languages | jsonb | Y | 語言 |
| bank_account_name | text | Y | 收款戶名 |
| bank_code | text | Y | 銀行代碼 |
| bank_account_last4 | text | Y | 僅存末四碼供顯示 |
| profile_photo_path | text | Y | 私有 storage path |
| id_doc_front_path | text | Y | 私有 storage path |
| id_doc_back_path | text | Y | 私有 storage path |
| guide_license_path | text | N | 私有 storage path |
| status | text | Y | `pending` / `approved` / `rejected` |
| review_note | text | N | admin 備註 |
| submitted_at | timestamptz | Y | 提交時間 |
| reviewed_at | timestamptz | N | 審核時間 |
| reviewed_by | uuid | N | admin user id |

**索引**
- index(user_id)
- index(status)

---

### 2.4 activities
導遊上架的活動。

| 欄位 | 型別 | 必填 | 說明 |
|------|------|------|------|
| id | uuid | Y | PK |
| guide_id | uuid | Y | FK -> guide_profiles.id |
| title | text | Y | 活動名稱 |
| slug | text | Y | URL slug |
| description | text | Y | 活動描述 |
| region | text | Y | 地區 |
| category | text | Y | `culture` / `food` / `outdoor` ... |
| price_per_person | integer | Y | 單位：TWD 元（MVP 統一） |
| min_participants | integer | Y | 最低成團 |
| max_participants | integer | Y | 最高人數 |
| duration_minutes | integer | Y | 活動時長 |
| meeting_point | text | Y | 集合地點 |
| meeting_point_map_url | text | N | 地圖連結 |
| cover_image_url | text | N | 主圖 |
| image_urls | jsonb | N | 圖片清單 |
| refund_policy_type | text | Y | `standard` |
| status | text | Y | `draft` / `published` / `archived` |
| published_at | timestamptz | N | 發布時間 |
| created_at | timestamptz | Y | 建立時間 |
| updated_at | timestamptz | Y | 更新時間 |

**索引**
- index(guide_id)
- index(region)
- index(category)
- index(status)
- unique(slug)

---

### 2.5 activity_schedules
活動場次。

| 欄位 | 型別 | 必填 | 說明 |
|------|------|------|------|
| id | uuid | Y | PK |
| activity_id | uuid | Y | FK -> activities.id |
| start_at | timestamptz | Y | 開始時間 |
| end_at | timestamptz | Y | 結束時間 |
| capacity | integer | Y | 總名額 |
| booked_count | integer | Y | 已售名額 |
| status | text | Y | `open` / `full` / `cancelled` |
| created_at | timestamptz | Y | 建立時間 |
| updated_at | timestamptz | Y | 更新時間 |

**索引**
- index(activity_id)
- index(start_at)
- index(status)

---

### 2.6 orders
訂單主表。

| 欄位 | 型別 | 必填 | 說明 |
|------|------|------|------|
| id | uuid | Y | PK |
| order_no | text | Y | 顯示用單號，unique |
| traveler_id | uuid | Y | FK -> users.id |
| guide_id | uuid | Y | FK -> guide_profiles.id |
| activity_id | uuid | Y | FK -> activities.id |
| schedule_id | uuid | Y | FK -> activity_schedules.id |
| status | text | Y | `pending_payment` / `paid` / `confirmed` / `cancelled_by_user` / `cancelled_by_guide` / `completed` / `refund_pending` / `refunded` |
| participants | integer | Y | 人數 |
| unit_price | integer | Y | 單價快照 |
| subtotal_amount | integer | Y | 小計 |
| platform_fee_amount | integer | Y | 平台抽成 |
| guide_payout_amount | integer | Y | 導遊可得 |
| currency | text | Y | `TWD` |
| contact_name | text | Y | 聯絡人 |
| contact_phone | text | Y | 聯絡電話 |
| contact_email | text | Y | 聯絡 Email |
| note | text | N | 備註 |
| agreed_refund_policy_at | timestamptz | Y | 同意退款政策時間 |
| agreed_terms_at | timestamptz | Y | 同意條款時間 |
| paid_at | timestamptz | N | 付款成功時間 |
| confirmed_at | timestamptz | N | 導遊確認時間 |
| completed_at | timestamptz | N | 完成時間 |
| cancelled_at | timestamptz | N | 取消時間 |
| created_at | timestamptz | Y | 建立時間 |
| updated_at | timestamptz | Y | 更新時間 |

| user_id | uuid | N | FK -> auth.users.id（Phase 9，Supabase Auth 用戶，NULL = 舊訂單） |

**索引**
- unique(order_no)
- index(traveler_id)
- index(user_id) WHERE user_id IS NOT NULL
- index(guide_id)
- index(activity_id)
- index(schedule_id)
- index(status)
- index(created_at)

---

### 2.7 payments
付款記錄。

| 欄位 | 型別 | 必填 | 說明 |
|------|------|------|------|
| id | uuid | Y | PK |
| order_id | uuid | Y | FK -> orders.id |
| provider | text | Y | `ecpay` |
| provider_trade_no | text | Y | 平台送給金流的單號 |
| provider_txn_id | text | N | 金流回傳交易編號 |
| amount | integer | Y | 金額 |
| status | text | Y | `created` / `paid` / `failed` / `cancelled` |
| raw_callback_payload | jsonb | N | callback raw data |
| paid_at | timestamptz | N | 成功付款時間 |
| created_at | timestamptz | Y | 建立時間 |
| updated_at | timestamptz | Y | 更新時間 |

**索引**
- unique(provider_trade_no)
- index(order_id)
- index(status)

---

### 2.8 refund_requests
退款申請。

| 欄位 | 型別 | 必填 | 說明 |
|------|------|------|------|
| id | uuid | Y | PK |
| order_id | uuid | Y | FK -> orders.id |
| requester_id | uuid | Y | FK -> users.id |
| reason | text | Y | 退款原因 |
| detail | text | N | 補充說明 |
| requested_amount | integer | Y | 申請金額 |
| approved_amount | integer | N | 核准金額 |
| status | text | Y | `requested` / `reviewing` / `approved` / `processing` / `refunded` / `rejected` |
| admin_note | text | N | admin 備註 |
| requested_at | timestamptz | Y | 申請時間 |
| approved_at | timestamptz | N | 核准時間 |
| refunded_at | timestamptz | N | 完成時間 |
| handled_by | uuid | N | admin user id |
| created_at | timestamptz | Y | 建立時間 |
| updated_at | timestamptz | Y | 更新時間 |

**索引**
- index(order_id)
- index(status)
- index(requester_id)

---

### 2.9 reviews
訂單完成後評價。

| 欄位 | 型別 | 必填 | 說明 |
|------|------|------|------|
| id | uuid | Y | PK |
| order_id | uuid | Y | FK -> orders.id |
| activity_id | uuid | Y | FK -> activities.id |
| guide_id | uuid | Y | FK -> guide_profiles.id |
| traveler_id | uuid | Y | FK -> users.id |
| rating | integer | Y | 1~5 |
| comment | text | N | 評論 |
| is_verified_order | boolean | Y | 固定 true |
| created_at | timestamptz | Y | 建立時間 |
| updated_at | timestamptz | Y | 更新時間 |

**索引**
- unique(order_id)
- index(activity_id)
- index(guide_id)
- index(traveler_id)

---

### 2.10 notifications
通知發送記錄（MVP 先做 Email）。

| 欄位 | 型別 | 必填 | 說明 |
|------|------|------|------|
| id | uuid | Y | PK |
| user_id | uuid | Y | FK -> users.id |
| channel | text | Y | `email` |
| template_key | text | Y | 如 `order_paid` |
| related_type | text | N | `order` / `refund` / `guide_application` |
| related_id | uuid | N | 關聯主體 id |
| status | text | Y | `queued` / `sent` / `failed` |
| payload | jsonb | N | 送出內容快照 |
| sent_at | timestamptz | N | 發送時間 |
| created_at | timestamptz | Y | 建立時間 |

---

### 2.11 audit_logs
關鍵狀態變更記錄。

| 欄位 | 型別 | 必填 | 說明 |
|------|------|------|------|
| id | uuid | Y | PK |
| actor_user_id | uuid | N | 操作者 |
| actor_role | text | N | `traveler` / `guide` / `admin` / `system` |
| target_type | text | Y | `order` / `refund_request` / `guide_application` / `activity` |
| target_id | uuid | Y | 關聯實體 id |
| action | text | Y | 如 `order.confirmed` |
| before_data | jsonb | N | 變更前 |
| after_data | jsonb | N | 變更後 |
| created_at | timestamptz | Y | 建立時間 |

**索引**
- index(target_type, target_id)
- index(actor_user_id)
- index(created_at)

---

### 2.12 events（Phase 8–9，migration 008+009）
事件追蹤表，用於漏斗分析。

| 欄位 | 型別 | 必填 | 說明 |
|------|------|------|------|
| id | bigserial | Y | PK |
| event_name | text | Y | page_view / view_item / begin_checkout / purchase_intent / payment_succeeded / error |
| session_id | text | N | Client anonymous session UUID |
| contact_email | text | N | 聯絡 email |
| order_id | uuid | N | FK -> orders.id |
| activity_id | uuid | N | FK -> activities.id |
| schedule_id | uuid | N | FK -> activity_schedules.id |
| properties | jsonb | Y | Event-specific payload |
| error_code | text | N | 錯誤碼 |
| page_path | text | N | 頁面路徑 |
| referrer | text | N | 來源頁 |
| user_agent | text | N | User agent |
| ip_hash | text | N | SHA-256 of IP |
| utm_source | text | N | UTM source |
| utm_medium | text | N | UTM medium |
| utm_campaign | text | N | UTM campaign |
| utm_content | text | N | UTM content variant |
| utm_term | text | N | UTM keyword |
| created_at | timestamptz | Y | 建立時間 |

**索引**
- index(event_name)
- index(session_id)
- index(order_id)
- index(activity_id)
- index(created_at DESC)
- index(utm_source) WHERE NOT NULL
- index(utm_campaign) WHERE NOT NULL

**RLS**
- RLS enabled，只有 service_role 可讀寫（前端透過 /api/events API route）

---

## 3. 關聯摘要（ERD 文字版）

- `users` 1:1 `guide_profiles`
- `users` 1:N `orders`（作為 traveler）
- `guide_profiles` 1:N `activities`
- `activities` 1:N `activity_schedules`
- `activity_schedules` 1:N `orders`
- `orders` 1:N `payments`（MVP 實際多半 1:1）
- `orders` 1:0..1 `refund_requests`
- `orders` 1:0..1 `reviews`

---

## 4. RLS 建議

### traveler
- 只能讀自己的 orders / refund_requests / reviews
- 不能讀 guide_application private docs

### guide
- 只能讀自己的 activities / schedules / related orders
- 不能讀其他 guide 的後台資料

### admin
- 全部可讀寫

### public
- 只能讀 `published` activities 與公開 guide_profiles

---

## 5. MVP 後續可擴充但先不做

- coupons
- conversations / messages
- payouts / withdrawals
- saved_items / wishlist
- emergency_incidents
- multilingual_content
- search_index / ranking_signals

---

## 6. 實作注意事項

- 金額欄位全專案必須統一單位
- `order_no` 與 `provider_trade_no` 要可追蹤且不可重複
- KYC 文件路徑放資料庫，檔案本體放 private storage
- 評分平均可先同步寫入 `guide_profiles`，後續再改 materialized view
- 退款與訂單狀態變更必須寫 `audit_logs`

---

## 7. V2 Booking Engine + POS 新增資料表

> Migration: `20260409000000_v2_booking_pos_foundation.sql`
> 新增日期：2026-04-10

### 設計原則

**三層狀態分離**：
- **BookingStatus**：履約狀態（draft → confirmed → completed）
- **OrderStatus**：商業狀態（pending_payment → paid → refunded）
- **PaymentStatus**：收款狀態（pending → paid → failed）

**V1 相容**：
- 所有改動皆為增量，不破壞現有 `activity_schedules` 流程
- `orders.schedule_id` 保留，舊流程可繼續運作

---

### 7.1 activity_plans

把活動拆成可銷售方案（半日遊 / 一日遊 / 私人包團）。

| 欄位 | 型別 | 必填 | 說明 |
|------|------|------|------|
| id | uuid | Y | PK |
| activity_id | uuid | Y | FK -> activities.id |
| name | text | Y | 方案名稱（如 Half Day / Full Day） |
| slug | text | Y | 方案代碼 |
| duration_minutes | integer | Y | 行程時長 |
| price_type | text | Y | `per_person` / `per_group` |
| base_price | integer | Y | 基礎售價（TWD） |
| min_participants | integer | Y | 最低人數 |
| max_participants | integer | Y | 最高人數 |
| booking_type | text | Y | `scheduled` / `request` / `instant` |
| status | text | Y | `active` / `inactive` |
| created_at | timestamptz | Y | 建立時間 |
| updated_at | timestamptz | Y | 更新時間 |

**索引**
- index(activity_id)
- index(status)
- unique(activity_id, slug)

---

### 7.2 guide_availability_rules

Cal.com 風格的導遊可用時間規則。

| 欄位 | 型別 | 必填 | 說明 |
|------|------|------|------|
| id | uuid | Y | PK |
| guide_id | uuid | Y | FK -> guide_profiles.id |
| activity_plan_id | uuid | N | FK -> activity_plans.id（NULL = 全方案通用） |
| weekday | integer | Y | 0-6（0=週日） |
| start_time_local | time | Y | 當地開始時間 |
| end_time_local | time | Y | 當地結束時間 |
| timezone | text | Y | 如 `Asia/Taipei` |
| slot_interval_minutes | integer | Y | slot 間隔（預設 30） |
| buffer_before_minutes | integer | Y | 前置緩衝 |
| buffer_after_minutes | integer | Y | 後置緩衝 |
| effective_from | date | N | 生效起始日 |
| effective_to | date | N | 生效結束日 |
| is_active | boolean | Y | 是否啟用 |
| created_at | timestamptz | Y | 建立時間 |
| updated_at | timestamptz | Y | 更新時間 |

**索引**
- index(guide_id)
- index(activity_plan_id)
- index(is_active)

**約束**
- end_time_local > start_time_local
- effective_to >= effective_from (when both non-null)

---

### 7.3 guide_blackout_dates

導遊不可接單的時段。

| 欄位 | 型別 | 必填 | 說明 |
|------|------|------|------|
| id | uuid | Y | PK |
| guide_id | uuid | Y | FK -> guide_profiles.id |
| starts_at | timestamptz | Y | 開始時間 |
| ends_at | timestamptz | Y | 結束時間 |
| reason | text | N | 原因（休假 / 私事 / 已接案） |
| source | text | Y | `manual` / `system` |
| created_at | timestamptz | Y | 建立時間 |

**索引**
- index(guide_id)
- index(starts_at)

**約束**
- ends_at > starts_at

---

### 7.4 bookings

預約實體（從 orders 分離）。

| 欄位 | 型別 | 必填 | 說明 |
|------|------|------|------|
| id | uuid | Y | PK |
| booking_no | text | Y | 顯示用編號（unique，自動生成） |
| traveler_id | uuid | N | FK -> users.id |
| guide_id | uuid | Y | FK -> guide_profiles.id |
| activity_id | uuid | Y | FK -> activities.id |
| activity_plan_id | uuid | N | FK -> activity_plans.id |
| source_channel | text | Y | `web` / `line` / `admin_pos` |
| start_at | timestamptz | Y | 預約開始時間 |
| end_at | timestamptz | Y | 預約結束時間 |
| timezone | text | Y | 預約時區 |
| participants | integer | Y | 人數 |
| status | text | Y | 見下方狀態機 |
| order_id | uuid | N | FK -> orders.id |
| customer_note | text | N | 客戶備註 |
| internal_note | text | N | 內部備註 |
| confirmed_at | timestamptz | N | 確認時間 |
| completed_at | timestamptz | N | 完成時間 |
| cancelled_at | timestamptz | N | 取消時間 |
| created_at | timestamptz | Y | 建立時間 |
| updated_at | timestamptz | Y | 更新時間 |

**BookingStatus 狀態機**
```
draft → pending_confirmation → confirmed → completed
                            ↘ cancelled
              confirmed → cancelled / no_show / reschedule_requested
              reschedule_requested → confirmed / cancelled
```

**索引**
- unique(booking_no)
- index(traveler_id)
- index(guide_id)
- index(activity_id)
- index(activity_plan_id)
- index(status)
- index(start_at)
- partial index: (guide_id, start_at) WHERE status IN ('draft', 'pending_confirmation', 'confirmed', 'reschedule_requested')

---

### 7.5 booking_status_logs

預約狀態變更的審計日誌。

| 欄位 | 型別 | 必填 | 說明 |
|------|------|------|------|
| id | uuid | Y | PK |
| booking_id | uuid | Y | FK -> bookings.id |
| from_status | text | N | 原狀態 |
| to_status | text | Y | 新狀態 |
| actor_user_id | uuid | N | FK -> users.id |
| actor_role | text | Y | `traveler` / `guide` / `admin` / `system` |
| reason | text | N | 變更原因 |
| metadata | jsonb | N | 附加資料 |
| created_at | timestamptz | Y | 建立時間 |

**索引**
- index(booking_id)
- index(created_at DESC)

---

### 7.6 order_items

訂單明細項目（ERPNext 風格）。

| 欄位 | 型別 | 必填 | 說明 |
|------|------|------|------|
| id | uuid | Y | PK |
| order_id | uuid | Y | FK -> orders.id |
| item_type | text | Y | `activity_booking` / `adjustment` / `fee` / `discount` |
| ref_id | uuid | N | 關聯 ID（如 booking_id） |
| title | text | Y | 顯示名稱 |
| quantity | integer | Y | 數量 |
| unit_price | integer | Y | 單價 |
| subtotal_amount | integer | Y | 小計 |
| metadata | jsonb | N | 附加資料 |
| created_at | timestamptz | Y | 建立時間 |

**索引**
- index(order_id)
- index(item_type)

---

### 7.7 payment_events

付款生命週期事件日誌。

| 欄位 | 型別 | 必填 | 說明 |
|------|------|------|------|
| id | uuid | Y | PK |
| payment_id | uuid | Y | FK -> payments.id |
| event_type | text | Y | `initiated` / `callback_received` / `authorized` / `paid` / `failed` / `refunded` / `cancelled` |
| payload | jsonb | N | 原始資料 |
| created_at | timestamptz | Y | 建立時間 |

**索引**
- index(payment_id)
- index(created_at DESC)

---

### 7.8 orders 擴充欄位

V2 新增欄位（皆為可選，維持 V1 相容）。

| 欄位 | 型別 | 必填 | 說明 |
|------|------|------|------|
| booking_id | uuid | N | FK -> bookings.id |
| source_channel | text | N | `web` / `line` / `admin_pos` |
| handled_by | uuid | N | FK -> users.id（POS 操作員） |
| discount_amount | integer | N | 折扣金額 |
| payment_status | text | N | `pending` / `partially_paid` / `paid` / `failed` / `refunded` / `partially_refunded` |

**新增索引**
- index(booking_id)
- index(source_channel)
- index(payment_status)

---

### 7.9 V2 關聯摘要

```
activities 1:N activity_plans
guide_profiles 1:N guide_availability_rules
guide_profiles 1:N guide_blackout_dates
activity_plans 1:N guide_availability_rules (optional)
activity_plans 1:N bookings
bookings 1:N booking_status_logs
bookings 1:1 orders (optional)
orders 1:N order_items
payments 1:N payment_events
```

---

### 7.10 V2 RLS 規則

| 表 | traveler | guide | admin |
|-----|----------|-------|-------|
| activity_plans | 讀取 active | 讀取自己活動的 | 全部 |
| guide_availability_rules | - | 讀寫自己的 | 全部 |
| guide_blackout_dates | - | 讀寫自己的 | 全部 |
| bookings | 讀取自己的 | 讀取自己的 | 全部 |
| booking_status_logs | 讀取自己 booking 的 | 讀取自己 booking 的 | 全部 |
| order_items | 讀取自己 order 的 | 讀取自己 order 的 | 全部 |
| payment_events | - | - | 全部 |

> 目前所有表皆設為 service_role full access，待實作細部權限時再調整。
