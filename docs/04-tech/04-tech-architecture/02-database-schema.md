# Tour Platform MVP Database Schema

> 目的：定義 MVP 階段足夠支撐交易流程的資料結構。
> 更新日期：2026-04-13 (Incorporating Phase 12 Booking Engine & POS Lite)

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
| invite_token | text | N | UUID 邀請碼（一次性，24 小時有效）migration 007 |
| invite_token_expires_at | timestamptz | N | 邀請碼到期時間 migration 007 |
| guide_password_hash | text | N | SHA-256 + salt 密碼雜湊 migration 007 |
| guide_session_version | integer | Y | Session 版本號（預設 1，登出全部裝置時 +1）migration 007 |

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

### 2.5 activity_plans (New - Migration 014)
支援多方案架構，讓每個活動可設定多個販售方案（例如：早鳥、標準、VIP）。

| 欄位 | 型別 | 必填 | 說明 |
|------|------|------|------|
| id | uuid | Y | PK |
| activity_id | uuid | Y | FK -> activities.id |
| plan_date | date | Y | 活動日期 |
| start_time | time | Y | 開始時間 |
| end_time | time | Y | 結束時間 |
| max_participants | integer | Y | 最大名額 |
| current_participants | integer | N | 已預訂人數 |
| guide_id | uuid | N | FK -> guide_profiles.id |
| status | text | Y | `scheduled` / `confirmed` / `cancelled` / `completed` |
| price_override | decimal | N | 價格覆蓋 |
| created_at | timestamptz | Y | 建立時間 |

---

### 2.6 activity_schedules
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

### 2.7 guide_availability_rules (New - Migration 015)
導遊可設定週期性可接案時段（Recurring Weekly Availability）。

| 欄位 | 型別 | 必填 | 說明 |
|------|------|------|------|
| id | uuid | Y | PK |
| guide_id | uuid | Y | FK -> guide_profiles.id |
| activity_plan_id | uuid | N | FK -> activity_plans.id (NULL = 適用所有方案) |
| weekday | integer | Y | 0=Sun, 1=Mon, ..., 6=Sat |
| start_time_local | time | Y | 開始時間 |
| end_time_local | time | Y | 結束時間 |
| timezone | text | Y | 預設 'Asia/Taipei' |
| slot_interval_minutes | integer | Y | 時段間隔 (例如 30 分鐘一個 Slot) |
| buffer_before_minutes | integer | Y | 預留前置時間 |
| buffer_after_minutes | integer | Y | 預留後置時間 |
| effective_from | date | N | 生效日期 |
| effective_to | date | N | 到期日期 |
| is_active | boolean | Y | 是否啟用 |

---

### 2.8 guide_blackout_dates (New - Migration 016)
導遊黑名單日期（請假、私人事務等不可預訂時段）。

| 欄位 | 型別 | 必填 | 說明 |
|------|------|------|------|
| id | uuid | Y | PK |
| guide_id | uuid | Y | FK -> guide_profiles.id |
| starts_at | timestamptz | Y | 開始時間 |
| ends_at | timestamptz | Y | 結束時間 |
| reason | text | N | 原因 |
| source | text | Y | `manual` / `system` |

---

### 2.9 bookings (New - Migration 017)
核心預訂實體，將預訂生命週期與付款分離。

| 欄位 | 型別 | 必填 | 說明 |
|------|------|------|------|
| id | uuid | Y | PK |
| booking_number | text | Y | 顯示用單號，unique |
| customer_id | uuid | Y | FK -> customers.id |
| activity_plan_id | uuid | N | FK -> activity_plans.id |
| booking_date | timestamptz | Y | 預訂日期 |
| status | text | Y | `pending` / `confirmed` / `cancelled` / `completed` / `no_show` |
| number_of_participants | integer | Y | 人數 |
| total_amount | decimal | Y | 總額 |
| deposit_amount | decimal | N | 定金 |
| paid_amount | decimal | N | 已付金額 |
| payment_status | text | Y | `unpaid` / `partial` / `paid` / `refunded` |
| payment_method | text | N | 付款方式 |
| created_at | timestamptz | Y | 建立時間 |
| updated_at | timestamptz | Y | 更新時間 |

---

### 2.10 booking_status_logs (New - Migration 017/019)
預訂狀態變更追蹤（Audit Trail）。

| 欄位 | 型別 | 必填 | 說明 |
|------|------|------|------|
| id | uuid | Y | PK |
| booking_id | uuid | Y | FK -> bookings.id |
| from_status | text | N | 變更前狀態 |
| to_status | text | Y | 變更後狀態 |
| actor_user_id | uuid | N | 操作者 ID |
| actor_role | text | Y | `traveler` / `guide` / `admin` / `system` |
| created_at | timestamptz | Y | 建立時間 |

---

### 2.11 orders (Upgraded - Migration 019)
訂單主表。

| 欄位 | 型別 | 必填 | 說明 |
|------|------|------|------|
| id | uuid | Y | PK |
| order_no | text | Y | 顯示用單號，unique |
| traveler_id | uuid | Y | FK -> users.id |
| guide_id | uuid | Y | FK -> guide_profiles.id |
| activity_id | uuid | Y | FK -> activities.id |
| status | text | Y | `pending_payment` / `paid` / `confirmed` / `cancelled` ... |
| participants | integer | Y | 人數 |
| subtotal_amount | integer | Y | 小計 |
| currency | text | Y | `TWD` |
| created_at | timestamptz | Y | 建立時間 |

---

### 2.12 payments (Upgraded - Migration 020)
付款記錄與金流追蹤。

| 欄位 | 型別 | 必填 | 說明 |
|------|------|------|------|
| id | uuid | Y | PK |
| booking_id | uuid | Y | FK -> bookings.id |
| amount | decimal | Y | 金額 |
| status | text | Y | `pending` / `processing` / `completed` / `failed` ... |
| method | text | N | `credit_card` / `atm` / `cvs` / `ecpay` |
| merchant_trade_no | text | Y | ECPay 商家交易單號 (Unique) |
| trade_no | text | N | ECPay 交易單號 |
| payment_date | timestamptz | N | 付款成功時間 |
| created_at | timestamptz | Y | 建立時間 |

---

### 2.13 payment_logs (New - Migration 020)
付款事件日誌。

| 欄位 | 型別 | 必填 | 說明 |
|------|------|------|------|
| id | uuid | Y | PK |
| payment_id | uuid | Y | FK -> payments.id |
| log_type | text | Y | 事件類型 |
| log_message | text | N | 訊息 |
| created_at | timestamptz | Y | 建立時間 |

---

### 2.14 activity_packages (New - Migration 018)
活動方案包 (例如：一日遊套裝)。

| 欄位 | 型別 | 必填 | 說明 |
|------|------|------|------|
| id | uuid | Y | PK |
| package_name | text | Y | 套裝名稱 |
| package_price | decimal | Y | 方案價格 |
| is_active | boolean | Y | 是否啟用 |

---

### 2.15 package_activities (New - Migration 018)
套裝與活動的關聯表 (Many-to-Many)。

| 欄位 | 型別 | 必填 | 說明 |
|------|------|------|------|
| id | uuid | Y | PK |
| package_id | uuid | Y | FK -> activity_packages.id |
| activity_id | uuid | Y | FK -> activities.id |
| sequence_order | integer | Y | 排序順序 |

---

### 2.16 reviews
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
| created_at | timestamptz | Y | 建立時間 |

---

### 2.17 notifications
通知發送記錄。

| 欄位 | 型別 | 必填 | 說明 |
|------|------|------|------|
| id | uuid | Y | PK |
| user_id | uuid | Y | FK -> users.id |
| channel | text | Y | `email` |
| status | text | Y | `queued` / `sent` / `failed` |
| created_at | timestamptz | Y | 建立時間 |

---

### 2.18 audit_logs
關鍵狀態變更記錄。

| 欄位 | 型別 | 必填 | 說明 |
|------|------|------|------|
| id | uuid | Y | PK |
| target_type | text | Y | `order` / `refund_request` / `guide_application` / `activity` |
| target_id | uuid | Y | 關聯實體 id |
| action | text | Y | 如 `order.confirmed` |
| created_at | timestamptz | Y | 建立時間 |

---

### 2.19 events
事件追蹤表（漏斗分析）。

| 欄位 | 型別 | 必填 | 說明 |
|------|------|------|------|
| id | bigserial | Y | PK |
| event_name | text | Y | `page_view` / `purchase_intent` ... |
| session_id | text | N | Client anonymous session UUID |
| created_at | timestamptz | Y | 建立時間 |

---

## 3. 關聯摘要（ERD 文字版）

- `users` 1:1 `guide_profiles`
- `users` 1:N `bookings`（作為 traveler）
- `guide_profiles` 1:N `activities`
- `guide_profiles` 1:N `guide_availability_rules`
- `guide_profiles` 1:N `guide_blackout_dates`
- `activities` 1:N `activity_plans`
- `activity_plans` 1:N `activity_schedules`
- `activity_plans` 1:N `guide_availability_rules`
- `activity_schedules` 1:N `bookings`
- `bookings` 1:1 `orders`
- `bookings` 1:N `booking_status_logs`
- `orders` 1:N `payments`
- `activity_packages` 1:N `package_activities` $\rightarrow$ `activities`

---

## 4. RLS 建議

### traveler
- 只能讀自己的 bookings / orders / refund_requests / reviews
- 不能讀 guide_application private docs

### guide
- 只能讀自己的 activities / schedules / availability_rules / blackout_dates / related bookings

### admin
- 全部可讀寫

### public
- 只能讀 `published` activities 與公開 guide_profiles

---

## 5. 實作注意事項

- **Booking-Order 分離**：預訂 (`bookings`) 負責履約週期，訂單 (`orders`) 負責金流週期。
- **Availability Driven**：所有預訂必須基於 `guide_availability_rules` 與 `guide_blackout_dates` 計算可用 Slot。
- **金流追蹤**：`payments` 表必須記錄 ECPay 的 `merchant_trade_no` 以便對帳。
- **狀態追蹤**：所有 `bookings` 的狀態變更必須寫入 `booking_status_logs`。

**未來擴展方向 (Future Scope):**
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

