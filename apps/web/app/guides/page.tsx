import { Suspense } from 'react';
import Link from 'next/link';
import type { Metadata } from 'next';
import { listPublishedGuidesDb } from '../../src/lib/db.mjs';
import GuidesContent from './GuidesContent';

export const metadata: Metadata = {
  title: '認識導遊 | Midao 祕島',
  description: '認識 Midao 祕島平台上的在地導遊。每位導遊都經過實名認證，帶你走進台灣最有故事的地方。',
  openGraph: {
    title: '認識導遊 | Midao 祕島',
    description: '找到屬於你的引路人——認識台灣各地在地導遊的專長與故事。',
    images: [{ url: 'https://images.unsplash.com/photo-1528164344705-47542687000d?w=1200&q=80', width: 1200, height: 630, alt: '台灣在地導遊 | Midao 祕島' }],
  },
};

export default async function GuidesPage() {
  const guides = await listPublishedGuidesDb().catch((): unknown[] => []);

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://tour-platform-nine.vercel.app';
  const guidesJsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'ItemList',
        name: '台灣在地導遊 | Midao 祕島',
        url: `${baseUrl}/guides`,
        numberOfItems: guides.length,
        itemListElement: (guides as Array<{ slug: string; displayName: string; region?: string }>).map((g, i) => ({
          '@type': 'ListItem',
          position: i + 1,
          item: {
            '@type': 'Person',
            name: g.displayName,
            url: `${baseUrl}/guides/${g.slug}`,
            ...(g.region ? { address: { '@type': 'PostalAddress', addressLocality: g.region } } : {}),
          },
        })),
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: '首頁', item: baseUrl },
          { '@type': 'ListItem', position: 2, name: '認識導遊', item: `${baseUrl}/guides` },
        ],
      },
    ],
  };

  return (
    <main className="tp-container tp-guides-page" style={{ paddingBottom: 40 }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(guidesJsonLd) }} />
      <div className="tp-breadcrumb"><Link href="/">首頁</Link> &gt; <Link href="/guides">認識導遊</Link></div>
      <Suspense fallback={<div style={{ padding: 40, textAlign: 'center', color: '#666' }}>載入中⋯</div>}>
        <GuidesContent guides={guides as any[]} />
      </Suspense>
    </main>
  );
}
