import type { MetadataRoute } from 'next';
import { getActivitySitemapEntries } from '../src/lib/sitemap-activities.mjs';
import { listPublishedGuidesDb } from '../src/lib/db.mjs';
import { sitemapLanguageAlternates } from '../src/lib/seo-alternates.ts';

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

  // 健檢 v2 SEO-3：公開 localized 頁面帶 hreflang languages 變體
  // （/guide/apply 屬 guide realm、不在 [locale] 下，不帶 alternates）。
  const localized = (path: string) => ({
    url: path === '/' ? baseUrl : `${baseUrl}${path}`,
    alternates: sitemapLanguageAlternates(path, baseUrl),
  });

  return [
    { ...localized('/'), lastModified: now, changeFrequency: 'weekly', priority: 1 },
    { ...localized('/activities'), lastModified: now, changeFrequency: 'daily', priority: 0.9 },
    { ...localized('/guides'), lastModified: now, changeFrequency: 'weekly', priority: 0.7 },
    { ...localized('/blog'), lastModified: now, changeFrequency: 'weekly', priority: 0.6 },
    ...BLOG_SLUGS.map((slug) => ({
      ...localized(`/blog/${slug}`),
      lastModified: now,
      changeFrequency: 'monthly' as const,
      priority: 0.6,
    })),
    { ...localized('/theme/cave-exploration'), lastModified: now, changeFrequency: 'monthly', priority: 0.6 },
    { ...localized('/theme/river-trekking'), lastModified: now, changeFrequency: 'monthly', priority: 0.6 },
    { ...localized('/theme/culture-history'), lastModified: now, changeFrequency: 'monthly', priority: 0.6 },
    { ...localized('/theme/ecology'), lastModified: now, changeFrequency: 'monthly', priority: 0.6 },
    { ...localized('/theme/mountain-wilderness'), lastModified: now, changeFrequency: 'monthly', priority: 0.6 },
    ...EXPERIENCE_SLUGS.map((slug) => ({
      ...localized(`/experiences/${slug}`),
      lastModified: now,
      changeFrequency: 'monthly' as const,
      priority: 0.6,
    })),
    { ...localized('/why-choose-us'), lastModified: now, changeFrequency: 'monthly', priority: 0.5 },
    { ...localized('/about'), lastModified: now, changeFrequency: 'monthly', priority: 0.5 },
    { url: `${baseUrl}/guide/apply`, lastModified: now, changeFrequency: 'monthly', priority: 0.4 },
    { url: `${baseUrl}/for-guides`, lastModified: now, changeFrequency: 'monthly', priority: 0.5 },
    { ...localized('/contact'), lastModified: now, changeFrequency: 'monthly', priority: 0.4 },
    { ...localized('/faq'), lastModified: now, changeFrequency: 'monthly', priority: 0.5 },
    { ...localized('/legal/privacy'), lastModified: now, changeFrequency: 'monthly', priority: 0.3 },
    { ...localized('/legal/terms'), lastModified: now, changeFrequency: 'monthly', priority: 0.3 },
    { ...localized('/legal/refund'), lastModified: now, changeFrequency: 'monthly', priority: 0.3 },
    ...(await getActivitySitemapEntries({ baseUrl, now })).map(
      (entry: { url: string } & Record<string, unknown>) => ({
        ...entry,
        alternates: sitemapLanguageAlternates(entry.url.slice(baseUrl.length) || '/', baseUrl),
      })
    ),
    // Guide profile pages — dynamic from DB, same revalidation as activities.
    ...(await listPublishedGuidesDb().then(guides =>
      (guides || [])
        .filter((g: { slug?: string }) => g.slug)
        .map((g: { slug: string }) => ({
          ...localized(`/guides/${encodeURIComponent(g.slug)}`),
          lastModified: now,
          changeFrequency: 'monthly' as const,
          priority: 0.7,
        }))
    ).catch(() => [])),
  ];
}
