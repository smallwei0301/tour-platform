/**
 * 旅客「我的提問／問答回覆」收件匣的純函式映射（離線可測，不依賴 Supabase）。
 *
 * activity_qa.activity_id 可能是：
 *  - 一般行程 id（uuid）或 slug → 連到 canonical 詳情頁 /activities/<region>/<slug>
 *    （行程詳情頁的「旅客問答」區塊）。務必帶 region segment：詳情頁路由是
 *    `/activities/[region]/[slug]`，少了 region 的 `/activities/<slug>` 會先打到
 *    `[region]` 相容頁，做一次 slug→activity 查詢後 302 轉址到 canonical 路徑，
 *    每次點擊都多一個 server round-trip + DB 查詢（後台點行程「載入過久」的根因）。
 *  - sentinel `guide:<guideId>` → 連到 /guides/<slug>（導遊頁的「詢問導遊」區塊）
 *
 * 審核通過（approved）且有 answer 才算「已回覆」；其餘為審核中／未通過。
 */
import { resolveActivityRegionSegment } from './region-slug.mjs';

const GUIDE_SENTINEL_PREFIX = 'guide:';

/** 依 (status, 是否有回覆) 給中文標籤。 */
export function qaStatusLabel(status, hasAnswer) {
  switch (status) {
    case 'approved':
      return hasAnswer ? '已回覆' : '已公開';
    case 'rejected':
      return '未通過';
    case 'pending_moderation':
    default:
      return '審核中';
  }
}

/**
 * @param {Array<object>} qaRows activity_qa rows（含 id, activity_id, question, answer, status, created_at, updated_at）
 * @param {{ activityById?: Map, guideById?: Map }} maps
 *   activityById: id/slug → { title, slug, region, regionSlug }
 *   guideById: guideId → { slug, display_name }
 * @returns {Array<object>} 依 updatedAt 由新到舊排序的 view models
 */
export function mapMyQaRows(qaRows, { activityById = new Map(), guideById = new Map() } = {}) {
  const items = (qaRows || []).map((row) => {
    const activityRef = String(row.activity_id || '').trim();
    const isGuideContact = activityRef.startsWith(GUIDE_SENTINEL_PREFIX);

    let targetKind;
    let targetTitle;
    let targetHref = null;

    if (isGuideContact) {
      const guideId = activityRef.slice(GUIDE_SENTINEL_PREFIX.length);
      const guide = guideById.get(guideId);
      targetKind = 'guide';
      targetTitle = guide?.display_name ? `${guide.display_name}（導遊）` : '向導遊提問';
      targetHref = guide?.slug ? `/guides/${guide.slug}` : null;
    } else {
      const activity = activityById.get(activityRef);
      targetKind = 'activity';
      targetTitle = activity?.title || '行程提問';
      // canonical 詳情頁路徑（含 region segment），與 buildActivityHref()／
      // buildCanonicalActivityDetailPath() 一致，避免命中 [region] 相容轉址。
      targetHref = activity?.slug
        ? `/activities/${encodeURIComponent(resolveActivityRegionSegment(activity))}/${encodeURIComponent(activity.slug)}`
        : null;
    }

    const hasAnswer = String(row.answer || '').trim().length > 0;
    const status = String(row.status || 'pending_moderation');

    return {
      id: row.id,
      question: String(row.question || ''),
      answer: hasAnswer ? String(row.answer) : null,
      status,
      statusLabel: qaStatusLabel(status, hasAnswer),
      answered: status === 'approved' && hasAnswer,
      targetKind,
      targetTitle,
      targetHref,
      createdAt: row.created_at || null,
      updatedAt: row.updated_at || row.created_at || null,
    };
  });

  return items.sort((a, b) => {
    const ta = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
    const tb = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
    return tb - ta;
  });
}
