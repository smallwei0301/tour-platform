import Link from 'next/link';
import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'contact' });
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
const contactJsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'ContactPage',
      url: `${baseUrl}/contact`,
      name: '聯絡我們 | Midao 祕島',
      description: '有任何問題、合作提案或回饋？聯絡 Midao 祕島，我們會在 1-2 個工作天內回覆。',
    },
    {
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: '首頁', item: baseUrl },
        { '@type': 'ListItem', position: 2, name: '聯絡我們', item: `${baseUrl}/contact` },
      ],
    },
  ],
};

export default async function ContactPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'contact' });
  const subjectOptions = t.raw('subjectOptions') as Array<string>;

  return (
    <main className="tp-container" style={{ paddingBottom: 40 }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(contactJsonLd) }} />
      <div className="tp-breadcrumb" style={{ marginTop: 18 }}>
        <Link href="/">{t('breadcrumbHome')}</Link> &gt; {t('breadcrumbCurrent')}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 32, marginTop: 20 }}
        className="contact-grid">
        <style>{`
          @media (min-width: 640px) {
            .contact-grid { grid-template-columns: 1fr 1fr !important; }
          }
        `}</style>
        <div>
          <h1>{t('heading')}</h1>
          <p style={{ color: 'var(--tp-muted)', lineHeight: 1.8, marginBottom: 24 }}>
            {t('intro')}
          </p>

          <form style={{ display: 'grid', gap: 14 }}>
            <label htmlFor="contact-name" style={{ display: 'block' }}>
              <span style={{ fontWeight: 700, fontSize: 14 }}>{t('nameLabel')}</span>
              <input id="contact-name" type="text" name="name" placeholder={t('namePlaceholder')} required aria-required="true" autoComplete="name" style={{ display: 'block', width: '100%', padding: '10px 12px', border: '1px solid var(--tp-border)', borderRadius: 10, marginTop: 4 }} />
            </label>
            <label htmlFor="contact-email" style={{ display: 'block' }}>
              <span style={{ fontWeight: 700, fontSize: 14 }}>{t('emailLabel')}</span>
              <input id="contact-email" type="email" name="email" placeholder={t('emailPlaceholder')} required aria-required="true" autoComplete="email" style={{ display: 'block', width: '100%', padding: '10px 12px', border: '1px solid var(--tp-border)', borderRadius: 10, marginTop: 4 }} />
            </label>
            <label htmlFor="contact-subject" style={{ display: 'block' }}>
              <span style={{ fontWeight: 700, fontSize: 14 }}>{t('subjectLabel')}</span>
              <select id="contact-subject" name="subject" style={{ display: 'block', width: '100%', padding: '10px 12px', border: '1px solid var(--tp-border)', borderRadius: 10, marginTop: 4 }}>
                {subjectOptions.map((opt, i) => (
                  <option key={i}>{opt}</option>
                ))}
              </select>
            </label>
            <label htmlFor="contact-message" style={{ display: 'block' }}>
              <span style={{ fontWeight: 700, fontSize: 14 }}>{t('messageLabel')}</span>
              <textarea id="contact-message" name="message" rows={5} placeholder={t('messagePlaceholder')} required aria-required="true"
                style={{ display: 'block', width: '100%', padding: '10px 12px', border: '1px solid var(--tp-border)', borderRadius: 10, marginTop: 4, resize: 'vertical' }} />
            </label>
            <button type="submit" className="tp-btn tp-btn-primary" style={{ padding: '12px 0', fontSize: 16 }}>{t('submitButton')}</button>
          </form>
        </div>

        <div style={{ paddingTop: 0 }}>
          <div style={{ background: 'var(--tp-bg-soft)', borderRadius: 12, padding: 24, marginBottom: 20 }}>
            <h3 style={{ marginTop: 0 }}>{t('emailCardTitle')}</h3>
            <p style={{ color: 'var(--tp-muted)' }}>{t('emailCardValue')}</p>
          </div>
          <div style={{ background: 'var(--tp-bg-soft)', borderRadius: 12, padding: 24, marginBottom: 20 }}>
            <h3 style={{ marginTop: 0 }}>{t('hotlineCardTitle')}</h3>
            <p style={{ color: 'var(--tp-muted)' }}>{t('hotlineCardValue')}</p>
          </div>
          <div style={{ background: 'var(--tp-bg-soft)', borderRadius: 12, padding: 24 }}>
            <h3 style={{ marginTop: 0 }}>{t('hoursCardTitle')}</h3>
            <p style={{ color: 'var(--tp-muted)' }}>{t('hoursCardLine1')}<br />{t('hoursCardLine2')}</p>
          </div>
        </div>
      </div>
    </main>
  );
}
