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
- **Supabase backup & restore runbook** — `docs/operations/supabase-backup-restore-runbook.md`（資料層 P0/P1 recovery 主流程；§2 決策樹涵蓋 migration 失敗 / 誤刪 / 資料漂移三種情境；§4 post-restore smoke checklist 覆蓋 schema、row counts、orphan refs、payment events 與 soft_launch_controls 一致性驗證）
- **Restore drill template** — `docs/operations/drills/2026-05-24-supabase-restore-drill-template.md`（演練 #724 用模板；填寫後留存為 evidence）

### 6.1 P0/P1 Recovery 必含的資料一致性驗證（連回 backup/restore runbook）

P0/P1 事故 close-out 前，若涉及資料層改動（含 production 寫入、migration、restore），必須完成以下 backup/restore runbook §4 post-restore smoke 對應檢查並留在事故 post-mortem 中：

- [ ] **Schema verification**（`SELECT tablename FROM pg_tables WHERE schemaname='public'`）— 確認核心表全在：activities, activity_plans, activity_schedules, bookings, booking_status_logs, guide_availability_rules, guide_blackout_dates, guide_balances, incidents, order_items, orders, payment_events, payouts, refund_requests, soft_launch_controls
- [ ] **Activities count > 0** + **Orders count** 與事故前期望值差異可解釋
- [ ] **No orphan order_items**（LEFT JOIN orders WHERE orders.id IS NULL → count 0）
- [ ] **No orphan bookings**（LEFT JOIN orders WHERE orders.id IS NULL AND bookings.status != 'abandoned' → count 0）
- [ ] **Payment events all reference valid payments**（LEFT JOIN payments WHERE payments.id IS NULL → count 0）
- [ ] **`soft_launch_controls` 狀態 intact**（最近 5 筆 flag 值未被誤改）

若任一項不通過：
1. 不可宣告事故 close-out。
2. 套用 §8.6.1 保守處理（若涉及 PII / 金流）並升級為 deferred 在 §8.6.2 紀錄。
3. 若涉及資料 restore，依 backup runbook §3 決策樹 + §5 升級條件處理；payment data 缺失視為 P0 並 page Wei + Wei 的銀行聯絡窗口。

## 7. 後續待補
- 法規通報義務對照表 → 見 [§8 法規/合規通報義務矩陣](#法規合規通報義務矩陣初版)

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

## 法規/合規通報義務矩陣（初版）

> ⚠️ 本矩陣為 AI 草稿，需 Wei / 法律顧問 / 保險顧問 / 金流 provider 確認後方可視為正式意見。
> 標記 [需確認] 的欄位表示仍有法律不確定性。

### 8.1 個資 / 帳號 / Session 疑似外洩

| 欄位 | 說明 |
|------|------|
| **Owner** | Wei + 工程師 |
| **升級時限** | P0: 1 小時內；P1: 4 小時內 |
| **需諮詢角色** | 法律顧問、資安顧問 |
| **候選外部通報** | 個人資料保護委員會（台灣個資法 §22）[需確認時限] |
| **證據保存** | 系統 log、access log 至少 6 個月；疑似被盜資料目錄 |
| **對外溝通限制** | 未確認範圍前不對外公告；確認後依法律建議決定時程 |
| **#531 evidence governance** | 外洩的 storageState/token 立即撤銷（見 §3）|

### 8.2 付款 / 退款 / 金流 Provider 異常

| 欄位 | 說明 |
|------|------|
| **Owner** | Wei |
| **升級時限** | P1: 2 小時內；P2: 同工作日 |
| **需諮詢角色** | ECPay 客服、法律顧問（如涉及受款失敗/多重扣款）|
| **候選外部通報** | ECPay（異常回報）；必要時金管會 [需確認：適用門檻] |
| **證據保存** | payment_events log、ECPay 回應 log 至少 6 個月 |
| **對外溝通限制** | 確認金流狀態後再通知受影響旅客；不公開 provider 細節 |
| **旅客補償** | 依退款政策 v2（見 04-refund-policy-v2.md）+ Admin override |

### 8.3 旅遊現場安全事故 / 導遊失聯

| 欄位 | 說明 |
|------|------|
| **Owner** | Wei + 客服 Lead |
| **升級時限** | P0（旅客受傷）: 即時；P1（導遊失聯）: 4 小時 |
| **需諮詢角色** | 保險顧問（旅遊責任險適用性）、緊急聯絡鏈（見 #319）|
| **候選外部通報** | 急診/警方（旅客受傷）；保險公司（責任險理賠申請）[需確認] |
| **證據保存** | 事故時間、地點、當事人記錄；通訊截圖（遮蔽個資）|
| **對外溝通限制** | 依保險顧問建議；不在社群媒體自發說明 |

### 8.4 大面積服務中斷 / 錯誤 Email 發出

| 欄位 | 說明 |
|------|------|
| **Owner** | 工程師 + Wei |
| **升級時限** | P0: 30 分鐘內確認範圍；P1: 2 小時內 |
| **需諮詢角色** | 法律顧問（錯誤 Email 若含 PII）；Resend（deliverability）|
| **候選外部通報** | 無強制；若錯誤 Email 含他人個資 → 個資法通報 [需確認] |
| **證據保存** | Resend/email log（遮蔽收件人）；錯誤 Email 範本 copy |
| **對外溝通限制** | 確認範圍後以官方管道（App/Email）說明；避免誇大或輕描 |

### 8.5 整體原則

- 本矩陣為初步判斷用，不取代法律諮詢。
- 所有 P0/P1 事故均需同步更新 post-mortem（見 §5.5 模板）。
- 任何涉及外部通報的決定，需 Wei 批准後執行。
- 若不確定是否需通報，寧可諮詢再決定，不可靜默忽略。

---

## 法規/合規通報義務矩陣 — 決策記錄（Decision Log）

> 本節記錄每個 `[需確認]` 項目的決策狀態。以下為 soft launch 期間的**保守預設處理方式**，待 Wei / 外部顧問確認後更新為正式立場。
>
> 建立日期：2026-06-03（AI草稿由 tour-loop 生成）
> 狀態：**DRAFT — 待 Wei 確認各項決策**

### D.1 個資 / 帳號 / Session 疑似外洩 → §8.1

| 項目 | `[需確認]` 內容 | 保守預設 (soft launch) | 決策狀態 |
|------|------|------|------|
| 個資法通報時限 | 個人資料保護委員會（台灣個資法 §22）的強制通報時限是否 72 小時或有所不同？ | **DEFERRED**: 事故發生時立即諮詢法律顧問，未確認前保守做法為「24 小時內完成內部評估，若涉及外洩則同日內諮詢是否需通報」 | ⬜ 待 Wei 確認 |
| 確認角色 | 需要法律顧問、資安顧問的哪一方？是否有 retainer 聯絡人？ | **DEFERRED**: 暫依 Wei 直接決定，事後補簽法律顧問 | ⬜ 待 Wei 確認 |

### D.2 付款 / 退款 / 金流 Provider 異常 → §8.2

| 項目 | `[需確認]` 內容 | 保守預設 (soft launch) | 決策狀態 |
|------|------|------|------|
| 金管會通報門檻 | 付款異常/多重扣款需向金融監督管理委員會通報的適用門檻為何？ | **DEFERRED**: soft launch 期間預設不向金管會通報（規模小），但任何多重扣款立即停止結帳流程並通知 ECPay；若累積金額超過 NTD 1,000 或 3 筆，升級為 Wei 決定是否諮詢 | ⬜ 待 Wei 確認 |

### D.3 旅遊現場安全事故 / 導遊失聯 → §8.3

| 項目 | `[需確認]` 內容 | 保守預設 (soft launch) | 決策狀態 |
|------|------|------|------|
| 保險公司理賠時機 | 旅遊責任險何時啟動理賠申請？是否有 24 小時通報義務？ | **DEFERRED**: 旅客受傷時立即聯繫保險顧問；若保險顧問電話/聯絡人未確認，保守做法為「事故後 24 小時內書面告知事故摘要給 Wei，由 Wei 決定保險申請」 | ⬜ 待 Wei 確認保險顧問聯絡方式 |

### D.4 大面積服務中斷 / 錯誤 Email 發出 → §8.4

| 項目 | `[需確認]` 內容 | 保守預設 (soft launch) | 決策狀態 |
|------|------|------|------|
| 個資法通報（錯誤 Email 含 PII） | 錯誤發送含其他用戶個資的 Email，是否觸發個資法強制通報？ | **DEFERRED**: 若發送的錯誤 Email 含收件人名稱/訂單資訊/其他用戶 PII，保守做法為「立即 Resend 緊急暫停、告知 Wei、24 小時內諮詢法律顧問判斷通報義務」；若只含內部操作記錄（無個資），不通報 | ⬜ 待 Wei 確認 |

### D.5 確認角色總覽（由 Wei 填寫）

| 角色 | 是否需要 | Owner | 聯絡方式 | 備註 |
|------|------|------|------|------|
| 法律顧問 | ⬜ 待確認 | Wei | — | 個資法 §8.1 / §8.4 |
| 保險顧問 | ⬜ 待確認 | Wei | — | 旅遊責任險 §8.3 |
| ECPay 客服 | ✅ 已有 | Wei | 依 ECPay 合約 | §8.2 |
| 金管會通報 | ⬜ 待確認 | Wei | — | soft launch 預設不觸發 |

### D.6 相鄰 SOP 口徑對齊

本矩陣的通報/升級口徑應與下列 issue 一致：
- #319 客服 SOP 演練：升級路徑需引用 §8.3 緊急聯絡鏈
- #593 活動安全/保險 posture：§8.3 保險申請觸發條件
- #606 KYC 資料保存：§8.1 個資外洩時的保存標準
- #320 Go/No-Go gate：任何未確認的 DEFERRED 項目應列為 soft launch 前必確認清單

### D.7 下一次複查時機

- **Soft launch 前**（第一筆真實付款前）：Wei 需確認 D.1 法律顧問聯絡方式 + D.3 保險顧問聯絡方式。
- **首月後**：複查 D.2 金管會門檻是否因交易量增加而需更新。
