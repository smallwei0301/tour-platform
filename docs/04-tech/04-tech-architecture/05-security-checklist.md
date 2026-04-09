# 安全性檢查清單

> **文件版本**: v1.0
> **最後更新**: 2026-04-09
> **負責人**: 技術團隊

---

## 一、OWASP Top 10 對應防護措施

| # | 風險 | 現狀 | 防護措施 | 狀態 |
|---|------|------|----------|------|
| A01 | **Broken Access Control** | 已實作 | Middleware 路由保護 (Admin/Guide/User 三層)；API 驗證 Session/Token | ✅ |
| A02 | **Cryptographic Failures** | 已實作 | 密碼使用 SHA256 + Salt；Session 使用 HMAC-SHA256 簽名；HTTPS only (production) | ✅ |
| A03 | **Injection** | 已實作 | Supabase prepared statements；無直接 SQL 拼接 | ✅ |
| A04 | **Insecure Design** | 部分實作 | 已實作 Rate Limiting；缺少安全日誌 | 🔶 |
| A05 | **Security Misconfiguration** | 已實作 | 環境變數管理；Vercel 自動 HTTPS | ✅ |
| A06 | **Vulnerable Components** | 待驗證 | 需執行 npm audit | 🔶 |
| A07 | **Auth Failures** | 已實作 | Token 驗證 + Email 白名單；Session 版本控制；7天自動過期 | ✅ |
| A08 | **Data Integrity Failures** | 已實作 | ECPay CheckMacValue 驗簽 | ✅ |
| A09 | **Security Logging** | 待實作 | 需部署 Sentry + Telegram 告警 | ❌ |
| A10 | **SSRF** | 低風險 | 無伺服器端 URL Fetch 功能 | ✅ |

### 1.1 存取控制 (Access Control)

**現有實作：**
```
middleware.ts
├── Admin 路由保護 (/admin/*, /api/admin/*)
│   ├── Token 驗證 (ADMIN_ACCESS_TOKEN)
│   ├── Email 白名單 (ADMIN_EMAIL_ALLOWLIST)
│   └── Session 版本檢查 (強制登出支援)
├── Guide 路由保護 (/guide/*, /api/guide/*)
│   ├── HMAC-SHA256 Session 驗證
│   └── guideId:version:signature 格式
└── 旅客路由 (Supabase Auth)
    └── Session 自動刷新
```

**檢查項目：**
- [ ] 確認所有 Admin API 都經過 middleware 保護
- [ ] 確認所有 Guide API 都經過 middleware 保護
- [ ] 確認敏感資料 API (/api/me/*) 需要登入

### 1.2 密碼學保護 (Cryptographic Failures)

**密碼儲存：**
```typescript
// guide-auth.ts
hashPassword(plain): `${salt}:${hash}`
  - salt: 16 bytes random
  - hash: SHA256(salt + plain)
```

**Session 簽名：**
```typescript
// guide-auth.ts
signToken(guideId, sessionVersion)
  - HMAC-SHA256
  - Secret: GUIDE_SESSION_SECRET
```

**檢查項目：**
- [ ] 生產環境 `GUIDE_SESSION_SECRET` 已更換
- [ ] `ADMIN_ACCESS_TOKEN` 至少 32 字元
- [ ] 所有 Cookies 在 production 加上 `Secure` flag

### 1.3 注入防護 (Injection)

**防護措施：**
- 所有資料庫操作使用 Supabase Client (prepared statements)
- 無 `eval()` 或動態 SQL 拼接
- 輸入驗證在 API 層進行

**檢查項目：**
- [ ] `npm audit` 無高風險漏洞
- [ ] 無 `dangerouslySetInnerHTML` 使用未過濾內容

### 1.4 速率限制 (Rate Limiting)

**現有配置：** (`src/lib/rate-limit.ts`)

| Endpoint | Limit | Window |
|----------|-------|--------|
| `/api/orders` | 10 req | 1 min |
| `/api/payments/ecpay/callback` | 30 req | 1 min |
| `/api/me/orders` | 20 req | 1 min |
| `/api/events` | 50 req | 1 min |

**檢查項目：**
- [ ] 登入 API 有獨立限制
- [ ] 註冊 API 有獨立限制
- [ ] 密碼重設 API 有獨立限制

---

## 二、金流安全規範 (PCI DSS 相關)

### 2.1 信用卡資料處理

> **重要**: Tour Platform 採用 **ECPay 代收模式**，信用卡資料**不經過平台伺服器**。

| PCI DSS 要求 | 本平台作法 | 狀態 |
|--------------|-----------|------|
| 不儲存 CVV | ECPay 處理，本平台不經手 | ✅ |
| 不儲存完整卡號 | ECPay 處理，本平台不經手 | ✅ |
| 加密傳輸 | HTTPS only + ECPay SSL | ✅ |
| 驗簽機制 | CheckMacValue (SHA256) | ✅ |

### 2.2 ECPay 安全機制

**CheckMacValue 驗證流程：**
```
1. ECPay 發送 callback
2. 本平台提取 params (排除 CheckMacValue)
3. 按字母排序組成 query string
4. 加上 HashKey/HashIV
5. URL encode → 小寫 → SHA256 → 大寫
6. 比對 CheckMacValue
```

**程式碼位置：** `src/lib/ecpay.ts`

**檢查項目：**
- [ ] `ECPAY_HASH_KEY` 使用正式環境金鑰
- [ ] `ECPAY_HASH_IV` 使用正式環境金鑰
- [ ] 正式環境已停用測試商店代碼

### 2.3 金流安全稽核

| 檢查項目 | 頻率 | 負責人 |
|----------|------|--------|
| ECPay callback 日誌審查 | 每日 | 技術 |
| 異常交易偵測 (金額 > 10萬) | 即時 | Admin |
| 退款申請審核 | 每筆 | 財務 |
| 月結帳單核對 | 每月 | 財務 |

---

## 三、個資保護措施 (PDPA/GDPR)

### 3.1 個資分類

| 類別 | 資料項目 | 加密 | 存取權限 |
|------|----------|------|----------|
| 識別資料 | 姓名、Email、電話 | 傳輸加密 | Admin, Guide (自己訂單) |
| 財務資料 | 訂單金額 | 傳輸加密 | Admin |
| 敏感資料 | 密碼 | SHA256+Salt | 無直接存取 |

### 3.2 資料存取控制

**RLS (Row Level Security) 策略：**
```sql
-- Supabase RLS 已啟用
-- orders: 使用者只能看自己的訂單
-- guide_schedules: 導遊只能管理自己的行程
```

**API 層保護：**
- `/api/me/orders`: 只回傳當前使用者的訂單
- `/api/guide/bookings`: 只回傳該導遊的預約

### 3.3 資料保留政策

| 資料類型 | 保留期限 | 刪除方式 |
|----------|----------|----------|
| 訂單記錄 | 永久 (法規要求) | 不刪除 |
| 使用者帳號 | 帳號刪除後 30 天 | 軟刪除 |
| 錯誤日誌 | 90 天 | 自動清除 |
| 分析事件 | 365 天 | 自動清除 |

### 3.4 隱私權檢查項目

- [ ] 隱私權政策已公開 (`/privacy`)
- [ ] Cookie 同意機制已實作
- [ ] 資料匯出功能 (GDPR Article 20)
- [ ] 帳號刪除功能 (GDPR Article 17)

---

## 四、定期安全稽核計畫

### 4.1 稽核頻率

| 項目 | 頻率 | 負責人 | 工具 |
|------|------|--------|------|
| npm audit | 每週 | CI/CD | npm audit |
| 程式碼審查 | 每 PR | 開發者 | GitHub PR |
| 存取權限審查 | 每月 | Admin | Manual |
| ECPay 對帳 | 每月 | 財務 | ECPay 後台 |
| 滲透測試 | 每季 | 外部 | Manual |

### 4.2 自動化檢查

**CI/CD Pipeline 需包含：**
```yaml
# .github/workflows/security.yml
- npm audit --audit-level=high
- TypeScript strict mode
- ESLint security rules
- E2E auth tests
```

### 4.3 日誌監控

**待部署：**
- [ ] Sentry 錯誤監控
- [ ] Telegram 即時告警 (500 errors)
- [ ] Admin Dashboard 異常訂單警示

---

## 五、滲透測試計畫 (上線前必做)

### 5.1 測試範圍

| 區域 | 測試項目 | 優先級 |
|------|----------|--------|
| 認證 | 暴力破解防護、Session Hijacking | P0 |
| 授權 | IDOR、權限提升 | P0 |
| 金流 | Callback 偽造、重放攻擊 | P0 |
| 輸入 | XSS、SQL Injection | P0 |
| API | Rate Limiting、錯誤處理 | P1 |

### 5.2 測試清單

**認證測試：**
- [ ] Admin Token 暴力破解 (應被 Rate Limit)
- [ ] Guide 密碼暴力破解 (應被 Rate Limit)
- [ ] Session Cookie 竄改 (HMAC 應失敗)
- [ ] 過期 Session 存取 (應被拒絕)

**授權測試：**
- [ ] 旅客存取他人訂單 (應 403)
- [ ] 導遊存取他人行程 (應 403)
- [ ] 無權限存取 Admin API (應 401)

**金流測試：**
- [ ] 偽造 ECPay Callback (CheckMacValue 應失敗)
- [ ] 重放相同 Callback (訂單狀態應不變)
- [ ] 修改金額 Callback (驗簽應失敗)

**輸入測試：**
- [ ] 訂單備註 XSS
- [ ] 搜尋欄位 SQL Injection
- [ ] 檔案上傳繞過

### 5.3 修復流程

```
發現漏洞 → 評估嚴重度 → 立即修復(P0)/排程修復(P1) → 驗證修復 → 更新文件
```

| 嚴重度 | 修復時限 | 範例 |
|--------|----------|------|
| Critical | 4 小時 | 認證繞過 |
| High | 24 小時 | SQL Injection |
| Medium | 7 天 | XSS |
| Low | 下個 Sprint | 資訊洩漏 |

---

## 六、上線前安全檢查表

### 6.1 環境變數

- [ ] `ADMIN_ACCESS_TOKEN` 已設定強密碼 (32+ chars)
- [ ] `ADMIN_EMAIL_ALLOWLIST` 僅包含必要人員
- [ ] `GUIDE_SESSION_SECRET` 已設定強密碼
- [ ] `ECPAY_HASH_KEY` 使用正式環境金鑰
- [ ] `ECPAY_HASH_IV` 使用正式環境金鑰
- [ ] `SUPABASE_SERVICE_ROLE_KEY` 未暴露於前端

### 6.2 部署配置

- [ ] HTTPS 強制啟用
- [ ] HSTS Header 設定
- [ ] CORS 限制正確網域
- [ ] 錯誤頁面不洩漏堆疊資訊

### 6.3 監控告警

- [ ] Sentry 已連接
- [ ] Telegram Bot 已設定
- [ ] Vercel Analytics 已啟用

### 6.4 文件

- [ ] 隱私權政策上線
- [ ] 服務條款上線
- [ ] 退款政策上線

---

## 附錄：安全事件通報流程

```
1. 發現事件 → 評估影響
2. 立即通報 → Telegram 群組 + Email
3. 緊急處置 → 隔離/停止服務
4. 根因分析 → 記錄 Incident Report
5. 修復驗證 → 更新檢查清單
6. 復盤檢討 → 更新 SOP
```

**通報聯絡人：**
- 技術負責人: [待填]
- 法務聯絡人: [待填]
- ECPay 客服: 02-2655-1775
