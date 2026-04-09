# Tour Platform 開發階段規劃與技術債分析 (2026-04-09)

## 📊 專案現況摘要
- **技術棧**: Next.js 15 + Supabase + Vercel
- **當前階段**: Phase 8 完成（量測地基 + E2E）
- **核心交易閉環**: ~97% 完成
- **含 Auth + 金流**: ~70% 完成
- **目標**: 2026/04 底前 Go-Live

---

## 🔴 技術債詳細分析

### 一、 已償還技術債
- TD-001: 前台行程資料硬編碼 (fixtures) -> ✅ 2026-03-31
- TD-002: 無 Admin 行程 CRUD -> ✅ 2026-03-31
- TD-003: 無場次管理 UI -> ✅ 2026-03-31

### 二、 現存高優先技術債 (上線阻斷級 P0)
| ID | 描述 | 影響 | 建議修復方案 |
| :--- | :--- | :--- | :--- |
| TD-004 | 無旅客/導遊 Auth | 訂單不綁定帳號，無法追蹤回頭客 | Phase 9: Google OAuth + Supabase Auth |
| TD-005 | ECPay 模擬流程 | 無法收真錢 | Phase 10: ECPay 沙箱 -> 正式串接 |
| TD-006 | E2E 測試覆蓋低 | 改動容易破壞流程 | 補完 funnel-booking-payment.spec.ts |
| TD-007 | API 無版本控制 | 未來破壞性變更難管理 | 加 /api/v1/ prefix |
| NEW-01 | 通知系統完全缺失 | 旅客付錢後沒確認信 | Email/LINE 通知系統 |
| NEW-02 | API 無 Rate Limiting | 任何人可無限打 API | express-rate-limit 或 Vercel Edge |
| NEW-03 | 無錯誤監控 | 500 error 不會知道 | Sentry + Telegram alert |
| NEW-04 | Security Checklist 空白 | 處理信用卡前必須完成 | OWASP Top 10 對策 |

### 三、 現存中優先技術債 (P1)
| ID | 描述 | 影響 | 建議修復方案 |
| :--- | :--- | :--- | :--- |
| TD-009 | 無 i18n 支援 | 外語旅客體驗差 | Phase 12: next-intl |
| TD-010 | 圖片未優化 | 載入速度慢 | next/image + CDN |
| NEW-05 | 導遊 Auth 自製 session | 安全性不如 Supabase Auth | Phase 12: 遷移到 Supabase Auth |
| NEW-06 | Migration 008/009 未執行 | events 表不存在 | 立刻執行 |
| NEW-07 | CI/CD 無 E2E 自動化 | 無自動化保護 | GitHub Actions + Playwright |

### 四、 低優先/長期技術債 (P2)
- TD-008: git gc unreachable objects
- NEW-08: 無超賣壓力測試 (Phase 10)
- NEW-09: 無備份 & 災難恢復 SOP (Phase 12)
- NEW-10: Admin 無漏斗分析 Dashboard (Phase 12)

### 五、 文件債務
- **P0 (上線阻斷)**: `05-security-checklist.md`, `01-ecpay-integration-guide.md`
- **P1 (運維)**: `01-guide-onboarding-sop.md`, `02-customer-service-sop.md`, `03-settlement-rules.md`, `04-refund-policy-detail.md`
- **P2 (架構)**: `01-system-diagram.md`, `02-user-stories-backlog.md`

---

## 📋 下一階段開發任務路徑
1. **文件先行**: 補完 P0 等級的資安與金流指南。
2. **核心突破**: Phase 9 (Auth) $\rightarrow$ Phase 10 (金流實裝)。
3. **基礎加固**: 部署 Sentry 監控與 Telegram 告警系統。
4. **品質保證**: 完成 `funnel-booking-payment.spec.ts` E2E 測試。
