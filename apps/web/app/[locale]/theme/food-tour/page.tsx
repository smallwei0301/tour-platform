import Image from 'next/image';
import Link from 'next/link';
import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'theme.foodTour' });
  const ogImage = 'https://images.pexels.com/photos/1640777/pexels-photo-1640777.jpeg?auto=compress&cs=tinysrgb&w=1200';
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

// slug + region + imageUrl stay in source; localized title/meta come from the catalog `tours` array (same order).
const foodTours = [
  { slug: 'taipei-night-market-food-tour', region: 'taipei', imageUrl: 'https://images.unsplash.com/photo-1567306226416-28f0efdc88ce?w=1200&q=80' },
  { slug: 'taipei-night-market-food-tour', region: 'taipei', imageUrl: 'https://images.pexels.com/photos/1640777/pexels-photo-1640777.jpeg?auto=compress&cs=tinysrgb&w=1200' },
  { slug: 'taipei-night-market-food-tour', region: 'taipei', imageUrl: 'https://images.pexels.com/photos/2253643/pexels-photo-2253643.jpeg?auto=compress&cs=tinysrgb&w=1200' },
];

const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://tour-platform-nine.vercel.app';

// JSON-LD structured data stays in zh-Hant for now (non-visible SEO; localization deferred).
const foodJsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: '首頁', item: baseUrl },
        { '@type': 'ListItem', position: 2, name: '探索行程', item: `${baseUrl}/activities` },
        { '@type': 'ListItem', position: 3, name: '美食導覽', item: `${baseUrl}/theme/food-tour` },
      ],
    },
    {
      '@type': 'FAQPage',
      mainEntity: [
        {
          '@type': 'Question',
          name: '會吃到很飽嗎？',
          acceptedAnswer: { '@type': 'Answer', text: '行程安排多攤少量，讓你嘗到更多種類又不會太撐，建議出發前留點胃口。' },
        },
        {
          '@type': 'Question',
          name: '有素食或飲食限制可以參加嗎？',
          acceptedAnswer: { '@type': 'Answer', text: '可以，預約時先告知，導遊會調整攤位與品項。' },
        },
        {
          '@type': 'Question',
          name: '餐費包含在費用裡嗎？',
          acceptedAnswer: { '@type': 'Answer', text: '依行程標示為準，部分含品嘗費用、部分另計，請見各行程頁面。' },
        },
      ],
    },
  ],
};

export default async function FoodTourPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'theme.foodTour' });
  const tCrumb = await getTranslations({ locale, namespace: 'activities' });
  const tours = t.raw('tours') as Array<{ title: string; meta: string }>;
  const faq = t.raw('faq') as Array<{ q: string; a: string }>;

  return (
    <main>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(foodJsonLd) }} />
      <div className="tp-container">
        <div className="tp-breadcrumb" style={{ paddingTop: 16 }}>
          <Link href="/">{tCrumb('breadcrumbHome')}</Link> &gt; <Link href="/activities">{tCrumb('breadcrumbActivities')}</Link> &gt; {t('breadcrumb')}
        </div>
      </div>
      <section className="tp-theme-hero tp-theme-food-hero">
        <div className="tp-container">
          <h1>{t('heroTitle')}</h1>
          <p>{t('heroSubtitle')}</p>
          <Link className="tp-btn tp-btn-primary" href={`/activities?type=${encodeURIComponent('美食導覽')}`}>{t('heroCta')}</Link>
        </div>
      </section>

      <section className="tp-section">
        <div className="tp-container tp-feature-3col">
          <article>🍜 {t('feature1a')}<br/>{t('feature1b')}</article>
          <article>🗺️ {t('feature2a')}<br/>{t('feature2b')}</article>
          <article>✅ {t('feature3a')}<br/>{t('feature3b')}</article>
        </div>
      </section>

      <section className="tp-section">
        <div className="tp-container">
          <h2>{t('toursHeading')}</h2>
          <div className="tp-card-grid tp-card-grid-activities">
            {foodTours.map((tour, i) => (
              <article className="tp-card" key={tour.slug + tours[i].title}>
                <Image src={tour.imageUrl} alt={tours[i].title} className="tp-card-img" loading="lazy" width={1200} height={675} />
                <h3>{tours[i].title}</h3>
                <p>{tours[i].meta}</p>
                <Link className="tp-link" href={`/activities/${tour.region}/${encodeURIComponent(tour.slug)}`}>{t('viewTour')}</Link>
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
