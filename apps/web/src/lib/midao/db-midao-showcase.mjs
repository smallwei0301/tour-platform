// @ts-check
/**
 * midao2 服務（＝既有 activities）雙軌可見度與精靈建立（spec §4.1）。
 * 接案頁可見 = midao_status='published' OR (midao_status IS NULL AND status='published')。
 * 主站可見度只看既有 status（審核流不動）。
 */
import { hasSupabaseEnv, getSupabase } from '../db.mjs';

export const MIDAO_DEAL_MODES = ['instant_booking', 'confirm_first', 'line_inquiry'];
const QUESTION_TYPES = ['text', 'single_choice', 'multi_choice', 'yes_no'];
const ACT_COLS = 'id, guide_id, title, slug, tagline, cover_image_url, duration_minutes, min_participants, max_participants, region, languages, price_twd, midao_status, midao_deal_mode, midao_questions, midao_sort_order, status, created_at';

/** @type {any[]} */
const _memActivities = [];
/** @type {any[]} */
const _memGuides = [];
/** @type {any[]} */
const _memPlans = [];
let _memSeq = 0;
export function __resetMemMidaoShowcase() { _memActivities.length = 0; _memGuides.length = 0; _memPlans.length = 0; _memSeq = 0; }
/** @param {any} profile */
export function __seedMemMidaoGuide(profile) { _memGuides.push(profile); }
/** @param {any[]} rows */
export function __seedMemMidaoActivities(rows) { _memActivities.push(...rows); }
/** @param {any[]} rows */
export function __seedMemMidaoPlans(rows) { _memPlans.push(...rows); }

/** 雙軌可見度矩陣（純函式）。 @param {{midaoStatus:string|null, status:string}} a */
export function isShowcaseVisible({ midaoStatus, status }) {
  if (midaoStatus === 'published') return true;
  if (midaoStatus === 'draft') return false;
  return status === 'published'; // NULL＝跟隨主站
}

/** @param {any} a @param {any[]} [plans] */
function serviceShape(a, plans = []) {
  const activePlans = plans
    .filter((p) => p.activity_id === a.id)
    .filter((p) => !p.status || p.status === 'active');
  const planOptions = activePlans.map((p) => ({
    planId: p.id, name: p.name, basePrice: p.base_price,
    priceType: p.price_type, durationMinutes: p.duration_minutes ?? null,
  }));
  const positivePrices = activePlans
    .map((p) => Number(p.base_price))
    .filter((n) => Number.isFinite(n) && n > 0);
  const priceFromTwd = positivePrices.length ? Math.min(...positivePrices) : (a.price_twd ?? 0);
  return {
    activityId: a.id, title: a.title, tagline: a.tagline ?? null,
    coverImageUrl: a.cover_image_url ?? null, durationMinutes: a.duration_minutes ?? null,
    minParticipants: a.min_participants ?? 1, maxParticipants: a.max_participants ?? 10,
    region: a.region ?? null, languages: Array.isArray(a.languages) ? a.languages : [],
    priceTwd: a.price_twd ?? 0,
    planOptions, priceFromTwd,
    dealMode: a.midao_deal_mode ?? 'confirm_first',
    questions: Array.isArray(a.midao_questions) ? a.midao_questions : [],
    showcasePublished: isShowcaseVisible({ midaoStatus: a.midao_status ?? null, status: a.status }),
    mainSiteStatus: a.status, midaoSortOrder: a.midao_sort_order ?? null,
  };
}

/**
 * 該批 activity ids 的非封存方案（in-memory／Supabase 皆先濾 archived，active 判定在 serviceShape）。
 * @param {string[]} ids
 */
async function fetchPlansByActivityIds(ids) {
  if (!ids.length) return [];
  if (!hasSupabaseEnv()) {
    return _memPlans.filter((p) => ids.includes(p.activity_id) && p.status !== 'archived');
  }
  const supabase = await getSupabase();
  const { data } = await supabase.from('activity_plans')
    .select('id, activity_id, name, base_price, price_type, duration_minutes, status')
    .in('activity_id', ids).neq('status', 'archived');
  return Array.isArray(data) ? data : [];
}

/**
 * 精靈/編輯輸入驗證。partial=true 只驗有給的欄（PATCH 用）。
 * @param {any} input @param {boolean} [partial]
 * @returns {{ok:true, value:any}|{ok:false, code:string, message:string}}
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
      ? input.languages.map((/** @type {any} */ l) => String(l).trim()).filter(Boolean).slice(0, 8) : [];
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
    out.midao_questions = qs.map((/** @type {any} */ q, /** @type {number} */ i) => ({
      id: String(q?.id ?? `q${i + 1}`), label: String(q?.label ?? '').trim().slice(0, 120),
      type: QUESTION_TYPES.includes(q?.type) ? q.type : 'text',
      options: Array.isArray(q?.options) ? q.options.map((/** @type {any} */ o) => String(o).slice(0, 60)).slice(0, 10) : [],
      required: q?.required === true,
    })).filter((/** @type {any} */ q) => q.label);
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
  const plans = await fetchPlansByActivityIds(rows.map((a) => a.id));
  return rows.map((a) => serviceShape(a, plans));
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
    const nextMin = norm.value.min_participants ?? row.min_participants ?? 1;
    const nextMax = norm.value.max_participants ?? row.max_participants ?? 10;
    if (nextMax < nextMin) return { ok: false, code: 'INVALID_PARTICIPANTS', message: '適合人數範圍不正確' };
    Object.assign(row, norm.value);
    return { ok: true, service: serviceShape(row) };
  }
  const supabase = await getSupabase();
  // 單欄 patch 不得造成 min>max：先讀既有列合併檢查
  const { data: current } = await supabase.from('activities')
    .select('min_participants, max_participants')
    .eq('id', activityId).eq('guide_id', guideId).maybeSingle();
  if (!current) return { ok: false, code: 'NOT_FOUND', message: '服務不存在' };
  const nextMin = norm.value.min_participants ?? current.min_participants ?? 1;
  const nextMax = norm.value.max_participants ?? current.max_participants ?? 10;
  if (nextMax < nextMin) return { ok: false, code: 'INVALID_PARTICIPANTS', message: '適合人數範圍不正確' };
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
  /** @type {any} */
  let profile;
  /** @type {any[]} */
  let activities;
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
        .eq('guide_id', profile.id).neq('status', 'archived')
        .order('created_at', { ascending: false });
      activities = Array.isArray(acts) ? acts : [];
    } else {
      activities = [];
    }
  }
  if (!profile || profile.verification_status !== 'approved') return null;
  const visible = activities
    .filter((a) => isShowcaseVisible({ midaoStatus: a.midao_status ?? null, status: a.status }))
    .sort((a, b) => ((a.midao_sort_order ?? 999) - (b.midao_sort_order ?? 999))
      || String(b.created_at ?? '').localeCompare(String(a.created_at ?? '')));
  if (!visible.length) return null;
  const plans = await fetchPlansByActivityIds(visible.map((a) => a.id));
  return {
    guideId: profile.id,
    guide: {
      displayName: profile.display_name, headline: profile.headline ?? null,
      bio: profile.bio ?? null,
      languages: Array.isArray(profile.languages) ? profile.languages : [],
      regions: Array.isArray(profile.regions) ? profile.regions : (profile.region ? [profile.region] : []),
      experienceYears: profile.experience_years ?? null,
      photoUrl: profile.profile_photo_url ?? null, heroUrl: profile.hero_image_url ?? null,
    },
    services: visible.map((a) => serviceShape(a, plans)),
  };
}

/** 我的頁面：讀取導覽經驗年資（不受接案頁公開條件影響）。 @param {string} guideId */
export async function getGuideExperienceYearsDb(guideId) {
  if (!hasSupabaseEnv()) {
    const g = _memGuides.find((x) => x.id === guideId);
    return g?.experience_years ?? null;
  }
  const supabase = await getSupabase();
  const { data } = await supabase.from('guide_profiles')
    .select('experience_years').eq('id', guideId).maybeSingle();
  return data?.experience_years ?? null;
}

/**
 * 我的頁面：更新導覽經驗年資（guide_profiles.experience_years，0–60 整數）。
 * @param {string} guideId @param {any} years
 * @returns {Promise<{ok:true, experienceYears:number}|{ok:false, code:string, message:string}>}
 */
export async function updateGuideExperienceYearsDb(guideId, years) {
  const n = Number(years);
  if (!Number.isInteger(n) || n < 0 || n > 60) {
    return { ok: false, code: 'INVALID_YEARS', message: '導覽經驗需為 0–60 的整數年' };
  }
  if (!hasSupabaseEnv()) {
    const g = _memGuides.find((x) => x.id === guideId);
    if (g) g.experience_years = n;
    return { ok: true, experienceYears: n };
  }
  const supabase = await getSupabase();
  const { error } = await supabase.from('guide_profiles')
    .update({ experience_years: n }).eq('id', guideId);
  if (error) throw new Error(error.message);
  return { ok: true, experienceYears: n };
}
