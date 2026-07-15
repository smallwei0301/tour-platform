import { Suspense } from 'react';
import Link from 'next/link';
import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { listPublishedGuidesDb } from '../../../src/lib/db.mjs';
import GuidesContent from './GuidesContent';
import { buildAlternates } from '../../../src/lib/seo-alternates.ts';

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
    // 健檢 v2 SEO-1：canonical/hreflang
    alternates: buildAlternates('/guides', locale),
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

  const tSeo = await getTranslations({ locale, namespace: 'seo' });
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://tour-platform-nine.vercel.app';
  const guidesJsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'ItemList',
        name: tSeo('guidesItemListName'),
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
          { '@type': 'ListItem', position: 1, name: ta('breadcrumbHome'), item: baseUrl },
          { '@type': 'ListItem', position: 2, name: t('breadcrumb'), item: `${baseUrl}/guides` },
        ],
      },
    ],
  };

  return (
    <main className="tp-container tp-guides-page" style={{ paddingBottom: 40 }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(guidesJsonLd) }} />
      <div className="tp-breadcrumb"><Link href="/">{ta('breadcrumbHome')}</Link> &gt; <Link href="/guides">{t('breadcrumb')}</Link></div>
      {/* issue1711 S3：GuidesContent 因 useSearchParams CSR bailout，SSR HTML 原本無 H1；
          頁面唯一 H1 改由 server 輸出，列表內的動態結果數降為 h2。 */}
      <h1 style={{ marginTop: 20, marginBottom: 4 }}>{t('pageTitle')}</h1>
      <Suspense fallback={<div style={{ padding: 40, textAlign: 'center', color: '#666' }}>{t('loading')}</div>}>
        <GuidesContent guides={guides as any[]} />
      </Suspense>
    </main>
  );
}
