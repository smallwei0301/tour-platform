# Issue #177 — Admin POS Operator-Ready Manual Checklist (Phase 12)

> Parent: #15  
> Issue: #177  
> Scope type: docs/QA truth slice (operator-run manual checklist)

## 0) 目的與使用方式

此清單用於 **Phase 12 readiness review** 的 Admin POS 手動驗證與 operator sign-off。  
本文件只使用 repo 內已存在且可追溯的事實，不推測未落地能力。

- 適用場景：Admin POS Lite 手動演練（happy path / known failure / recovery）
- 證據原則：每一步都要附「時間戳 + 操作人 + 截圖/日誌/API 回應」
- 真實性標記：
  - `VERIFIED`：已有實測證據（可附在本次執行紀錄）
  - `NOT VERIFIED`：可執行但本輪未完成驗證
  - `BLOCKED`：依賴尚未提供，無法真實驗證

---

## 1) 測試前欄位（operator 先填）

- 環境：`____`
- 執行日期：`____`
- 操作人：`____`
- 版本 / Commit SHA：`____`
- 關聯 issue / PR：`#177 / ____`

### 1.1 前置條件 Gate

- [ ] 可以存取 Admin POS API（參考：`docs/04-tech/04-tech-architecture/10-api-spec-v2-booking-pos.md`）
- [ ] 可觀察訂單/付款/退款資料（DB 或後台查詢）
- [ ] 可取得 availability snapshot 狀態（參考：`docs/operations/availability-snapshot.md`）
- [ ] 可取得 audit 證據（至少 action/source/correlation 相關欄位；參考：`docs/implementation/issue-170-audit-field-contract-and-troubleshooting.md`）

---

## 2) Path A — Happy Path（Admin POS 建單 + 補款）

### A-1 建立 POS 訂單

- [ ] 呼叫 `POST /api/v2/admin/pos/orders`
- [ ] 驗證 response 成功，取得 `orderId`（若有 `bookingId` 也記錄）
- [ ] 證據：request/response、時間戳、operator
- 狀態：`NOT VERIFIED`

### A-2 對同一張單新增付款

- [ ] 呼叫 `POST /api/v2/admin/pos/orders/:orderId/payments`
- [ ] 驗證 order/payment 狀態有變更（例如 pending -> paid）
- [ ] 證據：payment request/response、狀態變更截圖或查詢結果
- 狀態：`NOT VERIFIED`

### A-3 Availability Refresh 驗證（Happy Path 必做）

依 `docs/operations/availability-snapshot.md`，訂單建立/付款流程應觸發 `tryRefreshAvailabilitySnapshotByOrderId(orderId)`。

- [ ] 以剛建立的 `orderId` 驗證 snapshot refresh 有被觸發
- [ ] 檢查 snapshot-vs-schedule 未出現不可解釋漂移
- [ ] 證據：refresh 相關 log / source marker / reconcile 對照記錄
- 狀態：`NOT VERIFIED`

### A-4 Audit 驗證（Happy Path 必做）

- [ ] 驗證 POS 手動操作有 audit 足跡（action/actor/target/source_channel/correlation_id）
- [ ] `source_channel` 應為 `admin_pos`（若為 callback/system 需有合理解釋）
- [ ] 證據：`booking_status_logs` / `payment_events` / `audit_logs` 查詢結果
- 狀態：`NOT VERIFIED`

---

## 3) Path B — Known Failure Path（可預期失敗）

> 目標：確認「失敗可被辨識、可追溯、可啟動回復」。

### B-1 觸發已知失敗場景（擇一，需留證據）

- [ ] 無效 `orderId` 下執行 POS 補款，應得到可預期錯誤（如 `NOT_FOUND`）
- [ ] 或：輸入不合法金額/參數，應得到 `VALIDATION_ERROR` 類型
- [ ] 證據：錯誤碼、錯誤訊息、請求 payload
- 狀態：`NOT VERIFIED`

### B-2 Availability Refresh 失敗可觀測性

- [ ] 失敗案例中可判斷 refresh 是否未執行/執行失敗/需 reconcile
- [ ] 若有落差，建立 incident note 並指定補救（例如手動 reconcile）
- [ ] 證據：錯誤 log、source marker、補救紀錄
- 狀態：`NOT VERIFIED`

### B-3 Audit 失敗路徑覆蓋

- [ ] 失敗事件仍有可追溯 audit（至少包含 action + target + source）
- [ ] 若缺 `source_channel` 或 `correlation_id`，標記 release blocker
- [ ] 證據：查詢結果 + blocker 記錄
- 狀態：`NOT VERIFIED`

---

## 4) Path C — Recovery Path（回復演練）

### C-1 失敗後重試或替代操作成功

- [ ] 依失敗原因，修正輸入後重試成功（建單或補款）
- [ ] 確認狀態鏈一致（避免 orphan payment / 無關聯 booking）
- [ ] 證據：失敗前後對照、最終成功證據
- 狀態：`NOT VERIFIED`

### C-2 Availability Recovery 驗證

- [ ] 若發生 snapshot 落差，執行 reconcile/backfill 並確認恢復一致
- [ ] 證據：reconcile 執行記錄 + 恢復後對照結果
- 狀態：`NOT VERIFIED`

### C-3 Audit Recovery 驗證

- [ ] 失敗到回復全流程可串接同一條關聯線（或明確說明切鏈原因）
- [ ] 缺欄位/斷鏈需列入 follow-up issue，不得在報告中省略
- [ ] 證據：correlation/target 串查結果
- 狀態：`NOT VERIFIED`

---

## 5) Rollback / Observability / Risks（readiness 必填）

### 5.1 Rollback（操作層）

- [ ] 已定義失敗觸發回退條件（何時停止 POS 手動流程、改走既有安全路徑）
- [ ] 已定義回退後驗證項（訂單狀態一致性、付款一致性、availability source）
- [ ] 證據：回退決策紀錄 + 驗證結果
- 狀態：`NOT VERIFIED`

### 5.2 Observability（最小監看）

- [ ] 能觀察 availability source（snapshot/schedule）
- [ ] 能觀察 audit 欄位缺失風險（參考 #170 指標：missing source/correlation 等）
- [ ] 能在 1 個案例內完成 booking→order→payment（→refund，如有）追鏈
- 狀態：`NOT VERIFIED`

### 5.3 已知風險（本文件真實聲明）

1. 本 repo 目前 **未找到** `docs/qa/issue-171-audit-verification-checklist.md` 實體檔案；Audit 驗證需以 #170 契約與實際查詢證據替代，屬 `BLOCKED` 風險。  
2. 本清單為 issue-177 專用 operator checklist；不宣稱 #176 或 #182 深層相容性已完成。  
3. 若缺少可查詢的 runtime/DB 證據管道，operator sign-off 必須 `HOLD`。

---

## 6) Operator Sign-off

- 總結：`GO / HOLD / BLOCKED`
- 判定理由（必填）：`____`
- 阻塞項目（若有）：`____`
- 下一步 owner（Judy/Tracy/QA）：`____`
- 簽核人：`____`
- 簽核時間：`____`

---

## 7) 來源與對齊依據（truth anchors）

- `docs/04-tech/04-tech-architecture/10-api-spec-v2-booking-pos.md`
- `docs/operations/availability-snapshot.md`
- `docs/implementation/issue-170-audit-field-contract-and-troubleshooting.md`
- `docs/qa/booking-v2-rollout-manual-checklist.md`（格式參考，不等同 issue-177 專用清單）
- `docs/implementation/phase-12-mainline-matrix.md`（Phase 12 追蹤脈絡）
