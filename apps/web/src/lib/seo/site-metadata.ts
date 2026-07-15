import type { Metadata } from 'next';

export const SITE_METADATA_BASE = new URL(
  process.env.NEXT_PUBLIC_APP_URL ?? 'https://tour-platform-nine.vercel.app'
);

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
