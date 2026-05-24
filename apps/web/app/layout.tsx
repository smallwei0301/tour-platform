import { Inter, Noto_Sans_TC } from 'next/font/google';
import type { Metadata } from 'next';
import './globals.css';
import { Navbar } from '../src/components/layout/Navbar';
import { Footer } from '../src/components/layout/Footer';
import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/next';

const notoSans = Noto_Sans_TC({
  subsets: ['latin'],
  weight: ['400', '500', '700', '900'],
  display: 'swap',
  variable: '--font-noto-sans-tc',
});

const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '700'],
  display: 'swap',
  variable: '--font-inter',
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
      <body className={`${notoSans.variable} ${inter.variable}`}>
        <Navbar />
        {children}
        <Footer />
        {/* Vercel Analytics + Speed Insights — zero-config, GDPR-friendly */}
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
