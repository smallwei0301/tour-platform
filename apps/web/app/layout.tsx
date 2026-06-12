import { Inter, Noto_Sans_TC, Noto_Serif_TC } from 'next/font/google';
import type { Metadata } from 'next';
import './globals.css';
import { Navbar } from '../src/components/layout/Navbar';
import { Footer } from '../src/components/layout/Footer';
import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/next';

// Issue #1345 — Noto Sans TC is a large CJK font family; on slow mobile
// links the swap from the fallback (sans-serif) to the real font lands
// well after first paint, jumping every line-height and inflating CLS
// (round-4 Lighthouse measured 0.76–1.43, still 0.4–0.9 after part 1).
// next/font auto-generates a metric-matched fallback for Latin fonts
// but NOT for CJK families, so the swap is visually large.
// `display: 'optional'` tells the browser to skip the swap entirely if
// the font is not in the cache within ~100ms — first-time visitors see
// the system fallback for the whole session, repeat visitors get the
// real font on the next navigation. This kills the swap-shift entirely.
const notoSans = Noto_Sans_TC({
  subsets: ['latin'],
  weight: ['400', '500', '700', '900'],
  display: 'optional',
  variable: '--font-noto-sans-tc',
});

const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '700'],
  display: 'swap',
  variable: '--font-inter',
});

// 祕島 LP 顯示字體 — 古籍／古地圖質感的明體（BRAND_BOOK Section 04）。
// display:'swap'：標題層級的襯線字是品牌視覺核心，寧可短暫 fallback 再換字。
const notoSerif = Noto_Serif_TC({
  subsets: ['latin'],
  weight: ['600', '700', '900'],
  display: 'swap',
  variable: '--font-noto-serif-tc',
});

export const metadata: Metadata = {
  title: {
    template: '%s | Midao 祕島 — 台灣在地導遊',
    default: 'Midao 祕島 — 找到懂路的人，帶你走進台灣最有故事的地方',
  },
  description: '台灣在地導遊預約平台 — 發現真正在地的導遊與特色行程，直接預約、安全付款。',
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? 'https://tour-platform-nine.vercel.app'),
  openGraph: {
    type: 'website',
    locale: 'zh_TW',
    siteName: 'Midao 祕島',
    title: 'Midao 祕島 — 台灣在地導遊預約',
    description: '找到懂路的人，帶你走進台灣最有故事的地方',
    images: [{ url: 'https://images.unsplash.com/photo-1528164344705-47542687000d?w=1200&q=80', width: 1200, height: 630, alt: 'Midao 祕島 — 台灣在地導遊預約平台' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Midao 祕島 — 台灣在地導遊預約',
    description: '找到懂路的人，帶你走進台灣最有故事的地方',
    images: ['https://images.unsplash.com/photo-1528164344705-47542687000d?w=1200&q=80'],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true },
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-Hant">
      <head>
        {/* Preconnect to image CDNs used by CSS background images */}
        <link rel="preconnect" href="https://images.unsplash.com" />
        <link rel="dns-prefetch" href="https://images.unsplash.com" />
        <link rel="preconnect" href="https://images.pexels.com" />
        <link rel="dns-prefetch" href="https://images.pexels.com" />
        {/* Issue #1344 — 首頁 hero 大圖的 preload 過去放在這裡，導致
            「每一頁」的 head 都帶著一張 w=1600 (~數百 KB) 的首頁專用圖,
            在 slow 4G 上跟當頁的 LCP 圖搶頻寬(/activities mobile LCP
            實測 8.8s 的元兇之一)。首頁自己的 preload 在 app/page.tsx
            內,首頁 LCP 不受影響。Root layout 僅保留 preconnect。 */}
      </head>
      <body className={`${notoSans.variable} ${inter.variable} ${notoSerif.variable}`}>
        <a href="#main-content" className="tp-skip-link">跳至主要內容</a>
        <Navbar />
        <div id="main-content">
          {children}
        </div>
        <Footer />
        {/* Vercel Analytics + Speed Insights — zero-config, GDPR-friendly */}
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
