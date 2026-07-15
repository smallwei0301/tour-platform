import type { MetadataRoute } from 'next';

import { getActivitySitemapEntries } from '../src/lib/sitemap-activities.mjs';
import { listPublishedGuidesDb } from '../src/lib/db.mjs';
import { localizedSitemapUrls } from '../src/lib/seo-alternates.ts';

const BLOG_SLUGS = ['why-private-guide', 'chaishan-cave-guide'];

// Experience detail pages — public-facing, not covered by /theme/* collection pages.
const EXPERIENCE_SLUGS = ['kaohsiung-chaishan-cave-experience', 'dadadaocheng-walk'];

// Sitemap reads the published-activity catalog; revalidate hourly so crawlers
// don't trigger a DB read on every request.
export const revalidate = 3600;

type SitemapMetadata = Omit<MetadataRoute.Sitemap[number], 'url' | 'alternates'>;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://tour-platform-nine.vercel.app';
  const now = new Date();

  // Every public localized URL is explicitly listed for both visible locales.
  // Each URL retains the full reciprocal hreflang map, including x-default.
  const localized = (path: string, metadata: SitemapMetadata) =>
    localizedSitemapUrls(path, baseUrl).map((entry) => ({ ...entry, ...metadata }));

  return [
    ...localized('/', { lastModified: now, changeFrequency: 'weekly', priority: 1 }),
    // 經典行銷首頁（原 `/`，#1713 起 `/` 改為 3D 世界頁）
    ...localized('/home', { lastModified: now, changeFrequency: 'weekly', priority: 0.8 }),
    ...localized('/activities', { lastModified: now, changeFrequency: 'daily', priority: 0.9 }),
    ...localized('/guides', { lastModified: now, changeFrequency: 'weekly', priority: 0.7 }),
    ...localized('/blog', { lastModified: now, changeFrequency: 'weekly', priority: 0.6 }),
    ...BLOG_SLUGS.flatMap((slug) => localized(`/blog/${slug}`, {
      lastModified: now, changeFrequency: 'monthly', priority: 0.6,
    })),
    ...localized('/theme/cave-exploration', { lastModified: now, changeFrequency: 'monthly', priority: 0.6 }),
    ...localized('/theme/river-trekking', { lastModified: now, changeFrequency: 'monthly', priority: 0.6 }),
    ...localized('/theme/culture-history', { lastModified: now, changeFrequency: 'monthly', priority: 0.6 }),
    ...localized('/theme/ecology', { lastModified: now, changeFrequency: 'monthly', priority: 0.6 }),
    ...localized('/theme/mountain-wilderness', { lastModified: now, changeFrequency: 'monthly', priority: 0.6 }),
    ...EXPERIENCE_SLUGS.flatMap((slug) => localized(`/experiences/${slug}`, {
      lastModified: now, changeFrequency: 'monthly', priority: 0.6,
    })),
    ...localized('/why-choose-us', { lastModified: now, changeFrequency: 'monthly', priority: 0.5 }),
    ...localized('/about', { lastModified: now, changeFrequency: 'monthly', priority: 0.5 }),
    // These routes live outside app/[locale] and must not claim English equivalents.
    { url: `${baseUrl}/guide/apply`, lastModified: now, changeFrequency: 'monthly', priority: 0.4 },
    { url: `${baseUrl}/for-guides`, lastModified: now, changeFrequency: 'monthly', priority: 0.5 },
    ...localized('/contact', { lastModified: now, changeFrequency: 'monthly', priority: 0.4 }),
    ...localized('/faq', { lastModified: now, changeFrequency: 'monthly', priority: 0.5 }),
    ...localized('/legal/privacy', { lastModified: now, changeFrequency: 'monthly', priority: 0.3 }),
    ...localized('/legal/terms', { lastModified: now, changeFrequency: 'monthly', priority: 0.3 }),
    ...localized('/legal/refund', { lastModified: now, changeFrequency: 'monthly', priority: 0.3 }),
    ...(await getActivitySitemapEntries({ baseUrl, now })).flatMap(
      (entry: MetadataRoute.Sitemap[number]) => {
        const { url, alternates: _alternates, ...metadata } = entry;
        return localized(url.slice(baseUrl.length) || '/', metadata);
      },
    ),
    ...(await listPublishedGuidesDb().then((guides) =>
      (guides || [])
        .filter((guide: { slug?: string }) => guide.slug)
        .flatMap((guide: { slug: string }) => localized(`/guides/${encodeURIComponent(guide.slug)}`, {
          lastModified: now, changeFrequency: 'monthly', priority: 0.7,
        })),
    ).catch(() => [])),
  ];
}
