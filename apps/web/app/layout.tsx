import { Inter, Noto_Serif_TC } from 'next/font/google';
import type { Metadata } from 'next';
import './globals.css';
import { Navbar } from '../src/components/layout/Navbar';
import { Footer } from '../src/components/layout/Footer';
import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/next';

// 字型效能策略（手機 Lighthouse round-5，owner 拍板 2026-06-14）——
// Noto Sans/Serif TC 為 CJK 家族，next/font 會替「每個字重」切出 ~105 個
// unicode-range 子檔；中文 body 文字會跨字重觸發下載，實測一頁就抓 ~2.1MB
// 字型（內文 Noto Sans TC ~1.2MB + 標題 Noto Serif TC ~0.8MB）。`display:'optional'`
// 只是「不阻塞 render / 不 swap」，**並不會阻止背景下載**（實測 optional 仍下載
// 2MB 並與 LCP 圖搶頻寬），真實 slow-4G 實測 FCP 3.8s / LCP 4.4s。
//
// 對策：
//   1. 內文（body）改用系統中文字（PingFang TC／微軟正黑／Noto Sans CJK），
//      不再引用 Noto Sans TC webfont —— 該家族整組 @font-face 不再產生，
//      手機端省 ~1.2MB 下載且 render-blocking CSS 大幅縮小。系統字本來就是
//      #1345 把內文設 display:'optional' 後「首訪」實際看到的字，視覺一致。
//   2. 標題（品牌襯線）維持 Noto Serif TC 但改 display:'optional' + preload:false：
//      首訪用系統襯線（PMingLiU/Georgia，不阻塞、無 CLS swap-shift），
//      回訪自快取換回品牌字。

const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '700'],
  display: 'swap',
  variable: '--font-inter',
});

// 祕島 LP／標題 顯示字體 — 古籍／古地圖質感的明體（BRAND_BOOK Section 04）。
// 只保留品牌標題實際用到的 700／900（600 就近對應到 700），display:'optional'
// 讓首訪不被字型下載阻塞、無 swap-shift，回訪用快取的品牌字。
const notoSerif = Noto_Serif_TC({
  subsets: ['latin'],
  weight: ['700', '900'],
  display: 'optional',
  preload: false,
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
        {/* 首頁導覽列「載入即透明」根因修正：在 hydration 前（早於瀏覽器捲動位置
            還原時機）就把首頁的 scrollRestoration 設為 manual 並回到頂端，避免重新
            整理時自動捲回原處而觸發 scroll 事件、使導覽列載入瞬間誤判為已捲動。
            僅作用於首頁路徑，不影響其他頁的捲動還原。 */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "(function(){try{if(location.pathname==='/'){if('scrollRestoration' in history){history.scrollRestoration='manual';}window.scrollTo(0,0);}}catch(e){}})();",
          }}
        />
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
      <body className={`${inter.variable} ${notoSerif.variable}`}>
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
