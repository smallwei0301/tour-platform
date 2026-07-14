import Link from 'next/link';
import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { buildAlternates } from '../../../src/lib/seo-alternates.ts';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'faq' });
  return {
    title: t('metaTitle'),
    description: t('metaDescription'),
    alternates: buildAlternates('/faq', locale),
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

export default async function FaqPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'faq' });
  const sections = t.raw('sections') as Array<{ category: string; items: Array<{ q: string; a: string }> }>;

  // JSON-LD FAQPage maps the SAME catalog `sections` array as the visible FAQ,
  // so structured data and on-page content stay in sync in every locale.
  const faqJsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'FAQPage',
        mainEntity: sections.flatMap((section) =>
          section.items.map((item) => ({
            '@type': 'Question',
            name: item.q,
            acceptedAnswer: { '@type': 'Answer', text: item.a },
          }))
        ),
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: t('breadcrumbHome'), item: baseUrl },
          { '@type': 'ListItem', position: 2, name: t('breadcrumbCurrent'), item: `${baseUrl}/faq` },
        ],
      },
    ],
  };

  return (
    <main className="tp-container" style={{ paddingBottom: 56 }}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
      <div className="tp-breadcrumb" style={{ marginTop: 18 }}>
        <Link href="/">{t('breadcrumbHome')}</Link> &gt; {t('breadcrumbCurrent')}
      </div>

      <h1 style={{ marginTop: 20, marginBottom: 4 }}>{t('heroTitle')}</h1>
      <p style={{ color: 'var(--tp-muted)', marginBottom: 36, fontSize: 16 }}>{t('introA')}<Link href="/contact" style={{ color: 'var(--tp-gold-strong)' }}>{t('introLink')}</Link>{t('introB')}</p>

      <div style={{ display: 'grid', gap: 36 }}>
        {sections.map((section) => (
          <section key={section.category}>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--tp-gold-strong)', marginBottom: 14, paddingBottom: 8, borderBottom: '2px solid var(--tp-brass)' }}>
              {section.category}
            </h2>
            <div style={{ display: 'grid', gap: 12 }}>
              {section.items.map((item, i) => (
                <div key={i} style={{ background: 'var(--tp-bg-soft)', borderRadius: 10, padding: '16px 18px', border: '1px solid var(--tp-border)' }}>
                  <p style={{ fontWeight: 700, margin: '0 0 6px', fontSize: 15 }}>{t('questionPrefix')}{item.q}</p>
                  <p style={{ color: 'var(--tp-muted)', margin: 0, lineHeight: 1.8, fontSize: 14 }}>{t('answerPrefix')}{item.a}</p>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>

      <div style={{ marginTop: 40, textAlign: 'center', padding: '28px 20px', background: 'var(--tp-bg-soft)', borderRadius: 12, border: '1px solid var(--tp-border)' }}>
        <p style={{ fontWeight: 700, fontSize: 16, margin: '0 0 8px' }}>{t('footerHeading')}</p>
        <p style={{ color: 'var(--tp-muted)', margin: '0 0 14px', fontSize: 14 }}>{t('footerSubtitle')}</p>
        <Link href="/contact" className="tp-btn tp-btn-primary" style={{ padding: '10px 28px' }}>{t('footerButton')}</Link>
      </div>
    </main>
  );
}
