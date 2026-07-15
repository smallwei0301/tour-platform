import { Inter, Noto_Sans_TC, Noto_Serif_TC } from 'next/font/google';
import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/next';

import { GoogleAnalytics } from '../analytics/GoogleAnalytics';
import { Navbar } from './Navbar';
import { FooterGate } from './FooterGate';

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

const notoSerif = Noto_Serif_TC({
  subsets: ['latin'],
  weight: ['600', '700', '900'],
  display: 'swap',
  variable: '--font-noto-serif-tc',
});

export function RootDocument({ lang, children }: { lang: string; children: React.ReactNode }) {
  return (
    <html lang={lang}>
      <head>
        <GoogleAnalytics />
        <script
          dangerouslySetInnerHTML={{
            __html:
              "(function(){try{var p=location.pathname;if(p==='/'||p==='/en'||p==='/ja'||p==='/ko'){if('scrollRestoration' in history){history.scrollRestoration='manual';}window.scrollTo(0,0);}}catch(e){}})();",
          }}
        />
        <link rel="preconnect" href="https://images.unsplash.com" />
        <link rel="dns-prefetch" href="https://images.unsplash.com" />
        <link rel="preconnect" href="https://images.pexels.com" />
        <link rel="dns-prefetch" href="https://images.pexels.com" />
      </head>
      <body className={`${notoSans.variable} ${inter.variable} ${notoSerif.variable}`}>
        <a href="#main-content" className="tp-skip-link">跳至主要內容</a>
        <Navbar />
        <div id="main-content">{children}</div>
        <FooterGate />
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
