import Image from 'next/image';
import Link from 'next/link';
import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { buildAlternates } from '../../../../src/lib/seo-alternates.ts';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'theme.riverTrekking' });
  const ogImage = 'https://images.pexels.com/photos/2325446/pexels-photo-2325446.jpeg?auto=compress&cs=tinysrgb&w=1200';
  return {
    title: t('metaTitle'),
    description: t('metaDescription'),
    alternates: buildAlternates('/theme/river-trekking', locale),
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

// slug + imageUrl stay in source; localized title/meta come from the catalog `tours` array (same order).
const riverTours = [
  { slug: 'hualien-river-trekking', imageUrl: 'https://images.pexels.com/photos/2325446/pexels-photo-2325446.jpeg?auto=compress&cs=tinysrgb&w=1200' },
  { slug: 'hualien-river-trekking', imageUrl: 'https://images.pexels.com/photos/210186/pexels-photo-210186.jpeg?auto=compress&cs=tinysrgb&w=1200' },
  { slug: 'hualien-river-trekking', imageUrl: 'https://images.pexels.com/photos/125510/pexels-photo-125510.jpeg?auto=compress&cs=tinysrgb&w=1200' },
];


export default async function RiverTrekkingPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'theme.riverTrekking' });
  const tCrumb = await getTranslations({ locale, namespace: 'activities' });
  const tours = t.raw('tours') as Array<{ title: string; meta: string }>;
  const faq = t.raw('faq') as Array<{ q: string; a: string }>;

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://tour-platform-nine.vercel.app';
  const riverJsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: tCrumb('breadcrumbHome'), item: baseUrl },
          { '@type': 'ListItem', position: 2, name: tCrumb('breadcrumbActivities'), item: `${baseUrl}/activities` },
          { '@type': 'ListItem', position: 3, name: t('breadcrumb'), item: `${baseUrl}/theme/river-trekking` },
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
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(riverJsonLd) }} />
      <div className="tp-container">
        <div className="tp-breadcrumb" style={{ paddingTop: 16 }}>
          <Link href="/">{tCrumb('breadcrumbHome')}</Link> &gt; <Link href="/activities">{tCrumb('breadcrumbActivities')}</Link> &gt; {t('breadcrumb')}
        </div>
      </div>
      <section className="tp-theme-hero tp-theme-river-hero">
        <div className="tp-container">
          <h1>{t('heroTitle')}</h1>
          <p>{t('heroSubtitle')}</p>
          <Link className="tp-btn tp-btn-primary" href="/activities?type=%E9%87%8E%E5%A4%96%E6%BA%AA%E6%B5%81">{t('heroCta')}</Link>
        </div>
      </section>

      <section className="tp-section">
        <div className="tp-container tp-feature-3col">
          <article>🪨 {t('feature1a')}<br/>{t('feature1b')}</article>
          <article>🌊 {t('feature2a')}<br/>{t('feature2b')}</article>
          <article>✅ {t('feature3a')}<br/>{t('feature3b')}</article>
        </div>
      </section>

      <section className="tp-section">
        <div className="tp-container">
          <h2>{t('toursHeading')}</h2>
          <div className="tp-card-grid tp-card-grid-activities">
            {riverTours.map((tour, i) => (
              <article className="tp-card" key={tour.slug + tours[i].title}>
                <Image src={tour.imageUrl} alt={tours[i].title} className="tp-card-img" loading="lazy" width={1200} height={675} />
                <h3>{tours[i].title}</h3>
                <p>{tours[i].meta}</p>
                <Link className="tp-link" href={`/activities/hualien/${encodeURIComponent(tour.slug)}`}>{t('viewTour')}</Link>
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
