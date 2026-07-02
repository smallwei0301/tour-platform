import { Suspense } from 'react';
import { notFound, redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { getActivityBySlugDb, buildCanonicalActivityDetailPath, listPublishedActivitiesDb } from '../../../../src/lib/db.mjs';
import { getRegionBySlug, isKnownRegionSlug } from '../../../../src/lib/region-slugs.mjs';
import ActivitiesContent from '../ActivitiesContent';
import ActivitiesSkeleton from '../ActivitiesSkeleton';
import ActivitiesFirstPaint from '../ActivitiesFirstPaint';
import { resolveCoverSrc, buildCardImageSrcSet, CARD_IMAGE_SIZES } from '../cover-image';

// Same posture as the parent /activities listing (PR #1252): let Vercel's
// edge cache absorb anonymous region-page traffic for 60s. `revalidate`
// alone is enough — the previous `dynamic = 'force-dynamic'` was canceling
// it, which made every render a cold Supabase round-trip even though the
// underlying data is the same for all anonymous visitors.
export const revalidate = 60;

type Props = { params: Promise<{ region: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { region } = await params;
  const entry = getRegionBySlug(region);
  const regionName = entry?.displayName ?? region;
  const title = `${regionName} 在地行程導覽 | Midao 祕島`;
  const description = `探索${regionName}最道地的秘境行程，由在地導遊帶你體驗不一樣的${regionName}。`;
  return {
    title,
    description,
    openGraph: {
      title,
      description,
      images: [{ url: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=1200&h=630&fit=crop' }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: ['https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=1200&h=630&fit=crop'],
    },
  };
}

const DEFAULT_ACTIVITY_LOOKUP_TIMEOUT_MS = 8_000;

function parseActivityLookupTimeout() {
  const rawTimeout = Number.parseInt(process.env.GH502_ACTIVITY_LOOKUP_TIMEOUT_MS ?? '', 10);
  return Number.isFinite(rawTimeout) && rawTimeout > 0 ? rawTimeout : DEFAULT_ACTIVITY_LOOKUP_TIMEOUT_MS;
}

const COMPAT_ACTIVITY_TIMEOUT_MS = parseActivityLookupTimeout();

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

export default async function ActivitiesRegionPage({ params }: { params: Promise<{ locale: string; region: string }> }) {
  const { locale, region } = await params;

  if (isKnownRegionSlug(region)) {
    setRequestLocale(locale);
    const t = await getTranslations({ locale, namespace: 'activities' });
    const entry = getRegionBySlug(region)!;
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://tour-platform-nine.vercel.app';
    const regionBreadcrumbLd = {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: t('breadcrumbHome'), item: baseUrl },
        { '@type': 'ListItem', position: 2, name: t('breadcrumbActivities'), item: `${baseUrl}/activities` },
        { '@type': 'ListItem', position: 3, name: entry.displayName, item: `${baseUrl}/activities/${region}` },
      ],
    };
    // Server-side fetch the region-filtered list so the first paint has
    // cards. Mirrors PR #1252's /activities root SSR strategy. Fails soft
    // to undefined → ActivitiesContent falls back to its client fetch.
    const initialActivities = await listPublishedActivitiesDb({
      region: entry.dbValue,
      category: '',
      q: '',
    }).catch(() => undefined);

    // Issue #1344 — SSR preload 第一張卡 cover(同 /activities 根頁的
    // 理由:卡片是 client render,圖片下載鏈太長)。
    const firstCover = initialActivities?.[0] ? resolveCoverSrc(initialActivities[0].coverImageUrl) : null;

    return (
      <>
        {firstCover && (
          <link
            rel="preload"
            as="image"
            imageSrcSet={buildCardImageSrcSet(firstCover)}
            imageSizes={CARD_IMAGE_SIZES}
            fetchPriority="high"
          />
        )}
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(regionBreadcrumbLd) }} />
        {/* Issue #1344 — 同根頁 /activities：fallback 用 SSR 資料 render
            真卡片首屏（ActivitiesFirstPaint），LCP 圖片不再等 hydration；
            這裡的 initialActivities 已按地區過濾，首屏與 hydration 後
            內容一致。SSR 資料抓不到時退回 skeleton（#1345 同幾何）。 */}
        <Suspense
          fallback={
            initialActivities?.length
              ? <ActivitiesFirstPaint activities={initialActivities} locale={locale} />
              : <ActivitiesSkeleton />
          }
        >
          <ActivitiesContent initialRegion={entry.dbValue} initialActivities={initialActivities} />
        </Suspense>
      </>
    );
  }

  let activity: Awaited<ReturnType<typeof getActivityBySlugDb>>;
  try {
    activity = await withTimeout(
      getActivityBySlugDb(region),
      COMPAT_ACTIVITY_TIMEOUT_MS,
      'activity-detail-compat-redirect',
    );
  } catch {
    return notFound();
  }

  if (!activity) return notFound();

  redirect(buildCanonicalActivityDetailPath(activity));
}
