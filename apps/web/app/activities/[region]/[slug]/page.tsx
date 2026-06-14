import Image from 'next/image';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { getActivityBySlugDb } from '../../../../src/lib/db.mjs';
import { resolveActivityReviewStats } from '../../../../src/lib/activity-review-stats.mjs';
import { normalizeSocialProofQuotes, resolveSocialProofAuthor } from '../../../../src/lib/social-proof-quotes.mjs';
import {
  buildActivityProductJsonLd,
  resolveActivityOgImage,
  serialiseJsonLd,
} from '../../../../src/lib/activity-jsonld.mjs';
import { DatePlanSection } from '../../../../src/components/activity/DatePlanSection';
import { ActivityBottomBar } from '../../../../src/components/activity/ActivityBottomBar';
import { SelectedPlanProvider } from '../../../../src/components/activity/SelectedPlanContext';
import { SectionAnchorNav } from '../../../../src/components/activity/SectionAnchorNav';
import { ImageCarousel } from '../../../../src/components/activity/ImageCarousel';
import { isBookingV2Enabled } from '../../../../src/config/feature-flags.mjs';
import { inferPlanIdForBookingUrl, resolveBookingEntryHref, resolvePlanBookingHref } from '../../../../src/lib/booking-entry.mjs';
import { resolveDatePlanPresentation } from '../../../../src/lib/date-plan-source.mjs';
import { ActivityQASection } from '../../../../src/components/activity/ActivityQASection';
import { PublicPromoBanner } from '../../../../src/components/activity/PublicPromoBanner';
import { ActivityRecommendations } from '../../../../src/components/activity/ActivityRecommendations';
import { PublicIcon } from '../../../../src/components/ui/PublicIcon';

// Issue #502: avoid force-static/unstable_cache render lock on production cold path.
// Keep volatile availability on client intent fetch; detail page stays runtime-rendered.
export const dynamic = 'force-dynamic';
export const revalidate = 60;

const DEFAULT_ACTIVITY_LOOKUP_TIMEOUT_MS = 8_000;

function parseActivityLookupTimeout() {
  const rawTimeout = Number.parseInt(process.env.GH502_ACTIVITY_LOOKUP_TIMEOUT_MS ?? '', 10);
  return Number.isFinite(rawTimeout) && rawTimeout > 0 ? rawTimeout : DEFAULT_ACTIVITY_LOOKUP_TIMEOUT_MS;
}

const RENDER_ACTIVITY_TIMEOUT_MS = parseActivityLookupTimeout();

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timeoutRef: ReturnType<typeof setTimeout> | null = null;
  const timeoutPromise = new Promise<T>((_, reject) => {
    timeoutRef = setTimeout(() => {
      reject(new Error(`[${label}] timeout after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timeoutRef) clearTimeout(timeoutRef);
  }) as Promise<T>;
}

// GH-502 + #1378: metadata 與頁面共用同一次 lookup（React cache() 去重），
// metadata 不會觸發第二次 DB 查詢、也不會比頁面本身多等 —— 失敗/逾時則
// fallback 到 humanized slug 與預設 OG 圖，絕不擋下頁面渲染。
const getActivityForMetadata = cache((slug: string) => getActivityBySlugDb(slug));

export async function generateMetadata(
  { params }: { params: Promise<{ region: string; slug: string }> }
): Promise<Metadata> {
  const { slug } = await params;
  const humanTitle = slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

  let activity: Awaited<ReturnType<typeof getActivityBySlugDb>> = null;
  try {
    activity = await withTimeout(
      getActivityForMetadata(slug),
      RENDER_ACTIVITY_TIMEOUT_MS,
      'activity-metadata',
    );
  } catch {
    activity = null;
  }

  const title = `${activity?.title || humanTitle} | Midao 祕島`;
  const description = activity?.shortDescription
    || '探索台灣在地特色秘境行程，與專業導遊一起發現不一樣的台灣。';
  const ogImageUrl = resolveActivityOgImage(activity?.coverImageUrl);

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: 'website',
      images: [{ url: ogImageUrl, width: 1200, height: 630, alt: activity?.title || 'Midao 祕島 行程' }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [ogImageUrl],
    },
  };
}

export default async function ActivityDetailPage({ params }: { params: Promise<{ region: string; slug: string }> }) {
  const { slug } = await params;

  let activity: Awaited<ReturnType<typeof getActivityBySlugDb>>;
  try {
    activity = await withTimeout(
      // 與 generateMetadata 共用 cache() 結果 — 每請求仍只有一次 DB lookup（GH-502）
      getActivityForMetadata(slug),
      RENDER_ACTIVITY_TIMEOUT_MS,
      'activity-detail-render',
    );
  } catch {
    return notFound();
  }

  if (!activity) return notFound();

  const activityData = activity as typeof activity & {
    ratingAvg?: number | null;
    reviewCount?: number;
    itinerary?: Array<{ icon?: string; title?: string; duration?: string; description?: string }>;
    socialProofQuotes?: Array<string | { author?: string; rating?: number; text?: string }>;
    goodFor?: string[];
  };
  const guide = activity.guide;
  const actReviews = activity.reviews || [];
  // 評價統計（真實評論 + 社群口碑語錄）—— 與首頁精選卡共用同一實作（單一真實來源）
  const reviewStats = resolveActivityReviewStats(activityData);
  // 社群口碑語錄正規化為 { author, rating, text }（相容舊純文字資料）
  const warmQuotes = normalizeSocialProofQuotes(activityData.socialProofQuotes);
  const displayedSchedules = activity.schedules || [];
  const useBookingV2 = isBookingV2Enabled();
  const firstSchedulableEntry = displayedSchedules.find((s: any) => {
    const status = String(s?.status || '').toLowerCase();
    const capacity = Number(s?.capacity ?? 0);
    const bookedCount = Number(s?.bookedCount ?? s?.booked_count ?? 0);
    const hasRemaining = capacity > 0 ? bookedCount < capacity : true;
    return status !== 'full' && status !== 'closed' && hasRemaining;
  });
  const directBookingHref = firstSchedulableEntry
    ? resolvePlanBookingHref({
        activitySlug: activity.slug,
        planId: inferPlanIdForBookingUrl({
          explicitPlanId: firstSchedulableEntry?.planId ?? firstSchedulableEntry?.plan_id ?? undefined,
          scheduleId:
            firstSchedulableEntry?.scheduleId
            ?? firstSchedulableEntry?.schedule_id
            ?? firstSchedulableEntry?.id
            ?? undefined,
          schedules: displayedSchedules,
          plans: (activity as { plans?: unknown[] }).plans || [],
        }) || undefined,
        date: String(firstSchedulableEntry?.startAt || firstSchedulableEntry?.start_at || '').slice(0, 10) || undefined,
        scheduleId:
          firstSchedulableEntry?.scheduleId
          ?? firstSchedulableEntry?.schedule_id
          ?? firstSchedulableEntry?.id
          ?? undefined,
        useBookingV2,
      })
    : resolveBookingEntryHref({ activitySlug: activity.slug, useBookingV2 });

  const imageUrls: string[] = activity.imageUrls?.length ? activity.imageUrls : (activity.coverImageUrl ? [activity.coverImageUrl] : []);
  const originalPrice = Math.round(activity.priceTwd * 1.25);
  const formalPlans = Array.isArray((activity as { plans?: unknown[] }).plans) ? ((activity as { plans?: any[] }).plans || []) : [];
  const datePlanPresentation = resolveDatePlanPresentation({
    useBookingV2,
    canonicalPlans: formalPlans,
    defaultPlans: [],
  });
  const hidePublicBookingCta = Boolean(useBookingV2 && datePlanPresentation.showMissingCanonicalMessage);
  const hasFormalPlanRangeVariance = formalPlans.length > 0 && formalPlans.some((plan) => {
    const min = Number(plan?.minParticipants ?? plan?.min_participants ?? activity.minParticipants);
    const max = Number(plan?.maxParticipants ?? plan?.max_participants ?? activity.maxParticipants);
    return Number.isFinite(min) && Number.isFinite(max) && (min !== activity.minParticipants || max !== activity.maxParticipants);
  });
  const participantSummaryLabel = hasFormalPlanRangeVariance
    ? '最少人數依方案而定'
    : `${activity.minParticipants}~${activity.maxParticipants} 人`;

  return (
    <SelectedPlanProvider>
    <main className="kkd-detail-page" style={{ paddingBottom: 100 }}>
      {/* Preload LCP image (first carousel photo) to reduce Largest Contentful Paint */}
      {imageUrls[0] && (
        <link rel="preload" as="image" href={imageUrls[0]} fetchPriority="high" />
      )}
      {/* ── Structured data (JSON-LD) for SEO/GEO/AEO — issue #637 ── */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            "itemListElement": [
              { "@type": "ListItem", "position": 1, "name": "首頁", "item": `${process.env.NEXT_PUBLIC_APP_URL ?? 'https://tour-platform-nine.vercel.app'}` },
              { "@type": "ListItem", "position": 2, "name": "探索行程", "item": `${process.env.NEXT_PUBLIC_APP_URL ?? 'https://tour-platform-nine.vercel.app'}/activities` },
              { "@type": "ListItem", "position": 3, "name": activity.title },
            ],
          })
        }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "TouristAttraction",
            "name": activity.title,
            "description": activity.shortDescription || activity.title,
            "url": `${process.env.NEXT_PUBLIC_APP_URL ?? 'https://tour-platform-nine.vercel.app'}/activities/${activity.region}/${activity.slug}`,
            "image": activity.coverImageUrl || undefined,
            "priceRange": `NT$${activity.priceTwd}起`,
            "address": {
              "@type": "PostalAddress",
              "addressRegion": activity.region,
              "addressCountry": "TW"
            },
            ...(activityData.ratingAvg != null && activityData.reviewCount ? {
              "aggregateRating": {
                "@type": "AggregateRating",
                "ratingValue": activityData.ratingAvg,
                "reviewCount": activityData.reviewCount,
                "bestRating": 5,
                "worstRating": 1,
              }
            } : {})
          })
        }}
      />
      {/* #1378 — Product schema（Offer + AggregateRating）讓 SERP 顯示價格與星等 */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: serialiseJsonLd(buildActivityProductJsonLd(
            // SERP 星等只用真實已核准評論（activityData.ratingAvg/reviewCount），
            // 暖場口碑語錄不進 Google 結構化資料（#1378 安全準則）
            activityData,
            process.env.NEXT_PUBLIC_APP_URL ?? 'https://tour-platform-nine.vercel.app',
          ))
        }}
      />
      {activity.faq && activity.faq.length > 0 && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "FAQPage",
              "mainEntity": activity.faq.map((item: { question?: string; q?: string; answer?: string; a?: string }) => ({
                "@type": "Question",
                "name": item.question || item.q,
                "acceptedAnswer": { "@type": "Answer", "text": item.answer || item.a },
              })),
            })
          }}
        />
      )}
      {/* ── Breadcrumb ── */}
      <div className="tp-container">
        <div className="tp-breadcrumb">
          <Link href="/">首頁</Link> &gt;{' '}
          <Link href="/activities">探索行程</Link> &gt;{' '}
          {activity.region} &gt; {activity.title}
        </div>
        {/* #1381 — 公開促銷碼提示（無可用碼時不渲染） */}
        <PublicPromoBanner />
      </div>

      {/* ── Gallery ── */}
      {imageUrls.length > 0 && (
        <div className="tp-container">
          <ImageCarousel images={imageUrls} alt={activity.title} sizes="(min-width: 768px) 0vw, 100vw" />
        </div>
      )}

      {/* ── Title block ── */}
      <div className="tp-container">
        <div className="kkd-title-block">
          <h1 className="kkd-title" data-testid="activity-detail-title">{activity.title}</h1>
          {activity.tagline && (
            <p className="kkd-tagline">{activity.tagline}</p>
          )}

          <div className="kkd-meta-row">
            <span className="kkd-rating" data-testid="activity-detail-rating">
              {/* 評分/評論數採整合後單一真實來源 reviewStats（真實評論 + 社群口碑語錄）；
                  activityData.ratingAvg 為後台暖場初始值，已併入 reviewStats 計算 */}
              {reviewStats.count > 0 ? (
                <>★ {reviewStats.score.toFixed(1)}<span className="kkd-review-count">（{reviewStats.count} 則評價）</span></>
              ) : (
                <span style={{ color: 'var(--tp-muted)', fontSize: 13 }}>尚無評價</span>
              )}
            </span>
            <span className="kkd-dot">·</span>
            <span className="kkd-location">📍 {activity.region}</span>
          </div>

          <div className="kkd-price-row">
            <span className="kkd-orig-price">NT${originalPrice.toLocaleString()}</span>
            <strong className="kkd-price">NT${activity.priceTwd.toLocaleString()}</strong>
            <span className="kkd-price-unit">起 / 人</span>
          </div>

          {/* Policy + activity info row */}
          <div className="kkd-policy-row">
            <span className="kkd-policy-item">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
              認證導遊
            </span>
            <span className="kkd-policy-item">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              {activity.durationDisplay}
            </span>
            <span className="kkd-policy-item">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="5" r="2"/><path d="M12 7v8"/><path d="M9 10h6"/><path d="M9 19l3-4 3 4"/></svg>
              {(activity as {transportMode?: string}).transportMode || '步行'}
            </span>
            <span className="kkd-policy-item">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
              {participantSummaryLabel}
            </span>
            <span className="kkd-policy-divider" />
            <span className="kkd-policy-item">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
              最晚出發前 3 天確認
            </span>
            <span className="kkd-policy-item">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="5" y="2" width="14" height="20" rx="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>
              電子憑證
            </span>
            <span className="kkd-policy-item">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
              安全付款
            </span>
          </div>

          {/* Short description */}
          {activity.shortDescription && (
            <p className="kkd-short-desc">{activity.shortDescription}</p>
          )}
        </div>
      </div>

      {/* ── Anchor nav (sticky) ── */}
      <div className="kkd-anchor-wrap">
        <div className="tp-container">
          <SectionAnchorNav sections={[
            { id: 'section-plan', label: '方案' },
            { id: 'section-itinerary', label: '行程' },
            { id: 'section-reviews', label: '評價' },
            { id: 'section-details', label: '商品說明' },
            { id: 'section-policy', label: '購買須知' },
            { id: 'section-qa', label: '問答' },
          ]} />
        </div>
      </div>

      {/* ── Two-column layout: main + sidebar ── */}
      <div className="tp-container">
        <div className="kkd-scroll-layout">

          {/* ── Main content ── */}
          <div className="kkd-scroll-main">

            {/* SECTION 1: 方案 (DatePlanSection) */}
            <section id="section-plan" className="kkd-scroll-section">
              <h2 className="kkd-section-title"><PublicIcon name="calendar" size={18} /> 選擇方案</h2>
              <DatePlanSection activity={activity} schedules={displayedSchedules} useBookingV2={useBookingV2} />
            </section>

            {/* SECTION 1.5: 詳細行程時間表 */}
            {activityData.itinerary && activityData.itinerary.length > 0 && (
              <section id="section-itinerary" className="kkd-scroll-section">
                <h2 className="kkd-section-title"><PublicIcon name="route" size={18} /> 詳細行程</h2>
                <div className="kkd-itinerary">
                  {activityData.itinerary.map((step: { icon?: string; title?: string; duration?: string; description?: string }, i: number) => (
                    <div key={i} className="kkd-itinerary-step">
                      <div className="kkd-itinerary-icon"><PublicIcon name="pin" size={18} /></div>
                      <div className="kkd-itinerary-content">
                        <div className="kkd-itinerary-header">
                          <strong className="kkd-itinerary-title">{step.title}</strong>
                          {step.duration && <span className="kkd-itinerary-duration">{step.duration}</span>}
                        </div>
                        {step.description && <p className="kkd-itinerary-desc">{step.description}</p>}
                      </div>
                      {i < activityData.itinerary!.length - 1 && <div className="kkd-itinerary-connector" />}
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* SECTION 2: 旅客評價 */}
            <section id="section-reviews" className="kkd-scroll-section">
              <h2 className="kkd-section-title"><PublicIcon name="star" size={18} /> 旅客評價</h2>
              <div className="kkd-reviews-summary">
                <span className="kkd-reviews-score"><PublicIcon name="star" size={20} /> {reviewStats.score.toFixed(1)}</span>
                <span className="kkd-reviews-total">共 {reviewStats.count} 則評論</span>
              </div>

              <div className="kkd-review-list">
                {/* 真實旅客評論（已核准）與後台社群口碑語錄整合呈現，使用相同卡片樣式 */}
                {actReviews.map((r: any) => (
                  <div key={r.id} className="kkd-review-card">
                    <div className="kkd-review-header">
                      <strong className="kkd-reviewer">{r.author}（{r.city || 'TW'}）</strong>
                      <span className="kkd-review-date">{r.date || new Date().toLocaleDateString('zh-TW')}</span>
                    </div>
                    {r.rating && (
                      <div className="kkd-stars">{'★'.repeat(r.rating)}</div>
                    )}
                    <p className="kkd-review-text">{r.text}</p>
                  </div>
                ))}
                {warmQuotes.map((q, i) => (
                  <div key={`warm-${i}`} className="kkd-review-card">
                    <div className="kkd-review-header">
                      <strong className="kkd-reviewer">{resolveSocialProofAuthor(q.author)}</strong>
                    </div>
                    <div className="kkd-stars">{'★'.repeat(q.rating)}</div>
                    <p className="kkd-review-text">{q.text}</p>
                  </div>
                ))}
              </div>
            </section>

            {/* SECTION 3: 商品說明 */}
            <section id="section-details" className="kkd-scroll-section">
              <h2 className="kkd-section-title"><PublicIcon name="document" size={18} /> 商品說明</h2>

              {activity.inclusions && activity.inclusions.length > 0 && (
                <div className="kkd-detail-block">
                  <h3 className="kkd-detail-subtitle">行程包含</h3>
                  <ul className="kkd-checklist">
                    {activity.inclusions.map((item: string, i: number) => (
                      <li key={i}><span className="kkd-check"><PublicIcon name="checkCircle" size={16} /></span>{item}</li>
                    ))}
                  </ul>
                </div>
              )}

              {activity.exclusions && activity.exclusions.length > 0 && (
                <div className="kkd-detail-block">
                  <h3 className="kkd-detail-subtitle">行程不含</h3>
                  <ul className="kkd-checklist">
                    {activity.exclusions.map((item: string, i: number) => (
                      <li key={i}><span className="kkd-check"><PublicIcon name="xCircle" size={16} /></span>{item}</li>
                    ))}
                  </ul>
                </div>
              )}

              {activityData.goodFor && activityData.goodFor.length > 0 && (
                <div className="kkd-detail-block">
                  <h3 className="kkd-detail-subtitle">適合對象</h3>
                  <ul className="kkd-checklist">
                    {activityData.goodFor.map((item: string, i: number) => (
                      <li key={i}><span className="kkd-check"><PublicIcon name="thumbsUp" size={16} /></span>{item}</li>
                    ))}
                  </ul>
                </div>
              )}

              {activity.description && (
                <div className="kkd-detail-block">
                  <h3 className="kkd-detail-subtitle">行程描述</h3>
                  <p style={{ lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{activity.description}</p>
                </div>
              )}
            </section>

            {/* SECTION 4: 購買須知 */}
            <section id="section-policy" className="kkd-scroll-section">
              <h2 className="kkd-section-title"><PublicIcon name="pin" size={18} /> 購買須知</h2>

              {activity.notices && activity.notices.length > 0 && (
                <div className="kkd-detail-block">
                  <h3 className="kkd-detail-subtitle">注意事項</h3>
                  <ul className="kkd-notice-list">
                    {activity.notices.map((n: string, i: number) => (
                      <li key={i}>{n}</li>
                    ))}
                  </ul>
                </div>
              )}

              {activity.refundRules && activity.refundRules.length > 0 && (
                <div className="kkd-detail-block">
                  <h3 className="kkd-detail-subtitle">取消與退款政策</h3>
                  <ul className="kkd-notice-list">
                    {activity.refundRules.map((r: string, i: number) => (
                      <li key={i}>{r}</li>
                    ))}
                  </ul>
                </div>
              )}

              {activity.safetyNotice && (
                <div className="kkd-detail-block">
                  <h3 className="kkd-detail-subtitle">安全說明</h3>
                  <p className="kkd-notice-text">{activity.safetyNotice}</p>
                </div>
              )}
            </section>

            {/* 導遊介紹 */}
            {guide && (
              <section className="kkd-scroll-section">
                <h2 className="kkd-section-title"><PublicIcon name="badgeCheck" size={18} /> 關於你的導遊</h2>
                <div className="kkd-guide-card">
                  <Image
                    src={guide.profilePhotoUrl || (guide as {avatarUrl?: string}).avatarUrl || 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=200&q=80'}
                    alt={guide.displayName}
                    loading="lazy"
                    sizes="72px"
                    className="kkd-guide-avatar" width={72} height={72} />
                  <div className="kkd-guide-info">
                    <strong className="kkd-guide-name">{guide.displayName}</strong>
                    <span className="kkd-guide-verified"><PublicIcon name="badgeCheck" size={15} /> 實名已驗證</span>
                    <p className="kkd-guide-meta">
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><PublicIcon name="star" size={14} /> {guide.ratingAvg?.toFixed(1) || '5.0'}</span>（{guide.reviewCount || (guide as {serviceCount?: number}).serviceCount || 0} 次服務）&nbsp;·&nbsp;
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><PublicIcon name="pin" size={14} /> {guide.region}</span>
                      {guide.languages && guide.languages.length > 0 && (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>&nbsp;·&nbsp;<PublicIcon name="globe" size={14} /> {guide.languages.slice(0, 3).join('、')}</span>
                      )}
                    </p>
                    {(guide.headline || guide.bio) && (
                      <p className="kkd-guide-headline">「{guide.headline || guide.bio}」</p>
                    )}
                    <Link href={`/guides/${guide.slug}`} className="kkd-link-sm">
                      查看完整導遊簡介 →
                    </Link>
                  </div>
                </div>
              </section>
            )}

            {/* FAQ */}
            {activity.faq && activity.faq.length > 0 && (
              <section className="kkd-scroll-section">
                <h2 className="kkd-section-title">❓ 常見問題</h2>
                <div className="kkd-faq-list">
                  {activity.faq.map((item: any, i: number) => (
                    <details key={i} className="kkd-faq-item">
                      <summary className="kkd-faq-q">{item.question || item.q}</summary>
                      <p className="kkd-faq-a">{item.answer || item.a}</p>
                    </details>
                  ))}
                </div>
              </section>
            )}

            {/* Q&A section — ActivityQASection (client component) */}
            <ActivityQASection activityId={activity.id} />

          </div>

          {/* ── Sidebar (desktop only) ── */}
          <aside className="kkd-booking-side">
            <div className="kkd-booking-card">
              <div className="kkd-booking-price-block">
                <span className="kkd-booking-orig">NT${originalPrice.toLocaleString()}</span>
                <strong className="kkd-booking-price">
                  NT${activity.priceTwd.toLocaleString()} <span style={{ fontSize: 14, fontWeight: 400 }}>起 / 人</span>
                </strong>
              </div>

              {displayedSchedules.length > 0 && (
                <div className="kkd-booking-schedules">
                  <p className="kkd-booking-schedule-title">近期可預約場次</p>
                  {displayedSchedules.map((s: any, i: number) => {
                    const startAt = s.startAt || s.start_at;
                    const capacity = Number(s.capacity || 0);
                    const bookedCount = Number(s.bookedCount ?? s.booked_count ?? 0);
                    const status = s.status || (bookedCount >= capacity ? 'full' : 'open');
                    const d = new Date(startAt);
                    const label = `${d.getMonth() + 1}/${d.getDate()}（${['日','一','二','三','四','五','六'][d.getDay()]}）`;
                    const remaining = capacity - bookedCount;
                    return (
                      <div key={s.id || i} className="kkd-booking-schedule-row">
                        <span>{label}</span>
                        {status === 'full' ? (
                          <span className="kkd-full-label">已額滿</span>
                        ) : (
                          <span className="kkd-avail-label">剩 {remaining} 位</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {hidePublicBookingCta ? (
                <span
                  className="tp-btn"
                  data-testid="begin-checkout-unavailable"
                  aria-disabled="true"
                  style={{
                    width: '100%',
                    display: 'block',
                    textAlign: 'center',
                    padding: '14px 0',
                    fontSize: 16,
                    marginTop: 16,
                    background: '#e5e7eb',
                    color: '#6b7280',
                    cursor: 'not-allowed',
                  }}
                >
                  目前無可預約方案
                </span>
              ) : (
                <Link
                  href={directBookingHref}
                  className="tp-btn tp-btn-primary"
                  data-testid="begin-checkout-btn"
                  style={{ width: '100%', display: 'block', textAlign: 'center', padding: '14px 0', fontSize: 16, marginTop: 16 }}
                >
                  立即預約
                </Link>
              )}
              <button className="tp-btn tp-btn-ghost" style={{ width: '100%', marginTop: 8 }}>
                ✉️ 詢問導遊
              </button>

              <div className="kkd-booking-trust">
                <p>🔒 安全付款（ECPay 信用卡）</p>
                <p>📋 依取消時間適用退款：7天以上全額退款、3-7天退70%、72小時內不退款，<a href="/legal/refund" style={{ color: 'inherit', textDecoration: 'underline' }}>詳見退款政策</a></p>
                <p>📞 緊急熱線 30 分鐘回應</p>
                <p>✅ 實名認證導遊</p>
              </div>
            </div>
          </aside>

        </div>
      </div>

      {/* ── #1382 推薦（同地區/同類型）＋最近瀏覽 — client-side、不阻塞 LCP ── */}
      <ActivityRecommendations
        current={{
          slug: activity.slug,
          title: activity.title,
          region: activity.region,
          regionSlug: (activity as { regionSlug?: string }).regionSlug,
          category: (activity as { category?: string }).category,
          priceTwd: activity.priceTwd,
          coverImageUrl: activity.coverImageUrl ?? null,
        }}
      />

      {/* ── Mobile bottom bar ── */}
      <ActivityBottomBar
        activitySlug={activity.slug}
        activityId={activity.id}
        priceLabel={`NT$${activity.priceTwd?.toLocaleString()} / 人`}
        price={activity.priceTwd || 0}
        useBookingV2={useBookingV2}
        directBookingHref={directBookingHref}
        bookingUnavailable={hidePublicBookingCta}
      />
    </main>
    </SelectedPlanProvider>
  );
}
