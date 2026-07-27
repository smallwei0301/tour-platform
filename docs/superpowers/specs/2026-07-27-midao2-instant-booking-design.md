# midao2 直接預約（instant booking）設計規格

> 日期：2026-07-27（Asia/Taipei）。前置：Plan 1–3 已完成（分支 `claude/superpowers-midao-backend-x90czx`，PR #1763 未 merge）。
> Owner 決策（2026-07-27 對話拍板）：①單位＝三時段＋「全天」便捷鈕（一鍵選滿三時段）；②撞單自動轉一般需求單；③取消後單位自動恢復開放；④新增獨立狀態 `confirmed`／`cancelled`；⑤**只有 `confirmed` 的直接預約消耗單位**——待確認的單（一般需求單、撞單轉出的需求單、new/pending_reply/replied 全部）一律不消耗、不鎖任何時段。另：Navbar 保留不隱藏；Migration D 生產套用已獲 SQL-OVERRIDE 授權（落檔＋CI 綠後執行）。

## 1. 概念模型

**單位（unit）**＝某日期的某個開放時段（morning／afternoon／evening），來源即既有 midao 行事曆（週預設＋單日覆寫，`db-midao-availability.mjs`）。

- 服務 `midao_deal_mode='instant_booking'` → 旅客只能從「有開放單位的日期＋時段」中挑選，送出即**已確認（confirmed）**並**消耗**所選單位（該時段自動關閉）。
- 「全天」便捷鈕：僅當該日三時段全開時可選，按下＝一次選滿三時段（消耗 3 個單位），入單 `preferred_period='full_day'`。
- 導遊「再開單位」：在行事曆把被消耗的時段重新打開 → 可收第二筆直接預約；原預約不受影響。
- 另兩種模式（`confirm_first`／`line_inquiry`）行為完全不變（輕量需求單，日期自由填）。
- **硬規則（owner 決策⑤）：只有 `status='confirmed'` 的 instant 單消耗單位。** 任何待確認的單——一般需求單、撞單降級轉出的需求單、new/pending_reply/replied 各狀態——都不寫消耗列、不關時段、不影響公開可用性；導遊後續與旅客談成也只走 closed_won，不回頭消耗單位（時段管理權完全在導遊手上）。

## 2. 資料模型（Migration D，只增不改既有檔）

檔名：`supabase/migrations/<timestamp>_midao2_instant_booking.sql`（＋同名 `.rollback.sql`）。

```sql
-- (1) midao_requests：狀態機擴充＋全天時段值＋單別
ALTER TABLE midao_requests DROP CONSTRAINT IF EXISTS midao_requests_status_check;
ALTER TABLE midao_requests ADD CONSTRAINT midao_requests_status_check
  CHECK (status IN ('new','pending_reply','replied','closed_won','closed_done','confirmed','cancelled'));
ALTER TABLE midao_requests DROP CONSTRAINT IF EXISTS midao_requests_preferred_period_check;
ALTER TABLE midao_requests ADD CONSTRAINT midao_requests_preferred_period_check
  CHECK (preferred_period IN ('morning','afternoon','evening','full_day'));
ALTER TABLE midao_requests ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'request'
  CHECK (kind IN ('request','instant'));

-- (2) 單位消耗帳（防撞單的原子性來源）
CREATE TABLE IF NOT EXISTS midao_slot_consumptions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  guide_id    uuid NOT NULL REFERENCES guide_profiles(id) ON DELETE CASCADE,
  request_id  uuid NOT NULL REFERENCES midao_requests(id) ON DELETE CASCADE,
  date        date NOT NULL,
  period      text NOT NULL CHECK (period IN ('morning','afternoon','evening')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  released_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_midao_slot_active
  ON midao_slot_consumptions(guide_id, date, period) WHERE released_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_midao_slot_by_request ON midao_slot_consumptions(request_id);
-- RLS 比照 midao_requests（service-role 寫、導遊讀自己的）
```

> 註：DROP+ADD CONSTRAINT 是「新 migration 檔調整 schema」，不違反「migration 檔只增不改」（不動舊檔）。約束名 `midao_requests_status_check`／`..._preferred_period_check` 為 Postgres 對 inline CHECK 的預設命名，套用前以 information_schema 驗證實名，migration 內用 `IF EXISTS` 防禦。

### 為什麼不用 RPC：unique partial index 即原子鎖

「消耗單位」＝往 `midao_slot_consumptions` 插入該 (guide, date, period) 的 active 列（`released_at IS NULL`）。唯一索引保證**同一單位同時只有一個 active 消耗**：

- **建立預約**：單一 INSERT 語句一次插入所有選定時段列（全天＝3 列）→ 撞唯一索引（23505）＝單位已被搶走 → 整句失敗（all-or-nothing）→ 走撞單 fallback。成功後把對應時段寫單日覆寫 `is_open=false`（沿用 `setDayOverrideDb`）。
- **導遊再開單位**：該 (guide,date,period) 的 active 消耗列標記 `released_at=now()`（原預約單不動）＋時段覆寫改回 `is_open=true` → 唯一索引空出，可接受下一筆。
- **取消預約**（owner 決策③自動恢復）：request → `cancelled`；其 active 消耗列全部 `released_at=now()`＋對應時段自動改回 `is_open=true`。若導遊先前已手動再開（消耗列已 released）則無事可做。
- 行事曆顯示區分：時段關閉＋存在 active 消耗列 → 「已預約」；時段關閉＋無消耗列 → 「已關閉」（導遊自己關的）。

TOCTOU 窗口（route 先讀 availability 再 INSERT）由唯一索引兜底：兩人同過檢查，第二人 INSERT 必失敗。導遊同時關時段的極端競態（機率極低、後果輕微）接受不處理。

## 3. Domain 層

新檔 `apps/web/src/lib/midao/db-midao-instant.mjs`（strangler 規則：不進 db.mjs；in-memory seam 比照其他 midao 檔）：

- `consumeSlotsDb(guideId, requestId, date, periods[])` → `{ok:true}` | `{ok:false, code:'SLOT_TAKEN'}`（單一 INSERT，23505 → SLOT_TAKEN；in-memory 以同步陣列模擬唯一性）。
- `releaseSlotsByRequestDb(requestId)` → 該單 active 消耗列全 released，回被釋放的 `{date, period}[]`（供 route 自動恢復開放）。
- `releaseSlotByUnitDb(guideId, date, period)` → 導遊再開單位用。
- `listActiveConsumptionsDb(guideId, month)` → 行事曆「已預約」標示用（join request 帶 requestNo/travelerName）。

`db-midao-requests.mjs` 調整：
- 狀態機：`STATUS_META` 加 `confirmed`（已確認）／`cancelled`（已取消）；合法轉移：`confirmed → closed_done | cancelled`，兩者皆終態不可再轉；既有五狀態轉移不變；**guide PATCH 不得把單改成 `confirmed`**（只有系統建立時寫入），`cancelled` 僅允許從 `confirmed` 轉入（一般需求單的「不成立」仍走 `closed_done`，不引入新語意）。
- `normalizeRequestInput`：`preferredPeriod` 接受 `'full_day'`；新增 `kind`（'request'|'instant'，預設 'request'）。
- `TAB_FILTERS`／`listMidaoRequestsDb`／`tabCounts`／`summary`：`confirmed` 計入處理中；`cancelled` 併入結案側。首頁摘要新增「新預約（confirmed）」計數。

`midao-copy-templates.mjs`：`periodLabel` 加 `full_day`→「全天」；instant 單的摘要/回覆模板標「【已確認預約】」。

## 4. API

### 公開端（旅客）

- `POST /api/v2/public/midao/guides/[slug]/requests`（既有 route 擴充，不開新路）：
  - service 為 `instant_booking` 時：必填 `preferredDate`＋`preferredPeriod ∈ {morning,afternoon,evening,full_day}`；驗 `getMonthEffectiveDb` 該日該時段（full_day＝三時段全開）確實開放，否則 400 `SLOT_UNAVAILABLE`。
  - 流程：先建 request（`status='confirmed'`, `kind='instant'`）→ `consumeSlotsDb`；`SLOT_TAKEN` → **改單**為 `status='new'`, `kind='request'`（owner 決策②），回 `data.outcome='converted_to_request'`；成功 → 對應時段寫 `is_open=false` 覆寫，回 `data.outcome='confirmed'`。
  - 回應皆 200（成功建單），前端依 `outcome` 顯示不同畫面；backup date 欄位對 instant 單隱藏（無意義）。
  - LINE 推播分流：confirmed →「🎉 新預約已確認」（日期＋時段＋服務＋旅客）；converted →沿用既有新需求通知。
- `GET .../availability`（既有）：無需改——消耗後時段覆寫已關閉，公開可用性自然反映。

### 導遊端

- `PATCH /api/v2/guide/midao/requests/[id]`（既有擴充）：允許 `confirmed→closed_done`／`confirmed→cancelled`；轉 `cancelled` 時 route 呼叫 `releaseSlotsByRequestDb` 並把釋出的時段自動改回 `is_open=true`（owner 決策③）。
- `POST /api/v2/guide/midao/calendar/reopen`（新）：body `{date, period}` → `releaseSlotByUnitDb`＋時段 `is_open=true`（導遊「再開單位」）。
- `GET .../calendar`（既有擴充）：月視圖每日多回 `bookedPeriods[]`（active 消耗）；日詳情列出已確認預約（連到需求詳情）。

## 5. 前端

### 旅客 `/g/[slug]` RequestForm
- 選到 instant 服務時，日期改為「可預約日」選擇器（讀公開 availability，只可點有開放時段的日）；時段膠囊：上午／下午／晚上（未開放者 disabled）＋**「全天」鈕**（三時段全開才顯示，按下＝選滿三時段，`preferredPeriod='full_day'`）；隱藏備用日期欄。
- 成功畫面分流：`outcome='confirmed'` →「✅ 預約成功！行程已確認」（強調不需等回覆）；`converted_to_request'` →「此時段剛被預約，已改為需求單送出，導遊會盡快與你確認」。

### 導遊 midao2
- 行事曆：時段格三態——開放／已預約（active 消耗，可點看單）／已關閉；被消耗時段提供「再開放此時段」按鈕（打 reopen API）。
- 需求列表：`confirmed` 單獨狀態章（例：藍底「已確認」）；詳情頁對 confirmed 單顯示「行程結束（→已完成）」與「取消預約」兩鈕（取消需二次確認，說明單位將自動恢復開放）；隱藏 LINE 回覆自動轉態邏輯（confirmed 不受 pending_reply→replied 自動轉影響）。
- 首頁摘要卡：新增「已確認預約」計數。
- 服務精靈/編輯：`instant_booking` 模式旁加說明「旅客將依你的行事曆開放時段直接成立預約」。

### 管理端
- `/admin/midao-requests` 狀態下拉與狀態章補 `confirmed`／`cancelled`。

## 6. 測試要點

- domain：consumeSlots 原子性（同單位二次消耗→SLOT_TAKEN；全天 3 列 all-or-nothing）；release by request/unit；狀態機新轉移矩陣（confirmed 只能→closed_done/cancelled；PATCH 禁入 confirmed；cancelled 僅由 confirmed 轉入）。
- route：instant 驗證（缺時段 400、時段未開 400 SLOT_UNAVAILABLE、full_day 需三段全開）；撞單轉需求單（mock consumeSlots 回 SLOT_TAKEN → 單存在且 status='new'＋outcome 正確）；cancel 自動釋放＋時段恢復。
- 契約測試：migration D 檔名＋約束＋新表；前端 testid（`g-period-full_day`、`midao2-reopen-slot`、`midao2-status-cancelled` 等）。
- E2E：instant 服務走完「選日→選時段→送出→已確認畫面」；行事曆出現已預約＋再開；mock 需含新欄位。

## 7. 部署／驗收注意

- Migration D 套用生產需屆時 `SQL-OVERRIDE` 授權＋ledger（含約束實名驗證）。
- 驗收清單追加：⑭instant 送單即確認＋時段消耗、⑮撞單轉需求單（可用兩瀏覽器實測）、⑯取消自動恢復開放、⑰再開單位後收第二筆。
- 既有資料零影響：舊單全部 `kind='request'`（DEFAULT），狀態機舊值不變。
