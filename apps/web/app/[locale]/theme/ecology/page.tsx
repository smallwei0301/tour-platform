import Image from 'next/image';
import Link from 'next/link';
import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'theme.ecology' });
  const ogImage = 'https://images.unsplash.com/photo-1444464666168-49d633b86797?auto=format&fit=crop&w=1200&q=80';
  return {
    title: t('metaTitle'),
    description: t('metaDescription'),
    openGraph: {
      title: t('ogTitle'),
      description: t('ogDescription'),
      images: [{ url: ogImage, width: 1200, height: 630, alt: t('metaTitle') }],
    },
    twitter: {
      card: 'summary_large_image',
      title: t('ogTitle'),
      description: t('ogDescription'),
      images: [ogImage],
    },
  };
}

// 生態主題的展示圖片（localized title/meta 來自 catalog `tours`，同序對應）。
// 卡片連到「自然生態」篩選列表（非特定 slug），確保隨真實上架的生態行程動態呈現。
const ecologyTours = [
  { imageUrl: 'https://images.unsplash.com/photo-1452570053594-1b985d6ea890?auto=format&fit=crop&w=1200&q=80' },
  { imageUrl: 'https://images.unsplash.com/photo-1559825481-12a05cc00344?auto=format&fit=crop&w=1200&q=80' },
  { imageUrl: 'https://images.unsplash.com/photo-1511497584788-876760111969?auto=format&fit=crop&w=1200&q=80' },
];

const ECOLOGY_FILTER_HREF = `/activities?type=${encodeURIComponent('自然生態')}`;

export default async function EcologyThemePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'theme.ecology' });
  const tCrumb = await getTranslations({ locale, namespace: 'activities' });
  const tours = t.raw('tours') as Array<{ title: string; meta: string }>;
  const faq = t.raw('faq') as Array<{ q: string; a: string }>;

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://tour-platform-nine.vercel.app';
  const ecologyJsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: tCrumb('breadcrumbHome'), item: baseUrl },
          { '@type': 'ListItem', position: 2, name: tCrumb('breadcrumbActivities'), item: `${baseUrl}/activities` },
          { '@type': 'ListItem', position: 3, name: t('breadcrumb'), item: `${baseUrl}/theme/ecology` },
        ],
      },
      {
        '@type': 'FAQPage',
        mainEntity: faq.map((item) => ({
          '@type': 'Question',
          name: item.q,
          acceptedAnswer: { '@type': 'Answer', text: item.a },
        })),
      },
    ],
  };

  return (
    <main>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ecologyJsonLd) }} />
      <div className="tp-container">
        <div className="tp-breadcrumb" style={{ paddingTop: 16 }}>
          <Link href="/">{tCrumb('breadcrumbHome')}</Link> &gt; <Link href="/activities">{tCrumb('breadcrumbActivities')}</Link> &gt; {t('breadcrumb')}
        </div>
      </div>
      <section className="tp-theme-hero tp-theme-ecology-hero">
        <div className="tp-container">
          <h1>{t('heroTitle')}</h1>
          <p>{t('heroSubtitle')}</p>
          <Link className="tp-btn tp-btn-primary" href={ECOLOGY_FILTER_HREF}>{t('heroCta')}</Link>
        </div>
      </section>

      <section className="tp-section">
        <div className="tp-container tp-feature-3col">
          <article>🦅 {t('feature1a')}<br/>{t('feature1b')}</article>
          <article>🔭 {t('feature2a')}<br/>{t('feature2b')}</article>
          <article>🌿 {t('feature3a')}<br/>{t('feature3b')}</article>
        </div>
      </section>

      <section className="tp-section">
        <div className="tp-container">
          <h2>{t('toursHeading')}</h2>
          <div className="tp-card-grid tp-card-grid-activities">
            {ecologyTours.map((tour, i) => (
              <article className="tp-card" key={tours[i].title}>
                <Image src={tour.imageUrl} alt={tours[i].title} className="tp-card-img" loading="lazy" width={1200} height={675} />
                <h3>{tours[i].title}</h3>
                <p>{tours[i].meta}</p>
                <Link className="tp-link" href={ECOLOGY_FILTER_HREF}>{t('viewTour')}</Link>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="tp-section tp-faq">
        <div className="tp-container">
          <h2>{t('faqHeading')}</h2>
          <div className="tp-faq-list">
            {faq.map((item, i) => (
              <details key={item.q} open={i === 0}><summary>{item.q}</summary><p>{item.a}</p></details>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
