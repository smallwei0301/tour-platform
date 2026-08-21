// @ts-check
/**
 * /midao2 單方案「直接生效」領域寫入器（#1860 Stage 1B / F1）。
 *
 * 規則：
 *   - 只讀寫 canonical `activities` / `activity_plans`；不經 db.mjs（strangler 硬規則）。
 *   - 每次寫入必須綁定單一 planId ＋ activity/guide 歸屬，禁止以 activity_id 做整批寫入。
 *   - 下架只寫 status='inactive'，永不 DELETE、永不封存。
 *   - 樂觀鎖：更新一律帶 expectedUpdatedAt 作為條件欄位；影響 0 列時再讀一次分流
 *     404（不存在／越權）與 409（版本衝突）。
 *   - 本檔不寫任何審核狀態欄位，也不碰 booking/order 既有快照。
 */
import { getSupabase, hasSupabaseEnv } from '../supabase-env.mjs';
import { generatePlanSlug } from '../activity-plan-slugs.mjs';
import { MidaoRouteError } from './route-errors.ts';

const PLAN_COLS = 'id, activity_id, name, description, duration_minutes, price_type, base_price, min_participants, max_participants, booking_type, slug, status, updated_at';

/** 導遊可自助編輯的方案欄位（伺服端唯一真實來源；不含 status/slug/歸屬/審核欄位）。 */
export const MIDAO_EDITABLE_PLAN_FIELDS = [
  'name',
  'description',
  'duration_minutes',
  'price_type',
  'base_price',
  'min_participants',
  'max_participants',
  'booking_type',
];

const PRICE_TYPES = ['per_person', 'per_group'];
const BOOKING_TYPES = ['scheduled', 'request', 'instant'];

/** @type {any[]} */
const _memActivities = [];
/** @type {any[]} */
const _memPlans = [];
let _memSeq = 0;
/** @type {(() => string)|null} */
let _clock = null;

function now() {
  return _clock ? _clock() : new Date().toISOString();
}

export function __resetMidaoServicePlansForTest() {
  _memActivities.length = 0;
  _memPlans.length = 0;
  _memSeq = 0;
}
/** @param {any} row */
export function __seedMidaoServicePlanActivityForTest(row) { _memActivities.push({ ...row }); }
/** @param {any} row */
export function __seedMidaoServicePlanForTest(row) { _memPlans.push({ ...row }); return row; }
/** @param {(() => string)|null} clock */
export function __setMidaoServicePlanClockForTest(clock) { _clock = clock; }
export function __listMidaoServicePlanRowsForTest() { return _memPlans.map((r) => ({ ...r })); }

/** @param {string} code @param {string} message @param {number} status */
function planError(code, message, status) {
  return new MidaoRouteError(code, message, status);
}

function notFound() {
  return planError('NOT_FOUND', 'Resource not found', 404);
}

/** @param {any} row */
function planShape(row) {
  return {
    id: String(row.id),
    activityId: String(row.activity_id),
    name: row.name ?? null,
    description: row.description ?? null,
    durationMinutes: row.duration_minutes ?? null,
    priceType: row.price_type ?? null,
    basePrice: row.base_price ?? null,
    minParticipants: row.min_participants ?? null,
    maxParticipants: row.max_participants ?? null,
    bookingType: row.booking_type ?? null,
    slug: row.slug ?? null,
    status: row.status ?? 'active',
    updatedAt: row.updated_at ?? null,
  };
}

/** 只回傳可編輯白名單欄位的快照（審計 before/after 用）。 @param {any} row */
export function pickEditablePlanSnapshot(row, fields = MIDAO_EDITABLE_PLAN_FIELDS) {
  /** @type {Record<string, any>} */
  const out = {};
  for (const key of fields) {
    if (row && Object.prototype.hasOwnProperty.call(row, key)) out[key] = row[key];
  }
  return out;
}

/** @param {string} message */
function invalidInput(message) {
  return { ok: /** @type {false} */ (false), code: 'INVALID_PLAN_INPUT', message };
}

/**
 * 伺服端八欄驗證。partial=true 只驗有給的欄位（PATCH 用），且不得回填預設值。
 * 一律忽略 client 送來的 id / slug / status / 歸屬 / 審核相關欄位。
 * @param {any} input @param {boolean} [partial]
 * @returns {{ok:true, value:Record<string, any>}|{ok:false, code:string, message:string}}
 */
export function normalizePlanInput(input, partial = false) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return invalidInput('方案內容格式不正確');
  }
  const has = (/** @type {string} */ key) => Object.prototype.hasOwnProperty.call(input, key);
  /** @type {Record<string, any>} */
  const out = {};

  if (!partial || has('name')) {
    const name = String(input.name ?? '').trim();
    if (!name || name.length > 120) return invalidInput('方案名稱必填（120 字內）');
    out.name = name;
  }
  if (!partial || has('description')) {
    const description = input.description == null ? null : String(input.description).trim();
    if (description && description.length > 8000) return invalidInput('方案說明最多 8000 字');
    out.description = description || null;
  }
  if (!partial || has('duration_minutes')) {
    const duration = Math.trunc(Number(input.duration_minutes));
    if (!Number.isFinite(duration) || duration < 15 || duration > 10080) {
      return invalidInput('方案時長需為 15–10080 分鐘');
    }
    out.duration_minutes = duration;
  }
  if (!partial || has('price_type')) {
    if (!PRICE_TYPES.includes(input.price_type)) return invalidInput('計價方式須為每人或每團');
    out.price_type = input.price_type;
  }
  if (!partial || has('base_price')) {
    const basePrice = Math.trunc(Number(input.base_price));
    if (!Number.isFinite(basePrice) || basePrice < 0) return invalidInput('價格須為 0 或正整數');
    out.base_price = basePrice;
  }
  if (!partial || has('min_participants')) {
    const min = Math.trunc(Number(input.min_participants ?? 1));
    if (!Number.isFinite(min) || min < 1 || min > 99) return invalidInput('最少人數需為 1–99');
    out.min_participants = min;
  }
  if (!partial || has('max_participants')) {
    const max = Math.trunc(Number(input.max_participants ?? 10));
    if (!Number.isFinite(max) || max < 1 || max > 99) return invalidInput('最多人數需為 1–99');
    out.max_participants = max;
  }
  if (out.min_participants !== undefined && out.max_participants !== undefined
      && out.max_participants < out.min_participants) {
    return invalidInput('人數區間不合法（最多需 ≥ 最少）');
  }
  if (!partial || has('booking_type')) {
    const bookingType = input.booking_type ?? 'request';
    if (!BOOKING_TYPES.includes(bookingType)) return invalidInput('預約方式不合法');
    out.booking_type = bookingType;
  }

  if (partial && Object.keys(out).length === 0) {
    return invalidInput('請至少提供一個可修改的方案欄位');
  }
  return { ok: true, value: out };
}

const ISO_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/u;

/**
 * PATCH 必填的樂觀鎖時間戳；缺漏或格式錯誤一律 422。
 * @param {unknown} value
 */
export function normalizeExpectedUpdatedAt(value) {
  if (typeof value !== 'string' || !ISO_PATTERN.test(value.trim())) {
    throw planError('INVALID_EXPECTED_UPDATED_AT', 'expectedUpdatedAt is required and must be ISO-8601', 422);
  }
  const trimmed = value.trim();
  if (!Number.isFinite(Date.parse(trimmed))) {
    throw planError('INVALID_EXPECTED_UPDATED_AT', 'expectedUpdatedAt is required and must be ISO-8601', 422);
  }
  return trimmed;
}

/**
 * 歸屬檢查：activity 必須存在且屬於該 guide，否則 NOT_FOUND。
 * @param {string} guideId @param {string} activityId
 */
async function assertActivityOwnership(guideId, activityId) {
  if (!hasSupabaseEnv()) {
    const found = _memActivities.find((a) => a.id === activityId && a.guide_id === guideId);
    if (!found) throw notFound();
    return;
  }
  const supabase = await getSupabase();
  const { data, error } = await supabase.from('activities')
    .select('id')
    .eq('id', activityId)
    .eq('guide_id', guideId)
    .maybeSingle();
  if (error) throw new Error(String(error.message || 'MIDAO_PLAN_DB_ERROR'));
  if (!data) throw notFound();
}

/**
 * 讀取單一方案（非封存），查無回 null。
 * @param {string} activityId @param {string} planId
 */
async function readPlanRow(activityId, planId) {
  if (!hasSupabaseEnv()) {
    return _memPlans.find((p) => p.id === planId && p.activity_id === activityId && p.status !== 'archived') ?? null;
  }
  const supabase = await getSupabase();
  const { data, error } = await supabase.from('activity_plans')
    .select(PLAN_COLS)
    .eq('id', planId)
    .eq('activity_id', activityId)
    .neq('status', 'archived')
    .maybeSingle();
  if (error) throw new Error(String(error.message || 'MIDAO_PLAN_DB_ERROR'));
  return data ?? null;
}

/**
 * 列出該服務的所有非封存方案（含 inactive）。越權／不存在皆 NOT_FOUND。
 * @param {string} guideId @param {string} activityId
 */
export async function listServicePlansDb(guideId, activityId) {
  await assertActivityOwnership(guideId, activityId);
  if (!hasSupabaseEnv()) {
    return _memPlans
      .filter((p) => p.activity_id === activityId && p.status !== 'archived')
      .map((p) => planShape(p));
  }
  const supabase = await getSupabase();
  const { data, error } = await supabase.from('activity_plans')
    .select(PLAN_COLS)
    .eq('activity_id', activityId)
    .neq('status', 'archived');
  if (error) throw new Error(String(error.message || 'MIDAO_PLAN_DB_ERROR'));
  return (Array.isArray(data) ? data : []).map((row) => planShape(row));
}

/**
 * 建立單一方案（只 insert 一列，絕不動其他方案）。
 * @param {{guideId:string, activityId:string, input:any}} params
 */
export async function createServicePlanDb({ guideId, activityId, input }) {
  await assertActivityOwnership(guideId, activityId);
  const norm = normalizePlanInput(input, false);
  if (!norm.ok) throw planError(norm.code, norm.message, 422);

  const timestamp = now();
  const row = {
    ...norm.value,
    activity_id: activityId,
    slug: generatePlanSlug({ name: norm.value.name }),
    status: 'active',
    updated_at: timestamp,
  };

  if (!hasSupabaseEnv()) {
    const created = { id: `mplan_${String(++_memSeq).padStart(6, '0')}`, created_at: timestamp, ...row };
    _memPlans.push(created);
    return {
      plan: planShape(created),
      changedFields: [...MIDAO_EDITABLE_PLAN_FIELDS].filter((f) => norm.value[f] !== undefined),
      before: {},
      after: pickEditablePlanSnapshot(norm.value),
    };
  }

  const supabase = await getSupabase();
  const { data, error } = await supabase.from('activity_plans')
    .insert(row)
    .select(PLAN_COLS)
    .maybeSingle();
  if (error) throw new Error(String(error.message || 'MIDAO_PLAN_DB_ERROR'));
  if (!data) throw new Error('MIDAO_PLAN_INSERT_EMPTY');
  return {
    plan: planShape(data),
    changedFields: [...MIDAO_EDITABLE_PLAN_FIELDS].filter((f) => norm.value[f] !== undefined),
    before: {},
    after: pickEditablePlanSnapshot(norm.value),
  };
}

/**
 * 樂觀鎖條件寫入單一方案。影響 0 列時再讀一次分流 404 / 409。
 * @param {{activityId:string, planId:string, expectedUpdatedAt:string, payload:Record<string, any>}} params
 */
async function applyConditionalPlanWrite({ activityId, planId, expectedUpdatedAt, payload }) {
  if (!hasSupabaseEnv()) {
    const row = _memPlans.find((p) => p.id === planId
      && p.activity_id === activityId
      && p.status !== 'archived'
      && p.updated_at === expectedUpdatedAt);
    if (!row) return null;
    Object.assign(row, payload);
    return { ...row };
  }
  const supabase = await getSupabase();
  const { data, error } = await supabase.from('activity_plans')
    .update(payload)
    .eq('id', planId)
    .eq('activity_id', activityId)
    .eq('updated_at', expectedUpdatedAt)
    .select(PLAN_COLS);
  if (error) throw new Error(String(error.message || 'MIDAO_PLAN_DB_ERROR'));
  const rows = Array.isArray(data) ? data : (data ? [data] : []);
  return rows.length ? rows[0] : null;
}

/**
 * 寫入 0 列時的分流：不存在／越權 = 404；時間戳過期 = 409（附現況快照）。
 * @param {string} activityId @param {string} planId
 */
async function raiseConflictOrNotFound(activityId, planId) {
  const current = await readPlanRow(activityId, planId);
  if (!current) throw notFound();
  const conflict = planError('PLAN_REVISION_CONFLICT', '方案已被更新，請重新載入後再儲存', 409);
  /** @type {any} */ (conflict).currentUpdatedAt = current.updated_at ?? null;
  /** @type {any} */ (conflict).currentPlan = planShape(current);
  throw conflict;
}

/**
 * 更新單一方案（僅可編輯白名單欄位）。
 * @param {{guideId:string, activityId:string, planId:string, input:any, expectedUpdatedAt:string}} params
 */
export async function updateServicePlanDb({ guideId, activityId, planId, input, expectedUpdatedAt }) {
  await assertActivityOwnership(guideId, activityId);
  const norm = normalizePlanInput(input, true);
  if (!norm.ok) throw planError(norm.code, norm.message, 422);

  const existing = await readPlanRow(activityId, planId);
  if (!existing) throw notFound();

  const before = pickEditablePlanSnapshot(existing, Object.keys(norm.value));
  const changedFields = Object.keys(norm.value)
    .filter((key) => existing[key] !== norm.value[key])
    .sort();

  const payload = { ...norm.value, updated_at: now() };
  const written = await applyConditionalPlanWrite({ activityId, planId, expectedUpdatedAt, payload });
  if (!written) await raiseConflictOrNotFound(activityId, planId);

  return {
    plan: planShape(/** @type {any} */ (written)),
    changedFields,
    before: pickEditablePlanSnapshot(before, changedFields),
    after: pickEditablePlanSnapshot(norm.value, changedFields),
  };
}

/**
 * 下架單一方案：只寫 status='inactive'（不刪除、不封存）。
 * @param {{guideId:string, activityId:string, planId:string, expectedUpdatedAt:string}} params
 */
export async function deactivateServicePlanDb({ guideId, activityId, planId, expectedUpdatedAt }) {
  await assertActivityOwnership(guideId, activityId);
  const existing = await readPlanRow(activityId, planId);
  if (!existing) throw notFound();

  const payload = { status: 'inactive', updated_at: now() };
  const written = await applyConditionalPlanWrite({ activityId, planId, expectedUpdatedAt, payload });
  if (!written) await raiseConflictOrNotFound(activityId, planId);

  return {
    plan: planShape(/** @type {any} */ (written)),
    changedFields: ['status'],
    before: { status: existing.status ?? 'active' },
    after: { status: 'inactive' },
  };
}
