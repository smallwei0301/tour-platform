# Tour Platform 開發階段規劃與上線就緒指標（更新：2026-05-17）

## 📌 當前主線摘要（Pre-launch Readiness）

- live state 確認：Open issues = **#586 / #500 / #320 / #319 / #318**，open PR = **0**
- **#402/#403 已 CLOSED**：真實付款、退款、Email 與 Google session 的證據 runbook 保留作為歷史/運維參考，不再列為當前 blocker
- 目前主線重點：
  - **#500** 人工回歸與放行驗證（manual QA）
  - **#320** 人工決策與 go/no-go dashboard（soft-launch）
  - **#319** CS SOP 演練（取消/退款/出團異常/緊急事故）
  - **#318** 導遊 onboarding 實跑與回饋
  - **#586** 本任務（文件 live-state 同步）

## 🧭 當前可執行行動（5–10 分鐘上手）
1. 確認 `docs/README.md` 與 repo root README 的主線一致，重點以 open issues / merged PR 當天快照為準。
2. 進入 `docs/operations/issue-402-real-payment-refund-verification-runbook.md` 參考歷史驗證路徑（僅作參考），確認是否需補足最新人工證據與責任歸屬。
3. 收斂 `#500` 的人工驗證節點與 issue 記錄一致性。
4. 補齊 `#318/#319/#320` 的營運 handoff 文件（`docs/operations/*`、`docs/qa/*`）並保留可重複執行條件。

---

## ⚠️ 歷史文件（2026-04-09 快照，僅供回顧，不代表當前主線）

### 一、已償還/完成技術債（歷史）
- TD-001: 前台行程資料硬編碼 (fixtures) → ✅
- TD-002: 無 Admin 行程 CRUD → ✅
- TD-003: 無場次管理 UI → ✅

### 二、歷史高優先技術債（供參考）
| ID | 描述 | 影響 | 已狀態 |
| :--- | :--- | :--- | :--- |
| TD-004 | 無旅客/導遊 Auth | 訂單不綁定帳號，無法追蹤回頭客 | ✅（先前階段已完成） |
| TD-005 | ECPay 模擬流程 | 無法收真錢 | ⚠️ 已被 #402 接手，需真實付款/退款證據驗證 |
| TD-006 | E2E 測試覆蓋低 | 改動容易破壞流程 | 部分補齊中 |
| TD-007 | API 無版本控制 | 未來破壞性變更難管理 | 歷史待清理 |
| NEW-01 | 通知系統完整度不足 | 旅客付費後無可驗證 side-effect | 受 #402/#403 影響的實證項目 |
| NEW-02 | API 無 Rate Limiting | 風險暴露 | 已有 CI/Coverage 風險控管 |
| NEW-03 | 無錯誤監控 | 500 error 不易發現 | 需持續改善 |
| NEW-04 | Security Checklist 空白 | 高風險任務前置不足 | 受上線流程節點控制 |

### 三、文件債務（已歸檔為指標，不為當前主線）
- **P0（歷史）**: `05-security-checklist.md`, `01-ecpay-integration-guide.md`
- **P1（歷史）**: `01-guide-onboarding-sop.md`, `02-customer-service-sop.md`, `03-settlement-rules.md`, `04-refund-policy-detail.md`
- **P2（長期）**: `01-system-diagram.md`, `02-user-stories-backlog.md`

---

## ✅ 下一步建議（對齊 live-state）
1. 將 #402/#403 runbook 的 `Status` 保持為 `CLOSED`，並明確註記只作歷史與運維執行參考
2. 讓 `#500` 的 manual regression checklist 結果可追溯
3. 補齊 `#318/#319/#320` 文件與實際驗證/交接資料
4. 保持 `docs/README.md` 與 root README 的主線一致，避免回到過時版本語法
5. 每次更新 readiness docs 前，先跑 open issue / open PR / latest merged PR 查詢，將輸出納入 PR 說明
