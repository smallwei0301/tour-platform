# Event Tracking 設計文件 v1.0

> 作者：Tracy｜日期：2026-04-04｜任務：TP-001

---

## 一、為什麼要做事件追蹤

目前 tour-platform 完全沒有行為資料。使用者從「點進活動頁」到「付款完成」的整條漏斗是黑盒子：
- 不知道哪個環節流失最多
- 不知道哪些活動被看但沒有被選
- 不知道付款成功率（mock→真實 ECPay 後更需要）
- 不知道哪些錯誤影響轉換率

第一版目標：**打好地基，讓所有關鍵行為點可追蹤，漏斗資料可查詢**。

---

## 二、事件資料模型

### 2.1 events table schema

```sql
CREATE TABLE IF NOT EXISTS events (
  id            BIGSERIAL PRIMARY KEY,
  event_name    TEXT        NOT NULL,           -- 事件名稱（見下方清單）
  session_id    TEXT,                           -- 前端 sessionStorage UUID（匿名）
  contact_email TEXT,                           -- 已知使用者 email（可 null）
  order_id      UUID        REFERENCES orders(id) ON DELETE SET NULL,
  activity_id   UUID        REFERENCES activities(id) ON DELETE SET NULL,
  schedule_id   UUID        REFERENCES activity_schedules(id) ON DELETE SET NULL,
  properties    JSONB       NOT NULL DEFAULT '{}'::jsonb,  -- 事件專屬欄位
  error_code    TEXT,                           -- error 事件專用
  page_path     TEXT,                           -- 發生頁面路徑
  referrer      TEXT,                           -- document.referrer
  user_agent    TEXT,                           -- 精簡版（browser family + OS）
  ip_hash       TEXT,                           -- SHA-256(IP) 匿名化
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 查詢效能索引
CREATE INDEX IF NOT EXISTS events_event_name_idx  ON events(event_name);
CREATE INDEX IF NOT EXISTS events_session_id_idx  ON events(session_id);
CREATE INDEX IF NOT EXISTS events_order_id_idx    ON events(order_id);
CREATE INDEX IF NOT EXISTS events_activity_id_idx ON events(activity_id);
CREATE INDEX IF NOT EXISTS events_created_at_idx  ON events(created_at DESC);

-- RLS（Row Level Security）
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
-- 只允許 service_role 寫入（前端透過 API route，不直接存取）
CREATE POLICY "events: service_role insert"
  ON events FOR INSERT TO service_role WITH CHECK (true);
CREATE POLICY "events: service_role select"
  ON events FOR SELECT TO service_role USING (true);
```

### 2.2 設計決策

| 決策 | 原因 |
|------|------|
| BIGSERIAL（非 UUID） | 事件是高頻寫入，bigint 索引效能優於 uuid |
| properties JSONB | 不同事件有不同欄位，用 JSONB 避免欄位爆炸；高頻查詢欄位提升到頂層 |
| ip_hash 而非 ip | 隱私合規；可做 unique visitor 估算但不能反查身份 |
| session_id 前端生成 | 無需 auth 即可串連單次 session 行為 |
| 透過 API route 寫入 | 不暴露 Supabase service_role key 給前端 |

---

## 三、最小事件集合

### 3.1 事件定義表

| 事件名稱 | 觸發時機 | 關鍵 properties |
|---------|---------|----------------|
| `page_view` | 每個頁面載入（useEffect） | `{ title, path }` |
| `view_item_list` | 活動列表頁渲染完成 | `{ items: [{ id, name, price }], count }` |
| `select_item` | 點擊活動卡片（進入詳情頁） | `{ item_id, item_name, position }` |
| `view_item` | 活動詳情頁渲染完成 | `{ item_id, item_name, price, guide_id }` |
| `begin_checkout` | 點擊「立即預訂」並進入 checkout | `{ item_id, schedule_id, price }` |
| `purchase_intent` | checkout 頁面按下「確認付款」送出訂單 | `{ order_id, amount, schedule_id }` |
| `payment_callback_received` | `/api/payments/ecpay/callback` 收到回呼 | `{ order_id, trade_no, raw_result_code }` |
| `payment_succeeded` | 付款驗證成功，訂單狀態改為 paid | `{ order_id, amount, payment_provider }` |
| `error` | 任何可預期錯誤（API / 表單 / 付款） | `{ message, stack_summary, context }` |

### 3.2 漏斗對應

```
view_item_list          ← 有多少人看到活動列表
  ↓ select_item         ← 有多少人點入詳情
  ↓ view_item           ← 有多少人看完詳情（確認有流量）
  ↓ begin_checkout      ← 有多少人點「立即預訂」
  ↓ purchase_intent     ← 有多少人送出訂單
  ↓ payment_callback_received ← 有多少人進入付款流程
  ↓ payment_succeeded   ← 最終付款成功率
```

---

## 四、架構圖

```
前端（Next.js）
  ↓ POST /api/events  （不暴露 Supabase key）
後端 API Route（apps/web/app/api/events/route.ts）
  ↓ Supabase service_role
events table（PostgreSQL）
  ↓ SQL 查詢 / Supabase Dashboard
漏斗分析 / 管理後台（未來）
```

---

## 五、下一步最小實作

| 優先 | 項目 | 估時 |
|------|------|------|
| P0 | 008_events.sql migration 執行到 Supabase | 30 min |
| P0 | `POST /api/events` API route | 1h |
| P0 | `src/lib/track.ts` helper（前端呼叫） | 1h |
| P1 | `begin_checkout` + `purchase_intent` 打點（checkout page） | 1h |
| P1 | `payment_callback_received` + `payment_succeeded` 打點（API） | 1h |
| P2 | `page_view` + `view_item_list` + `select_item` + `view_item` 打點 | 2h |
| P2 | 管理後台漏斗查詢頁 | 4h |

**本次 TP-001 交付範圍**：P0 骨架（migration SQL + API route + track helper）
