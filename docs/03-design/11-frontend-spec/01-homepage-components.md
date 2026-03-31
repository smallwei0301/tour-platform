# 旅遊平台首頁 Next.js 元件規格書

> **TASK-048** | 產出日期：2026-03-26 | 版本：v1.0

---

## 目錄

1. [首頁整體 Layout 結構](#1-首頁整體-layout-結構)
2. [元件詳細規格](#2-元件詳細規格)
   - 2.1 [Navbar](#21-navbar)
   - 2.2 [HeroSection](#22-herosection)
   - 2.3 [SearchBar](#23-searchbar)
   - 2.4 [FeaturedTours](#24-featuredtours)
   - 2.5 [TourCard](#25-tourcard)
   - 2.6 [CategoryGrid](#26-categorygrid)
   - 2.7 [TestimonialsSection](#27-testimonialssection)
   - 2.8 [NewsletterBanner](#28-newsletterbanner)
   - 2.9 [Footer](#29-footer)
3. [RWD 斷點規劃](#3-rwd-斷點規劃)
4. [shadcn/ui 元件對照表](#4-shadcnui-元件對照表)
5. [資料流概覽](#5-資料流概覽)

---

## 1. 首頁整體 Layout 結構

```
┌─────────────────────────────────────────────┐
│  Navbar (sticky)                            │
│  Logo | Navigation | Auth Buttons           │
├─────────────────────────────────────────────┤
│  HeroSection                                │
│  ┌─────────────────────────────────────┐   │
│  │  Background Image / Video           │   │
│  │  Headline + Subheadline             │   │
│  │  ┌───────────────────────────────┐  │   │
│  │  │  SearchBar                    │  │   │
│  │  │  [Destination] [Date] [Search]│  │   │
│  │  └───────────────────────────────┘  │   │
│  └─────────────────────────────────────┘   │
├─────────────────────────────────────────────┤
│  FeaturedTours                              │
│  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐      │
│  │ Card │ │ Card │ │ Card │ │ Card │      │
│  └──────┘ └──────┘ └──────┘ └──────┘      │
├─────────────────────────────────────────────┤
│  CategoryGrid                               │
│  ┌────┐ ┌────┐ ┌────┐ ┌────┐ ┌────┐ ┌────┐│
│  │ C1 │ │ C2 │ │ C3 │ │ C4 │ │ C5 │ │ C6 ││
│  └────┘ └────┘ └────┘ └────┘ └────┘ └────┘│
├─────────────────────────────────────────────┤
│  TestimonialsSection                        │
│  ┌──────────────────────────────────────┐  │
│  │  ⭐⭐⭐⭐⭐  Quote  — Guest Name       │  │
│  └──────────────────────────────────────┘  │
├─────────────────────────────────────────────┤
│  NewsletterBanner                           │
│  [Email Input] [Subscribe Button]           │
├─────────────────────────────────────────────┤
│  Footer                                     │
│  Links | Social | Legal                     │
└─────────────────────────────────────────────┘
```

### 頁面檔案結構

```
app/
├── (marketing)/
│   ├── page.tsx                    # 首頁 (Server Component)
│   └── layout.tsx
components/
├── layout/
│   ├── Navbar.tsx
│   └── Footer.tsx
├── home/
│   ├── HeroSection.tsx
│   ├── SearchBar.tsx
│   ├── FeaturedTours.tsx
│   ├── TourCard.tsx
│   ├── CategoryGrid.tsx
│   ├── TestimonialsSection.tsx
│   └── NewsletterBanner.tsx
├── ui/                             # shadcn/ui (auto-generated)
└── shared/
    ├── StarRating.tsx
    ├── AvatarWithFallback.tsx
    └── LoadingSkeleton.tsx
```

---

## 2. 元件詳細規格

---

### 2.1 Navbar

**職責：** 全站頂部導覽列，sticky 定位，包含 Logo、主選單、語言切換、登入/註冊按鈕。

**檔案路徑：** `components/layout/Navbar.tsx`

**渲染模式：** Client Component（需要 scroll 偵測、mobile menu 狀態）

#### Props Interface

```typescript
interface NavbarProps {
  /** 目前登入的使用者，null 表示未登入 */
  user?: {
    id: string;
    name: string;
    avatarUrl?: string;
  } | null;
  /** 透明模式（Hero 上方時使用） */
  transparent?: boolean;
}
```

#### 內部狀態

```typescript
const [isScrolled, setIsScrolled] = useState(false);     // 決定背景是否顯示
const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
const [lang, setLang] = useState<'zh-TW' | 'en'>('zh-TW');
```

#### 互動狀態

| 狀態 | 行為 |
|------|------|
| 初始（Hero 上方） | 背景透明，文字白色 |
| 滾動後 | 白色背景，陰影，文字深色 |
| Mobile menu open | 展開全寬下拉選單 |
| 登入中（loading） | Avatar 顯示 Skeleton |

#### 資料來源

- 用戶狀態：Supabase Auth `auth.users` → Server Component 傳入
- 導覽項目：靜態常數 `constants/nav-links.ts`

#### 導覽連結結構

```typescript
const navLinks = [
  { label: '探索行程', href: '/tours' },
  { label: '目的地', href: '/destinations' },
  { label: '關於我們', href: '/about' },
  { label: '成為嚮導', href: '/become-guide' },
];
```

#### RWD 行為

- **Mobile (< 768px)：** Hamburger icon，點擊展開 Sheet（shadcn）
- **Tablet (768–1279px)：** 顯示主要連結，隱藏次要選項
- **Desktop (≥ 1280px)：** 完整橫排顯示

---

### 2.2 HeroSection

**職責：** 首頁視覺主體，全版背景圖＋標題＋SearchBar 嵌入。

**檔案路徑：** `components/home/HeroSection.tsx`

**渲染模式：** Server Component（靜態內容） + Client SearchBar 子元件

#### Props Interface

```typescript
interface HeroSectionProps {
  /** 背景圖片 URL（來自 Supabase Storage 或 CDN） */
  backgroundImageUrl: string;
  /** 主標題 */
  headline: string;
  /** 副標題 */
  subheadline: string;
  /** 快捷搜尋建議標籤 */
  quickSearchTags?: Array<{
    label: string;
    query: string;
  }>;
}
```

#### 預設值（來自 CMS 或硬碼）

```typescript
const defaultHero: HeroSectionProps = {
  backgroundImageUrl: '/images/hero-bg.jpg',
  headline: '與在地人一起，探索真正的旅程',
  subheadline: '超過 1,000 位認證嚮導，來自 50 個城市',
  quickSearchTags: [
    { label: '台北一日遊', query: 'taipei' },
    { label: '京都茶道體驗', query: 'kyoto-tea' },
    { label: '峇里島瀑布健行', query: 'bali-waterfall' },
  ],
};
```

#### 互動狀態

| 狀態 | 行為 |
|------|------|
| 初始 | 背景圖 Ken Burns 動畫（subtle zoom） |
| Quick Tag 點擊 | 填入 SearchBar destination 欄位 |
| 圖片載入失敗 | Fallback 純色漸層背景 |

#### 資料來源

- 背景圖：`site_settings` table，key = `hero_image_url`
- 標題文案：`site_settings` table，key = `hero_headline` / `hero_subheadline`
- 快捷標籤：`site_settings` table，key = `hero_quick_tags`（JSON array）

#### 尺寸規格

- **Mobile：** `min-h-[480px]`
- **Tablet：** `min-h-[560px]`
- **Desktop：** `min-h-[680px]`

---

### 2.3 SearchBar

**職責：** 旅遊行程搜尋輸入，支援目的地輸入、日期選擇、人數選擇，送出後跳轉 `/tours?...`。

**檔案路徑：** `components/home/SearchBar.tsx`

**渲染模式：** Client Component（`'use client'`）

#### Props Interface

```typescript
interface SearchBarProps {
  /** 初始值（從 URL params 帶入，用於搜尋結果頁回填） */
  defaultValues?: {
    destination?: string;
    date?: Date;
    guests?: number;
  };
  /** 顯示模式：Hero 內嵌（大）或頁面頂部（小） */
  variant?: 'hero' | 'compact';
  /** 自訂送出 callback，不傳則預設 router.push */
  onSearch?: (params: SearchParams) => void;
}

interface SearchParams {
  destination: string;
  date?: string;          // ISO 8601
  guests?: number;
  category?: string;
}
```

#### 內部狀態

```typescript
const [destination, setDestination] = useState('');
const [date, setDate] = useState<Date | undefined>();
const [guests, setGuests] = useState(1);
const [suggestions, setSuggestions] = useState<DestinationSuggestion[]>([]);
const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);
```

#### 互動狀態

| 狀態 | 行為 |
|------|------|
| Destination focus | 顯示下拉 autocomplete（debounce 300ms） |
| Loading suggestions | Spinner in input |
| Date picker open | shadcn Calendar Popover |
| Guests selector | 加減按鈕（min: 1, max: 20） |
| 送出 | Button 顯示 loading spinner，disabled |
| 空值送出 | Shake animation + toast 提示 |

#### Autocomplete API

```typescript
// Server Action / API Route
// GET /api/search/suggestions?q=台北
interface DestinationSuggestion {
  id: string;
  name: string;
  country: string;
  tourCount: number;
}
```

#### 資料來源

- Suggestions：`destinations` table（`name ILIKE %query%`，limit 8）
- 送出後跳轉：`/tours?destination=xxx&date=xxx&guests=x`

#### RWD 行為

- **Mobile：** 垂直堆疊，各欄位全寬
- **Tablet：** 2 欄（destination + date | guests + button）
- **Desktop（hero variant）：** 單行橫排，圓角卡片浮在背景上

---

### 2.4 FeaturedTours

**職責：** 首頁精選行程區塊，展示編輯精選或高評分行程，支援橫向捲動（mobile）。

**檔案路徑：** `components/home/FeaturedTours.tsx`

**渲染模式：** Server Component（資料在 SSR 取得）

#### Props Interface

```typescript
interface FeaturedToursProps {
  /** 精選行程列表 */
  tours: TourCardData[];
  /** 區塊標題 */
  title?: string;
  /** 區塊副標題 */
  subtitle?: string;
  /** 最多顯示幾個 */
  limit?: number;
  /** 「查看全部」連結 */
  viewAllHref?: string;
}

interface TourCardData {
  id: string;
  slug: string;
  title: string;
  location: string;
  country: string;
  coverImageUrl: string;
  pricePerPerson: number;
  currency: string;          // 'TWD' | 'USD' | 'JPY'
  durationHours: number;
  rating: number;            // 0–5
  reviewCount: number;
  guideId: string;
  guideName: string;
  guideAvatarUrl?: string;
  tags: string[];            // ['文化', '美食', '戶外']
  isFeatured: boolean;
  isNewListing: boolean;
}
```

#### 互動狀態

| 狀態 | 行為 |
|------|------|
| 載入中 | 顯示 4 個 TourCard Skeleton |
| 無資料 | Empty state：插圖 + 「即將推出更多行程」 |
| Mobile 捲動 | 橫向 scroll-snap，顯示 1.2 張暗示可捲動 |

#### 資料來源

```sql
-- Supabase Query
SELECT t.*, 
       AVG(r.rating) as rating,
       COUNT(r.id) as review_count,
       u.display_name as guide_name,
       u.avatar_url as guide_avatar_url
FROM tours t
LEFT JOIN reviews r ON r.tour_id = t.id
LEFT JOIN users u ON u.id = t.guide_id
WHERE t.is_featured = true 
  AND t.status = 'active'
ORDER BY t.featured_order ASC
LIMIT 8;
```

**Table：** `tours`, `reviews`, `users`

---

### 2.5 TourCard

**職責：** 單一行程卡片，用於 FeaturedTours、搜尋結果、相關推薦等多處。

**檔案路徑：** `components/home/TourCard.tsx`

**渲染模式：** Client Component（需要 hover 動效、wishlist toggle）

#### Props Interface

```typescript
interface TourCardProps {
  tour: TourCardData;
  /** 顯示模式 */
  variant?: 'default' | 'compact' | 'horizontal';
  /** 顯示 Wishlist 按鈕 */
  showWishlist?: boolean;
  /** 已收藏狀態 */
  isWishlisted?: boolean;
  /** 收藏切換 callback */
  onWishlistToggle?: (tourId: string) => void;
  /** 自訂 className */
  className?: string;
}
```

#### 子元件結構

```
TourCard
├── CoverImage (Next/Image, aspect-ratio: 4/3)
│   ├── Badge（NEW / FEATURED）
│   └── WishlistButton（Heart icon）
├── CardBody
│   ├── LocationBadge（icon + "台北, 台灣"）
│   ├── Title（h3, 2行截斷）
│   ├── Tags（最多3個 Badge）
│   ├── MetaRow
│   │   ├── Duration（clock icon + "3小時"）
│   │   └── StarRating（stars + "4.9 (128)"）
│   ├── GuideMini
│   │   ├── AvatarWithFallback
│   │   └── GuideName
│   └── PriceRow
│       ├── "每人 NT$1,200"
│       └── BookButton（"立即預訂" → /tours/[slug]）
```

#### 互動狀態

| 狀態 | 行為 |
|------|------|
| Hover | 卡片輕微 scale(1.02)，shadow 加深 |
| Wishlist toggle | Heart 動畫，樂觀 UI 更新，失敗則 revert |
| Image loading | Blur placeholder（base64 低解析度） |
| Image error | 顯示 fallback 灰色佔位圖 |
| Skeleton | 整張卡片骨架動畫 |

#### 資料來源

繼承自 `FeaturedToursProps.tours`（parent 負責取資料，TourCard 純展示）

---

### 2.6 CategoryGrid

**職責：** 行程分類導覽，用圖示卡片快速跳轉各類型行程。

**檔案路徑：** `components/home/CategoryGrid.tsx`

**渲染模式：** Server Component

#### Props Interface

```typescript
interface CategoryGridProps {
  categories: CategoryItem[];
  title?: string;
}

interface CategoryItem {
  id: string;
  slug: string;           // URL: /tours?category=cultural
  name: string;           // '文化探索'
  emoji: string;          // '🏯'
  coverImageUrl?: string;
  tourCount: number;
  color: string;          // Tailwind 背景色 'bg-amber-100'
}
```

#### 預設分類（靜態資料 or DB）

```typescript
const defaultCategories: CategoryItem[] = [
  { slug: 'cultural',    name: '文化探索', emoji: '🏯', color: 'bg-amber-100' },
  { slug: 'food',        name: '美食之旅', emoji: '🍜', color: 'bg-rose-100'  },
  { slug: 'outdoor',     name: '戶外冒險', emoji: '🏔️', color: 'bg-green-100' },
  { slug: 'art',         name: '藝術創作', emoji: '🎨', color: 'bg-purple-100'},
  { slug: 'wellness',    name: '身心療癒', emoji: '🧘', color: 'bg-sky-100'   },
  { slug: 'nightlife',   name: '夜生活',   emoji: '🌃', color: 'bg-indigo-100'},
];
```

#### 互動狀態

| 狀態 | 行為 |
|------|------|
| Hover | 背景加深，emoji 輕微放大 |
| 點擊 | 跳轉 `/tours?category=[slug]` |
| Mobile scroll | 橫向 scroll（同 FeaturedTours） |

#### 資料來源

```sql
-- Supabase Query
SELECT c.*, COUNT(t.id) as tour_count
FROM categories c
LEFT JOIN tours t ON t.category_id = c.id AND t.status = 'active'
GROUP BY c.id
ORDER BY c.sort_order ASC;
```

**Table：** `categories`, `tours`

#### RWD 行為

- **Mobile：** 橫向捲動，每個 item 寬 `80px`
- **Tablet：** Grid 3 欄
- **Desktop：** Grid 6 欄

---

### 2.7 TestimonialsSection

**職責：** 旅客評價輪播，建立信任感。

**檔案路徑：** `components/home/TestimonialsSection.tsx`

**渲染模式：** Client Component（輪播互動）

#### Props Interface

```typescript
interface TestimonialsSectionProps {
  testimonials: Testimonial[];
  autoPlayInterval?: number;   // ms，default 5000
  title?: string;
}

interface Testimonial {
  id: string;
  quote: string;
  authorName: string;
  authorLocation: string;      // '來自台北'
  authorAvatarUrl?: string;
  rating: number;              // 1–5
  tourTitle: string;
  tourSlug: string;
  createdAt: string;
}
```

#### 輪播設計

- 使用 `embla-carousel-react`（shadcn Carousel 底層）
- Desktop：顯示 3 張，center card 放大
- Tablet：顯示 2 張
- Mobile：1 張，左右箭頭 + dot indicator

#### 互動狀態

| 狀態 | 行為 |
|------|------|
| Auto-play | 每 5 秒自動切換 |
| Hover on carousel | 暫停 auto-play |
| Arrow click | 手動切換 |
| Swipe（mobile） | Touch 手勢支援 |
| 載入中 | 3 個 Skeleton 卡片 |

#### 資料來源

```sql
-- 高評分、近期評價
SELECT r.*, 
       u.display_name as author_name,
       u.avatar_url as author_avatar_url,
       t.title as tour_title,
       t.slug as tour_slug
FROM reviews r
JOIN users u ON u.id = r.reviewer_id
JOIN tours t ON t.id = r.tour_id
WHERE r.rating >= 4
  AND r.is_featured = true
ORDER BY r.created_at DESC
LIMIT 9;
```

**Table：** `reviews`, `users`, `tours`

---

### 2.8 NewsletterBanner

**職責：** 電子報訂閱 CTA 區塊。

**檔案路徑：** `components/home/NewsletterBanner.tsx`

**渲染模式：** Client Component

#### Props Interface

```typescript
interface NewsletterBannerProps {
  title?: string;
  subtitle?: string;
  backgroundVariant?: 'gradient' | 'image' | 'solid';
  backgroundValue?: string;    // CSS gradient 或圖片 URL 或色碼
}
```

#### 內部狀態

```typescript
const [email, setEmail] = useState('');
const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
const [errorMessage, setErrorMessage] = useState('');
```

#### 互動狀態

| 狀態 | 行為 |
|------|------|
| idle | 正常輸入框 + 訂閱按鈕 |
| loading | 按鈕 spinner，input disabled |
| success | 替換成 ✅ 成功訊息，3s 後 reset |
| error | 輸入框紅框 + 錯誤文字 |
| 格式錯誤 | Client-side 即時驗證 |

#### 資料來源 / API

```typescript
// Server Action
async function subscribeNewsletter(email: string): Promise<{ success: boolean; error?: string }> {
  // INSERT INTO newsletter_subscribers (email) VALUES ($1)
  // ON CONFLICT (email) DO NOTHING
}
```

**Table：** `newsletter_subscribers`

---

### 2.9 Footer

**職責：** 全站底部，包含連結、社群媒體、法律聲明、語言切換。

**檔案路徑：** `components/layout/Footer.tsx`

**渲染模式：** Server Component

#### Props Interface

```typescript
interface FooterProps {
  /** 不同頁面可傳不同連結組 */
  linkGroups?: FooterLinkGroup[];
  /** 社群媒體連結 */
  socialLinks?: SocialLink[];
}

interface FooterLinkGroup {
  title: string;
  links: Array<{
    label: string;
    href: string;
    isExternal?: boolean;
  }>;
}

interface SocialLink {
  platform: 'instagram' | 'facebook' | 'twitter' | 'youtube' | 'line';
  url: string;
}
```

#### 預設連結組

```typescript
const defaultLinkGroups: FooterLinkGroup[] = [
  {
    title: '探索',
    links: [
      { label: '所有行程', href: '/tours' },
      { label: '熱門目的地', href: '/destinations' },
      { label: '最新行程', href: '/tours?sort=newest' },
    ],
  },
  {
    title: '成為嚮導',
    links: [
      { label: '嚮導申請', href: '/become-guide' },
      { label: '嚮導資源', href: '/guide-resources' },
      { label: '嚮導社群', href: '/guide-community' },
    ],
  },
  {
    title: '幫助',
    links: [
      { label: '常見問題', href: '/faq' },
      { label: '聯絡我們', href: '/contact' },
      { label: '安全指南', href: '/safety' },
    ],
  },
  {
    title: '關於',
    links: [
      { label: '關於我們', href: '/about' },
      { label: '媒體報導', href: '/press' },
      { label: '職缺', href: '/careers' },
    ],
  },
];
```

#### RWD 行為

- **Mobile：** Accordion 展開各連結組
- **Tablet：** 2 欄 grid
- **Desktop：** 4 欄 + 左側 Logo/簡介

---

## 3. RWD 斷點規劃

### Tailwind CSS 斷點對照

| 名稱 | 尺寸 | Tailwind prefix |
|------|------|----------------|
| Mobile | 0–767px | (default) |
| Tablet | 768–1279px | `md:` |
| Desktop | 1280px+ | `xl:` |
| Wide | 1536px+ | `2xl:` |

### 各元件 RWD 規格摘要

| 元件 | Mobile | Tablet | Desktop |
|------|--------|--------|---------|
| Navbar | Hamburger menu | 顯示主要連結 | 完整橫排 |
| HeroSection | 480px 高，SearchBar 堆疊 | 560px 高 | 680px 高，SearchBar 橫排 |
| SearchBar | 垂直堆疊 | 2×2 grid | 單行 4 欄 |
| FeaturedTours | 橫向 scroll，1.2 卡 | Grid 2 欄 | Grid 4 欄 |
| CategoryGrid | 橫向 scroll | Grid 3 欄 | Grid 6 欄 |
| TestimonialsSection | 1 張，swipe | 2 張 | 3 張 |
| NewsletterBanner | 堆疊 | 橫排 | 橫排，max-width 容器 |
| Footer | Accordion | 2 欄 grid | 4 欄 grid |

### Container 設定

```typescript
// tailwind.config.ts
container: {
  center: true,
  padding: {
    DEFAULT: '1rem',    // 16px
    md: '2rem',         // 32px
    xl: '3rem',         // 48px
  },
  screens: {
    xl: '1280px',
    '2xl': '1536px',
  },
}
```

---

## 4. shadcn/ui 元件對照表

| 頁面元件 | 使用的 shadcn/ui 元件 | 用途 |
|----------|----------------------|------|
| Navbar | `Sheet`, `Button`, `NavigationMenu`, `DropdownMenu` | Mobile menu, Auth buttons, Nav links |
| SearchBar | `Input`, `Popover`, `Calendar`, `Button`, `Badge` | 輸入欄位, 日期選擇器 |
| TourCard | `Card`, `CardContent`, `Badge`, `Button`, `Avatar` | 卡片框架, 標籤, 嚮導頭像 |
| FeaturedTours | `Carousel`, `CarouselContent`, `CarouselItem` | Mobile 橫向捲動 |
| CategoryGrid | `Badge` | 行程數量 |
| TestimonialsSection | `Carousel`, `Avatar`, `Card` | 評價輪播 |
| NewsletterBanner | `Input`, `Button` | 訂閱表單 |
| Footer | `Accordion`, `AccordionItem` | Mobile 折疊 |
| 全域 | `Skeleton`, `Toast`, `Tooltip`, `Dialog` | 載入狀態, 通知, 提示 |
| StarRating | `icons` (lucide-react: Star) | 評分顯示 |

### 安裝指令

```bash
npx shadcn@latest add card badge button input sheet
npx shadcn@latest add navigation-menu dropdown-menu
npx shadcn@latest add calendar popover
npx shadcn@latest add carousel avatar skeleton
npx shadcn@latest add accordion toast tooltip dialog
```

---

## 5. 資料流概覽

### Server Component 資料取得（首頁）

```typescript
// app/(marketing)/page.tsx
import { createServerClient } from '@/lib/supabase/server';

export default async function HomePage() {
  const supabase = createServerClient();

  // 並行取得所有資料
  const [
    { data: featuredTours },
    { data: categories },
    { data: testimonials },
    { data: heroSettings },
  ] = await Promise.all([
    supabase
      .from('tours')
      .select('*, reviews(rating), users!guide_id(display_name, avatar_url)')
      .eq('is_featured', true)
      .eq('status', 'active')
      .order('featured_order')
      .limit(8),

    supabase
      .from('categories')
      .select('*, tours(count)')
      .order('sort_order'),

    supabase
      .from('reviews')
      .select('*, users!reviewer_id(display_name, avatar_url), tours(title, slug)')
      .eq('is_featured', true)
      .gte('rating', 4)
      .order('created_at', { ascending: false })
      .limit(9),

    supabase
      .from('site_settings')
      .select('key, value')
      .in('key', ['hero_image_url', 'hero_headline', 'hero_subheadline', 'hero_quick_tags']),
  ]);

  return (
    <main>
      <HeroSection {...parseHeroSettings(heroSettings)} />
      <FeaturedTours tours={featuredTours ?? []} />
      <CategoryGrid categories={categories ?? []} />
      <TestimonialsSection testimonials={testimonials ?? []} />
      <NewsletterBanner />
    </main>
  );
}
```

### Supabase Tables 對照

| Table | 首頁用途 |
|-------|---------|
| `tours` | 精選行程資料 |
| `users` | 嚮導資訊、旅客資訊 |
| `reviews` | 評分、精選評價 |
| `categories` | 行程分類導覽 |
| `destinations` | SearchBar Autocomplete |
| `site_settings` | Hero 文案與圖片 |
| `newsletter_subscribers` | 電子報訂閱 |

### 快取策略

```typescript
// 首頁 ISR（Incremental Static Regeneration）
export const revalidate = 3600; // 每 1 小時重新產生

// 或使用 fetch cache
const data = await fetch('/api/featured-tours', {
  next: { revalidate: 3600, tags: ['featured-tours'] }
});

// 管理後台更新精選行程後觸發：
// revalidateTag('featured-tours')
```

---

## 附錄：元件開發優先順序

| 優先 | 元件 | 原因 |
|------|------|------|
| P0 | Navbar, HeroSection, SearchBar | 首屏可見，影響 CRO |
| P1 | TourCard, FeaturedTours | 核心轉換元件 |
| P2 | CategoryGrid | 探索路徑 |
| P3 | TestimonialsSection | 信任建立 |
| P4 | NewsletterBanner, Footer | 次要 CTA |

---

*規格書版本：v1.0 | 產出者：Emily (TASK-048) | 2026-03-26*
