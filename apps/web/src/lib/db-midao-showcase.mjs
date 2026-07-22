// @ts-check
/**
 * midao2 服務（＝既有 activities）雙軌可見度與精靈建立（spec §4.1）。
 * 接案頁可見 = midao_status='published' OR (midao_status IS NULL AND status='published')。
 * 主站可見度只看既有 status（審核流不動）。
 */
import { hasSupabaseEnv, getSupabase } from './db.mjs';

export const MIDAO_DEAL_MODES = ['instant_booking', 'confirm_first', 'line_inquiry'];
const QUESTION_TYPES = ['text', 'single_choice', 'multi_choice', 'yes_no'];
const ACT_COLS = 'id, guide_id, title, slug, tagline, cover_image_url, duration_minutes, min_participants, max_participants, region, languages, price_twd, midao_status, midao_deal_mode, midao_questions, midao_sort_order, status, created_at';

const _memActivities = [];
const _memGuides = [];
let _memSeq = 0;
export function __resetMemMidaoShowcase() { _memActivities.length = 0; _memGuides.length = 0; _memSeq = 0; }
export function __seedMemMidaoGuide(profile) { _memGuides.push(profile); }
export function __seedMemMidaoActivities(rows) { _memActivities.push(...rows); }

/** 雙軌可見度矩陣（純函式）。 @param {{midaoStatus:string|null, status:string}} a */
export function isShowcaseVisible({ midaoStatus, status }) {
  if (midaoStatus === 'published') return true;
  if (midaoStatus === 'draft') return false;
  return status === 'published'; // NULL＝跟隨主站
}

/** @param {any} a */
function serviceShape(a) {
  return {
    activityId: a.id, title: a.title, tagline: a.tagline ?? null,
    coverImageUrl: a.cover_image_url ?? null, durationMinutes: a.duration_minutes ?? null,
    minParticipants: a.min_participants ?? 1, maxParticipants: a.max_participants ?? 10,
    region: a.region ?? null, languages: Array.isArray(a.languages) ? a.languages : [],
    priceTwd: a.price_twd ?? 0,
    dealMode: a.midao_deal_mode ?? 'confirm_first',
    questions: Array.isArray(a.midao_questions) ? a.midao_questions : [],
    showcasePublished: isShowcaseVisible({ midaoStatus: a.midao_status ?? null, status: a.status }),
    mainSiteStatus: a.status, midaoSortOrder: a.midao_sort_order ?? null,
  };
}

/**
 * 精靈/編輯輸入驗證。partial=true 只驗有給的欄（PATCH 用）。
 * @param {any} input @param {boolean} [partial]
 */
export function normalizeServiceInput(input, partial = false) {
  const out = /** @type {any} */ ({});
  const has = (/** @type {string} */ k) => input && Object.prototype.hasOwnProperty.call(input, k);
  if (!partial || has('title')) {
    const title = String(input?.title ?? '').trim();
    if (!title || title.length > 80) return { ok: false, code: 'INVALID_TITLE', message: '請填寫服務名稱（80 字內）' };
    out.title = title;
  }
  if (!partial || has('tagline')) {
    const tagline = String(input?.tagline ?? '').trim();
    if (tagline.length > 60) return { ok: false, code: 'TAGLINE_TOO_LONG', message: '一句話介紹最多 60 字' };
    out.tagline = tagline || null;
  }
  if (has('coverImageUrl')) out.cover_image_url = String(input.coverImageUrl ?? '').trim() || null;
  if (!partial || has('durationMinutes')) {
    const d = Math.trunc(Number(input?.durationMinutes));
    if (!Number.isFinite(d) || d < 30 || d > 1440) return { ok: false, code: 'INVALID_DURATION', message: '服務時間需為 30–1440 分鐘' };
    out.duration_minutes = d;
  }
  if (!partial) {
    const min = Math.trunc(Number(input?.minParticipants ?? 1));
    const max = Math.trunc(Number(input?.maxParticipants ?? 10));
    if (!Number.isFinite(min) || !Number.isFinite(max) || min < 1 || max < min || max > 99) {
      return { ok: false, code: 'INVALID_PARTICIPANTS', message: '適合人數範圍不正確' };
    }
    out.min_participants = min; out.max_participants = max;
  } else {
    // partial：只驗、只寫有給的欄，缺的欄不得回填預設（避免清掉既有值）
    if (has('minParticipants')) {
      const min = Math.trunc(Number(input.minParticipants));
      if (!Number.isFinite(min) || min < 1 || min > 99) return { ok: false, code: 'INVALID_PARTICIPANTS', message: '適合人數範圍不正確' };
      out.min_participants = min;
    }
    if (has('maxParticipants')) {
      const max = Math.trunc(Number(input.maxParticipants));
      if (!Number.isFinite(max) || max < 1 || max > 99) return { ok: false, code: 'INVALID_PARTICIPANTS', message: '適合人數範圍不正確' };
      out.max_participants = max;
    }
    if (out.min_participants !== undefined && out.max_participants !== undefined && out.max_participants < out.min_participants) {
      return { ok: false, code: 'INVALID_PARTICIPANTS', message: '適合人數範圍不正確' };
    }
  }
  if (!partial || has('region')) out.region = String(input?.region ?? '').trim().slice(0, 40) || null;
  if (!partial || has('languages')) {
    out.languages = Array.isArray(input?.languages)
      ? input.languages.map((l) => String(l).trim()).filter(Boolean).slice(0, 8) : [];
  }
  if (!partial || has('priceTwd')) {
    const price = Math.trunc(Number(input?.priceTwd));
    if (!Number.isFinite(price) || price < 0) return { ok: false, code: 'INVALID_PRICE', message: '參考價格需為 ≥0 整數' };
    out.price_twd = price;
  }
  if (!partial || has('dealMode')) {
    const mode = String(input?.dealMode ?? '').trim();
    if (!MIDAO_DEAL_MODES.includes(mode)) return { ok: false, code: 'INVALID_DEAL_MODE', message: '成交方式不正確' };
    out.midao_deal_mode = mode;
  }
  if (!partial || has('questions')) {
    const qs = Array.isArray(input?.questions) ? input.questions : [];
    if (qs.length > 10) return { ok: false, code: 'TOO_MANY_QUESTIONS', message: '需求問題最多 10 題' };
    out.midao_questions = qs.map((q, i) => ({
      id: String(q?.id ?? `q${i + 1}`), label: String(q?.label ?? '').trim().slice(0, 120),
      type: QUESTION_TYPES.includes(q?.type) ? q.type : 'text',
      options: Array.isArray(q?.options) ? q.options.map((o) => String(o).slice(0, 60)).slice(0, 10) : [],
      required: q?.required === true,
    })).filter((q) => q.label);
  }
  if (has('midaoSortOrder')) out.midao_sort_order = Math.trunc(Number(input.midaoSortOrder) || 0);
  if (has('midaoStatus')) {
    const s = input.midaoStatus;
    if (s !== 'draft' && s !== 'published' && s !== null) {
      return { ok: false, code: 'INVALID_MIDAO_STATUS', message: '上架狀態不正確' };
    }
    out.midao_status = s;
  }
  return { ok: true, value: out };
}

/** title → slug（中文安全：random 尾碼保 unique）。 @param {string} title */
function slugify(title) {
  const base = String(title).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'midao';
  return `${base}-${Math.random().toString(36).slice(2, 8)}`;
}

/** @param {string} guideId */
export async function listMidaoServicesDb(guideId) {
  let rows;
  if (!hasSupabaseEnv()) {
    rows = _memActivities.filter((a) => a.guide_id === guideId && a.status !== 'archived');
  } else {
    const supabase = await getSupabase();
    const { data } = await supabase.from('activities').select(ACT_COLS)
      .eq('guide_id', guideId).neq('status', 'archived')
      .order('created_at', { ascending: false });
    rows = Array.isArray(data) ? data : [];
  }
  return rows.map(serviceShape);
}

/**
 * 精靈建立：真 activities row，主站恆為 draft。
 * @param {string} guideId @param {any} value @param {{publish?:boolean}} [opts]
 */
export async function createMidaoServiceDb(guideId, value, opts = {}) {
  const row = {
    ...value,
    guide_id: guideId, slug: slugify(value.title), status: 'draft',
    midao_status: opts.publish ? 'published' : 'draft',
  };
  if (!hasSupabaseEnv()) {
    const created = { id: `mact_${String(++_memSeq).padStart(6, '0')}`, created_at: new Date().toISOString(), ...row };
    _memActivities.push(created);
    return serviceShape(created);
  }
  const supabase = await getSupabase();
  const { data, error } = await supabase.from('activities').insert(row).select(ACT_COLS).single();
  if (error) throw new Error(error.message);
  return serviceShape(data);
}

/**
 * 編輯/上下架（ownership 內建：查無/越權 = NOT_FOUND）。patch 需先過 normalizeServiceInput(…, true)。
 * @param {string} guideId @param {string} activityId @param {any} patch
 * @returns {Promise<{ok:true, service:any}|{ok:false, code:string, message:string}>}
 */
export async function updateMidaoServiceDb(guideId, activityId, patch) {
  const norm = normalizeServiceInput(patch, true);
  if (!norm.ok) return norm;
  if (!hasSupabaseEnv()) {
    const row = _memActivities.find((a) => a.id === activityId && a.guide_id === guideId);
    if (!row) return { ok: false, code: 'NOT_FOUND', message: '服務不存在' };
    Object.assign(row, norm.value);
    return { ok: true, service: serviceShape(row) };
  }
  const supabase = await getSupabase();
  const { data, error } = await supabase.from('activities').update(norm.value)
    .eq('id', activityId).eq('guide_id', guideId).select(ACT_COLS).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return { ok: false, code: 'NOT_FOUND', message: '服務不存在' };
  return { ok: true, service: serviceShape(data) };
}

/**
 * 公開接案頁資料。條件：guide approved＋≥1 可見服務；否則 null（route 統一回 404）。
 * @param {string} slug
 */
export async function getPublicMidaoPageDb(slug) {
  let profile, activities;
  if (!hasSupabaseEnv()) {
    profile = _memGuides.find((g) => g.slug === slug) ?? null;
    activities = profile ? _memActivities.filter((a) => a.guide_id === profile.id) : [];
  } else {
    const supabase = await getSupabase();
    const { data: g } = await supabase.from('guide_profiles')
      .select('id, slug, display_name, headline, bio, languages, regions, region, experience_years, profile_photo_url, hero_image_url, verification_status')
      .eq('slug', slug).maybeSingle();
    profile = g ?? null;
    if (profile) {
      const { data: acts } = await supabase.from('activities').select(ACT_COLS)
        .eq('guide_id', profile.id).neq('status', 'archived');
      activities = Array.isArray(acts) ? acts : [];
    } else {
      activities = [];
    }
  }
  if (!profile || profile.verification_status !== 'approved') return null;
  const visible = activities
    .filter((a) => isShowcaseVisible({ midaoStatus: a.midao_status ?? null, status: a.status }))
    .sort((a, b) => (a.midao_sort_order ?? 999) - (b.midao_sort_order ?? 999));
  if (!visible.length) return null;
  return {
    guide: {
      displayName: profile.display_name, headline: profile.headline ?? null,
      bio: profile.bio ?? null,
      languages: Array.isArray(profile.languages) ? profile.languages : [],
      regions: Array.isArray(profile.regions) ? profile.regions : (profile.region ? [profile.region] : []),
      experienceYears: profile.experience_years ?? null,
      photoUrl: profile.profile_photo_url ?? null, heroUrl: profile.hero_image_url ?? null,
    },
    services: visible.map(serviceShape),
  };
}
