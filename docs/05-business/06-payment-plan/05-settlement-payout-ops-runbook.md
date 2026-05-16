# 導遊 Settlement / Payout 營運 Runbook

> 版本：v1 soft-launch
> 狀態：已拍板
> Owner：Wei
> 關聯：#446–#449 (技術實作), #508 (guide round-2), #504 (evidence pack), #505 (Go/No-Go)

---

## 1. Soft-launch 第一階段決策：人工先行

**決定：** soft-launch 第一階段採用「人工先行」模式。
- Admin 系統已可生成 payout 記錄與金額計算，但**不執行自動銀行轉帳**
- 由 Wei（maker）+ 第二位確認人（checker）手動核准並轉帳
- 系統批次轉帳功能（T+7 自動）在 soft-launch 期間設為「生成記錄但不自動執行」

**原因：**
- 確保首筆真實撥款有足夠人工核查
- 避免系統/環境設定問題導致錯誤轉帳
- 積累一到兩輪人工確認後，再轉為批次自動

---

## 2. 第一筆 Payout 前置條件

以下全部符合才可執行：
- [ ] 對應活動狀態為 `completed`
- [ ] 活動完成日 + 7 天（T+7）已過
- [ ] 無 `refund_pending` 或 `dispute` 訂單（該筆活動的所有訂單）
- [ ] 導遊 `guide_balances.pending_amount` ≥ NT$5,000（最低提款門檻）
- [ ] 導遊收款帳戶資料已完成且通過人工核查（存於受控位置，不進 repo）
- [ ] Admin 已在 Admin 後台確認 payout 記錄（`payouts.status = confirmed`）

---

## 3. Maker/Checker 流程

### Maker（Wei）
1. 登入 Admin 後台 → Payouts 頁面
2. 確認待付款記錄（status = confirmed）
3. 核對 guide_balances、訂單明細、抽成計算
4. 執行銀行轉帳（手動）
5. 記錄轉帳結果：日期、金額、參考號碼

### Checker（第二位確認人）
1. 覆核轉帳憑證與 payout 記錄一致
2. 確認導遊收款帳戶（名稱、帳號 — 核查後遮蔽）
3. 在 Admin 後台或 payout 紀錄標記 `verified`

### 失敗重試
- 轉帳失敗 → 通知導遊、記錄原因、72h 內重試
- 重試超過 2 次仍失敗 → 升級 Wei，評估人工補償或延後

### Hold/Rollback
- 若發現金額計算錯誤 → 暫停（HOLD），修正後重啟
- 若 guide_balances 與 payout 記錄不一致 → 停止，開 bug issue

---

## 4. 對帳 Evidence 格式

每筆 payout 需留：

| 欄位 | 說明 | 公開 repo? |
|------|------|-----------|
| payout_id | DB payout.id | ✅（遮蔽後半段）|
| guide_id | guide.id | ✅（遮蔽後半段）|
| 應付金額 | NT$ 數字 | ✅ |
| 實付金額 | NT$ 數字 | ✅ |
| 轉帳日期 | YYYY-MM-DD | ✅ |
| 轉帳參考號 | 銀行參考碼 | ❌（受控位置）|
| 導遊帳戶 | 銀行帳號 | ❌（受控位置）|
| 確認人 | 角色名稱 | ✅ |
| 驗證人 | 角色名稱 | ✅ |

遮蔽後摘要可進 issue comment 或 docs/qa/evidence/。

---

## 5. KYC / 收款資料邊界

**可進公開 repo：**
- 流程說明（需提供哪些資料）
- 審核狀態（已完成/待確認）

**只能放受控位置（不進 repo）：**
- 導遊姓名、身份證字號
- 銀行帳號、戶名
- KYC 文件影本

**處理原則：**
- KYC 資料由 Wei 保管於受控位置
- 使用後 90 天封存，1 年後評估刪除
- 疑似外洩 → #529 P0 incident response

---

## 6. 與 Go/No-Go 的關係

若第一筆 payout 尚未執行：
- Admin Go/No-Go 自動顯示 `HOLD`（`EVIDENCE_318_SIGNED` 等相關環境變數未設為 true）
- Wei 在 evidence pack (#504) 中記錄：「settlement/payout: 人工先行模式，第一筆待執行，預計 [日期]」
- Go/No-Go 判定：允許 soft-launch（僅限已完成 T+7 的活動），但 payout evidence 需在 soft-launch 後 14 天內補齊

---

## 7. Dry-run 紀錄模板

### PR-001 人工 Payout Dry-run

- 日期：[YYYY-MM-DD]（模擬）
- 導遊 ID：[guide_id 前 8 碼]-[REDACTED]
- 活動：[activity_id 前 8 碼]-[REDACTED]
- Payout 金額：NT$ [已遮蔽]
- Maker：Wei
- Checker：[角色]
- 轉帳結果：[success/fail/pending]
- 備注：首次 soft-launch dry-run；未使用真實銀行帳戶
