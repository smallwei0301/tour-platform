const REGION_SLUG_MAP: Record<string, string> = {
  '台北市': 'taipei',
  '台北': 'taipei',
  '新北市': 'new-taipei',
  '桃園市': 'taoyuan',
  '台中市': 'taichung',
  '台南市': 'tainan',
  '高雄市': 'kaohsiung',
  '高雄': 'kaohsiung',
  '花蓮縣': 'hualien',
  '花蓮': 'hualien',
};

export function normalizeRegionSlug(region?: string, regionSlug?: string): string {
  if (regionSlug && regionSlug.trim()) return regionSlug.trim();
  if (!region) return 'taiwan';

  const byMap = REGION_SLUG_MAP[region.trim()];
  if (byMap) return byMap;

  const asciiSlug = region
    .trim()
    .toLowerCase()
    .replace(/[^\w]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return asciiSlug || 'taiwan';
}

export function buildActivityHref(params: { slug?: string; region?: string; regionSlug?: string }): string {
  const slug = params.slug?.trim();
  if (!slug) return '/activities';

  // HOTFIX (2026-04-13): production dynamic detail routes /activities/[region]/[slug]
  // intermittently timeout. Temporarily route all "查看行程" entry points to
  // stable checkout flow to avoid dead-click/user blocking.
  return `/checkout?slug=${encodeURIComponent(slug)}`;
}
