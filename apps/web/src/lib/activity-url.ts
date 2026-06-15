// 地區→slug 正規化的單一真相來源在 `region-slug.mjs`，避免多份對照表 drift
// 導致 revalidate 路徑與實際快取路徑對不上（#1440）。
import { normalizeRegionForActivityPath } from './region-slug.mjs';

export function normalizeRegionSlug(region?: string, regionSlug?: string): string {
  if (regionSlug && regionSlug.trim()) return regionSlug.trim();
  return normalizeRegionForActivityPath(region);
}

export function buildActivityHref(params: { slug?: string; region?: string; regionSlug?: string }): string {
  const slug = params.slug?.trim();
  if (!slug) return '/activities';

  const region = normalizeRegionSlug(params.region, params.regionSlug);
  return `/activities/${encodeURIComponent(region)}/${encodeURIComponent(slug)}`;
}
