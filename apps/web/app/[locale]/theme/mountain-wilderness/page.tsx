import Image from 'next/image';
import Link from 'next/link';
import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'theme.mountainWilderness' });
  const ogImage = 'https://images.pexels.com/photos/618833/pexels-photo-618833.jpeg?auto=compress&cs=tinysrgb&w=1200';
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
const wildernessTours = [
  { slug: 'kaohsiung-chaishan-cave-experience', region: 'kaohsiung', imageUrl: '/images/activities/chaishan/main.jpg' },
  { slug: 'kaohsiung-chaishan-cave-experience', region: 'kaohsiung', imageUrl: 'https://images.pexels.com/photos/618833/pexels-photo-618833.jpeg?auto=compress&cs=tinysrgb&w=1200' },
  { slug: 'kaohsiung-chaishan-cave-experience', region: 'kaohsiung', imageUrl: 'https://images.pexels.com/photos/733162/pexels-photo-733162.jpeg?auto=compress&cs=tinysrgb&w=1200' },
];

const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://tour-platform-nine.vercel.app';

// JSON-LD structured data stays in zh-Hant for now (non-visible SEO; localization deferred).
const wildernessJsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: '首頁', item: baseUrl },
        { '@type': 'ListItem', position: 2, name: '探索行程', item: `${baseUrl}/activities` },
        { '@type': 'ListItem', position: 3, name: '山野秘境', item: `${baseUrl}/theme/mountain-wilderness` },
      ],
    },
    {
      '@type': 'FAQPage',
      mainEntity: [
        {
          '@type': 'Question',
          name: '沒有登山經驗可以參加嗎？',
          acceptedAnswer: { '@type': 'Answer', text: '可以，入門路線以平緩步道為主，導遊會先做行前說明與裝備檢查。' },
        },
        {
          '@type': 'Question',
          name: '需要自己準備裝備嗎？',
          acceptedAnswer: { '@type': 'Answer', text: '建議自備登山鞋、飲水與雨具，部分行程提供登山杖等裝備，詳見行程頁面。' },
        },
        {
          '@type': 'Question',
          name: '遇到下雨會出團嗎？',
          acceptedAnswer: { '@type': 'Answer', text: '以當日天氣與山況安全為準，導遊會評估是否調整路線或改期。' },
        },
      ],
    },
  ],
};

export default async function MountainWildernessPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'theme.mountainWilderness' });
  const tCrumb = await getTranslations({ locale, namespace: 'activities' });
  const tours = t.raw('tours') as Array<{ title: string; meta: string }>;
  const faq = t.raw('faq') as Array<{ q: string; a: string }>;

  return (
    <main>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(wildernessJsonLd) }} />
      <div className="tp-container">
        <div className="tp-breadcrumb" style={{ paddingTop: 16 }}>
          <Link href="/">{tCrumb('breadcrumbHome')}</Link> &gt; <Link href="/activities">{tCrumb('breadcrumbActivities')}</Link> &gt; {t('breadcrumb')}
        </div>
      </div>
      <section className="tp-theme-hero tp-theme-wilderness-hero">
        <div className="tp-container">
          <h1>{t('heroTitle')}</h1>
          <p>{t('heroSubtitle')}</p>
          <Link className="tp-btn tp-btn-primary" href={`/activities?type=${encodeURIComponent('山野秘境')}`}>{t('heroCta')}</Link>
        </div>
      </section>

      <section className="tp-section">
        <div className="tp-container tp-feature-3col">
          <article>🥾 {t('feature1a')}<br/>{t('feature1b')}</article>
          <article>🌲 {t('feature2a')}<br/>{t('feature2b')}</article>
          <article>✅ {t('feature3a')}<br/>{t('feature3b')}</article>
        </div>
      </section>

      <section className="tp-section">
        <div className="tp-container">
          <h2>{t('toursHeading')}</h2>
          <div className="tp-card-grid tp-card-grid-activities">
            {wildernessTours.map((tour, i) => (
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
