import Link from 'next/link';
import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'about' });
  return {
    title: t('metaTitle'),
    description: t('metaDescription'),
    openGraph: {
      title: t('ogTitle'),
      description: t('ogDescription'),
      images: [{ url: '/images/og-default.png', width: 1536, height: 1024, alt: t('ogImageAlt') }],
    },
    twitter: {
      card: 'summary_large_image',
      title: t('ogTitle'),
      description: t('ogDescription'),
      images: ['/images/og-default.png'],
    },
  };
}

const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://tour-platform-nine.vercel.app';

// JSON-LD structured data stays in zh-Hant for now (non-visible SEO; localization deferred).
const aboutJsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Organization',
      name: 'Midao 祕島',
      url: baseUrl,
      description: '台灣在地導遊預約平台 — 連結旅客與在地導遊，提供深度文化體驗。',
      sameAs: [`${baseUrl}/about`],
    },
    {
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: '首頁', item: baseUrl },
        { '@type': 'ListItem', position: 2, name: '關於我們', item: `${baseUrl}/about` },
      ],
    },
  ],
};

export default async function AboutPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'about' });
  const numbers = t.raw('numbers') as Array<{ num: string; label: string }>;

  return (
    <main className="tp-container" style={{ paddingBottom: 40 }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(aboutJsonLd) }} />
      <link rel="preload" as="image" href="https://images.unsplash.com/photo-1528164344705-47542687000d?w=1400&q=80" fetchPriority="high" />
      <div className="tp-breadcrumb" style={{ marginTop: 18 }}>
        <Link href="/">{t('breadcrumbHome')}</Link> &gt; {t('breadcrumbCurrent')}
      </div>
      {/* Hero */}
      <section style={{
        backgroundImage: 'linear-gradient(rgba(0,0,0,0.4), rgba(0,0,0,0.5)), url(https://images.unsplash.com/photo-1528164344705-47542687000d?w=1400&q=80)',
        backgroundSize: 'cover', backgroundPosition: 'center',
        borderRadius: 14, padding: '60px 40px', marginTop: 18, color: '#fff',
      }}>
        <h1 style={{ fontSize: 36, marginBottom: 12 }}>{t('heroTitle')}</h1>
        <p style={{ fontSize: 18, maxWidth: 600, lineHeight: 1.7, opacity: 0.95 }}>
          {t('heroSubtitle')}
        </p>
      </section>

      {/* Story */}
      <section style={{ marginTop: 40, maxWidth: 720 }}>
        <h2>{t('storyHeading')}</h2>
        <p style={{ lineHeight: 1.8, color: 'var(--tp-muted)', marginBottom: 16 }}>
          {t('storyP1')}
        </p>
        <p style={{ lineHeight: 1.8, color: 'var(--tp-muted)', marginBottom: 16 }}>
          {t('storyP2a')}<strong>{t('storyP2b')}</strong>
        </p>
        <p style={{ lineHeight: 1.8, color: 'var(--tp-muted)' }}>
          {t('storyP3')}
        </p>
      </section>

      {/* Numbers */}
      <section style={{ marginTop: 40, display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16 }}
        className="about-numbers">
        <style>{`@media (min-width: 640px) { .about-numbers { grid-template-columns: repeat(4, 1fr) !important; } }`}</style>
        {numbers.map((d, i) => (
          <div key={i} style={{ textAlign: 'center', padding: 20, border: '1px solid var(--tp-border)', borderRadius: 12 }}>
            <p style={{ fontSize: 32, fontWeight: 800, color: 'var(--tp-gold-strong)', margin: 0 }}>{d.num}</p>
            <p style={{ color: 'var(--tp-muted)', margin: '4px 0 0', fontSize: 14 }}>{d.label}</p>
          </div>
        ))}
      </section>

      {/* CTA */}
      <section style={{ marginTop: 40, textAlign: 'center', padding: '40px 0' }}>
        <h2>{t('ctaHeading')}</h2>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginTop: 16 }}>
          <Link href="/guide/apply" className="tp-btn tp-btn-primary" style={{ padding: '12px 28px' }}>{t('ctaGuide')}</Link>
          <Link href="/activities" className="tp-btn tp-btn-ghost" style={{ padding: '12px 28px' }}>{t('ctaExplore')}</Link>
        </div>
      </section>
    </main>
  );
}
