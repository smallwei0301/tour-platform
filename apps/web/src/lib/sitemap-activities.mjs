import { buildCanonicalActivityDetailPath, listPublishedActivitiesDb } from './db.mjs';

/**
 * Issue #829 — Build dynamic sitemap entries for public activity detail pages.
 *
 * Pure mapper: turns published-activity rows into MetadataRoute.Sitemap entries
 * pointing at /activities/{region}/{slug}. Reuses buildCanonicalActivityDetailPath
 * from db.mjs for region normalization, so private/checkout/admin routes can never
 * be produced here.
 *
 * @param {Array<object>} activities
 * @param {{ baseUrl: string, now: Date }} opts
 */
export function mapActivitiesToSitemapEntries(activities, { baseUrl, now }) {
  const byUrl = new Map();

  for (const activity of activities || []) {
    if (!activity || activity.status !== 'published') continue;

    const slug = typeof activity.slug === 'string' ? activity.slug.trim() : '';
    if (!slug) continue;

    const path = buildCanonicalActivityDetailPath(activity);
    // Guard: only emit real detail pages. A bare "/activities" means the slug
    // could not be resolved — skip it so we never produce a duplicate/non-detail URL.
    if (!path.startsWith('/activities/')) continue;

    const url = `${baseUrl}${path}`;
    const lastModified = activity.publishedAt || activity.updatedAt || now;

    byUrl.set(url, {
      url,
      lastModified,
      changeFrequency: 'daily',
      priority: 0.8,
    });
  }

  return [...byUrl.values()];
}

/**
 * Async wrapper: loads published activities and maps them to sitemap entries.
 * Fail-open — any load error returns [] so the static sitemap still renders.
 *
 * @param {{ baseUrl: string, now: Date, loadActivities?: () => Promise<Array<object>> }} opts
 */
export async function getActivitySitemapEntries({ baseUrl, now, loadActivities = listPublishedActivitiesDb }) {
  try {
    const activities = await loadActivities();
    return mapActivitiesToSitemapEntries(activities, { baseUrl, now });
  } catch {
    return [];
  }
}
