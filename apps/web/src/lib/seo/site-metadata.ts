import type { Metadata } from 'next';

export const SITE_METADATA_BASE = new URL(
  process.env.NEXT_PUBLIC_APP_URL ?? 'https://tour-platform-nine.vercel.app'
);

// issue1711 S6：GSC「HTML 標記」驗證 token。
// 此值「公開 by design」——它本來就輸出在每頁 HTML 的 meta 上供 Google 讀取，
// 不是秘密（owner 於 2026-07-16 對話提供並要求直接完成串接）；env 可覆寫。
// env 讀取集中於本檔，避免增加直讀 process.env 的檔案數（architecture-ratchet-guard）。
export const GOOGLE_SITE_VERIFICATION =
  process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION ??
  'kAD31f9fOJMB5x2zwteiJYKFo2252dM_J4aiKK1wffQ';

export const siteMetadata: Metadata = {
  title: {
    template: '%s | Midao 祕島 — 台灣在地導遊',
    default: 'Midao 祕島 — 找到懂路的人，帶你走進台灣最有故事的地方',
  },
  description: '台灣在地導遊預約平台 — 發現真正在地的導遊與特色行程，直接預約、安全付款。',
  metadataBase: SITE_METADATA_BASE,
  openGraph: {
    type: 'website',
    locale: 'zh_TW',
    siteName: 'Midao 祕島',
    title: 'Midao 祕島 — 台灣在地導遊預約',
    description: '找到懂路的人，帶你走進台灣最有故事的地方',
    images: [{ url: '/images/og-default.png', width: 1536, height: 1024, alt: 'Midao 祕島 — 台灣在地導遊預約平台' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Midao 祕島 — 台灣在地導遊預約',
    description: '找到懂路的人，帶你走進台灣最有故事的地方',
    images: ['/images/og-default.png'],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true },
  },
};
