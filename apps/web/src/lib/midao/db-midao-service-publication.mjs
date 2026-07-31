// #1758 S7 · Task 28 — 服務草稿「一鍵發布」gateway 層。
//
// 目標（白話）：把 S6 的原子發布 RPC（midao_publish_service_draft）接上應用層，讓前端
// 真的能按下「發布」按鈕。本層只做兩件事：
//   1. 發布前先用 S3 validateServiceForPublication 做「送得出去嗎」的預先檢查——不完整的
//      草稿直接擋在應用層（回 VALIDATION_FAILED），不必打 DB、也不必進 RPC 交易。
//   2. 把 S6 RPC（Supabase 路徑）或等價的 in-memory parity（測試路徑）回應「正確轉譯」成
//      結構化物件，不重新發明發布邏輯。
//
// 沿用專案既有 gateway pattern（db-booking-commands.mjs / db-midao-service-drafts.mjs）：
//   - 不寫進 db.mjs（strangler 硬規則），本領域檔放在 src/lib/midao/ 子資料夾
//     （避開 architecture-ratchet 的 src/lib 頂層攤平天花板）。
//   - in-memory store 與 Supabase RPC 走一致行為（parity）；`hasSupabaseEnv()` 決定走哪條。
//   - 對外「不 throw 預期結果」：成功／版本衝突／slug 衝突／驗證失敗都回傳結構化物件，
//     只有非預期後端錯誤才 throw。
//
// 對外結構化回應（供 route 直接映射 HTTP）：
//   - 成功            → { ok: true, status: 200, code: 'PUBLISHED' | 'IDEMPOTENT_NO_OP',
//                          publicUrl, version, activityId, idempotent }
//   - 版本衝突        → { ok: false, code: 'REVISION_CONFLICT', status: 409, currentRevision, draft }
//   - slug 衝突       → { ok: false, code: 'SLUG_COLLISION', status: 409 }
//   - 發布前驗證失敗  → { ok: false, code: 'VALIDATION_FAILED', status: 422, errors }
//   - 擁有權不符      → { ok: false, code: 'OWNERSHIP_MISMATCH', status: 404 }
//   - 找不到可發布草稿→ { ok: false, code: 'DRAFT_NOT_FOUND', status: 404 }
//   - 找不到活動      → { ok: false, code: 'ACTIVITY_NOT_FOUND', status: 404 }
//   - 輸入不合法      → { ok: false, code: 'INVALID_*', status: 422 }
//
// 檢查順序（in-memory 與 Supabase parity 一致）：先抓 active 草稿 → 若有草稿先跑 S3 驗證
// （invalid 直接 422，不進 RPC）→ 預先偵測草稿內重複 plan slug（SLUG_COLLISION，避免讓
// RPC 交易撞 21000 才失敗）→ 才進 RPC / in-memory 發布（RPC 內再做擁有權 CAS、版本 CAS、
// 原子寫入）。因此「草稿不完整」的 VALIDATION_FAILED(422) 會優先於版本衝突(409) 回覆——
// 不完整的草稿無論版本對不對都不該被發布，此為 by-design。
//
// Idempotent replay：同一 expectedRevision 重複呼叫且該次已成功發布過（草稿已被 RPC 刪除）
// → 回同一個成功結果（IDEMPOTENT_NO_OP），不重複寫入。此語意沿用 S6 RPC 的設計，gateway
// 只負責正確轉譯，不自行重放。
//
// 相依：
//   - S6 midao_publish_service_draft(uuid, integer, uuid) RPC（Supabase 路徑；原子發布）。
//   - S4 getServiceDraft（Supabase 路徑抓 active 草稿供 S3 預檢，重用不重寫）。
//   - S3 validateServiceForPublication（發布前驗證，重用不重寫）。

import { getSupabase, hasSupabaseEnv } from '../supabase-env.mjs';
import { getSiteBaseUrl } from '../../config/env.ts';
import { validateServiceForPublication } from './service-publication.ts';
import { getServiceDraft } from './db-midao-service-drafts.mjs';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const DRAFT_STATUSES = new Set(['active', 'discarded', 'published']);

// PostgreSQL error 碼：唯一可被視為「slug 衝突」的 RPC 失敗原因。
//   23505 unique_violation：activity_plans (activity_id, slug) 撞既有唯一鍵。
//   21000 cardinality_violation：同一 INSERT ... ON CONFLICT 批次內兩列同 slug
//          （「ON CONFLICT DO UPDATE command cannot affect row a second time」）。
const UNIQUE_VIOLATION = '23505';
const CARDINALITY_VIOLATION = '21000';

// ---------------------------------------------------------------------------
// in-memory parity store（測試 seam；比照 db-midao-service-drafts.mjs 命名慣例）。
//   draftStore   : activityId → { activityId, guideId, revision, status:'active', payload }
//   activityStore: activityId → { slug, region, regionSlug }（供組 publicUrl）
//   versionStore : activityId → 最新已發布版本號（idempotent 判定與版本遞增用）
// ---------------------------------------------------------------------------
const draftStore = new Map();
const activityStore = new Map();
const versionStore = new Map();
let nowProvider = () => new Date().toISOString();

export function __resetMidaoServicePublicationStoreForTest() {
  draftStore.clear();
  activityStore.clear();
  versionStore.clear();
}

export function __seedMidaoServicePublicationDraftForTest(input = {}) {
  const activityId = normalizeUuid(input.activityId ?? input.activity_id);
  if (!activityId) throw unexpected('Midao service publication fixture activity id is invalid');
  const guideId = normalizeUuid(input.guideId ?? input.guide_id);
  if (!guideId) throw unexpected('Midao service publication fixture guide id is invalid');
  const revisionRaw = input.revision ?? 1;
  if (typeof revisionRaw !== 'number' || !Number.isInteger(revisionRaw) || revisionRaw < 1) {
    throw unexpected('Midao service publication fixture revision must be an integer >= 1');
  }
  const status = input.status ?? 'active';
  if (!DRAFT_STATUSES.has(status)) throw unexpected('Midao service publication fixture status is invalid');
  const payload = input.payload === undefined ? {} : input.payload;
  if (!isPlainObject(payload)) throw unexpected('Midao service publication fixture payload must be an object');
  const row = { activityId, guideId, revision: revisionRaw, status, payload: clone(payload) };
  draftStore.set(activityId, row);
  return clone(row);
}

export function __seedMidaoServicePublicationActivityForTest(input = {}) {
  const activityId = normalizeUuid(input.activityId ?? input.activity_id);
  if (!activityId) throw unexpected('Midao service publication fixture activity id is invalid');
  const record = {
    slug: typeof input.slug === 'string' ? input.slug : null,
    region: typeof input.region === 'string' ? input.region : null,
    regionSlug: typeof (input.regionSlug ?? input.region_slug) === 'string'
      ? String(input.regionSlug ?? input.region_slug)
      : null,
  };
  activityStore.set(activityId, record);
  return clone(record);
}

export function __seedMidaoServicePublicationVersionForTest(input = {}) {
  const activityId = normalizeUuid(input.activityId ?? input.activity_id);
  if (!activityId) throw unexpected('Midao service publication fixture activity id is invalid');
  const versionRaw = input.version ?? 1;
  if (typeof versionRaw !== 'number' || !Number.isInteger(versionRaw) || versionRaw < 1) {
    throw unexpected('Midao service publication fixture version must be an integer >= 1');
  }
  versionStore.set(activityId, versionRaw);
  return versionRaw;
}

export function __setMidaoServicePublicationClockForTest(clock) {
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

// ---------------------------------------------------------------------------
// 共用工具。
// ---------------------------------------------------------------------------
function unexpected(message = 'Midao service publication backend failure') {
  const error = new Error(message);
  error.name = 'MidaoServicePublicationBackendError';
  return error;
}

function clone(value) {
  return structuredClone(value);
}

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeUuid(value) {
  if (typeof value !== 'string' || !UUID_PATTERN.test(value.trim())) return null;
  return value.trim().toLowerCase();
}

// publish 一定針對既有 active 草稿，revision 必為 >= 1（比照 S6 RPC 的參數約束）。
function normalizePublishRevision(value) {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) return null;
  return value;
}

function invalidResult(code) {
  return { ok: false, conflict: false, code, status: 422, draft: null };
}

// 站台 base URL（無尾斜線）：走 src/config/env.ts 的集中 getter（符合 env 直讀 ratchet，
// 純資料 gateway 不直接讀環境變數）。getSiteBaseUrl 已自帶 fallback。
function appBaseUrl() {
  return String(getSiteBaseUrl()).trim().replace(/\/+$/u, '');
}

// 由 activity 的 slug + region 組 canonical 詳情頁絕對 URL。
//
// 刻意「不」import buildActivityHref()／region-slug.mjs：那條鏈會拉進 i18n/routing.ts →
// next-intl（edge/中介層依賴），把純資料 gateway 綁上前端路由與 i18n runtime，且在無
// node_modules 的環境無法載入。改用 activities 表已儲存、正規化過的 region_slug 作為路徑
// segment（缺漏時退回 raw region），與 activity-jsonld.mjs / 詳情頁 buildActivityProductJsonLd
// 相同的 `${appUrl}/activities/${regionSegment}/${slug}` 形狀；slug 缺漏時退回列表頁
// `/activities`，不 throw。region_slug 由建立活動時寫入，作為 canonical segment 已足夠，
// 不需在發布後路徑再跑一次 region 正規化。
function buildPublicUrl(activity) {
  const slug = typeof activity?.slug === 'string' ? activity.slug.trim() : '';
  if (!slug) return `${appBaseUrl()}/activities`;
  const regionSegment = typeof (activity?.regionSlug ?? activity?.region_slug) === 'string'
    && String(activity.regionSlug ?? activity.region_slug).trim()
    ? String(activity.regionSlug ?? activity.region_slug).trim()
    : (typeof activity?.region === 'string' ? activity.region.trim() : '');
  const path = regionSegment
    ? `/activities/${encodeURIComponent(regionSegment)}/${encodeURIComponent(slug)}`
    : `/activities/${encodeURIComponent(slug)}`;
  return `${appBaseUrl()}${path}`;
}

// 從草稿 payload 組出 S3 發布驗證輸入（status 帶入草稿目前狀態）。
function publicationValidationInput(draft) {
  const payload = draft?.payload ?? {};
  const draftInput = {
    status: draft?.status,
    name: payload?.name,
    description: payload?.description,
    descriptions: payload?.descriptions,
    plans: payload?.plans,
  };
  const questions = Array.isArray(payload?.questions) ? payload.questions : [];
  return validateServiceForPublication(draftInput, questions);
}

// 預先偵測草稿內是否有兩個 plan 帶相同的「明確 slug」——這正是 S6 RPC 的
// INSERT ... ON CONFLICT (activity_id, slug) 會在同批次撞 21000 的情況。空 slug 由 RPC
// 依 ordinal 產生唯一 fallback，不會互撞，故只看明確非空 slug 的重複。
function hasDuplicatePlanSlug(payload) {
  const plans = Array.isArray(payload?.plans) ? payload.plans : [];
  const seen = new Set();
  for (const plan of plans) {
    if (!isPlainObject(plan)) continue;
    const raw = typeof plan.slug === 'string' ? plan.slug.trim().toLowerCase() : '';
    if (!raw) continue;
    if (seen.has(raw)) return true;
    seen.add(raw);
  }
  return false;
}

function draftView(row) {
  if (!row) return null;
  return {
    activityId: row.activityId,
    guideId: row.guideId,
    revision: row.revision,
    status: row.status,
    payload: clone(row.payload),
  };
}

function conflictResult(activeRow) {
  return {
    ok: false,
    conflict: true,
    code: 'REVISION_CONFLICT',
    status: 409,
    currentRevision: activeRow ? activeRow.revision : null,
    draft: draftView(activeRow),
  };
}

function slugCollisionResult() {
  return { ok: false, conflict: false, code: 'SLUG_COLLISION', status: 409, draft: null };
}

function validationFailedResult(errors) {
  return {
    ok: false,
    conflict: false,
    code: 'VALIDATION_FAILED',
    status: 422,
    errors: Array.isArray(errors) ? errors : [],
    draft: null,
  };
}

function ownershipMismatchResult() {
  return { ok: false, conflict: false, code: 'OWNERSHIP_MISMATCH', status: 404, draft: null };
}

function draftNotFoundResult() {
  return { ok: false, conflict: false, code: 'DRAFT_NOT_FOUND', status: 404, draft: null };
}

function activityNotFoundResult() {
  return { ok: false, conflict: false, code: 'ACTIVITY_NOT_FOUND', status: 404, draft: null };
}

function successResult({ activityId, version, publicUrl, idempotent, code }) {
  return {
    ok: true,
    conflict: false,
    code: code ?? (idempotent ? 'IDEMPOTENT_NO_OP' : 'PUBLISHED'),
    status: 200,
    activityId,
    version,
    publicUrl,
    idempotent: Boolean(idempotent),
  };
}

// 發布前共通閘門（in-memory 與 Supabase 皆先跑）：S3 驗證 + 重複 slug 偵測。
// 回 null 代表通過；否則回結構化失敗結果。
function preflightGate(draft) {
  const validation = publicationValidationInput(draft);
  if (!validation.valid) return validationFailedResult(validation.errors);
  if (hasDuplicatePlanSlug(draft?.payload)) return slugCollisionResult();
  return null;
}

// ---------------------------------------------------------------------------
// 對外主函式。
// ---------------------------------------------------------------------------
export async function publishServiceDraft(activityId, expectedRevision, guideId) {
  const normalizedActivityId = normalizeUuid(activityId);
  if (!normalizedActivityId) return invalidResult('INVALID_ACTIVITY_ID');
  const normalizedGuideId = normalizeUuid(guideId);
  if (!normalizedGuideId) return invalidResult('INVALID_GUIDE_ID');
  const expected = normalizePublishRevision(expectedRevision);
  if (expected === null) return invalidResult('INVALID_EXPECTED_REVISION');

  if (hasSupabaseEnv()) {
    return publishInSupabase(normalizedActivityId, expected, normalizedGuideId);
  }
  return publishInMemory(normalizedActivityId, expected, normalizedGuideId);
}

// ---------------------------------------------------------------------------
// in-memory parity 路徑。
// ---------------------------------------------------------------------------
function publishInMemory(activityId, expected, guideId) {
  const existing = draftStore.get(activityId);
  const active = existing && existing.status === 'active' ? existing : null;

  if (!active) {
    // 無 active 草稿：已發布過 → idempotent 成功；從未發布 → 404。
    const priorVersion = versionStore.get(activityId);
    if (priorVersion) {
      return successResult({
        activityId,
        version: priorVersion,
        publicUrl: buildPublicUrl(activityStore.get(activityId)),
        idempotent: true,
      });
    }
    return draftNotFoundResult();
  }

  // 發布前閘門：S3 驗證 + 重複 slug 偵測（與 Supabase 路徑同順序）。
  const gate = preflightGate(active);
  if (gate) return gate;

  // RPC parity：擁有權 → 版本 CAS（皆回結構化訊號，不 throw）。
  if (active.guideId !== guideId) return ownershipMismatchResult();
  if (active.revision !== expected) return conflictResult(active);

  // 原子發布：刪草稿、版本遞增（沿用 S6 RPC 的 version = 前版 + 1）。
  draftStore.delete(activityId);
  const nextVersion = (versionStore.get(activityId) ?? 0) + 1;
  versionStore.set(activityId, nextVersion);

  return successResult({
    activityId,
    version: nextVersion,
    publicUrl: buildPublicUrl(activityStore.get(activityId)),
    idempotent: false,
  });
}

// ---------------------------------------------------------------------------
// Supabase 路徑（呼叫 S6 原子 RPC；發布前先在應用層跑 S3 驗證）。
// ---------------------------------------------------------------------------
async function fetchActivityPublicUrl(supabase, activityId) {
  const { data, error } = await supabase
    .from('activities')
    .select('slug, region, region_slug')
    .eq('id', activityId)
    .maybeSingle();
  if (error) throw unexpected('Midao service publication activity lookup failed');
  return buildPublicUrl(data);
}

// 把 RPC 回傳的錯誤（error 物件）分類：只有 slug 衝突（23505/21000）與 ACTIVITY_NOT_FOUND
// 轉結構化結果，其餘後端錯誤一律 throw（避免把 RLS/FK 故障偽裝成業務結果）。
function classifyRpcError(error) {
  const code = error?.code;
  if (code === UNIQUE_VIOLATION || code === CARDINALITY_VIOLATION) return slugCollisionResult();
  const token = [error?.message, error?.details, error?.hint]
    .filter((value) => typeof value === 'string')
    .join(' ')
    .toUpperCase();
  if (token.includes('ACTIVITY_NOT_FOUND')) return activityNotFoundResult();
  if (token.includes('OWNERSHIP_MISMATCH')) return ownershipMismatchResult();
  if (token.includes('REVISION_CONFLICT')) return conflictResult(null);
  if (token.includes('DRAFT_NOT_FOUND')) return draftNotFoundResult();
  return null;
}

async function publishInSupabase(activityId, expected, guideId) {
  const supabase = await getSupabase();

  // 發布前預檢：抓 active 草稿（S4 重用），若有草稿先跑 S3 驗證 + 重複 slug 偵測，
  // 不完整 / 撞 slug 直接擋在應用層，不進 RPC 交易。
  const draftLookup = await getServiceDraft(activityId);
  const activeDraft = draftLookup?.draft ?? null;
  if (activeDraft) {
    const gate = preflightGate(activeDraft);
    if (gate) return gate;
  }

  // 進 S6 原子 RPC：擁有權 CAS、版本 CAS、canonical 寫入、草稿清除、outbox 都在單交易內。
  let response;
  try {
    response = await supabase.rpc('midao_publish_service_draft', {
      p_activity_id: activityId,
      p_expected_revision: expected,
      p_guide_id: guideId,
    });
  } catch (error) {
    const classified = classifyRpcError(error);
    if (classified) return classified;
    throw unexpected('Midao service publication RPC call failed');
  }

  if (response?.error) {
    const classified = classifyRpcError(response.error);
    if (classified) return classified;
    throw unexpected('Midao service publication RPC returned an error');
  }

  return mapRpcData(supabase, activityId, response?.data);
}

async function mapRpcData(supabase, activityId, data) {
  if (!isPlainObject(data)) throw unexpected('Midao service publication RPC returned an invalid payload');
  const code = data.code;

  if (code === 'PUBLISHED' || code === 'IDEMPOTENT_NO_OP') {
    const version = data.version;
    if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
      throw unexpected('Midao service publication RPC returned an invalid version');
    }
    return successResult({
      activityId,
      version,
      publicUrl: await fetchActivityPublicUrl(supabase, activityId),
      idempotent: code === 'IDEMPOTENT_NO_OP',
      code,
    });
  }

  if (code === 'REVISION_CONFLICT') {
    const currentRevision = typeof data.currentRevision === 'number' ? data.currentRevision : null;
    // RPC 回目前版本供前端重讀；gateway 不另抓草稿列（RPC 未回完整 draft，交由 route 呼叫
    // getServiceDraft 或前端重讀）。draft 帶 null，currentRevision 帶 RPC 版本。
    return { ok: false, conflict: true, code: 'REVISION_CONFLICT', status: 409, currentRevision, draft: null };
  }
  if (code === 'OWNERSHIP_MISMATCH') return ownershipMismatchResult();
  if (code === 'DRAFT_NOT_FOUND') return draftNotFoundResult();

  throw unexpected(`Midao service publication RPC returned an unrecognized code: ${String(code)}`);
}

export const __internal = {
  normalizeUuid,
  normalizePublishRevision,
  hasDuplicatePlanSlug,
  buildPublicUrl,
  publicationValidationInput,
  classifyRpcError,
};
