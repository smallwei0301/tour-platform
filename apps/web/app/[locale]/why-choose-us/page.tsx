import Link from 'next/link';
import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { buildAlternates } from '../../../src/lib/seo-alternates.ts';
import { PublicIcon } from '../../../src/components/ui/PublicIcon';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'whyChooseUs' });
  return {
    title: t('metaTitle'),
    description: t('metaDescription'),
    alternates: buildAlternates('/why-choose-us', locale),
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

// Icon names stay in source; localized title/desc come from the catalog `promises` array (same order).
const promiseIcons = ['badgeCheck', 'shieldCheck', 'phone', 'route'];

export default async function WhyChooseUsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'whyChooseUs' });

  const whyChooseJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: t('breadcrumbHome'), item: baseUrl },
      { '@type': 'ListItem', position: 2, name: t('breadcrumbCurrent'), item: `${baseUrl}/why-choose-us` },
    ],
  };

  const promises = t.raw('promises') as Array<{ title: string; desc: string }>;
  const comparisonRows = t.raw('comparisonRows') as Array<{ label: string; us: string; them: string }>;
  const testimonials = t.raw('testimonials') as Array<{ author: string; text: string; activity: string }>;

  return (
    <main className="tp-container" style={{ paddingBottom: 40 }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(whyChooseJsonLd) }} />
      <link rel="preload" as="image" href="https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=1400&q=80" fetchPriority="high" />
      <div className="tp-breadcrumb" style={{ marginTop: 18 }}>
        <Link href="/">{t('breadcrumbHome')}</Link> &gt; {t('breadcrumbCurrent')}
      </div>
      {/* Hero */}
      <section style={{
        backgroundImage: 'linear-gradient(rgba(0,0,0,0.4), rgba(0,0,0,0.5)), url(https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=1400&q=80)',
        backgroundSize: 'cover', backgroundPosition: 'center',
        borderRadius: 14, padding: '60px 40px', marginTop: 18, color: '#fff',
      }}>
        <h1 style={{ fontSize: 36, marginBottom: 12 }}>{t('heroTitle')}</h1>
        <p style={{ fontSize: 18, maxWidth: 600, lineHeight: 1.7, opacity: 0.95 }}>
          {t('heroSubtitle')}
        </p>
      </section>

      {/* 4 Promises */}
      <section style={{ marginTop: 36, display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16 }}
        className="why-promises">
        <style>{`@media (min-width: 640px) { .why-promises { grid-template-columns: repeat(4, 1fr) !important; } }`}</style>
        {promises.map((p, i) => (
          <div key={i} style={{ textAlign: 'center', padding: 20, border: '1px solid var(--tp-border)', borderRadius: 12 }}>
            <p style={{ fontSize: 36, margin: '0 0 8px', color: 'var(--tp-gold-strong)', display: 'flex', justifyContent: 'center' }}><PublicIcon name={promiseIcons[i] as any} size={36} /></p>
            <h4 style={{ margin: '0 0 6px' }}>{p.title}</h4>
            <p style={{ color: 'var(--tp-muted)', fontSize: 14, margin: 0 }}>{p.desc}</p>
          </div>
        ))}
      </section>

      {/* Comparison table */}
      <section style={{ marginTop: 40 }}>
        <h2 style={{ marginBottom: 16 }}>{t('comparisonHeading')}</h2>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 15 }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--tp-brass)' }}>
                <th scope="col" style={{ textAlign: 'left', padding: '12px 16px' }}></th>
                <th scope="col" style={{ textAlign: 'center', padding: '12px 16px', color: 'var(--tp-gold-strong)', fontWeight: 700 }}><span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><PublicIcon name="sparkles" size={16} /> {t('comparisonUs')}</span></th>
                <th scope="col" style={{ textAlign: 'center', padding: '12px 16px', color: 'var(--tp-muted)' }}><span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, justifyContent: 'center' }}><PublicIcon name="mountain" size={16} /> {t('comparisonThem')}</span></th>
              </tr>
            </thead>
            <tbody>
              {comparisonRows.map((row, i) => (
                <tr key={i} style={{ borderBottom: '1px solid var(--tp-border)' }}>
                  <td style={{ padding: '12px 16px', fontWeight: 600 }}>{row.label}</td>
                  <td style={{ textAlign: 'center', padding: '12px 16px', color: 'var(--tp-gold-strong)' }}>{row.us}</td>
                  <td style={{ textAlign: 'center', padding: '12px 16px', color: 'var(--tp-muted)' }}>{row.them}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Testimonials */}
      <section style={{ marginTop: 40 }}>
        <h2 style={{ marginBottom: 16 }}>{t('testimonialsHeading')}</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(1, 1fr)', gap: 16 }}
          className="why-testimonials">
          <style>{`@media (min-width: 640px) { .why-testimonials { grid-template-columns: repeat(3, 1fr) !important; } }`}</style>
          {testimonials.map((item, i) => (
            <div key={i} style={{ background: 'var(--tp-bg-soft)', border: '1px solid var(--tp-border)', borderRadius: 12, padding: 18 }}>
              <p style={{ color: '#f5a623', margin: '0 0 8px' }}>★★★★★</p>
              <p style={{ lineHeight: 1.7, margin: '0 0 10px' }}>「{item.text}」</p>
              <p style={{ fontSize: 13, color: 'var(--tp-muted)', margin: 0 }}>— {item.author} · {item.activity}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section style={{ marginTop: 40, textAlign: 'center', padding: '40px 0' }}>
        <h2>{t('ctaHeading')}</h2>
        <p style={{ color: 'var(--tp-muted)', marginBottom: 16 }}>{t('ctaSubtitle')}</p>
        <Link href="/activities" className="tp-btn tp-btn-primary" style={{ padding: '14px 32px', fontSize: 16 }}>{t('ctaButton')}</Link>
      </section>
    </main>
  );
}
