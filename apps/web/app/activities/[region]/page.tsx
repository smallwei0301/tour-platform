import { Suspense } from 'react';
import { notFound, redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { getActivityBySlugDb, buildCanonicalActivityDetailPath } from '../../../src/lib/db.mjs';
import { getRegionBySlug, isKnownRegionSlug } from '../../../src/lib/region-slugs.mjs';
import ActivitiesContent from '../ActivitiesContent';

export const dynamic = 'force-dynamic';
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

export default async function ActivitiesRegionPage({ params }: { params: Promise<{ region: string }> }) {
  const { region } = await params;

  if (isKnownRegionSlug(region)) {
    const entry = getRegionBySlug(region)!;
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://tour-platform-nine.vercel.app';
    const regionBreadcrumbLd = {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: '首頁', item: baseUrl },
        { '@type': 'ListItem', position: 2, name: '探索行程', item: `${baseUrl}/activities` },
        { '@type': 'ListItem', position: 3, name: entry.displayName, item: `${baseUrl}/activities/${region}` },
      ],
    };
    return (
      <>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(regionBreadcrumbLd) }} />
        <Suspense fallback={null}>
          <ActivitiesContent initialRegion={entry.dbValue} />
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
