import Image from 'next/image';
import Link from 'next/link';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { getGuideBySlugDb } from '../../../../src/lib/db.mjs';
import { paymentMethodLabels } from '../../../../src/lib/guide-payment-options.mjs';
import { buildActivityHref } from '../../../../src/lib/activity-url';
import { GuideAvatar } from '../../../../src/components/shared/GuideAvatar';
import { ActivityHero } from '../../../../src/components/shared/ActivityHero';
import { GalleryImage } from '../../../../src/components/shared/GalleryImage';
import { GuideContactQASection } from '../../../../src/components/guide/GuideContactQASection';
import { buildAlternates } from '../../../../src/lib/seo-alternates.ts';
import { buildPublicPath } from '../../../../src/lib/seo-path.mjs';

// On-demand revalidation（非定時 ISR）：導遊在後台儲存後，
// /api/guide/profile 會 revalidatePath(`/guides/<slug>`) 精準失效本頁，
// 旅客下次刷新即見最新資料；平時維持靜態快取、零背景運算。
//
// 但動態 segment `[slug]` 原本「沒有」下列設定，Next 預設走 dynamic（每次重 SSR，
// 線上實測 x-vercel-cache: MISS、TTFB ~1.2-1.5s），上面「靜態快取」其實沒生效。
// 補設定讓它真正進 on-demand ISR：
//   - generateStaticParams()→[]：build 不預渲染任何頁，首次請求才 on-demand 生成
//     後快取，由 CDN 邊緣供應（~50ms）。
//   - fetchCache='force-cache'：讓 Supabase 查詢結果可被 ISR 快取。
//   - 不宣告數字 revalidate（預設永久快取）：維持「純 on-demand 失效」設計——
//     只有導遊存檔（/api/guide/profile 的 revalidatePath）才更新，無定時背景重算、
//     也無新核可導遊的延遲窗（見 tests/ui/guides-listing-freshness.test.mjs）。
// 與活動詳情頁 #502 後續同手法，差別在活動頁用定時 revalidate、導遊頁用純 on-demand。
export const fetchCache = 'force-cache';
export const dynamicParams = true;
export function generateStaticParams() {
  return [] as Array<{ slug: string }>;
}

export async function generateMetadata(
  { params }: { params: Promise<{ locale: string; slug: string }> }
): Promise<Metadata> {
  const { locale, slug } = await params;
  const t = await getTranslations({ locale, namespace: 'guideProfile' });
  const guide = await getGuideBySlugDb(slug).catch((): null => null);
  const name = guide?.displayName ?? slug;
  const description = guide?.bio ? guide.bio.slice(0, 140).replace(/\n/g, ' ') : t('metaDescFallback', { name });
  return {
    title: t('metaTitle', { name }),
    description,
    // 健檢 v2 SEO-1：canonical/hreflang
    alternates: buildAlternates(buildPublicPath('/guides', [slug]), locale),
    openGraph: {
      title: t('metaTitleShort', { name }),
      description,
      type: 'profile',
      images: guide?.profilePhotoUrl
        ? [{ url: guide.profilePhotoUrl }]
        : [{ url: '/images/og-default.png', width: 1536, height: 1024, alt: t('metaTitleShort', { name }) }],
    },
    twitter: {
      card: 'summary',
      title: t('metaTitleShort', { name }),
      description,
      ...(guide?.profilePhotoUrl ? { images: [guide.profilePhotoUrl] } : {}),
    },
  };
}

export default async function GuideProfilePage({ params }: { params: Promise<{ locale: string; slug: string }> }) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'guideProfile' });
  const guide = await getGuideBySlugDb(slug).catch((): null => null);
  if (!guide) return notFound();

  const guideActivities = guide.activities || [];
  const guideReviews = guide.reviews || [];
  // 熟悉區域：優先用 regions 陣列，向後相容單一 region。收款方式 id → 顯示文字。
  const guideRegions: string[] = Array.isArray(guide.regions) && guide.regions.length
    ? guide.regions
    : (guide.region ? [guide.region] : []);
  const guideCertifications: string[] = Array.isArray(guide.certifications) ? guide.certifications : [];
  const guidePaymentLabels: string[] = paymentMethodLabels(guide.paymentMethods);
  const regionSummary = guideRegions.join('、') || guide.region;

  // 「詢問導遊」＝認識導遊頁的 inline 訊息（GuideContactQASection）。按下後先判斷
  // 旅客是否登入，已登入即就地展開輸入框送訊息給導遊。訊息不綁定任何行程，重用
  // activity_qa pipeline（activity_id 帶 sentinel `guide:<guideId>`），流進導遊
  // 後台同一個收件匣，後台卡片以「導遊頁面」標示來源。
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://tour-platform-nine.vercel.app';
  const guideJsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Person',
        name: guide.displayName,
        url: `${baseUrl}/guides/${slug}`,
        ...(guide.profilePhotoUrl ? { image: guide.profilePhotoUrl } : {}),
        ...(guide.region ? { address: { '@type': 'PostalAddress', addressLocality: guide.region, addressCountry: 'TW' } } : {}),
        ...(guide.ratingAvg != null && guide.reviewCount >= 1 ? { aggregateRating: { '@type': 'AggregateRating', ratingValue: guide.ratingAvg, reviewCount: guide.reviewCount } } : {}),
        ...(guide.bio ? { description: guide.bio } : {}),
        ...(guide.specialties?.length ? { knowsAbout: guide.specialties } : {}),
        ...(guide.languages?.length ? { knowsLanguage: guide.languages } : {}),
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: t('breadcrumbHome'), item: baseUrl },
          { '@type': 'ListItem', position: 2, name: t('breadcrumbGuides'), item: `${baseUrl}/guides` },
          { '@type': 'ListItem', position: 3, name: guide.displayName },
        ],
      },
    ],
  };

  return (
    <main className="tp-container tp-guide-detail" style={{ paddingBottom: 40 }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(guideJsonLd) }} />
      <div className="tp-breadcrumb" style={{ marginTop: 18 }}>
        <Link href="/">{t('breadcrumbHome')}</Link> &gt; <Link href="/guides">{t('breadcrumbGuides')}</Link> &gt; {guide.displayName}
      </div>
      {/* Hero cover with placeholder fallback */}
      <div style={{ marginTop: 12 }}>
        <ActivityHero
          imageUrl={guide.heroImageUrl}
          title={guide.displayName}
          height={300}
        />
      </div>

      <section className="tp-guide-profile-layout" style={{ display: 'grid', gap: 24, marginTop: 20 }}>
        {/* Main content */}
        <article>
          {/* Head card */}
          <div className="tp-guide-profile-head" style={{ display: 'flex', gap: 16, alignItems: 'center', marginBottom: 24 }}>
            <GuideAvatar
              photoUrl={guide.profilePhotoUrl}
              name={guide.displayName}
              size={96}
              showBorder={true}
            />
            <div>
              <h1 style={{ margin: 0 }}>{guide.displayName}</h1>
              <p style={{ margin: '4px 0', color: 'var(--tp-muted)' }}>
                ✅ {t('verified')} · ⭐ {guide.ratingAvg?.toFixed(1) || '5.0'}{t('statsLine', { reviews: guideReviews.length, services: guide.serviceCount || 0 })} · 📍 {regionSummary}
                {guide.languages?.length > 0 && ` · 🌍 ${guide.languages.slice(0, 4).join('、')}`}
              </p>
              {guide.specialties?.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                  {guide.specialties.map((s: string) => (
                    <span key={s} style={{ background: 'rgba(190, 178, 137, 0.18)', color: 'var(--tp-gold-strong)', border: '1px solid rgba(190, 178, 137, 0.45)', padding: '3px 10px', borderRadius: 10, fontSize: 12 }}>{s}</span>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* About */}
          <section className="tp-detail-block" style={{ marginBottom: 28 }}>
            <h2>{t('about')}</h2>
            <p style={{ lineHeight: 1.8, whiteSpace: 'pre-line' }}>{guide.bio}</p>
          </section>

          {/* 服務資訊：熟悉區域 / 專業證照 / 收款方式（皆來自導遊申請與後台維護） */}
          {(guideRegions.length > 0 || guideCertifications.length > 0 || guidePaymentLabels.length > 0) && (
            <section className="tp-detail-block" data-testid="guide-service-info" style={{ marginBottom: 28 }}>
              <h2>{t('serviceInfo')}</h2>
              <div style={{ display: 'grid', gap: 16 }}>
                {guideRegions.length > 0 && (
                  <div data-testid="guide-regions">
                    <p style={{ margin: '0 0 6px', fontWeight: 700, color: 'var(--tp-muted)' }}>{t('regionsLabel')}</p>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {guideRegions.map((r) => (
                        <span key={r} style={{ background: 'rgba(190, 178, 137, 0.18)', color: 'var(--tp-gold-strong)', border: '1px solid rgba(190, 178, 137, 0.45)', padding: '3px 10px', borderRadius: 10, fontSize: 13 }}>📍 {r}</span>
                      ))}
                    </div>
                  </div>
                )}
                {guideCertifications.length > 0 && (
                  <div data-testid="guide-certifications">
                    <p style={{ margin: '0 0 6px', fontWeight: 700, color: 'var(--tp-muted)' }}>{t('certificationsLabel')}</p>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {guideCertifications.map((c) => (
                        <span key={c} style={{ background: '#e6f4ed', color: 'var(--tp-gold-strong)', padding: '4px 12px', borderRadius: 10, fontSize: 13 }}>🎖️ {c}</span>
                      ))}
                    </div>
                  </div>
                )}
                {guidePaymentLabels.length > 0 && (
                  <div data-testid="guide-payment-methods">
                    <p style={{ margin: '0 0 6px', fontWeight: 700, color: 'var(--tp-muted)' }}>{t('paymentMethodsLabel')}</p>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {guidePaymentLabels.map((p) => (
                        <span key={p} style={{ background: 'rgba(124, 58, 237, 0.10)', color: '#6d28d9', border: '1px solid rgba(124, 58, 237, 0.35)', padding: '4px 12px', borderRadius: 10, fontSize: 13 }}>💳 {p}</span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </section>
          )}

          {/* Verification badges */}
          {guide.verificationBadges?.length > 0 && (
            <section className="tp-detail-block" style={{ marginBottom: 28 }}>
              <h2>{t('credentials')}</h2>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {guide.verificationBadges.map((b: string) => (
                  <span key={b} style={{ background: '#e6f4ed', color: 'var(--tp-gold-strong)', padding: '6px 14px', borderRadius: 10, fontSize: 13 }}>✅ {b}</span>
                ))}
              </div>
            </section>
          )}

          {/* Gallery */}
          <section className="tp-detail-block" style={{ marginBottom: 28 }}>
            <h2>{t('gallery')}</h2>
            {guide.galleryUrls?.length > 0 ? (
              <div className="tp-guide-profile-gallery" style={{ display: 'grid', gap: 8 }}>
                {guide.galleryUrls.map((url: string, i: number) => (
                  <GalleryImage key={i} url={url} alt={t('galleryAlt', { name: guide.displayName, i: i + 1 })} />
                ))}
              </div>
            ) : (
              <div style={{
                background: '#f9fafb',
                border: '1px dashed #d1d5db',
                borderRadius: 12,
                padding: '40px 20px',
                textAlign: 'center',
                color: '#9ca3af',
              }}>
                <span style={{ fontSize: 32, display: 'block', marginBottom: 8 }}>📷</span>
                <span style={{ fontSize: 14 }}>{t('noPhotos')}</span>
              </div>
            )}
          </section>

          {/* Activities */}
          {guideActivities.length > 0 && (
            <section className="tp-detail-block" style={{ marginBottom: 28 }}>
              <h2>{t('myTours')}</h2>
              <div className="tp-card-grid tp-card-grid-activities">
                {guideActivities.map((a: any) => (
                  <article className="tp-card" key={a.slug}>
                    {a.coverImageUrl && (
                      <Image src={a.coverImageUrl} alt={a.title} className="tp-card-img" style={{ background: 'none' }} loading="lazy" width={1200} height={675} />
                    )}
                    <h3>{a.title}</h3>
                    <p>📍 {a.region}</p>
                    <strong style={{ color: 'var(--tp-gold-strong)' }}>{t('priceFrom', { price: a.priceTwd?.toLocaleString() ?? '0' })}</strong>
                    <Link className="tp-link" href={buildActivityHref({ slug: a.slug, region: a.region, regionSlug: a.regionSlug })}>{t('viewTour')}</Link>
                  </article>
                ))}
              </div>
            </section>
          )}

          {/* Reviews */}
          {guideReviews.length > 0 && (
            <section className="tp-detail-block">
              <h2>{t('reviewsHeading')}</h2>
              <p style={{ marginBottom: 14 }}>{t('reviewsSummary', { score: guide.ratingAvg?.toFixed(1) || '5.0', n: guideReviews.length })}</p>
              <div style={{ display: 'grid', gap: 12 }}>
                {guideReviews.map((r: any) => (
                  <div key={r.id} style={{ background: 'var(--tp-bg-soft)', border: '1px solid var(--tp-border)', borderRadius: 10, padding: 14 }}>
                    <div className="tp-guide-review-head" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                      <strong>{r.author}{r.city ? `（${r.city}）` : ''}</strong>
                      <span style={{ color: 'var(--tp-muted)', fontSize: 13 }}>{r.date || r.createdAt?.slice(0, 10)}</span>
                    </div>
                    <p style={{ color: '#f5a623', margin: '0 0 6px' }}>{'★'.repeat(r.rating)}</p>
                    <p style={{ margin: 0, lineHeight: 1.6 }}>{r.text || r.comment}</p>
                  </div>
                ))}
              </div>
            </section>
          )}
        </article>

        {/* Sidebar */}
        <aside className="tp-guide-profile-side" style={{ position: 'sticky', top: 80, height: 'fit-content' }}>
          <div className="tp-booking-card" style={{ border: '1px solid var(--tp-border)', borderRadius: 12, padding: 20, textAlign: 'center' }}>
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <GuideAvatar
                photoUrl={guide.profilePhotoUrl}
                name={guide.displayName}
                size={80}
                showBorder={false}
              />
            </div>
            <p style={{ fontSize: 20, fontWeight: 700, marginTop: 8 }}>{guide.displayName}</p>
            <p style={{ color: 'var(--tp-muted)' }}>⭐ {guide.ratingAvg?.toFixed(1) || '5.0'}{t('sidebarReviews', { n: guideReviews.length })}</p>
            <GuideContactQASection guideId={guide.id} guideName={guide.displayName} />
            <Link className="tp-btn tp-btn-ghost" href="/activities" style={{ width: '100%', display: 'block', marginTop: 8 }}>{t('viewActivitiesBtn')}</Link>
          </div>
        </aside>
      </section>
    </main>
  );
}
