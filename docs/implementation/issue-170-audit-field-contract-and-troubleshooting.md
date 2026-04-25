# Issue #170 — Audit Field Contract and Troubleshooting Guide

> Status: doc-only isolated slice  
> Scope: 統一 audit 欄位契約與排錯路徑，供 POS / LINE / Web / callback 共用  
> Out of scope: schema redesign、migration spec、完整 backfill 保證、#171 驗證包實作

---

## 1) 目標與適用範圍

本文件定義 **critical write operations** 的共同契約，避免不同入口（POS、LINE、Web、payment callback）寫出互不相容的 audit 資料。

適用資料落點（依現有實作逐步對齊）：
- `booking_status_logs`
- `payment_events`
- `audit_logs`

本文件是 POS 與 LINE 共用的 contract/troubleshooting 參考層；實作細節由各 issue slice 落地。

---

## 2) Canonical Field Contract

### 2.1 `source_channel` 契約

**Required**（所有 critical write 事件必填，至少放在 metadata/payload）

允許值（目前標準）：
- `web`：前台 Web / admin web 但非 POS 操作
- `line`：LINE / LIFF 觸發流程
- `admin_pos`：POS / 後台營運人工操作
- `system`：排程、補償、callback replay 或機器流程

規則：
1. 不可留空；未知來源不得寫 `null`，改用 `system` 並補 `reason`。
2. 同一交易鏈（booking → order → payment → refund）內，不可任意改寫來源語意。
3. callback 類事件若來自金流通知，`source_channel=system`，並在 payload 補 provider 資訊（如 `provider=ecpay`）。

### 2.2 `correlation_id` 契約

**Required for cross-entity chain**（任何跨 booking/payment/refund 的流程必填）

建議格式（可機器產生）：
- `corr_<uuid|ulid>`

規則：
1. 在第一個可識別入口生成（draft/checkout/POS 建單/LINE draft）。
2. 後續事件只能傳遞，不可重生（除非明確切新流程並註記）。
3. callback/replay 需沿用原鏈 `correlation_id`；若缺失，先補救查回，再寫事件。

### 2.3 `actor / action / target / before / after` 契約

#### actor
- `actor_type`: `user` | `admin` | `system`
- `actor_id`: 穩定識別（user id / admin id / service id）
- `actor_role`: 業務角色（`traveler` / `operator` / `system`）

規則：
- 人工操作不可只寫 role 不寫 id。
- 系統流程需可追到 service identity（例如 `payment_callback_worker`）。

#### action
- 使用動詞片語，且同義詞收斂（避免 `approve_refund` / `refund_approved` 混用）
- 建議命名：`<domain>.<verb>`，例如：
  - `booking.create_draft`
  - `booking.cancel`
  - `payment.callback_received`
  - `refund.approve`
  - `order.status_update`

#### target
- 最少要有一個主 target id，並補跨表關聯：
  - `booking_id`
  - `order_id`
  - `payment_id`
  - `refund_request_id`

規則：
- 若主事件是 payment，仍需盡可能帶 `order_id` / `booking_id` 以利追鏈。

#### before / after
- 狀態轉換型事件必填：
  - `before.status`
  - `after.status`
- 非狀態事件可省略，但若有金額/欄位變更，建議至少記錄 key diff。

---

## 3) Store Mapping（最小一致寫法）

| Store | Minimal fields |
|---|---|
| `booking_status_logs` | `booking_id`, `action`, `actor_*`, `source_channel`, `correlation_id`, `before/after`（若狀態轉換）, `created_at` |
| `payment_events` | `payment_id`, `event_type/action`, `payload.order_id`, `payload.booking_id`, `payload.source_channel`, `payload.correlation_id`, `created_at` |
| `audit_logs` | `action`, `target_*`, `actor_*`, `metadata.source_channel`, `metadata.correlation_id`, `before/after`（若有）, `created_at` |

> 原則：欄位名可因 table schema 不同而分佈在 column / metadata / payload，但語意必須一致。

---

## 4) Propagation Rules（入口到下游）

1. **入口生成**：Web/POS/LINE 第一個可識別寫入點建立 `correlation_id`，同時定義 `source_channel`。
2. **服務邊界傳遞**：API → service → DB write / provider callback handling，禁止掉欄位。
3. **回呼補寫**：payment callback 事件必須攜帶原鏈 `correlation_id` 與 target id。
4. **人工補登**：POS 手動補款/退款流程若跨多筆寫入，所有寫入共用同一 `correlation_id`。
5. **重試/重放**：idempotent path 可重寫事件，但 `correlation_id` / target 關聯不得漂移。

---

## 5) Troubleshooting Path（查不到 audit 時）

### Step 0 — 先定義查核輸入
至少提供一個：`booking_id` / `order_id` / `payment_id` / `refund_request_id`，及大概時間窗。

### Step 1 — 先找鏈路主鍵
1. 以已知 id 反查關聯 id（booking↔order↔payment↔refund）。
2. 若關聯缺失，先記錄為 data integrity blocker，再做 audit 判斷。

### Step 2 — 分表檢查
1. 查 `booking_status_logs`：是否有對應 target + source + actor。
2. 查 `payment_events`：是否存在 callback/paid/failed/refunded 事件。
3. 查 `audit_logs`：是否有 admin/manual action 與 before/after。

### Step 3 — 判斷缺失類型
- **A. 完全無事件**：可能未寫入或寫入條件漏掉。
- **B. 有事件但欄位缺失**：契約未落地（常見：`source_channel` / `correlation_id` 缺失）。
- **C. 有事件但鏈路斷裂**：target id 沒對齊（只能單點查，不能串查）。
- **D. callback 有寫但人工操作缺失**：POS/refund admin path audit 缺口。

### Step 4 — 快速定位責任層
- 入口層（controller/route）是否帶齊 contract fields。
- service 層 mapping 是否丟欄位。
- DB writer 是否把欄位塞進 metadata/payload。
- callback/replay 是否沿用原 `correlation_id`。

### Step 5 — 處置與回報
- 補 issue：標記缺失類型（A/B/C/D）、影響 flow（POS/LINE/Web/Callback）。
- 附上最小證據：查詢條件、缺失欄位、應有值。
- 若為 P0（無法追溯 who/what/target/source）→ 進入 release blocker。

---

## 6) Observability（建議監控）

最小可觀測性指標：
- `audit_missing_source_channel_count`
- `audit_missing_correlation_id_count`
- `audit_unlinkable_chain_count`（有 payment 但無 order/booking 關聯）
- `audit_manual_action_without_actor_id_count`

告警建議：
- 任一指標在 15 分鐘窗 > 0（P0 flow）即告警
- callback replay 流程若出現 correlation 漂移，升級為高優先

---

## 7) Rollback Strategy（文件契約層）

本文件是契約，不涉及 schema 變更。若新實作導致不相容：
1. 先回滾到「只新增欄位、不改語意」版本。
2. 保持舊欄位可讀，新增欄位以 metadata/payload 補齊。
3. 禁止在未完成相容層時直接改名或改 enum，避免查詢中斷。

---

## 8) Risks / Known Limitations

- 目前不同表的欄位結構未完全統一，需靠語意契約對齊。
- 舊資料可能沒有 `correlation_id`，歷史查詢仍可能斷鏈。
- callback replay 若上游缺鏈路資訊，需先做補救查詢再寫事件。
- 本文件不承諾自動 backfill；backfill 由後續 issue 定義。

---

## 9) References and Handoff Anchors

- Upstream context: **#165**（audit coverage matrix 層，定義 flow coverage；檔名慣例：`docs/implementation/phase-12-audit-coverage-matrix.md`）
- Downstream verification: **#171**（audit verification checklist / evidence gate；檔名慣例：`docs/qa/issue-171-audit-verification-checklist.md`）
- Parent epic: **#73**（No Audit Trail for Critical Operations）

> Handoff note: POS 與 LINE 後續實作（#174 / #178）應直接引用本文件的 field contract 與 troubleshooting path，避免各自定義。
