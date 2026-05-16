# 導遊自主操作 Round 2 計畫

> 版本：v1
> Owner：Wei
> 前置條件：#318 Round 1 onboarding demo run 完成
> 關聯：#402（payment/refund evidence）, #319（CS SOP）, #540（payout runbook）, #504（evidence pack）

---

## 1. Round 1 vs Round 2 差異

| 面向 | Round 1 (#318) | Round 2 (#508) |
|------|---------------|---------------|
| 協助程度 | 有 operator 陪同指導 | 最小協助，導遊自主操作 |
| 活動設置 | 1 個活動到 publishable 狀態 | 完整週期（設置→預訂→付款→退款→撥款）|
| 付款 | 不含真實付款 | 協同 #402 執行 controlled 付款 |
| 退款 | 不含 | 協同 #319 CS SOP 演練退款申請 |
| 撥款 | 不含 | 決定 real/sandbox/deferred（見 #540）|

---

## 2. Round 2 前置條件

- [ ] #318 Round 1 回顧報告已完成
- [ ] #402 real payment 環境可用（ECPay sandbox 或 real）
- [ ] #403 traveler browser session 可用（storageState 有效）
- [ ] #540 payout 模式決定（human-first / deferred）
- [ ] Admin 後台 soft-launch 控制已就緒（#506 完成 ✅）

---

## 3. Round 2 Checklist

### A. 自主登入與個人資料
- [ ] 導遊自行登入 guide dashboard（無 operator 操作）
- [ ] 更新個人簡介、頭像
- [ ] 確認通知設定可用

### B. 活動編輯（自主操作）
- [ ] 修改現有活動：標題、描述、價格
- [ ] 新增或修改場次（日期、時間、容量）
- [ ] 上傳圖片（AvatarUpload / ImageUpload）
- [ ] 確認活動狀態變更（draft → active）

### C. 預訂與付款（協同 #402）
- [ ] 旅客端下單（使用 traveler storageState）
- [ ] Controlled payment 執行（ECPay sandbox 或 real，記錄結果）
- [ ] Admin 確認訂單 → confirmed 狀態
- [ ] 導遊查看 guide dashboard 的新訂單

### D. 退款申請（協同 #319）
- [ ] 旅客端提交退款申請
- [ ] Admin 審核 refund request
- [ ] 執行退款（admin refund execute）
- [ ] 確認 orders.status = refunded + payment_events 記錄
- [ ] 旅客通知（email via Resend）

### E. 撥款/結算（參考 #540 runbook）
- [ ] 確認 guide_balances.pending_amount 正確
- [ ] 決定本輪 payout 模式（real / sandbox / deferred + 記錄原因）
- [ ] 若執行 payout：maker/checker 核准 → 轉帳 → 記錄結果
- [ ] 若 deferred：記錄 blocker、owner、下次驗證時間

---

## 4. 自主 vs 協助操作分類

每個步驟記錄：**S**（Self = 導遊自主）/ **A**（Assisted = operator 協助）/ **B**（Blocked = 有阻塞）

| 步驟 | 預期 | 實際（填寫）| 備注 |
|------|------|-----------|------|
| 登入 | S | | |
| 活動編輯 | S | | |
| 場次管理 | S | | |
| 圖片上傳 | S | | |
| 訂單查看 | S | | |
| 退款查看 | S | | |
| 收款資料設定 | A（首次）| | |

---

## 5. 高嚴重度阻塞點識別

若以下情況發生，記錄為 blocker 並開 follow-up issue：
- 導遊無法自行登入（login hang / OAuth 問題）
- 活動設置超過 30 分鐘仍無法完成
- 付款路徑有技術錯誤（非 sandbox 限制）
- 退款申請 UX 不清晰或有 bug
- 撥款金額計算不正確

---

## 6. Payout/Bank-account 決定

**本輪決定（請填寫）：**
- [ ] Real payout（需 KYC + 銀行帳戶完成）
- [ ] Sandbox（使用測試帳號，不真實轉帳）
- [x] **Deferred** — Owner：Wei，原因：等待首輪 real payment evidence 完成，時間：TBD

（人工先行模式詳見 `06-settlement-payout-ops-runbook.md`）

---

## 7. Evidence 格式

每個 Round 2 步驟留下：
- 執行者：[導遊 / operator]
- 日期：
- 結果：PASS / FAIL / BLOCKED
- 備注：
- 截圖/log：[受控位置路徑，遮蔽後]
