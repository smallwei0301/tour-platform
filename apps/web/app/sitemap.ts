import type { MetadataRoute } from 'next';
import { getActivitySitemapEntries } from '../src/lib/sitemap-activities.mjs';
import { listPublishedGuidesDb } from '../src/lib/db.mjs';

const BLOG_SLUGS = [
  'why-private-guide',
  'chaishan-cave-guide',
];

// Experience detail pages — public-facing, not covered by /theme/* collection pages.
// Slugs sourced from store.mjs; add new slugs here when new experiences launch.
const EXPERIENCE_SLUGS = [
  'kaohsiung-chaishan-cave-experience',
  'dadadaocheng-walk',
];

// Sitemap reads the published-activity catalog; revalidate hourly so crawlers
// don't trigger a DB read on every request.
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://tour-platform-nine.vercel.app';
  const now = new Date();
  return [
    { url: baseUrl, lastModified: now, changeFrequency: 'weekly', priority: 1 },
    { url: `${baseUrl}/activities`, lastModified: now, changeFrequency: 'daily', priority: 0.9 },
    { url: `${baseUrl}/guides`, lastModified: now, changeFrequency: 'weekly', priority: 0.7 },
    { url: `${baseUrl}/blog`, lastModified: now, changeFrequency: 'weekly', priority: 0.6 },
    ...BLOG_SLUGS.map((slug) => ({
      url: `${baseUrl}/blog/${slug}`,
      lastModified: now,
      changeFrequency: 'monthly' as const,
      priority: 0.6,
    })),
    { url: `${baseUrl}/theme/cave-exploration`, lastModified: now, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${baseUrl}/theme/river-trekking`, lastModified: now, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${baseUrl}/theme/culture-history`, lastModified: now, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${baseUrl}/theme/ecology`, lastModified: now, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${baseUrl}/theme/mountain-wilderness`, lastModified: now, changeFrequency: 'monthly', priority: 0.6 },
    ...EXPERIENCE_SLUGS.map((slug) => ({
      url: `${baseUrl}/experiences/${slug}`,
      lastModified: now,
      changeFrequency: 'monthly' as const,
      priority: 0.6,
    })),
    { url: `${baseUrl}/why-choose-us`, lastModified: now, changeFrequency: 'monthly', priority: 0.5 },
    { url: `${baseUrl}/about`, lastModified: now, changeFrequency: 'monthly', priority: 0.5 },
    { url: `${baseUrl}/guide/apply`, lastModified: now, changeFrequency: 'monthly', priority: 0.4 },
    { url: `${baseUrl}/contact`, lastModified: now, changeFrequency: 'monthly', priority: 0.4 },
    { url: `${baseUrl}/faq`, lastModified: now, changeFrequency: 'monthly', priority: 0.5 },
    { url: `${baseUrl}/legal/privacy`, lastModified: now, changeFrequency: 'monthly', priority: 0.3 },
    { url: `${baseUrl}/legal/terms`, lastModified: now, changeFrequency: 'monthly', priority: 0.3 },
    { url: `${baseUrl}/legal/refund`, lastModified: now, changeFrequency: 'monthly', priority: 0.3 },
    ...(await getActivitySitemapEntries({ baseUrl, now })),
    // Guide profile pages — dynamic from DB, same revalidation as activities.
    ...(await listPublishedGuidesDb().then(guides =>
      (guides || [])
        .filter((g: { slug?: string }) => g.slug)
        .map((g: { slug: string }) => ({
          url: `${baseUrl}/guides/${encodeURIComponent(g.slug)}`,
          lastModified: now,
          changeFrequency: 'monthly' as const,
          priority: 0.7,
        }))
    ).catch(() => [])),
  ];
}
