import type { Metadata } from 'next';
import { HeroSection } from '../src/components/home/HeroSection';
import { FeaturedTours } from '../src/components/home/FeaturedTours';
import { ValueTrustSection } from '../src/components/home/ValueTrustSection';
import { StoryProofSection } from '../src/components/home/StoryProofSection';
import { DestinationsSection } from '../src/components/home/DestinationsSection';
import { ThemeCtas } from '../src/components/home/ThemeCtas';
import { GuideSpotlight } from '../src/components/home/GuideSpotlight';
import { FaqSection } from '../src/components/home/FaqSection';

export const metadata: Metadata = {
  title: 'Midao 祕島｜台灣在地導遊預約平台',
  description: '找到懂路的人，帶你走進台灣最有故事的地方。柴山探洞、大稻埕老街、花蓮溯溪⋯⋯ 預約實名認證在地導遊，安全透明。',
  openGraph: {
    title: 'Midao 祕島｜台灣在地導遊預約平台',
    description: '找到懂路的人，帶你走進台灣最有故事的地方。',
    images: [{ url: 'https://images.unsplash.com/photo-1528164344705-47542687000d?w=1200&q=80' }],
  },
};

const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://tour-platform-nine.vercel.app';

const homeJsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Organization',
      '@id': `${baseUrl}/#organization`,
      name: 'Midao 祕島',
      url: baseUrl,
      description: '台灣在地導遊預約平台 — 連結旅客與在地導遊，提供深度文化體驗。',
      contactPoint: {
        '@type': 'ContactPoint',
        email: 'hello@midao.tw',
        contactType: 'customer service',
        availableLanguage: ['zh-TW', 'en'],
      },
    },
    {
      '@type': 'WebSite',
      '@id': `${baseUrl}/#website`,
      url: baseUrl,
      name: 'Midao 祕島',
      publisher: { '@id': `${baseUrl}/#organization` },
      potentialAction: {
        '@type': 'SearchAction',
        target: `${baseUrl}/activities?q={search_term_string}`,
        'query-input': 'required name=search_term_string',
      },
    },
  ],
};

export default function HomePage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(homeJsonLd) }}
      />
      <HeroSection />
      <ValueTrustSection />
      <FeaturedTours />
      <StoryProofSection />
      <DestinationsSection />
      <ThemeCtas />
      <GuideSpotlight />
      <FaqSection />
    </>
  );
}
