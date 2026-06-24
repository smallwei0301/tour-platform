import Link from 'next/link';
import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'legalPrivacy' });
  return {
    title: t('metaTitle'),
    description: t('metaDescription'),
  };
}

const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://tour-platform-nine.vercel.app';
// JSON-LD structured data stays in zh-Hant for now (non-visible SEO; localization deferred).
const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: [
    { '@type': 'ListItem', position: 1, name: '首頁', item: baseUrl },
    { '@type': 'ListItem', position: 2, name: '隱私政策', item: `${baseUrl}/legal/privacy` },
  ],
};

export default async function PrivacyPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'legalPrivacy' });

  return (
    <main className="tp-container tp-static-page">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <div className="tp-breadcrumb" style={{ marginTop: 18 }}>
        <Link href="/">{t('breadcrumbHome')}</Link> &gt; {t('breadcrumbLeaf')}
      </div>
      <h1>{t('heading')}</h1>
      <section className="tp-step-card">
        <p>{t('para1')}</p>
        <p>{t('para2')}</p>
      </section>
    </main>
  );
}
