import Link from 'next/link';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { listPublishedActivitiesDb } from '../../../../src/lib/db.mjs';
import { buildAlternates, buildPublicPath } from '../../../../src/lib/seo-alternates.ts';

const getPublishedExperienceBySlug = cache(async (slug: string) => {
  try {
    return (await listPublishedActivitiesDb()).find((experience: { slug: string }) => experience.slug === slug) ?? null;
  } catch {
    return null;
  }
});

export async function generateMetadata(
  { params }: { params: Promise<{ locale: string; slug: string }> }
): Promise<Metadata> {
  const { locale, slug } = await params;
  const t = await getTranslations({ locale, namespace: 'experienceDetail' });
  const experience = await getPublishedExperienceBySlug(slug);
  if (!experience) notFound();
  const readable = experience.title;
  return {
    title: t('metaTitle', { name: readable }),
    description: t('metaDescription', { name: readable }),
    alternates: buildAlternates(buildPublicPath('/experiences', [slug]), locale),
    openGraph: {
      title: t('metaTitleShort', { name: readable }),
      description: t('ogDescription'),
      type: 'website',
      images: [{ url: '/images/og-default.png', width: 1536, height: 1024, alt: t('metaTitleShort', { name: readable }) }],
    },
    twitter: {
      card: 'summary_large_image',
      title: t('metaTitleShort', { name: readable }),
      description: t('ogDescription'),
      images: ['/images/og-default.png'],
    },
  };
}

type Experience = {
  slug: string;
  title: string;
  priceTwd: number;
  durationLabel?: string;
  locationLabel?: string;
  levelLabel?: string;
  highlightBullets?: string[];
  description?: string;
  ratingAvg?: number | null;
  ratingCount?: number;
};

function toExperience(experience: Record<string, unknown>): Experience {
  return {
    slug: String(experience.slug),
    title: String(experience.title),
    priceTwd: Number(experience.priceTwd ?? experience.price_twd ?? 1800),
    durationLabel: String(experience.durationLabel ?? experience.duration_display ?? '約 4 小時'),
    locationLabel: String(experience.locationLabel ?? experience.region ?? '台灣在地路線'),
    levelLabel: String(experience.levelLabel ?? '新手友善'),
    highlightBullets: Array.isArray(experience.highlightBullets)
      ? experience.highlightBullets.map(String)
      : (Array.isArray(experience.highlights) ? experience.highlights.map(String) : ['實名在地導遊', '小團體深度體驗', '透明價格與彈性取消']),
    description: String(experience.description ?? '跟著懂路的人，走進最有故事的地方。'),
    ratingAvg: typeof experience.ratingAvg === 'number' ? experience.ratingAvg : null,
    ratingCount: typeof experience.ratingCount === 'number' ? experience.ratingCount : 0,
  };
}

export default async function ExperiencePage({ params }: { params: Promise<{ locale: string; slug: string }> }) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'experienceDetail' });

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://tour-platform-nine.vercel.app';
  const publishedExperience = await getPublishedExperienceBySlug(slug);
  if (!publishedExperience) notFound();
  const experience = toExperience(publishedExperience);

  const experienceJsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'TouristAttraction',
        name: experience.title,
        description: experience.description,
        url: `${baseUrl}/experiences/${experience.slug}`,
        ...(experience.locationLabel ? { address: { '@type': 'PostalAddress', addressLocality: experience.locationLabel, addressCountry: 'TW' } } : {}),
        offers: {
          '@type': 'Offer',
          price: experience.priceTwd,
          priceCurrency: 'TWD',
          availability: 'https://schema.org/InStock',
        },
        ...(experience.ratingAvg != null && experience.ratingCount && experience.ratingCount > 0 ? {
          aggregateRating: {
            '@type': 'AggregateRating',
            ratingValue: experience.ratingAvg,
            reviewCount: experience.ratingCount,
            bestRating: 5,
            worstRating: 1,
          },
        } : {}),
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: t('breadcrumbHome'), item: baseUrl },
          { '@type': 'ListItem', position: 2, name: t('breadcrumbExperiences'), item: `${baseUrl}/experiences` },
          { '@type': 'ListItem', position: 3, name: experience.title },
        ],
      },
    ],
  };

  return (
    <main className="tp-detail">
      <div className="tp-container">
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(experienceJsonLd) }} />
        <div className="tp-breadcrumb"><Link href="/">{t('breadcrumbHome')}</Link> &gt; {t('breadcrumbExperiences')} &gt; {experience.title}</div>

        <section className="tp-detail-layout">
          <article className="tp-detail-main">
            <div className="tp-gallery-main" />

            <h1 style={{ marginTop: 16, marginBottom: 8, fontSize: 32 }}>{experience.title}</h1>
            <p className="tp-detail-meta">{experience.locationLabel} ・ {experience.durationLabel}</p>

            <div className="tp-badges">
              <span>{experience.levelLabel}</span>
              <span>{t('badgeInstant')}</span>
              <span>{t('badgeEvoucher')}</span>
            </div>

            <section className="tp-detail-block">
              <h2>{t('introHeading')}</h2>
              <p>{experience.description}</p>
            </section>

            <section className="tp-detail-block">
              <h2>{t('highlightsHeading')}</h2>
              <ul className="tp-timeline">
                {(experience.highlightBullets || []).map((h, idx) => (
                  <li key={`${experience.slug}-highlight-${idx}`}>{h}</li>
                ))}
              </ul>
            </section>

            <section className="tp-detail-block">
              <h2>{t('bookingHeading')}</h2>
              <ul className="tp-timeline">
                <li>{t('bookingNote1')}</li>
                <li>{t('bookingNote2')}</li>
                <li>{t('bookingNote3')}</li>
              </ul>
            </section>
          </article>

          <aside className="tp-booking-side">
            <div className="tp-booking-card">
              <p style={{ margin: 0, color: 'var(--tp-muted)', fontSize: 14 }}>{t('pricePerPerson')}</p>
              <p className="tp-price">NT$ {experience.priceTwd.toLocaleString()}</p>

              {/* Legacy 退役階段二（#1406）：預約 CTA 改導向 Booking V2 入口，不再進 legacy /checkout。 */}
              <Link className="tp-btn tp-btn-primary tp-full" href={`/booking/${encodeURIComponent(experience.slug)}`}>
                {t('ctaBook')}
              </Link>
              <Link className="tp-btn tp-btn-ghost tp-full" href={`/activities`}>
                {t('ctaOtherTours')}
              </Link>

              <p className="tp-booking-note">
                {t('sideNote')}
              </p>
            </div>
          </aside>
        </section>
      </div>
    </main>
  );
}
