import { Suspense } from 'react';
import Link from 'next/link';
import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { listPublishedGuidesDb } from '../../../src/lib/db.mjs';
import GuidesContent from './GuidesContent';

// On-demand revalidation（非定時 ISR）：認識導遊列表直接讀 Supabase，
// 平時維持靜態快取、零背景運算；當導遊在後台「儲存並公開」時，
// /api/guide/profile 會 revalidatePath('/guides') 精準失效，旅客下次
// 刷新即見最新資料。導遊資料變動不頻繁，這比定時 ISR 更省資源。

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'guides' });
  return {
    title: t('metaTitle'),
    description: t('metaDescription'),
    openGraph: {
      title: t('ogTitle'),
      description: t('ogDescription'),
      images: [{ url: '/images/og-default.png', width: 1536, height: 1024, alt: t('ogAlt') }],
    },
    twitter: {
      card: 'summary_large_image',
      title: t('ogTitle'),
      description: t('ogDescription'),
      images: ['/images/og-default.png'],
    },
  };
}

export default async function GuidesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'guides' });
  const ta = await getTranslations({ locale, namespace: 'activities' });
  const guides = await listPublishedGuidesDb().catch((): unknown[] => []);

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://tour-platform-nine.vercel.app';
  // JSON-LD 結構化資料維持 zh（非可見 SEO，全面搬遷後再分批 localize）。
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
      <div className="tp-breadcrumb"><Link href="/">{ta('breadcrumbHome')}</Link> &gt; <Link href="/guides">{t('breadcrumb')}</Link></div>
      <Suspense fallback={<div style={{ padding: 40, textAlign: 'center', color: '#666' }}>{t('loading')}</div>}>
        <GuidesContent guides={guides as any[]} />
      </Suspense>
    </main>
  );
}
