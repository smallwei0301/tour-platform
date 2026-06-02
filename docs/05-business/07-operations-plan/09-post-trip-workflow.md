# Post-Trip Operations Workflow

> 狀態：v1 — soft-launch 版本（人工介入為主）
> 建立日期：2026-06-03（refs issue #1106）
> 技術支援：post-trip-eligibility.mjs 模組，endpoints /api/v2/admin/orders/{id}/post-trip-status

---

## 1. 出團後流程概覽

```
活動結束
    │
    ├─ 0–24小時 ──► 旅客 review 邀請（若符合資格）
    │
    ├─ 0–24小時 ──► 導遊 trip report（有或無）
    │              └─ 未交報告 → Admin follow-up: guide_report_risk
    │
    ├─ 24小時後 ──► 計算 payout eligibility
    │              ├─ 無爭議/退款 → 加入下批結算
    │              └─ 有 hold 原因 → Admin follow-up: 依 holdReason 類別
    │
    └─ 隨時 ──────► 旅客投訴/爭議 → Admin follow-up: refund_dispute_safety
```

---

## 2. 各事件的觸發條件（純邏輯，非自動執行）

> 目前（v1 soft-launch）所有動作均為**人工觸發**。自動化可在穩定後逐步加入。

### 2.1 Review Invitation（評價邀請）

**觸發條件（同時滿足）：**
- 訂單狀態 ∈ {paid, confirmed, completed}
- `schedule.end_at < now`（活動已結束）
- `now - schedule.end_at ≥ 24小時`
- 無下列排除條件：cancelled/refunded/no_show/disputed/hasComplaint/refundAmountTwd>0/isSafetyCase

**人工介入點：**
1. Admin 從 `/api/v2/admin/orders/post-trip-summary?since=7d` 取得符合資格的訂單列表
2. 確認無爭議/退款
3. 手動發送邀請 Email（或未來 API endpoint 執行）

**NOT 邀請的情況（記錄 reason）：**
- 取消 / 退款 / 旅客 no-show
- 有投訴 / 安全事故 / 付款爭議

---

### 2.2 Guide Trip Report（導遊出行報告）

**觸發條件：**
- 每筆已結束的真實出團（`schedule.end_at < now`）
- 報告提交期限：活動結束後 24 小時

**狀態：**
| 狀態 | 條件 |
|------|------|
| `pending` | 活動已結束，24h 內未提交 |
| `submitted` | 導遊已提交報告 |
| `overdue` | 超過 24h 未提交 |

**Admin follow-up（overdue）：**
1. `adminFollowupCategory` = `guide_report_risk`
2. Admin 聯繫導遊確認出團情況
3. 若出團正常但未填寫 → 督促填寫
4. 若有特殊狀況 → 升級到 incident response

> **注意**：目前尚未有 guide_trip_reports 資料表。`tripReportStatus` 回傳的 `submittedAt` 永遠為 null，所有過期出團都顯示 'overdue'。建立表後再接入真實資料。

---

### 2.3 Payout Eligibility（入帳資格）

**Hold 條件（任一成立 → payout 暫停）：**

| holdReason | 觸發條件 | 解除條件 |
|---|---|---|
| `payment_dispute` | 付款爭議開啟 | 爭議解決 |
| `safety_review` | 安全事故/旅客受傷 | 事後評估完成 |
| `complaint_under_review` | 有效投訴進行中 | Admin 結案 |
| `refund_pending` | 退款金額 > 0 | 退款完成 |
| `oversell_investigation` | 超賣調查 | 調查結案 |

**正常結算條件：**
- `isPayoutOnHold` → null（無 hold 原因）
- `isCompletionEligible` → true
- v1 soft-launch：仍為人工計算 + Admin 手動觸發

---

### 2.4 Admin Follow-up Queue（行政跟進隊列）

**類別及優先順序（高到低）：**

| Category | 觸發條件 | 處理 SLA |
|---|---|---|
| `refund_dispute_safety` | 安全事故 / 有效投訴 | 立即 (P0) |
| `payment_order_mismatch` | 付款爭議 / 金流異常 | 2小時 (P1) |
| `guide_report_risk` | 導遊報告逾期 | 24小時 (P2) |
| `review_moderation` | 差評/敏感 review 待人工審核 | 48小時 (P3) |

**查詢方式：**
```bash
# 取得 Admin 需要跟進的訂單
source /root/.openclaw/workspace/tour-platform/.env
curl -H "Authorization: Bearer $ADMIN_ACCESS_TOKEN" \
  "$STAGING_HEALTHCHECK_URL/api/v2/admin/orders/post-trip-summary?since=7d"
```

---

## 3. 人工介入決策樹

```
接到 post-trip 事件
    │
    ├── 是否有人身傷亡？
    │   YES → §8.3 緊急聯絡鏈 → 保險顧問 → incident report
    │
    ├── 是否有退款/付款爭議？
    │   YES → §8.2 ECPay 流程 → Admin POS 手動處理
    │
    ├── 是否有旅客投訴（低於 3 星或文字投訴）？
    │   YES → Admin 先看評語 → 決定：公開回應 / 補償 / 升級
    │
    ├── 導遊報告逾期？
    │   YES → LINE 聯繫導遊 → 確認出團情況 → 督促填寫
    │
    └── 一切正常 → 加入下批結算佇列
```

---

## 4. 隱私與證據邊界

- **Review 邀請 Email**：不在邀請中包含訂單金額、導遊身份（只說「你的最近行程」）
- **Trip Report**：只由 Admin 和導遊看到，旅客無法看到
- **事故報告**：遵循 `04-incident-response.md §5.5` post-mortem 模板；不在 GitHub issue/PR 中放入旅客個資
- **Payout records**：不在 Slack/LINE/Email 中明文傳遞銀行帳號或結算金額

---

## 5. V1 Software vs 未來自動化路線

| 功能 | V1 Soft-launch (手動) | 未來自動化 |
|------|------|------|
| Review invitation | Admin 手動發送 | CRON job + Resend API |
| Trip report reminder | Admin 手動聯繫 | Messaging API + 24h reminder job |
| Payout eligibility check | Admin 手動查 `/api/v2/admin/orders/post-trip-summary` | CRON → settlement pipeline |
| Follow-up queue | Admin 手動優先排序 | Admin dashboard widget |

---

## 6. 關聯文件

- 技術：`apps/web/src/lib/post-trip-eligibility.mjs`（pure predicates）
- API：`GET /api/v2/admin/orders/{orderId}/post-trip-status`
- API：`GET /api/v2/admin/orders/post-trip-summary`
- 退款 SOP：`docs/05-business/06-payment-plan/04-refund-policy-v2.md`
- 事故處理：`docs/05-business/07-operations-plan/04-incident-response.md`
- 緊急聯絡：`docs/05-business/07-operations-plan/05-emergency-contact-chain.md`
- 結算 SOP：`docs/05-business/06-payment-plan/05-settlement-payout-ops-runbook.md`
