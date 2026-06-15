/**
 * guide-contact-qa.mjs
 *
 * 「認識導遊」頁的「詢問導遊」inline 訊息，重用既有的 activity_qa pipeline，
 * 但訊息不屬於任何行程。做法：用 sentinel 形狀的 activity_id —
 *   `guide:<guideId>` —
 * 讓這些訊息流進「同一個」導遊後台收件匣（/api/guide/qa），
 * 同時可在 UI 上被辨識為「導遊頁面」訊息（而非某筆行程）。
 *
 * guideId 採用導遊 session 的 guideId（= guide_profiles.id），與
 * /api/guide/qa 用來比對 activities.guide_id / session.guideId 同源。
 *
 * 純函式、無外部相依，方便單測（見 tests/unit/guide-contact-qa.test.mjs）。
 */

/** sentinel 前綴：activity_id 以此開頭者代表「導遊頁面」訊息而非行程問答 */
export const GUIDE_CONTACT_QA_PREFIX = 'guide:';

/**
 * 由 guideId 組出 sentinel activity_id（`guide:<guideId>`）。
 * @param {string} guideId
 * @returns {string}
 */
export function buildGuideContactActivityId(guideId) {
  const id = String(guideId || '').trim();
  if (!id) throw new Error('guideId is required');
  return `${GUIDE_CONTACT_QA_PREFIX}${id}`;
}

/**
 * 判斷某 activity_id 是否為「導遊頁面」訊息 sentinel。
 * @param {unknown} activityId
 * @returns {boolean}
 */
export function isGuideContactActivityId(activityId) {
  return typeof activityId === 'string'
    && activityId.startsWith(GUIDE_CONTACT_QA_PREFIX)
    && activityId.length > GUIDE_CONTACT_QA_PREFIX.length;
}

/**
 * 從 sentinel activity_id 取出 guideId；非 sentinel 則回傳 null。
 * @param {unknown} activityId
 * @returns {string | null}
 */
export function parseGuideContactGuideId(activityId) {
  if (!isGuideContactActivityId(activityId)) return null;
  return activityId.slice(GUIDE_CONTACT_QA_PREFIX.length);
}
