import Image from 'next/image';
import Link from 'next/link';
import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'theme.caveExploration' });
  const ogImage = 'https://images.pexels.com/photos/1496373/pexels-photo-1496373.jpeg?auto=compress&cs=tinysrgb&w=1200';
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

// slug + imageUrl stay in source; localized title/meta come from the catalog `tours` array (same order).
const caveTours = [
  { slug: 'kaohsiung-chaishan-cave-experience', imageUrl: '/images/activities/chaishan/main.jpg' },
  { slug: 'kaohsiung-chaishan-cave-experience', imageUrl: 'https://images.pexels.com/photos/1496373/pexels-photo-1496373.jpeg?auto=compress&cs=tinysrgb&w=1200' },
  { slug: 'kaohsiung-chaishan-cave-experience', imageUrl: 'https://images.pexels.com/photos/3763814/pexels-photo-3763814.jpeg?auto=compress&cs=tinysrgb&w=1200' },
];

const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://tour-platform-nine.vercel.app';

// JSON-LD structured data stays in zh-Hant for now (non-visible SEO; localization deferred).
const caveJsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: '首頁', item: baseUrl },
        { '@type': 'ListItem', position: 2, name: '探索行程', item: `${baseUrl}/activities` },
        { '@type': 'ListItem', position: 3, name: '柴山探洞', item: `${baseUrl}/theme/cave-exploration` },
      ],
    },
    {
      '@type': 'FAQPage',
      mainEntity: [
        {
          '@type': 'Question',
          name: '需要有攀岩經驗嗎？',
          acceptedAnswer: { '@type': 'Answer', text: '不需要，MVP 路線以初中階安全探索為主。' },
        },
        {
          '@type': 'Question',
          name: '適合幾歲的人參加？',
          acceptedAnswer: { '@type': 'Answer', text: '建議 10 歲以上，實際依行程標示與導遊評估。' },
        },
        {
          '@type': 'Question',
          name: '當天要穿什麼？',
          acceptedAnswer: { '@type': 'Answer', text: '建議防滑鞋、長褲、可活動上衣，避免拖鞋。' },
        },
      ],
    },
  ],
};

export default async function CaveExplorationPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'theme.caveExploration' });
  const tCrumb = await getTranslations({ locale, namespace: 'activities' });
  const tours = t.raw('tours') as Array<{ title: string; meta: string }>;
  const faq = t.raw('faq') as Array<{ q: string; a: string }>;

  return (
    <main>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(caveJsonLd) }} />
      <div className="tp-container">
        <div className="tp-breadcrumb" style={{ paddingTop: 16 }}>
          <Link href="/">{tCrumb('breadcrumbHome')}</Link> &gt; <Link href="/activities">{tCrumb('breadcrumbActivities')}</Link> &gt; {t('breadcrumb')}
        </div>
      </div>
      <section className="tp-theme-hero tp-theme-cave-hero">
        <div className="tp-container">
          <h1>{t('heroTitle')}</h1>
          <p>{t('heroSubtitle')}</p>
          <Link className="tp-btn tp-btn-primary" href="/activities?type=%E6%9F%B4%E5%B1%B1%E6%8E%A2%E6%B4%9E">{t('heroCta')}</Link>
        </div>
      </section>

      <section className="tp-section">
        <div className="tp-container tp-feature-3col">
          <article>🔦 {t('feature1a')}<br/>{t('feature1b')}</article>
          <article>🦎 {t('feature2a')}<br/>{t('feature2b')}</article>
          <article>✅ {t('feature3a')}<br/>{t('feature3b')}</article>
        </div>
      </section>

      <section className="tp-section">
        <div className="tp-container">
          <h2>{t('toursHeading')}</h2>
          <div className="tp-card-grid tp-card-grid-activities">
            {caveTours.map((tour, i) => (
              <article className="tp-card" key={tour.slug + tours[i].title}>
                <Image src={tour.imageUrl} alt={tours[i].title} className="tp-card-img" loading="lazy" width={1200} height={675} />
                <h3>{tours[i].title}</h3>
                <p>{tours[i].meta}</p>
                <Link className="tp-link" href={`/activities/kaohsiung/${encodeURIComponent(tour.slug)}`}>{t('viewTour')}</Link>
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
