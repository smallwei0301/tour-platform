import { Inter, Noto_Sans_TC } from 'next/font/google';
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

export const metadata = {
  title: 'Tour Platform — 台灣在地導遊平台',
  description: '找到懂路的人，帶你走進台灣最有故事的地方。預約在地導遊，柴山探洞、大稻埕老街、花蓮溯溪。',
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
