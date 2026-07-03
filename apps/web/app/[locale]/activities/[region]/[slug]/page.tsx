import Image from 'next/image';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { getActivityBySlugDb } from '../../../../../src/lib/db.mjs';
import { resolveActivityReviewStats } from '../../../../../src/lib/activity-review-stats.mjs';
import { normalizeAdditionalRegions } from '../../../../../src/lib/activity-regions.mjs';
import { normalizeRegionForActivityPath } from '../../../../../src/lib/region-slug.mjs';
import { normalizeSocialProofQuotes, resolveSocialProofAuthor } from '../../../../../src/lib/social-proof-quotes.mjs';
import {
  buildActivityProductJsonLd,
  resolveActivityOgImage,
  serialiseJsonLd,
} from '../../../../../src/lib/activity-jsonld.mjs';
import { DatePlanSection } from '../../../../../src/components/activity/DatePlanSection';
import { PlanItinerarySection } from '../../../../../src/components/activity/PlanItinerarySection';
import { ActivityBottomBar } from '../../../../../src/components/activity/ActivityBottomBar';
import { SelectedPlanProvider } from '../../../../../src/components/activity/SelectedPlanContext';
import { SectionAnchorNav } from '../../../../../src/components/activity/SectionAnchorNav';
import { ImageCarousel } from '../../../../../src/components/activity/ImageCarousel';
import { ReviewPhotos } from '../../../../../src/components/activity/ReviewPhotos';
import { inferPlanIdForBookingUrl, resolveBookingEntryHref, resolvePlanBookingHref } from '../../../../../src/lib/booking-entry.mjs';
import { resolveDatePlanPresentation } from '../../../../../src/lib/date-plan-source.mjs';
import { resolveActivityPriceUnit } from '../../../../../src/lib/activity-price-unit.mjs';
import { ActivityQASection } from '../../../../../src/components/activity/ActivityQASection';
import { PublicPromoBanner } from '../../../../../src/components/activity/PublicPromoBanner';
import { ActivityRecommendations } from '../../../../../src/components/activity/ActivityRecommendations';
import { PublicIcon } from '../../../../../src/components/ui/PublicIcon';
import { buildAlternates } from '../../../../../src/lib/seo-alternates.ts';

// Issue #502 背景：詳情頁曾因 force-static/unstable_cache + 關聯查詢在 cold path
// render lock（hang/500），緊急以 force-dynamic + withTimeout 止血。事故主因已移除
// （無關聯 embed、有 8s timeout、容錯 fallback），且即時庫存改由 client 端另抓，
// 故改回 ISR（revalidate=60）：HTML 由 CDN 邊緣供應，導航 TTFB ~1-2s → ~50ms。
// 內容平時最多 60s 更新；admin 編輯/刪除/上下架時以 revalidatePath 立即刷新
// （見 app/api/admin/activities/[id]/route.ts 與 .../status/route.ts）。
export const revalidate = 60;
// Next 15 預設 fetch 不快取 → 會把整條路由判為 dynamic、revalidate 失效。
// force-cache 讓 activity lookup 的 fetch 可被 ISR 快取（每 60s 或 on-demand 失效）。
// 比 #502 出事的 force-static 溫和：只快取 fetch、不強制整頁 static-at-build。
export const fetchCache = 'force-cache';
// 動態 segment 沒有 generateStaticParams 時，Next 預設走 dynamic、不會 ISR 快取。
// 回傳 []：build 階段「不預渲染任何頁」（避開 #502 build-time cold-path hang），
// 但開啟「on-demand ISR」——首次請求才生成並快取，之後由 CDN 邊緣供應。
export const dynamicParams = true;
export function generateStaticParams() {
  return [] as Array<{ region: string; slug: string }>;
}

const DEFAULT_ACTIVITY_LOOKUP_TIMEOUT_MS = 8_000;

function parseActivityLookupTimeout() {
  const rawTimeout = Number.parseInt(process.env.GH502_ACTIVITY_LOOKUP_TIMEOUT_MS ?? '', 10);
  return Number.isFinite(rawTimeout) && rawTimeout > 0 ? rawTimeout : DEFAULT_ACTIVITY_LOOKUP_TIMEOUT_MS;
}

const RENDER_ACTIVITY_TIMEOUT_MS = parseActivityLookupTimeout();

const REVIEW_STAR_MAX = 5;

// 旅客評價星等：固定顯示 5 顆星，達標的顯示品牌金色、未達標的顯示灰色，
// 讓 4 星評價也能呈現「4 金 + 1 灰」而非只畫 4 顆。
function StarRating({ value, ariaLabel }: { value?: number | null; ariaLabel: (filled: number, max: number) => string }) {
  const filled = Math.max(0, Math.min(REVIEW_STAR_MAX, Math.round(Number(value) || 0)));
  const empty = REVIEW_STAR_MAX - filled;
  return (
    <div className="kkd-stars" role="img" aria-label={ariaLabel(filled, REVIEW_STAR_MAX)}>
      {filled > 0 && <span className="kkd-stars-on">{'★'.repeat(filled)}</span>}
      {empty > 0 && <span className="kkd-stars-off">{'★'.repeat(empty)}</span>}
    </div>
  );
}

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
  { params }: { params: Promise<{ locale: string; region: string; slug: string }> }
): Promise<Metadata> {
  const { locale, region, slug } = await params;
  const t = await getTranslations({ locale, namespace: 'activityDetail' });
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

  const title = t('metaTitleSuffix', { title: activity?.title || humanTitle });
  const description = activity?.shortDescription
    || t('metaDescFallback');
  const ogImageUrl = resolveActivityOgImage(activity?.coverImageUrl);

  return {
    title,
    description,
    // 健檢 v2 SEO-1：canonical/hreflang
    alternates: buildAlternates(`/activities/${region}/${slug}`, locale),
    openGraph: {
      title,
      description,
      type: 'website',
      images: [{ url: ogImageUrl, width: 1200, height: 630, alt: activity?.title || t('ogImageAlt') }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [ogImageUrl],
    },
  };
}

export default async function ActivityDetailPage({ params }: { params: Promise<{ locale: string; region: string; slug: string }> }) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'activityDetail' });

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
    regions?: string[];
  };
  // 附加地區（複選）：正規化、去重、排除主要地區後顯示。行程同時涵蓋這些縣市，
  // 旅客以任一地區搜尋都會看到此行程（篩選邏輯見 listPublishedActivitiesDb）。
  const additionalRegions = normalizeAdditionalRegions(activityData.regions, activityData.region);
  const guide = activity.guide;
  const actReviews = activity.reviews || [];
  // 評價統計（真實評論 + 社群口碑語錄）—— 與首頁精選卡共用同一實作（單一真實來源）
  const reviewStats = resolveActivityReviewStats(activityData);
  // 社群口碑語錄正規化為 { author, rating, text }（相容舊純文字資料）
  const warmQuotes = normalizeSocialProofQuotes(activityData.socialProofQuotes);
  const displayedSchedules = activity.schedules || [];
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
      })
    : resolveBookingEntryHref({ activitySlug: activity.slug });

  const imageUrls: string[] = activity.imageUrls?.length ? activity.imageUrls : (activity.coverImageUrl ? [activity.coverImageUrl] : []);
  const originalPrice = Math.round(activity.priceTwd * 1.25);
  const formalPlans = Array.isArray((activity as { plans?: unknown[] }).plans) ? ((activity as { plans?: any[] }).plans || []) : [];
  const datePlanPresentation = resolveDatePlanPresentation({
    canonicalPlans: formalPlans,
  });
  const hidePublicBookingCta = datePlanPresentation.showMissingCanonicalMessage;
  // 活動層級起價單位跟著方案計價方式走：所有方案皆為「每團報價」時顯示每團單位，
  // 否則維持每人（避免每團方案在 hero／側欄／底部 CTA 仍誤標「/ 人」）。
  const activityPriceUnit = resolveActivityPriceUnit(formalPlans);
  const isGroupPriced = activityPriceUnit === 'per_group';
  // #297 人數限制以「方案」為唯一真實來源（活動層級輸入已移除）。前台摘要改由方案推導：
  // 各方案範圍一致 → 顯示該範圍；不一致 → 「最少人數依方案而定」；無方案 → 退回活動既有值。
  const planParticipantRanges = formalPlans
    .map((plan) => ({
      min: Number(plan?.minParticipants ?? plan?.min_participants),
      max: Number(plan?.maxParticipants ?? plan?.max_participants),
    }))
    .filter((r) => Number.isFinite(r.min) && Number.isFinite(r.max));
  let participantSummaryLabel: string;
  if (planParticipantRanges.length > 0) {
    const mins = planParticipantRanges.map((r) => r.min);
    const maxs = planParticipantRanges.map((r) => r.max);
    const uniform = mins.every((m) => m === mins[0]) && maxs.every((m) => m === maxs[0]);
    participantSummaryLabel = uniform ? t('participants', { min: mins[0], max: maxs[0] }) : t('participantsVaries');
  } else {
    participantSummaryLabel = t('participants', { min: activity.minParticipants, max: activity.maxParticipants });
  }

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
              { "@type": "ListItem", "position": 1, "name": t('breadcrumbHome'), "item": `${process.env.NEXT_PUBLIC_APP_URL ?? 'https://tour-platform-nine.vercel.app'}` },
              { "@type": "ListItem", "position": 2, "name": t('breadcrumbActivities'), "item": `${process.env.NEXT_PUBLIC_APP_URL ?? 'https://tour-platform-nine.vercel.app'}/activities` },
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
            "priceRange": t('jsonLdPriceRange', { price: activity.priceTwd }),
            "address": {
              "@type": "PostalAddress",
              "addressRegion": activity.region,
              "addressCountry": "TW"
            },
            // 行程涵蓋的所有地區（主要 + 附加），讓搜尋引擎理解多地區服務範圍。
            ...(additionalRegions.length > 0 ? {
              "areaServed": [activity.region, ...additionalRegions]
                .filter(Boolean)
                .map((r) => ({ "@type": "AdministrativeArea", "name": r })),
            } : {}),
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
          <Link href="/">{t('breadcrumbHome')}</Link> &gt;{' '}
          <Link href="/activities">{t('breadcrumbActivities')}</Link> &gt;{' '}
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
                <>★ {reviewStats.score.toFixed(1)}<span className="kkd-review-count">{t('reviewCountInline', { count: reviewStats.count })}</span></>
              ) : (
                <span style={{ color: 'var(--tp-muted)', fontSize: 13 }}>{t('noRating')}</span>
              )}
            </span>
            <span className="kkd-dot">·</span>
            <span className="kkd-location">📍 {activity.region}</span>
            {additionalRegions.length > 0 && (
              <span className="kkd-location" data-testid="activity-additional-regions" style={{ color: 'var(--tp-muted)' }}>
                ＋
                {additionalRegions.map((r, i) => (
                  <span key={r}>
                    {i > 0 && '、'}
                    <Link href={`/activities/${normalizeRegionForActivityPath(r)}`} style={{ color: 'inherit', textDecoration: 'underline' }}>
                      {r}
                    </Link>
                  </span>
                ))}
              </span>
            )}
          </div>

          <div className="kkd-price-row">
            <span className="kkd-orig-price">NT${originalPrice.toLocaleString()}</span>
            <strong className="kkd-price">NT${activity.priceTwd.toLocaleString()}</strong>
            <span className="kkd-price-unit">{isGroupPriced ? t('priceUnitGroup') : t('priceUnit')}</span>
          </div>

          {/* Policy + activity info row */}
          <div className="kkd-policy-row">
            <span className="kkd-policy-item">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
              {t('policyCertifiedGuide')}
            </span>
            <span className="kkd-policy-item">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              {activity.durationDisplay}
            </span>
            <span className="kkd-policy-item">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="5" r="2"/><path d="M12 7v8"/><path d="M9 10h6"/><path d="M9 19l3-4 3 4"/></svg>
              {(activity as {transportMode?: string}).transportMode || t('transportWalk')}
            </span>
            <span className="kkd-policy-item">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
              {participantSummaryLabel}
            </span>
            <span className="kkd-policy-divider" />
            <span className="kkd-policy-item">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
              {t('policyConfirm')}
            </span>
            <span className="kkd-policy-item">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="5" y="2" width="14" height="20" rx="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>
              {t('policyEvoucher')}
            </span>
            <span className="kkd-policy-item">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
              {t('policySecurePay')}
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
            { id: 'section-plan', label: t('anchorPlan') },
            { id: 'section-itinerary', label: t('anchorItinerary') },
            { id: 'section-reviews', label: t('anchorReviews') },
            { id: 'section-details', label: t('anchorDetails') },
            { id: 'section-policy', label: t('anchorPolicy') },
            { id: 'section-qa', label: t('anchorQa') },
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
              <h2 className="kkd-section-title"><PublicIcon name="calendar" size={18} /> {t('sectionSelectPlan')}</h2>
              <DatePlanSection activity={activity} schedules={displayedSchedules} />
            </section>

            {/* SECTION 1.5: 詳細行程 — #297 依所選方案顯示該方案後台「行程介紹」站點時間表。
                方案為唯一來源；活動層級 itinerary 備援已移除（#admin-plan-revert 後續）。 */}
            <PlanItinerarySection
              plans={datePlanPresentation.plans as Array<{ id: string; label?: string; planItinerary?: Array<{ icon?: string; title?: string; duration?: string; description?: string; imageUrl?: string; text?: string }> }>}
            />


            {/* SECTION 2: 旅客評價 */}
            <section id="section-reviews" className="kkd-scroll-section">
              <h2 className="kkd-section-title"><PublicIcon name="star" size={18} /> {t('sectionReviews')}</h2>
              <div className="kkd-reviews-summary">
                <span className="kkd-reviews-score"><PublicIcon name="star" size={20} /> {reviewStats.score.toFixed(1)}</span>
                <span className="kkd-reviews-total">{t('reviewsTotal', { count: reviewStats.count })}</span>
              </div>

              <div
                className="kkd-review-list"
                role="region"
                aria-label={t('sectionReviews')}
                tabIndex={0}
              >
                {/* 真實旅客評論（已核准）與後台社群口碑語錄整合呈現，使用相同卡片樣式；
                    容器為橫向 scroll-snap 卷軸，旅客可左右滑動瀏覽評價 */}
                {actReviews.map((r: any) => (
                  <div key={r.id} className="kkd-review-card">
                    <div className="kkd-review-header">
                      <strong className="kkd-reviewer">{t('reviewAuthor', { author: r.author, city: r.city || t('reviewCityFallback') })}</strong>
                      <span className="kkd-review-date">{r.date || new Date().toLocaleDateString(locale === 'en' ? 'en-US' : 'zh-TW')}</span>
                    </div>
                    {r.rating && <StarRating value={r.rating} ariaLabel={(filled, max) => t('starAria', { filled, max })} />}
                    <p className="kkd-review-text">{r.text}</p>
                    {Array.isArray(r.photos) && r.photos.length > 0 && (
                      <ReviewPhotos photos={r.photos} authorLabel={r.author} />
                    )}
                  </div>
                ))}
                {warmQuotes.map((q, i) => (
                  <div key={`warm-${i}`} className="kkd-review-card">
                    <div className="kkd-review-header">
                      <strong className="kkd-reviewer">{resolveSocialProofAuthor(q.author)}</strong>
                    </div>
                    <StarRating value={q.rating} ariaLabel={(filled, max) => t('starAria', { filled, max })} />
                    <p className="kkd-review-text">{q.text}</p>
                    {Array.isArray(q.photos) && q.photos.length > 0 && (
                      <ReviewPhotos photos={q.photos} authorLabel={resolveSocialProofAuthor(q.author)} />
                    )}
                  </div>
                ))}
              </div>
            </section>

            {/* SECTION 3: 商品說明 */}
            <section id="section-details" className="kkd-scroll-section">
              <h2 className="kkd-section-title"><PublicIcon name="document" size={18} /> {t('sectionDetails')}</h2>

              {activity.inclusions && activity.inclusions.length > 0 && (
                <div className="kkd-detail-block">
                  <h3 className="kkd-detail-subtitle">{t('detailIncludes')}</h3>
                  <ul className="kkd-checklist">
                    {activity.inclusions.map((item: string, i: number) => (
                      <li key={i}><span className="kkd-check"><PublicIcon name="checkCircle" size={16} /></span>{item}</li>
                    ))}
                  </ul>
                </div>
              )}

              {activity.exclusions && activity.exclusions.length > 0 && (
                <div className="kkd-detail-block">
                  <h3 className="kkd-detail-subtitle">{t('detailExcludes')}</h3>
                  <ul className="kkd-checklist">
                    {activity.exclusions.map((item: string, i: number) => (
                      <li key={i}><span className="kkd-check"><PublicIcon name="xCircle" size={16} /></span>{item}</li>
                    ))}
                  </ul>
                </div>
              )}

              {activityData.goodFor && activityData.goodFor.length > 0 && (
                <div className="kkd-detail-block">
                  <h3 className="kkd-detail-subtitle">{t('detailGoodFor')}</h3>
                  <ul className="kkd-checklist">
                    {activityData.goodFor.map((item: string, i: number) => (
                      <li key={i}><span className="kkd-check"><PublicIcon name="thumbsUp" size={16} /></span>{item}</li>
                    ))}
                  </ul>
                </div>
              )}

              {activity.description && (
                <div className="kkd-detail-block">
                  <h3 className="kkd-detail-subtitle">{t('detailDescription')}</h3>
                  <p style={{ lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{activity.description}</p>
                </div>
              )}
            </section>

            {/* SECTION 4: 購買須知 */}
            <section id="section-policy" className="kkd-scroll-section">
              <h2 className="kkd-section-title"><PublicIcon name="pin" size={18} /> {t('sectionPolicy')}</h2>

              {activity.notices && activity.notices.length > 0 && (
                <div className="kkd-detail-block">
                  <h3 className="kkd-detail-subtitle">{t('policyNotices')}</h3>
                  <ul className="kkd-notice-list">
                    {activity.notices.map((n: string, i: number) => (
                      <li key={i}>{n}</li>
                    ))}
                  </ul>
                </div>
              )}

              {activity.refundRules && activity.refundRules.length > 0 && (
                <div className="kkd-detail-block">
                  <h3 className="kkd-detail-subtitle">{t('policyRefund')}</h3>
                  <ul className="kkd-notice-list">
                    {activity.refundRules.map((r: string, i: number) => (
                      <li key={i}>{r}</li>
                    ))}
                  </ul>
                </div>
              )}

              {activity.safetyNotice && (
                <div className="kkd-detail-block">
                  <h3 className="kkd-detail-subtitle">{t('policySafety')}</h3>
                  <p className="kkd-notice-text">{activity.safetyNotice}</p>
                </div>
              )}
            </section>

            {/* 導遊介紹 */}
            {guide && (
              <section className="kkd-scroll-section">
                <h2 className="kkd-section-title"><span style={{ color: 'var(--tp-brass)', display: 'inline-flex' }}><PublicIcon name="badgeCheck" size={18} /></span> {t('sectionGuide')}</h2>
                <div className="kkd-guide-card">
                  <Image
                    src={guide.profilePhotoUrl || (guide as {avatarUrl?: string}).avatarUrl || 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=200&q=80'}
                    alt={guide.displayName}
                    loading="lazy"
                    sizes="72px"
                    className="kkd-guide-avatar" width={72} height={72} />
                  <div className="kkd-guide-info">
                    <strong className="kkd-guide-name">{guide.displayName}</strong>
                    <span className="kkd-guide-verified"><PublicIcon name="badgeCheck" size={15} /> {t('guideVerified')}</span>
                    <p className="kkd-guide-meta">
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><PublicIcon name="star" size={14} /> {guide.ratingAvg?.toFixed(1) || '5.0'}</span>{t('guideServices', { count: guide.reviewCount || (guide as {serviceCount?: number}).serviceCount || 0 })}&nbsp;·&nbsp;
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><PublicIcon name="pin" size={14} /> {guide.region}</span>
                      {guide.languages && guide.languages.length > 0 && (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>&nbsp;·&nbsp;<PublicIcon name="globe" size={14} /> {guide.languages.slice(0, 3).join('、')}</span>
                      )}
                    </p>
                    {(guide.headline || guide.bio) && (
                      <p className="kkd-guide-headline">「{guide.headline || guide.bio}」</p>
                    )}
                    <Link href={`/guides/${guide.slug}`} className="kkd-link-sm">
                      {t('guideViewProfile')}
                    </Link>
                  </div>
                </div>
              </section>
            )}

            {/* FAQ */}
            {activity.faq && activity.faq.length > 0 && (
              <section className="kkd-scroll-section">
                <h2 className="kkd-section-title">❓ {t('sectionFaq')}</h2>
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
                  NT${activity.priceTwd.toLocaleString()} <span style={{ fontSize: 14, fontWeight: 400 }}>{isGroupPriced ? t('priceUnitGroup') : t('priceUnit')}</span>
                </strong>
              </div>

              {displayedSchedules.length > 0 && (
                <div className="kkd-booking-schedules">
                  <p className="kkd-booking-schedule-title">{t('scheduleTitle')}</p>
                  {displayedSchedules.map((s: any, i: number) => {
                    const startAt = s.startAt || s.start_at;
                    const capacity = Number(s.capacity || 0);
                    const bookedCount = Number(s.bookedCount ?? s.booked_count ?? 0);
                    const status = s.status || (bookedCount >= capacity ? 'full' : 'open');
                    const d = new Date(startAt);
                    const weekdays = t.raw('weekdays') as string[];
                    const label = t('scheduleDate', { month: d.getMonth() + 1, day: d.getDate(), weekday: weekdays[d.getDay()] });
                    const remaining = capacity - bookedCount;
                    return (
                      <div key={s.id || i} className="kkd-booking-schedule-row">
                        <span>{label}</span>
                        {status === 'full' ? (
                          <span className="kkd-full-label">{t('scheduleFull')}</span>
                        ) : (
                          <span className="kkd-avail-label">{t('scheduleRemaining', { count: remaining })}</span>
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
                  {t('bookingUnavailable')}
                </span>
              ) : (
                <Link
                  href={directBookingHref}
                  className="tp-btn tp-btn-primary"
                  data-testid="begin-checkout-btn"
                  style={{ width: '100%', display: 'block', textAlign: 'center', padding: '14px 0', fontSize: 16, marginTop: 16 }}
                >
                  {t('bookNow')}
                </Link>
              )}
              <a href="#section-qa" className="tp-btn tp-btn-ghost" style={{ width: '100%', display: 'block', textAlign: 'center', marginTop: 8 }}>
                {t('askGuide')}
              </a>

              <div className="kkd-booking-trust">
                <p>{t('trustPay')}</p>
                <p>{t('trustRefundPrefix')}<a href="/legal/refund" style={{ color: 'inherit', textDecoration: 'underline' }}>{t('trustRefundLink')}</a></p>
                <p>{t('trustHotline')}</p>
                <p>{t('trustVerified')}</p>
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
        priceLabel={t(isGroupPriced ? 'priceLabelBottomGroup' : 'priceLabelBottom', { price: activity.priceTwd?.toLocaleString() ?? '0' })}
        price={activity.priceTwd || 0}
        directBookingHref={directBookingHref}
        bookingUnavailable={hidePublicBookingCta}
      />
    </main>
    </SelectedPlanProvider>
  );
}
