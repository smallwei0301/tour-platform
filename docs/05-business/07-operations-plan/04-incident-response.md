# 緊急應變手冊

> 最後更新：2026-04-20
> 狀態：v2 pre-launch 可執行版本

## 1. 目的
當發生技術事故、金流中斷、安全事件或出團現場異常時，提供一套可執行的應變流程。

## 2. 事故分級
### P0
- 金流全面中斷
- 資安事件 / 敏感資料外洩
- 大面積服務不可用
- **Owner**：Wei + 工程師
- **首次回應**：≤ 15 分鐘
- **狀態更新頻率**：每 30 分鐘
- **Recovery 條件**：服務恢復 + 金流驗證通過 + 確認無資料遺失

### P1
- 關鍵功能故障（如下單、付款、callback）
- 當日活動受到明顯影響
- **Owner**：工程師
- **首次回應**：≤ 1 小時
- **狀態更新頻率**：每 2 小時
- **Recovery 條件**：功能恢復 + 受影響訂單已確認

### P2
- 非關鍵功能異常
- 有 workaround，可暫時營運
- **Owner**：工程師
- **首次回應**：≤ 4 小時
- **狀態更新頻率**：下一個工作日更新
- **Recovery 條件**：workaround 已記錄

### P3
- 文件、後台非核心功能、單點 UI 問題
- **Owner**：工程師
- **首次回應**：≤ 1 個工作日
- **Recovery 條件**：問題已記錄 + 排程已告知

## 3. 應變原則
- 先止血，再追根因
- 優先保護使用者、訂單、金流與資料安全
- 緊急事件先明確指定 owner
- 所有重大事故都要留紀錄

## 3.5 通知矩陣（Notification Matrix）

| 等級 | 通知對象與時限 |
|------|----------------|
| P0 | 工程師（即時）、Wei（即時）、客服 Lead（30 分鐘內）、必要時旅客公告 |
| P1 | 工程師（即時）、Wei（1 小時內）、客服 Lead（2 小時內） |
| P2 | 工程師（即時）、Wei（下一個工作日） |
| P3 | Issue log 留存即可 |

> 實際聯絡人名單存於受控位置（不進 repo）

## 4. 常見情境
### 技術事故
- 服務掛掉
- 下單 / 付款 API 失敗
- callback 無法正確更新訂單

### 金流事故
- 付款成功但訂單未更新
- callback 驗簽失敗
- 退款流程異常

### 安全事故
- secret 洩漏
- session / auth 問題
- 可疑請求 / 濫用

### 營運事故
- 導遊失聯
- 當日活動無法出團
- 旅客受傷 / 爭議升級

## 5. 基本流程
1. 發現事故
2. 定級（P0/P1/P2/P3）
3. 指定 owner
4. 止血
5. 通知相關人
6. 修復 / workaround
7. 驗證恢復
8. 記錄與 post-mortem

## 5.5 Soft-launch Kill-switch 觸發條件（#506）

以下情境應主動評估啟用 `/admin/soft-launch` 控制面板對應開關：

| 情境 | 觸發動作 |
|------|----------|
| P0 金流中斷 | 立即啟用 `new_booking_paused=true` |
| P0 資安事件 | 啟用 `whitelist_enabled=true` |
| P1 付款 / 退款異常 | 評估啟用 `refund_manual_only=true` |

**解除條件**：Admin 確認 recovery 後，記錄解除原因並手動關閉開關。

**控制面板路徑**：`/admin/soft-launch`

## 6. 文件連動
- rollback runbook
- refund policy
- customer service SOP
- security evidence / closure docs

## 7. 後續待補
- 法規通報義務對照表

## Post-Mortem 模板

- 事故 ID：[日期]-[分類]-[序號]
- 嚴重等級：P0/P1/P2/P3
- 影響時間：[開始] → [結束]（共 N 分鐘）
- 影響範圍：[受影響功能/用戶數/訂單數]
- 根本原因：
- 事故時序（Timeline）：
  - HH:MM 發現
  - HH:MM 通知 owner
  - HH:MM 採取措施
  - HH:MM 服務恢復
- 緩解措施：
- 後續 follow-up（owner + 期限）：
- 決策者：

## Tabletop Dry-Run 紀錄

### DR-001: 付款成功但訂單未更新（P1 情境）

- 日期：2026-05-16（模擬）
- 情境：ECPay callback 送達但 order status 未更新為 paid
- 觸發：監控發現 payment_events 有 paid event 但 orders.status 仍為 pending_payment
- 處置步驟：
  1. 工程師確認 callback log 與 payment_events 記錄
  2. 若 callback 已記錄 → 手動觸發 backfill-refund-status.mjs --write --order-id <id>
  3. 通知受影響旅客訂單已確認
  4. 留 incident log + 開 follow-up 確認根本原因
- 結論：現有 backfill tool 可處理此情境；需確認監控告警觸發時間
