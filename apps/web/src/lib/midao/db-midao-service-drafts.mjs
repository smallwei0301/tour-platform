// #1758 S4 · Task 25 — guide service draft 樂觀鎖（CAS）gateway 層。
//
// 目標（白話）：讓「編輯服務草稿」在多人同時操作時不會互相覆蓋。呼叫端每次存檔都
// 帶入自己讀到的 expectedRevision；若資料庫目前 revision 已被別人推進，回傳結構化的
// 409 衝突結果（不是悄悄蓋掉），呼叫端據此提示前端重新讀取最新版本。
//
// 沿用專案既有的 gateway pattern（如 db-booking-commands.mjs / db-requests.mjs）：
//   - 不寫進 db.mjs（strangler 硬規則），改開本領域檔，且放在 src/lib/midao/ 子資料夾
//     （避開 architecture-ratchet 的 src/lib 頂層攤平天花板）。
//   - in-memory store 與 Supabase 走一致行為（parity）；`hasSupabaseEnv()` 決定走哪條。
//   - 對外「不 throw 預期結果」：成功／409 衝突／問卷驗證失敗都回傳結構化物件，只有非
//     預期的後端錯誤才 throw。Supabase insert 僅在 unique-violation（23505）時歸類為 409；
//     其餘錯誤碼（如 42501 權限／RLS、23503 外鍵）一律 throw，與 update／discard 一致。
//
// 已知限制（非阻擋，留待 S5 route 層處理）：
//   - in-memory store 以 activityId 為單鍵，discard 後同鍵會被新草稿覆蓋，與 Supabase 保留
//     歷史列（多列不同 status）不對等。此差異僅影響 dev/test 路徑，不影響正式 Supabase 行為。
//   - 無 active 草稿但 expectedRevision >= 1 時目前回 409（draft=null）而非 404；語意上
//     「草稿不存在」較接近 404，留待 S5 route 層對外映射時區分。
//
// 相依：
//   - S1 schema（guide_service_drafts：revision INTEGER CHECK (revision >= 1)、
//     status IN active/discarded/published、單一 active partial unique index）。
//   - S2 validateIntakeQuestion（存草稿前若有問卷題目變更，先擋一次）。
//   - S3 validateServiceForPublication（僅作「送出發布會不會過」的預先提示，不阻擋存草稿；
//     草稿允許不完整）。

import { getSupabase, hasSupabaseEnv } from '../supabase-env.mjs';
import { validateIntakeQuestion } from './questionnaire-schema.mjs';
import { validateServiceForPublication } from './service-publication.ts';
import { normalizeStructuralUuid } from './structural-uuid.mjs';

const DRAFT_STATUSES = new Set(['active', 'discarded', 'published']);
// 對外結構化結果碼；status 供呼叫端直接映射 HTTP 狀態。
const CONFLICT = 'REVISION_CONFLICT';
const INVALID_QUESTIONNAIRE = 'INVALID_QUESTIONNAIRE';
const INVALID_ACTIVITY_ID = 'INVALID_ACTIVITY_ID';
const INVALID_EXPECTED_REVISION = 'INVALID_EXPECTED_REVISION';
const INVALID_PATCH = 'INVALID_PATCH';
const NOT_FOUND = 'NOT_FOUND';
// PostgreSQL unique_violation：guide_service_drafts 單一 active partial unique index 撞擊時
// Supabase 回的 error.code。唯一可被視為「版本衝突」的 insert 失敗原因。
const UNIQUE_VIOLATION = '23505';

const draftStore = new Map();
let nowProvider = () => new Date().toISOString();

// ---------------------------------------------------------------------------
// 測試 seam（比照 db-booking-commands.mjs 的 __reset / __seed / __setClock 命名）。
// ---------------------------------------------------------------------------
export function __resetMidaoServiceDraftStoreForTest() {
  draftStore.clear();
}

export function __seedMidaoServiceDraftForTest(input = {}) {
  const row = seedRow(input);
  draftStore.set(row.activityId, row);
  return toDraftView(row);
}

export function __setMidaoServiceDraftClockForTest(clock) {
  if (typeof clock === 'function') {
    nowProvider = clock;
    return;
  }
  if (typeof clock === 'string') {
    nowProvider = () => clock;
    return;
  }
  nowProvider = () => new Date().toISOString();
}

function nowIso() {
  const value = nowProvider();
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) {
    throw unexpected('Midao service draft clock returned an invalid timestamp');
  }
  return value;
}

function unexpected(message = 'Midao service draft backend failure') {
  const error = new Error(message);
  error.name = 'MidaoServiceDraftBackendError';
  return error;
}

function clone(value) {
  return structuredClone(value);
}

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeActivityId(value) {
  return normalizeStructuralUuid(value);
}

// expectedRevision 語意：
//   - 0（或 null/undefined，視為 0）：呼叫端預期「目前沒有 active 草稿」，這次是新建。
//   - >=1：呼叫端預期既有 active 草稿的 revision 恰為此值（CAS 比對用）。
function normalizeExpectedRevision(value) {
  if (value === null || value === undefined) return 0;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) return null;
  return value;
}

// ---------------------------------------------------------------------------
// Draft row（內部）與 DraftView（對外）。payload 只放草稿表單快照（含 questions）。
// ---------------------------------------------------------------------------
function seedRow(input = {}) {
  const activityId = normalizeActivityId(input.activityId ?? input.activity_id);
  if (!activityId) throw unexpected('Midao service draft fixture activity id is invalid');
  const guideId = normalizeActivityId(input.guideId ?? input.guide_id);
  if (!guideId) throw unexpected('Midao service draft fixture guide id is invalid');
  const revisionRaw = input.revision ?? 1;
  if (typeof revisionRaw !== 'number' || !Number.isInteger(revisionRaw) || revisionRaw < 1) {
    throw unexpected('Midao service draft fixture revision must be an integer >= 1');
  }
  const status = input.status ?? 'active';
  if (!DRAFT_STATUSES.has(status)) throw unexpected('Midao service draft fixture status is invalid');
  const payload = input.payload === undefined ? {} : input.payload;
  if (!isPlainObject(payload)) throw unexpected('Midao service draft fixture payload must be an object');
  const updatedAt = input.updatedAt ?? input.updated_at ?? nowIso();
  return {
    activityId,
    guideId,
    revision: revisionRaw,
    status,
    payload: clone(payload),
    updatedAt,
    materialization_origin: input.materializationOrigin ?? input.materialization_origin,
    materialization_review_state: input.materializationReviewState ?? input.materialization_review_state,
  };
}

function toDraftView(row) {
  if (!row) return null;
  return {
    activityId: row.activityId,
    guideId: row.guideId,
    revision: row.revision,
    status: row.status,
    payload: clone(row.payload),
    updatedAt: row.updatedAt,
    materializationOrigin: row.materialization_origin ?? 'native',
    materializationReviewState: row.materialization_review_state ?? null,
  };
}

// 從草稿 payload 組出 S3 發布驗證的輸入（僅供預先提示；status 帶入草稿目前狀態）。
function publicationPreviewFor(status, payload) {
  const draftInput = {
    status,
    name: payload?.name,
    description: payload?.description,
    descriptions: payload?.descriptions,
    plans: payload?.plans,
  };
  const questions = Array.isArray(payload?.questions) ? payload.questions : [];
  return validateServiceForPublication(draftInput, questions);
}

// 存草稿前先驗證問卷題目（若 payload 帶 questions）。回傳逐題錯誤（不 throw）。
function validateQuestionnairePatch(patch) {
  if (!('questions' in patch)) return { valid: true, errors: [], questionErrors: [] };
  const questions = patch.questions;
  if (questions === null || questions === undefined) {
    return { valid: true, errors: [], questionErrors: [] };
  }
  if (!Array.isArray(questions)) {
    return {
      valid: false,
      errors: ['questions 必須是陣列（自訂問卷題目清單；沒有題目時傳空陣列或省略）。'],
      questionErrors: [],
    };
  }
  const errors = [];
  const questionErrors = [];
  questions.forEach((question, index) => {
    const result = validateIntakeQuestion(question);
    if (!result.valid) {
      const keyLabel = isPlainObject(question)
        && typeof question.question_key === 'string'
        && question.question_key.trim().length > 0
        ? question.question_key
        : `#${index + 1}`;
      questionErrors.push({ index, questionKey: keyLabel, errors: result.errors });
      for (const message of result.errors) {
        errors.push(`問卷題目「${keyLabel}」：${message}`);
      }
    }
  });
  return { valid: errors.length === 0, errors, questionErrors };
}

// ---------------------------------------------------------------------------
// 讀取（get）。
// ---------------------------------------------------------------------------
export async function getServiceDraft(activityId) {
  const normalized = normalizeActivityId(activityId);
  if (!normalized) {
    return { ok: false, conflict: false, code: INVALID_ACTIVITY_ID, status: 422, draft: null };
  }
  if (hasSupabaseEnv()) return getInSupabase(normalized);
  return getInMemory(normalized);
}

function getInMemory(activityId) {
  const row = draftStore.get(activityId);
  const active = row && row.status === 'active' ? row : null;
  return { ok: true, conflict: false, code: null, status: 200, draft: toDraftView(active) };
}

// ---------------------------------------------------------------------------
// 建立／更新（upsert，帶 CAS）。
// ---------------------------------------------------------------------------
export async function upsertServiceDraft(activityId, patch, expectedRevision) {
  const normalized = normalizeActivityId(activityId);
  if (!normalized) {
    return { ok: false, conflict: false, code: INVALID_ACTIVITY_ID, status: 422, draft: null };
  }
  if (!isPlainObject(patch)) {
    return { ok: false, conflict: false, code: INVALID_PATCH, status: 422, draft: null };
  }
  const expected = normalizeExpectedRevision(expectedRevision);
  if (expected === null) {
    return { ok: false, conflict: false, code: INVALID_EXPECTED_REVISION, status: 422, draft: null };
  }

  // 存草稿前先擋問卷題目（S2 重用，不重寫）。不合法 → 422，不寫入。
  const questionnaire = validateQuestionnairePatch(patch);
  if (!questionnaire.valid) {
    return {
      ok: false,
      conflict: false,
      code: INVALID_QUESTIONNAIRE,
      status: 422,
      validation: {
        valid: false,
        errors: questionnaire.errors,
        questionErrors: questionnaire.questionErrors,
      },
      draft: null,
    };
  }

  if (hasSupabaseEnv()) return upsertInSupabase(normalized, patch, expected);
  return upsertInMemory(normalized, patch, expected);
}

// patch 只帶草稿表單欄位；guideId 於建立時取自 patch，更新時保留既有（不允許改擁有者）。
function mergePayload(existingPayload, patch) {
  const next = { ...(existingPayload ?? {}) };
  for (const [key, value] of Object.entries(patch)) {
    if (key === 'guideId' || key === 'guide_id') continue;
    next[key] = value;
  }
  return clone(next);
}

function conflictResult(currentActive) {
  return {
    ok: false,
    conflict: true,
    code: CONFLICT,
    status: 409,
    currentRevision: currentActive ? currentActive.revision : null,
    draft: toDraftView(currentActive),
  };
}

function successResult(row) {
  return {
    ok: true,
    conflict: false,
    code: null,
    status: 200,
    draft: toDraftView(row),
    publicationPreview: publicationPreviewFor(row.status, row.payload),
  };
}

function upsertInMemory(activityId, patch, expected) {
  const existing = draftStore.get(activityId);
  const active = existing && existing.status === 'active' ? existing : null;

  if (active) {
    // 既有 active 草稿：CAS 比對 revision。
    if (active.revision !== expected) return conflictResult(active);
    const next = {
      ...active,
      revision: active.revision + 1,
      payload: mergePayload(active.payload, patch),
      updatedAt: nowIso(),
    };
    draftStore.set(activityId, next);
    return successResult(next);
  }

  // 沒有 active 草稿：只有 expected === 0（預期新建）才可建立。
  if (expected !== 0) return conflictResult(null);
  const guideId = normalizeActivityId(patch.guideId ?? patch.guide_id);
  if (!guideId) {
    return { ok: false, conflict: false, code: INVALID_PATCH, status: 422, draft: null };
  }
  const created = {
    activityId,
    guideId,
    revision: 1,
    status: 'active',
    payload: mergePayload({}, patch),
    updatedAt: nowIso(),
  };
  draftStore.set(activityId, created);
  return successResult(created);
}

// ---------------------------------------------------------------------------
// 捨棄草稿（discard，帶 CAS）。
// ---------------------------------------------------------------------------
export async function discardServiceDraft(activityId, expectedRevision) {
  const normalized = normalizeActivityId(activityId);
  if (!normalized) {
    return { ok: false, conflict: false, code: INVALID_ACTIVITY_ID, status: 422, draft: null };
  }
  const expected = normalizeExpectedRevision(expectedRevision);
  if (expected === null || expected < 1) {
    // discard 一定針對既有 active 草稿，revision 必為 >= 1。
    return { ok: false, conflict: false, code: INVALID_EXPECTED_REVISION, status: 422, draft: null };
  }
  if (hasSupabaseEnv()) return discardInSupabase(normalized, expected);
  return discardInMemory(normalized, expected);
}

function discardInMemory(activityId, expected) {
  const existing = draftStore.get(activityId);
  const active = existing && existing.status === 'active' ? existing : null;
  if (!active) {
    return { ok: false, conflict: false, code: NOT_FOUND, status: 404, draft: null };
  }
  if (active.revision !== expected) return conflictResult(active);
  const discarded = {
    ...active,
    revision: active.revision + 1,
    status: 'discarded',
    updatedAt: nowIso(),
  };
  draftStore.set(activityId, discarded);
  return { ok: true, conflict: false, code: null, status: 200, draft: toDraftView(discarded) };
}

// ---------------------------------------------------------------------------
// Supabase parity 路徑（走既有 gateway pattern；CAS 以 .eq('revision', expected) 表達）。
// ---------------------------------------------------------------------------
const DRAFT_SELECT = 'id, activity_id, guide_id, revision, status, payload, updated_at, materialization_origin, materialization_review_state';

function mapSupabaseRow(row) {
  if (!row || typeof row !== 'object') return null;
  const activityId = normalizeActivityId(row.activity_id);
  const guideId = normalizeActivityId(row.guide_id);
  if (!activityId || !guideId) throw unexpected('Midao service draft row identifiers are invalid');
  if (typeof row.revision !== 'number' || !Number.isInteger(row.revision) || row.revision < 1) {
    throw unexpected('Midao service draft row revision is invalid');
  }
  if (!DRAFT_STATUSES.has(row.status)) throw unexpected('Midao service draft row status is invalid');
  const payload = row.payload == null ? {} : row.payload;
  if (!isPlainObject(payload)) throw unexpected('Midao service draft row payload is invalid');
  return {
    activityId,
    guideId,
    revision: row.revision,
    status: row.status,
    payload: clone(payload),
    updatedAt: typeof row.updated_at === 'string' ? row.updated_at : nowIso(),
    materialization_origin: row.materialization_origin,
    materialization_review_state: row.materialization_review_state,
  };
}

async function fetchActiveRow(supabase, activityId) {
  const { data, error } = await supabase
    .from('guide_service_drafts')
    .select(DRAFT_SELECT)
    .eq('activity_id', activityId)
    .eq('status', 'active')
    .maybeSingle();
  if (error) throw unexpected('Midao service draft active lookup failed');
  return mapSupabaseRow(data);
}

async function getInSupabase(activityId) {
  const supabase = await getSupabase();
  const active = await fetchActiveRow(supabase, activityId);
  return { ok: true, conflict: false, code: null, status: 200, draft: toDraftView(active) };
}

async function upsertInSupabase(activityId, patch, expected) {
  const supabase = await getSupabase();
  const active = await fetchActiveRow(supabase, activityId);

  if (active) {
    if (active.revision !== expected) return conflictResult(active);
    const payload = mergePayload(active.payload, patch);
    const { data, error } = await supabase
      .from('guide_service_drafts')
      .update({ revision: active.revision + 1, payload, updated_at: nowIso() })
      .eq('activity_id', activityId)
      .eq('status', 'active')
      .eq('revision', expected)
      .select(DRAFT_SELECT)
      .maybeSingle();
    if (error) throw unexpected('Midao service draft update failed');
    const updated = mapSupabaseRow(data);
    // 0 rows updated → 另一寫入已搶先推進 revision，回讀最新版報 409。
    if (!updated) return conflictResult(await fetchActiveRow(supabase, activityId));
    return successResult(updated);
  }

  if (expected !== 0) return conflictResult(null);
  const guideId = normalizeActivityId(patch.guideId ?? patch.guide_id);
  if (!guideId) {
    return { ok: false, conflict: false, code: INVALID_PATCH, status: 422, draft: null };
  }
  const payload = mergePayload({}, patch);
  const { data, error } = await supabase
    .from('guide_service_drafts')
    .insert({ activity_id: activityId, guide_id: guideId, revision: 1, status: 'active', payload })
    .select(DRAFT_SELECT)
    .maybeSingle();
  if (error) {
    // 只有 unique-violation（partial unique index：單一 active 草稿）才是真正的
    // 「另一 active 草稿已被搶先建立」→ 回 409 讓呼叫端重讀最新版本。
    // 其餘後端錯誤（42501 權限／RLS、23503 外鍵…）一律 throw，與同檔 update
    // (`:400`)／discard (`:442`) 路徑一致，避免把故障偽裝成版本衝突而形成
    // 無法復原的重試迴圈，並保留 RLS 安全訊號。
    if (error.code !== UNIQUE_VIOLATION) {
      throw unexpected('Midao service draft insert failed');
    }
    return conflictResult(await fetchActiveRow(supabase, activityId));
  }
  const created = mapSupabaseRow(data);
  if (!created) throw unexpected('Midao service draft insert returned no row');
  return successResult(created);
}

async function discardInSupabase(activityId, expected) {
  const supabase = await getSupabase();
  const active = await fetchActiveRow(supabase, activityId);
  if (!active) {
    return { ok: false, conflict: false, code: NOT_FOUND, status: 404, draft: null };
  }
  if (active.revision !== expected) return conflictResult(active);
  const { data, error } = await supabase
    .from('guide_service_drafts')
    .update({ revision: active.revision + 1, status: 'discarded', updated_at: nowIso() })
    .eq('activity_id', activityId)
    .eq('status', 'active')
    .eq('revision', expected)
    .select(DRAFT_SELECT)
    .maybeSingle();
  if (error) throw unexpected('Midao service draft discard failed');
  const discarded = mapSupabaseRow(data);
  if (!discarded) return conflictResult(await fetchActiveRow(supabase, activityId));
  return { ok: true, conflict: false, code: null, status: 200, draft: toDraftView(discarded) };
}

export const __internal = {
  normalizeActivityId,
  normalizeExpectedRevision,
  publicationPreviewFor,
  validateQuestionnairePatch,
};
