# Tour Platform — Web App

> 前台旅客介面 + Admin 後台 + Guide 後台 + API routes

## 當前狀態（2026-04-20）

### 已完成的核心能力
- 前台活動頁 / 預訂流程 / 訂單流程
- Admin 後台（訂單、退款、導遊審核、行程 CRUD、營運追蹤）
- Guide Dashboard（登入、場次管理、訂單查看）
- Google OAuth / 我的訂單 / Email 通知基礎
- 安全加固第一輪（含 default secret block / secret scan guard）

### 目前主線
- Booking V2 rollout
- Booking Engine / POS Lite 後續演進
- 安全與 CI 穩定化

### 最新收斂（2026-04-20）
- PR #121：加上 production secret guard
- PR #127：補 GitHub Actions CI env，修復 `GUIDE_SESSION_SECRET` blocker
- 最新 main CI：PASS

## 技術棧
- Next.js 15 (App Router)
- React
- Supabase PostgreSQL / Auth / Storage
- Playwright
- Vercel

## 目錄
- `/app` — App Router routes
- `/src/lib` — 共用邏輯（db、auth、email、tracking、security）
- `/src/components` — UI components
- `/e2e` — Playwright tests
- `/public` — 靜態資源

## 開發
```bash
npm install
npm run dev
npm run build
npm test
```

## 注意事項
- build / CI 現在依賴合格的 `GUIDE_SESSION_SECRET` 與 `ADMIN_ACCESS_TOKEN`
- 不要用弱預設值繞過 production security guard
- 若 CI 因 security env block 失敗，優先檢查 `.github/workflows/ci.yml`

## 相關文件
- `../../README.md`
- `../../docs/README.md`
- `../../docs/implementation/issue-96-rollout-contract.md`
- `../../docs/security/issue-119-evidence-2026-04-20.md`
