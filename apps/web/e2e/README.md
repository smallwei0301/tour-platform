# Admin E2E Tests

## 安裝

```bash
cd apps/web
npm install
npx playwright install chromium  # 安裝 browser
```

## 環境變數

```bash
export ADMIN_ACCESS_TOKEN="your-admin-token"
export ADMIN_EMAIL="admin@tour-platform.com"

# 測試 Vercel Preview 時
export BASE_URL="https://your-preview.vercel.app"
```

## 執行

```bash
# 本地 dev server（自動啟動）
npm run test:e2e

# 指定 Vercel Preview URL
BASE_URL=https://xxxx.vercel.app npm run test:e2e

# 看瀏覽器畫面（debug 用）
npm run test:e2e:headed

# 互動式 UI 模式
npm run test:e2e:ui

# 只跑特定測試
npx playwright test e2e/t3-orders.spec.ts
```

## 測試涵蓋範圍

| 檔案 | 測試案例 |
|------|---------|
| `t1-login.spec.ts` | 登入/登出/未授權重導 |
| `t2-dashboard.spec.ts` | KPI 卡片、時間篩選 |
| `t3-orders.spec.ts` | 訂單列表、篩選、詳情、儲存、Audit Logs |
| `t4-refunds.spec.ts` | 退款列表、approve、reject |
| `t5-guides.spec.ts` | 導遊審核、篩選、通過/拒絕 |
| `t6-operations.spec.ts` | 操作追蹤、編輯、CSV 匯出 |
| `t7-t8-settings.spec.ts` | KPI 設定回滾、安全設定強制登出 |

## Mock Data

`src/lib/store.mjs` 已預填以下測試資料：

- **5 筆訂單**（含 paid、confirmed、refund_pending、pending_payment、completed）
- **1 筆退款申請**（pending）
- **3 位導遊申請**（2 pending、1 approved）
- **4 筆操作追蹤記錄**
- **3 筆 Audit Logs**
