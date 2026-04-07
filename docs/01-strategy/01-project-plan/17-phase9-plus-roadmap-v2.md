# Phase 9+ 開發計畫 v2（缺漏補齊版）

> 作者：Emily（CEO）| 日期：2026-04-07
> 基於 README、milestone-tracker、sprint-log、tech-debt-log、andy-lee-checklist、
> security-checklist、ecpay-guide、event-tracking-design、法務/營運文件全面審查

---

## 🔴 發現的關鍵缺漏（按嚴重度排序）

### A. 上線阻斷級（不修不能收真錢）

| # | 缺漏 | 現況 | 影響 |
|---|------|------|------|
| A1 | **通知系統完全缺失** | 下單/付款/取消/退款 — 零通知 | 旅客付錢後沒收到任何確認，100% 客訴 |
| A2 | **安全性檢查清單是空的** | `05-security-checklist.md` 全部「待編寫」 | 處理真實信用卡前必須完成 OWASP 基本防護 |
| A3 | **ECPay 串接指南是空的** | `01-ecpay-integration-guide.md` 全部「待編寫」 | 沒有沙箱測試計畫、沒有驗簽邏輯文件 |
| A4 | **API 無 Rate Limiting** | 所有 API route 裸奔 | 任何人可以無限打 `/api/orders`、`/api/events` |
| A5 | **無錯誤監控** | 沒有 Sentry 或同等方案 | 真實用戶遇到 500 error 你不會知道 |
| A6 | ~~Storage RLS 未設~~ | ✅ Phase 9 已修（migration 011） | public read policy 已加 |

### B. 上線前強烈建議（影響信任度 & 營運效率）

| # | 缺漏 | 現況 | 影響 |
|---|------|------|------|
| B1 | **Andy Lee 真實照片未到位** | checklist 5+ 項標 ⚠️ | 上線用假圖 = 零可信度 |
| B2 | **導遊入駐 SOP 是空的** | `01-guide-onboarding-sop.md` 全部「待編寫」 | 第二位導遊加入時沒有標準流程 |
| B3 | **退款政策細則是空的** | `04-refund-policy-detail.md` 全部「待編寫」 | 發生退款爭議時無規則可依 |
| B4 | **結算規則是空的** | `03-settlement-rules.md` 全部「待編寫」 | 導遊不知道何時拿到錢、怎麼算 |
| B5 | **客服 SOP 是空的** | `02-customer-service-sop.md` 全部「待編寫」 | 出事沒有標準處理流程 |
| B6 | **法務待辦全空** | `04-legal-todo.md` 全部「待編寫」 | 公司設立、保險、旅行業執照零進度追蹤 |
| B7 | **DB Migration 008/009 未執行** | TP-004 報告明確寫「需人工在 Supabase 執行」 | events 表不存在 = 追蹤系統是死的 |

### C. 中期缺漏（Phase 10 後應處理）

| # | 缺漏 | 說明 |
|---|------|------|
| C1 | **Admin 漏斗分析 Dashboard** | 事件在收集但沒有 UI 看 |
| C2 | **i18n 國際化** | 外語旅客完全無法使用（TD-009） |
| C3 | **SEO og:image + structured data** | 行程頁在社群分享時沒有預覽圖 |
| C4 | **CI/CD E2E 自動化** | E2E 測試建好了但沒跑在 CI |
| C5 | **超賣壓力測試** | fn_book_schedule 未做 concurrent 壓測（TD-02） |
| C6 | **備份 & 災難恢復計畫** | Supabase 自動備份但無 restore SOP |
| C7 | **多導遊擴展規劃** | 目前單一導遊模型，第二位導遊的 onboarding 流程不明 |

### D. 文件版本不一致

| 問題 | 說明 |
|------|------|
| **Phase 編號混亂** | README 的 Phase 8=量測地基, Phase 9=Auth, Phase 10=金流；但 milestone-tracker 的 Phase 8=Auth, Phase 9=金流。**必須統一** |
| **milestone-tracker 過期** | Phase 5 出現兩次（舊版「待開始」+ 新版 Phase 6 完成），Phase 8 的 Go/No-Go 仍寫「Phase 8」但 README 已是 Phase 9 |
| **tech-debt-log 過期** | 最後更新 2026-03-31，TD-003 已還清但 TD-004～TD-010 未更新反映 Phase 6-8 進度 |
| **Andy Lee checklist 過期** | Section 10 依賴項「Admin 行程 CRUD」等早已完成但未勾選 |

---

## ✅ 更新後的開發計畫

> 以 README 的 Phase 編號為準（Phase 8 = 量測地基），統一後續編號

### Phase 9：旅客 Auth + 通知基礎 🔜 下一步

**為什麼合併？** Auth 和通知是同一個「旅客身份」問題。有了 Auth 才能推通知。

| 任務 | 說明 | 優先 | 預估 |
|------|------|------|------|
| Google OAuth 登入 | Supabase Auth + Google Provider | **P0** | 1d |
| `/me/orders` 改用 session | 移除 email query，用 OAuth session | **P0** | 0.5d |
| **Email 通知系統** | 訂單確認 / 付款成功 / 取消確認 / 退款通知 | **P0** | 1.5d |
| LINE 登入 | 台灣旅客首選行動登入 | P1 | 1d |
| 旅客個人頁 | 訂單歷史 + 偏好設定 | P1 | 1d |
| **導遊訂單通知** | 新訂單 Email/LINE 通知導遊 | P1 | 0.5d |

**Phase 9 Go/No-Go：**
- [ ] Google OAuth 登入可正常取得 user session
- [ ] `/me/orders` 用 session 識別，不再用 email param
- [ ] 旅客付款後 30 秒內收到確認 email
- [ ] 導遊收到新訂單通知

---

### Phase 10：正式金流 + 安全加固

**關鍵前置：安全性檢查必須在處理真實信用卡之前完成。**

| 任務 | 說明 | 優先 | 預估 |
|------|------|------|------|
| **安全性 Checklist 完成** | OWASP Top 10 + API rate limiting + input validation | **P0** | 1d |
| **API Rate Limiting** | express-rate-limit 或 Vercel Edge Config | **P0** | 0.5d |
| **Sentry 錯誤監控** | Next.js + Sentry SDK，接 Telegram alert | **P0** | 0.5d |
| ECPay 沙箱串接 | 測試環境真實信用卡流程 | **P0** | 2d |
| ECPay 正式串接 | 真實刷卡 + webhook 驗簽 + CheckMacValue | **P0** | 1d |
| ~~Storage RLS 政策~~ | ~~補 public SELECT policy~~ | ~~P1~~ | ✅ Phase 9 已修 |
| LINE Pay 串接 | 台灣主流行動支付 | P1 | 1.5d |
| 導遊分潤撥款機制 | 抽成後撥款（先手動，後自動） | P1 | 1d |
| **超賣壓力測試** | concurrent 場景驗證 fn_book_schedule | P1 | 0.5d |

**Phase 10 Go/No-Go：**
- [ ] 完成一筆 ECPay 沙箱真實信用卡交易
- [ ] Sentry 可捕捉到錯誤並推 alert
- [ ] 所有 API endpoint 有 rate limit（< 60 req/min/IP）
- [ ] security-checklist.md 完成且每項都有對策

---

### Phase 11：Andy Lee 正式上線（Go-Live）

**這才是真正的「上線」— 之前都是開發。**

| 任務 | 說明 | 優先 | 預估 |
|------|------|------|------|
| **Andy Lee 真實照片上傳** | 頭像 + 活動封面 + Gallery 5+ 張 | **P0** | 0.5d |
| **Andy Lee checklist 全部勾完** | 場次設定 / 交易流程 / 營運追蹤 | **P0** | 1d |
| **退款政策細則** | 各情境退款比例 + 爭議處理 | **P0** | 0.5d |
| **結算規則文件** | T+7 結算 / 抽成計算 / 提款流程 | **P0** | 0.5d |
| **客服 SOP** | 分層處理 + 標準話術 + 緊急事件 | P1 | 0.5d |
| **導遊合約** | 正式版導遊合作協議 | P1 | 0.5d |
| **Full E2E 走一次** | 真實場景：下單→付款→確認→取消→退款 | **P0** | 0.5d |
| **DB Migration 008/009 執行** | Supabase Dashboard 手動跑 | **P0** | 10min |
| SEO meta 優化 | og:image + structured data（LocalBusiness） | P1 | 0.5d |
| **保險確認** | Andy 的導覽保險細節確認 | P1 | — |

**Go-Live Checklist：**
- [ ] Andy Lee checklist `15-andy-lee-mvp-launch-checklist.md` 全部 ✅
- [ ] 用真實信用卡完成 1 筆交易
- [ ] 旅客收到 email 確認
- [ ] 導遊收到新訂單通知
- [ ] 取消 + 退款流程完整走過
- [ ] Sentry 無 critical error
- [ ] 額滿後無法再預約（驗證 auto_full trigger）

---

### Phase 12：成長基礎（Go-Live 後 2-4 週）

| 任務 | 說明 | 優先 |
|------|------|------|
| Admin 漏斗分析 Dashboard | 從 events 表拉漏斗轉換率 | P1 |
| 評價系統 | 行程完成後留評閉環 | P1 |
| Supabase Auth for Guides | 廢除自製 session | P2 |
| CI/CD E2E 自動化 | GitHub Actions 跑 Playwright | P1 |
| 第二位導遊 onboarding | 用 guide-onboarding-sop 實際走一次 | P1 |
| i18n（英文版） | 外語旅客至少能看懂基本資訊 | P2 |
| 備份 & Restore SOP | Supabase DB snapshot + restore 演練 | P2 |

---

## 📋 立刻可做（本週 Action Items）

| # | 任務 | 負責 | 預估 |
|---|------|------|------|
| 1 | **執行 DB Migration 008 + 009** | Tracy/Judy | 10 min |
| 2 | **統一 Phase 編號**（以 README 為準，更新 milestone-tracker） | Emily | 30 min |
| 3 | **更新 Andy Lee checklist**（勾選 Sprint 4-8 已完成的依賴項） | Emily | 20 min |
| 4 | **更新 tech-debt-log**（反映 Phase 6-8 已還的債） | Emily | 20 min |
| 5 | 催 Andy Lee 提供真實照片 | Emily → Andy | — |
| 6 | 開始 Phase 9 旅客 Auth 開發 | Tracy | 1d |

---

## 🧮 整體時程估計

| Phase | 預估工時 | 預計完成 |
|-------|---------|---------|
| Phase 9（Auth + 通知） | ~5.5d | 2026-04-14 |
| Phase 10（金流 + 安全） | ~8d | 2026-04-25 |
| Phase 11（Go-Live） | ~4d | 2026-04-30 |
| Phase 12（成長基礎） | 持續 | 2026-05 ongoing |

**目標：4 月底前 Andy Lee 行程正式可收真錢。**

---

## ⚠️ 風險提醒

| 風險 | 機率 | 影響 | 對策 |
|------|------|------|------|
| Andy Lee 照片遲遲不到 | 中 | 阻斷 Go-Live | 設 4/15 deadline，備案用 AI 生成示意圖 |
| ECPay 商家帳號審核慢 | 中 | 阻斷 Phase 10 | 立刻開始申請，先用沙箱 |
| 法規風險（旅行業執照） | 低 | 可能需調整商業模式 | 已有 legal-decision-memo 結論：不碰住宿交通 |
| Supabase 免費額度用完 | 低 | 需升級 Pro | 目前用量極低，觀察 |
