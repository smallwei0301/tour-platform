// #1475 導遊商店頁聚合的純函式（無 DB 依賴，方便單測）。
// getGuideShopDb 取資料後委派這裡做「方案過濾 + 公開欄位投影 + 依地區分組」。

/** 將原始方案（getActivityBySlugDb 形狀）映射為商店頁方案，僅保留 active。 */
export function mapShopPlans(rawPlans = []) {
  return (rawPlans || [])
    .filter((p) => p && p.id && (!p.status || p.status === 'active'))
    .map((p) => ({
      id: p.id,
      name: p.label || p.name || '方案',
      basePrice: Number.isFinite(Number(p.basePrice)) ? Number(p.basePrice) : null,
      priceType: p.priceType === 'per_group' ? 'per_group' : 'per_person',
      duration: p.duration || '',
      minParticipants: Number.isFinite(Number(p.minParticipants)) ? Number(p.minParticipants) : 1,
      maxParticipants: Number.isFinite(Number(p.maxParticipants)) ? Number(p.maxParticipants) : null,
    }));
}

/**
 * 組合導遊商店頁視圖。只輸出公開欄位（不含任何匯款資訊）。
 * @param {object|null} guide getGuideBySlugDb 結果
 * @param {Array<{summary:object, plans:Array}>} activityDetails 每個行程的摘要 + 原始方案
 */
export function buildGuideShopView(guide, activityDetails = []) {
  if (!guide) return null;

  const activities = [];
  for (const entry of activityDetails || []) {
    const s = (entry && entry.summary) || {};
    if (s.status && s.status !== 'published') continue;
    const plans = mapShopPlans(entry && entry.plans);
    if (plans.length === 0) continue; // 沒有 active 方案的行程不顯示
    activities.push({
      id: s.id,
      slug: s.slug,
      title: s.title,
      region: s.region,
      regionSlug: s.regionSlug || null,
      coverImageUrl: s.coverImageUrl || null,
      plans,
    });
  }

  const byRegion = new Map();
  for (const a of activities) {
    const key = a.region || '其他';
    if (!byRegion.has(key)) byRegion.set(key, []);
    byRegion.get(key).push(a);
  }
  const activitiesByRegion = [...byRegion.entries()].map(([region, acts]) => ({
    region,
    activities: acts,
  }));

  return {
    guide: {
      id: guide.id,
      slug: guide.slug,
      displayName: guide.displayName,
      region: guide.region,
      bio: guide.bio,
      profilePhotoUrl: guide.profilePhotoUrl,
      heroImageUrl: guide.heroImageUrl,
      ratingAvg: guide.ratingAvg,
      reviewCount: guide.reviewCount,
      // 信任列欄位（皆為導遊公開頁既已公開的資訊）
      languages: Array.isArray(guide.languages) ? guide.languages : [],
      specialties: Array.isArray(guide.specialties) ? guide.specialties : [],
      certifications: Array.isArray(guide.certifications) ? guide.certifications : [],
      verificationStatus: guide.verificationStatus ?? null,
      serviceCount: Number.isFinite(Number(guide.serviceCount)) ? Number(guide.serviceCount) : null,
    },
    activitiesByRegion,
  };
}
