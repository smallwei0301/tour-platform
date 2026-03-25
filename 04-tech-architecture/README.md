# 04. 技術棧架構

## 4.1 技術選型總覽

```
┌─────────────────────────────────────────────────┐
│                   前端 (Frontend)                │
│         Next.js 14 + TypeScript + Tailwind       │
│         shadcn/ui + react-hook-form + zod        │
└─────────────────────────┬───────────────────────┘
                          │ API Routes / Edge Functions
┌─────────────────────────▼───────────────────────┐
│                   後端 (Backend)                 │
│         Supabase (PostgreSQL + Auth + Storage)   │
│         Edge Functions (Supabase / Vercel)       │
└────────┬────────────────┬──────────────┬─────────┘
         │                │              │
    ┌────▼────┐    ┌───────▼────┐  ┌─────▼──────┐
    │  ECPay  │    │  LINE Pay  │  │   Resend   │
    │ 綠界金流 │    │  行動支付  │  │  Email 服務 │
    └─────────┘    └────────────┘  └────────────┘
```

## 4.2 各層技術細節

### 前端
| 技術 | 版本 | 用途 |
|------|------|------|
| Next.js | 14 (App Router) | 框架主體、SSR/SSG |
| TypeScript | 5.x | 型別安全 |
| Tailwind CSS | 3.x | 樣式 |
| shadcn/ui | latest | UI 元件庫 |
| react-hook-form | 7.x | 表單管理 |
| zod | 3.x | 資料驗證 |
| react-day-picker | 8.x | 日期選擇器 |
| react-big-calendar | latest | 導遊行事曆 |
| Framer Motion | 10.x | 動畫效果 |
| next-intl | 3.x | 多語言（中/英） |

### 後端 / 資料庫
| 技術 | 用途 |
|------|------|
| Supabase | PostgreSQL 資料庫 + 即時訂閱 |
| Supabase Auth | 用戶認證（Google / LINE / Email） |
| Supabase Storage | 圖片上傳（活動照片、KYC 文件） |
| Supabase Edge Functions | Serverless 邏輯（金流 Callback） |
| Row Level Security (RLS) | 資料權限管理 |

### 部署
| 技術 | 用途 |
|------|------|
| Vercel | Next.js 部署 + CDN |
| GitHub Actions | CI/CD |
| Sentry | 錯誤監控 |

### 第三方服務
| 服務 | 用途 |
|------|------|
| ECPay 綠界 | 主要金流（信用卡、ATM、超商代碼） |
| LINE Pay | 行動支付（Phase 3） |
| Resend | Transactional Email |
| LINE Notify | 導遊推播通知 |
| Cloudinary | 圖片優化（可選，Supabase Storage 備援） |
| Google Analytics 4 | 用戶行為分析 |

---

## 4.3 資料庫 Schema

```sql
-- 用戶表
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  avatar_url TEXT,
  role TEXT DEFAULT 'consumer', -- consumer / guide / admin
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 導遊資料表
CREATE TABLE guides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  display_name TEXT NOT NULL,
  bio TEXT,
  avatar_url TEXT,
  id_verified BOOLEAN DEFAULT false,
  guide_license TEXT, -- 導遊證號
  status TEXT DEFAULT 'pending', -- pending / approved / suspended
  bank_account JSONB, -- 加密儲存
  commission_rate DECIMAL DEFAULT 0.85, -- 導遊分潤比例
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 活動表
CREATE TABLE activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guide_id UUID REFERENCES guides(id),
  title TEXT NOT NULL,
  description TEXT,
  category TEXT, -- 文化/自然/美食/冒險
  location TEXT,
  region TEXT, -- 北部/中部/南部/東部/離島
  duration_hours INTEGER,
  max_participants INTEGER,
  price_per_person DECIMAL NOT NULL,
  cover_image TEXT,
  images JSONB,
  is_published BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 活動可用日期
CREATE TABLE activity_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id UUID REFERENCES activities(id),
  date DATE NOT NULL,
  start_time TIME,
  available_slots INTEGER,
  booked_slots INTEGER DEFAULT 0,
  status TEXT DEFAULT 'open' -- open / full / cancelled
);

-- 訂單表
CREATE TABLE orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_no TEXT UNIQUE NOT NULL, -- 顯示用訂單號
  consumer_id UUID REFERENCES users(id),
  activity_id UUID REFERENCES activities(id),
  schedule_id UUID REFERENCES activity_schedules(id),
  participants INTEGER NOT NULL,
  unit_price DECIMAL NOT NULL,
  total_amount DECIMAL NOT NULL,
  platform_fee DECIMAL NOT NULL, -- 15%
  guide_amount DECIMAL NOT NULL, -- 85%
  status TEXT DEFAULT 'pending', -- pending / paid / confirmed / completed / cancelled / refunded
  payment_method TEXT,
  payment_id TEXT, -- ECPay 交易編號
  paid_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 評價表
CREATE TABLE reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES orders(id),
  reviewer_id UUID REFERENCES users(id),
  guide_id UUID REFERENCES guides(id),
  rating INTEGER CHECK (rating BETWEEN 1 AND 5),
  comment TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 提款申請
CREATE TABLE withdrawals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guide_id UUID REFERENCES guides(id),
  amount DECIMAL NOT NULL,
  status TEXT DEFAULT 'pending', -- pending / processing / completed / failed
  bank_transfer_id TEXT,
  requested_at TIMESTAMPTZ DEFAULT NOW(),
  processed_at TIMESTAMPTZ
);
```

---

## 4.4 系統架構圖（文字版）

```
消費者/導遊瀏覽器
      │
      ▼
Vercel CDN + Next.js
      │
      ├── 靜態頁面（活動列表/詳情） → SSG/ISR
      ├── 動態頁面（訂單/後台） → SSR
      └── API Routes
            │
            ├── /api/auth     → Supabase Auth
            ├── /api/orders   → 訂單 CRUD
            ├── /api/payment  → ECPay 建單
            └── /api/webhook  → ECPay Callback
                      │
                      ▼
              Supabase PostgreSQL
              Supabase Storage（圖片）
```

---

## 4.5 安全性設計

- **RLS（Row Level Security）**：每個用戶只能看到自己的資料
- **HTTPS only**：Vercel 預設全站 HTTPS
- **金流資料不落地**：卡號直接傳給 ECPay，不經過我們的伺服器
- **KYC 文件加密**：Supabase Storage + 私有 Bucket
- **Rate Limiting**：API Routes 加 Upstash Redis 限流
- **環境變數**：所有 API Key 透過 Vercel 環境變數管理，不 commit 到 GitHub
