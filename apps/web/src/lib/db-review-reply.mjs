// @ts-check
/**
 * Issue #1592 — 導遊回覆評論 資料存取（strangler 領域檔，不進 db.mjs）。
 *
 * 一則評論最多一則導遊回覆（覆寫即更新 guide_reply_text / guide_reply_at）。
 * ownership：評論所屬活動（activity_slug → activities.guide_id）必須等於發話導遊，
 * 否則 403，避免 A 導遊回覆 B 導遊活動下的評論。
 */
import { hasSupabaseEnv, getSupabase } from './db.mjs';

export const GUIDE_REPLY_MAX_CHARS = 1000;

/**
 * in-memory fallback（測試 seam）。
 * @type {Array<{ id: string, activity_slug: string, guide_reply_text: string|null, guide_reply_at: string|null }>}
 */
let _memReviews = [];
/** @type {Map<string, string>} activity_slug → guide_id */
let _memActivityGuide = new Map();

/**
 * @param {Array<{ id: string, activity_slug: string, guide_reply_text?: string|null, guide_reply_at?: string|null }>} reviews
 * @param {Record<string, string>} activitySlugToGuideId
 */
export function __seedMemReviews(reviews, activitySlugToGuideId = {}) {
  _memReviews = (Array.isArray(reviews) ? reviews : []).map((r) => ({
    id: String(r.id),
    activity_slug: String(r.activity_slug),
    guide_reply_text: r.guide_reply_text ?? null,
    guide_reply_at: r.guide_reply_at ?? null,
  }));
  _memActivityGuide = new Map(Object.entries(activitySlugToGuideId || {}));
}
export function __getMemReviews() { return _memReviews.map((r) => ({ ...r })); }
export function __resetMemReviews() { _memReviews = []; _memActivityGuide = new Map(); }

/**
 * 正規化回覆文字：trim、砍超長、空字串視為刪除（null）。
 * @param {unknown} raw
 * @returns {{ ok: true, text: string|null } | { ok: false, code: string, message: string }}
 */
export function normalizeGuideReply(raw) {
  if (raw === null || raw === undefined) return { ok: true, text: null };
  if (typeof raw !== 'string') {
    return { ok: false, code: 'INVALID_REPLY', message: 'reply must be a string' };
  }
  const text = raw.trim();
  if (!text) return { ok: true, text: null }; // 空＝撤下回覆
  if (text.length > GUIDE_REPLY_MAX_CHARS) {
    return { ok: false, code: 'REPLY_TOO_LONG', message: `reply must be at most ${GUIDE_REPLY_MAX_CHARS} characters` };
  }
  return { ok: true, text };
}

/**
 * 導遊回覆評論（或覆寫／撤下）。
 * @param {{ guideId: string, reviewId: string, replyText: unknown, now?: string }} input
 * @returns {Promise<{ ok: true, replied: boolean, replyAt: string|null } | { ok: false, status: number, code: string, message: string }>}
 */
export async function upsertGuideReplyDb({ guideId, reviewId, replyText, now } = /** @type {any} */ ({})) {
  const gid = String(guideId || '').trim();
  const rid = String(reviewId || '').trim();
  if (!gid) return { ok: false, status: 401, code: 'UNAUTHORIZED', message: 'guide required' };
  if (!rid) return { ok: false, status: 400, code: 'INVALID_REVIEW', message: 'reviewId required' };

  const norm = normalizeGuideReply(replyText);
  if (!norm.ok) return { ok: false, status: 400, code: norm.code, message: norm.message };

  const nowIso = now || new Date().toISOString();
  const replyAt = norm.text ? nowIso : null;

  if (!hasSupabaseEnv()) {
    const row = _memReviews.find((r) => r.id === rid);
    if (!row) return { ok: false, status: 404, code: 'REVIEW_NOT_FOUND', message: 'review not found' };
    const ownerGuide = _memActivityGuide.get(row.activity_slug);
    if (!ownerGuide || ownerGuide !== gid) {
      return { ok: false, status: 403, code: 'NOT_OWNING_GUIDE', message: 'review not on your activity' };
    }
    row.guide_reply_text = norm.text;
    row.guide_reply_at = replyAt;
    return { ok: true, replied: Boolean(norm.text), replyAt };
  }

  const supabase = await getSupabase();
  // ownership：評論 → activity_slug → activities.guide_id
  const { data: review, error: revErr } = await supabase
    .from('activity_reviews')
    .select('id, activity_slug')
    .eq('id', rid)
    .maybeSingle();
  if (revErr) return { ok: false, status: 500, code: 'DB_ERROR', message: revErr.message };
  if (!review) return { ok: false, status: 404, code: 'REVIEW_NOT_FOUND', message: 'review not found' };

  const { data: activity, error: actErr } = await supabase
    .from('activities')
    .select('guide_id')
    .eq('slug', review.activity_slug)
    .maybeSingle();
  if (actErr) return { ok: false, status: 500, code: 'DB_ERROR', message: actErr.message };
  if (!activity || String(activity.guide_id || '') !== gid) {
    return { ok: false, status: 403, code: 'NOT_OWNING_GUIDE', message: 'review not on your activity' };
  }

  const { error: updErr } = await supabase
    .from('activity_reviews')
    .update({ guide_reply_text: norm.text, guide_reply_at: replyAt })
    .eq('id', rid);
  if (updErr) return { ok: false, status: 500, code: 'DB_ERROR', message: updErr.message };
  return { ok: true, replied: Boolean(norm.text), replyAt };
}
