# Tour Platform 開發階段規劃與上線就緒指標（更新：2026-05-25）

## 📌 當前主線摘要

> **Live state 不在本文硬編碼，以防 drift。**
> 即時 open issues / open PRs，請查閱：
> **[`operations/reports/readiness-live-state-latest.md`](./operations/reports/readiness-live-state-latest.md)**
> 或執行 `npm run readiness:snapshot` 刷新。
>
> Snapshot auto-refreshed every 6h by CI; treat as stale if header timestamp is >12h old. Run `npm run readiness:snapshot` to refresh. Not live truth.

**截至 2026-05-25 快照（refs #792）：**
- **#640 / #641 已 CLOSED**：V2 Launch QA blocker checklist 與 rollback drill 已完成，移至歷史
- **#799 已 CLOSED**：`isBookingV2Enabled` 預設改為 true — V2 booking entry 為主流程（PR #800）
- **#791 已 CLOSED**：Guide 自行編輯公開頁面（/guide/profile）已上線（PR #802）
- **#402/#403 已 CLOSED**：真實付款、退款、Email 與 Google session 的證據 runbook 保留作歷史/運維參考
- **#500 / #320 / #319 / #318** 狀態請以 live-state 快照為準
- 目前主線重點（V2 上線 + 觀察中）：
  - **#621** Enable Booking/Availability V2 as primary traveler flow（P0，umbrella，leaf #799 已完成，leaf 2 可接續）
  - **#642** V2 觀察視窗 + legacy fallback 守護（P1）
  - **#593** Andy Lee launch safety / insurance 揭露（P1）
  - **#319** Customer support SOP drill（P1）
  - **#607 / #714** Production alert drill evidence（P1，需 live credentials + 人工決策）

## 🧭 當前可執行行動（5–10 分鐘上手）
1. 執行 `npm run readiness:snapshot` 取得最新 live state，查閱 `docs/operations/reports/readiness-live-state-latest.md`。
2. 監看 **#642** V2 觀察視窗，確認 V2 無異常；確認 legacy fallback 守護機制正常。
3. 推進 **#593** Andy Lee launch safety/insurance 揭露文件（P1）。
4. 執行 **#319** customer support SOP 首次 drill（P1）。
5. 確認 **#714** production alert drill 前置條件（LINE vs Telegram 決策、SENTRY_DSN、incidents migration、admin access）。

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
1. 以 `npm run readiness:snapshot` 為主要 live-state 查詢工具，勿在 docs 手工維護 issue/PR 清單
2. 將 #402/#403 runbook 的 `Status` 保持為 `CLOSED`，並明確註記只作歷史與運維執行參考
3. #640 / #641 已 CLOSED — 不再作為當前行動項；移至歷史區
4. 監看 #642 V2 觀察視窗，確認無異常後推進 soft launch
5. 保持 `docs/README.md` 與 root README 只參考 snapshot，避免 hardcoded live-state 再次漂移
