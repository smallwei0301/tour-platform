# Tour Platform 開發階段規劃與上線就緒指標（更新：2026-05-14）

## 📌 當前主線摘要（Pre-launch Readiness）

- main 目前 latest gate 關注：**PR #501**（`test(ecpay): guard SimulatePaid callback side effects`，merge commit `a4fe92a`）
- **PR #501 僅保證 SimulatePaid=1 callback 模擬為 no-op**，不等於真實 ECPay 成功付款、退款與 Email side-effect
- **#402 仍為 P0 blocker**：尚缺真實付款、退款、Email 實際驗證證據
- 專案文件主線已改為：
  - `#402` 真實金流/退款/Email 證據
  - `#500` 人工回歸與放行驗證
  - `#403` 真實 Google 旅客 session
  - `#318`/`#319`/`#320` 營運 onboarding、CS SOP、go/no-go gate
  - `#504` 上線證據封裝彙整（待補完）

## 🧭 當前可執行行動（5–10 分鐘上手）
1. 確認 `docs/README.md` 與本 repo root README 的主線一致，確認 #402 仍開啟與 PR #501 限制
2. 進入 `docs/operations/issue-402-real-payment-refund-verification-runbook.md` 執行可核對的操作清單（待執行）
3. 收斂 #500/#403 的人工驗證節點與 issue 記錄一致性
4. 補齊營運 handoff 文件（#318/#319/#320）並在 `docs/operations/*`、`docs/qa/*` 留下可重複執行的驗證條件

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

## ✅ 下一步建議（對齊 #402）
1. 把每一筆 #402 證據（付款成功、退款、Email）集中到 `docs/operations/issue-402-real-payment-refund-verification-runbook.md`
2. 以 `#500` 補齊 manual regression checklist，並讓結果可追溯
3. 對 #403 補足真實 Google session 的檢核證據，不混淆模擬或靜態文件
4. 於 #318/#319/#320 的文件範圍中補上營運接管、客服/客服升級與上線 gate 的可執行條件
5. 保持 `docs/README.md` 與 root README 的主線一致，避免回到過時 Phase 8/10 文法
