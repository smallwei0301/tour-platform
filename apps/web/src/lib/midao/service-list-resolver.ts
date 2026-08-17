// #1758 S8 · Task 29 — guide 服務清單 resolver（application-layer，無新 migration）。
//
// 目標（白話）：讓導遊在後台看到「自己名下所有服務項目」的分頁清單，涵蓋還在草稿
// 狀態、已發布的，並顯示每個服務的價格區間（最低／最高方案價），支援分頁瀏覽。
//
// 沿用專案既有 gateway pattern（db-midao-service-drafts.mjs / db-midao-service-publication.mjs）：
//   - 不寫進 db.mjs（strangler 硬規則），本領域檔放在 src/lib/midao/ 子資料夾
//     （避開 architecture-ratchet 的 src/lib 頂層攤平天花板）。
//   - in-memory store 與 Supabase 走一致行為（parity）；`hasSupabaseEnv()` 決定走哪條。
//   - 對外只回讀取結果，不 throw 預期業務狀態；只有非預期後端錯誤才 throw。
//
// 顯示狀態（display status）語意（依 Pandora S8 spec）：
//   - 有 publication version（已發布）      → 'published'
//   - 有 active draft（進行中草稿）          → 'draft'
//   - 兩者皆有                                → 以 draft 優先顯示，並標記 hasUnpublishedChanges=true
//   - 皆無                                    → 非服務項目，不列入清單
//
// 價格區間：取自 activity_plans 的 canonical `base_price` 欄位（見
// apps/web/src/components/admin/activity-plans/plan-types.ts 的 ActivityPlan.base_price）；
// 取該活動所有方案 base_price 的 min／max，沒有任何有效方案時 min/max 皆為 null。
//
// 相依：
//   - S1 schema（guide_service_drafts、service_publication_versions；activities/activity_plans 既有）。

import { getSupabase, hasSupabaseEnv } from '../supabase-env.mjs';
import { isMidaoLegacyDraftMaterializationEnabledForGuide } from '../../config/feature-flags.mjs';
import { ensureLegacyServiceDraftMaterialized } from './db-legacy-service-draft-materialization.mjs';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export const DEFAULT_PAGE_SIZE = 20;
// 分頁上限比照既有 list gateway 慣例（db-requests.mjs MAX_LIMIT = 50）。
export const MAX_PAGE_SIZE = 50;

export type ServiceListStatusFilter = 'all' | 'draft' | 'published';
const STATUS_FILTERS: ReadonlySet<ServiceListStatusFilter> = new Set([
  'all',
  'draft',
  'published',
] as const);

export type ServiceDisplayStatus = 'draft' | 'published';

export interface ServiceListItem {
  activityId: string;
  title: string | null;
  slug: string | null;
  status: ServiceDisplayStatus;
  hasUnpublishedChanges: boolean;
  minPrice: number | null;
  maxPrice: number | null;
  publishedVersion: number | null;
  draftRevision: number | null;
  updatedAt: string | null;
}

export interface ServiceListResult {
  items: ServiceListItem[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface ServiceListQuery {
  page?: unknown;
  pageSize?: unknown;
  status?: unknown;
}

export class InvalidServiceListQueryError extends Error {
  readonly code = 'INVALID_REQUEST_QUERY';
  readonly status = 422;

  constructor(message = 'Invalid service list query') {
    super(message);
    this.name = 'InvalidServiceListQueryError';
  }
}

function unexpected(message = 'Midao service list backend failure'): Error {
  const error = new Error(message);
  error.name = 'MidaoServiceListBackendError';
  return error;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeUuid(value: unknown): string | null {
  if (typeof value !== 'string' || !UUID_PATTERN.test(value.trim())) return null;
  return value.trim().toLowerCase();
}

function normalizePage(value: unknown): number {
  if (value === undefined || value === null || value === '') return 1;
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new InvalidServiceListQueryError('page must be an integer >= 1');
  }
  return parsed;
}

function normalizePageSize(value: unknown): number {
  if (value === undefined || value === null || value === '') return DEFAULT_PAGE_SIZE;
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > MAX_PAGE_SIZE) {
    throw new InvalidServiceListQueryError(`pageSize must be an integer between 1 and ${MAX_PAGE_SIZE}`);
  }
  return parsed;
}

function normalizeStatus(value: unknown): ServiceListStatusFilter {
  if (value === undefined || value === null || value === '') return 'all';
  if (typeof value !== 'string' || !STATUS_FILTERS.has(value as ServiceListStatusFilter)) {
    throw new InvalidServiceListQueryError('status must be one of all / draft / published');
  }
  return value as ServiceListStatusFilter;
}

function coercePrice(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return parsed;
}

// ---------------------------------------------------------------------------
// in-memory parity store（測試 seam；比照 db-midao-service-publication.mjs 命名慣例）。
//   activityStore : activityId → { activityId, guideId, title, slug, updatedAt }
//   planStore     : activityId → number[]（每個方案的 base_price）
//   draftStore    : activityId → { revision }（active 草稿；只保留 active）
//   versionStore  : activityId → number（最新已發布版本號）
// ---------------------------------------------------------------------------
interface ActivityRecord {
  activityId: string;
  guideId: string;
  title: string | null;
  slug: string | null;
  legacyStatus: string | null;
  updatedAt: string | null;
}

export interface ServiceListDependencies {
  materializationEnabled?: boolean;
  ensureLegacyDraftMaterialized?: typeof ensureLegacyServiceDraftMaterialized;
}

const activityStore = new Map<string, ActivityRecord>();
const planStore = new Map<string, number[]>();
const draftStore = new Map<string, { revision: number }>();
const versionStore = new Map<string, number>();

export function __resetMidaoServiceListStoreForTest(): void {
  activityStore.clear();
  planStore.clear();
  draftStore.clear();
  versionStore.clear();
}

export function __seedMidaoServiceListActivityForTest(input: Record<string, unknown> = {}): ActivityRecord {
  const activityId = normalizeUuid(input.activityId ?? input.activity_id);
  if (!activityId) throw unexpected('Midao service list fixture activity id is invalid');
  const guideId = normalizeUuid(input.guideId ?? input.guide_id);
  if (!guideId) throw unexpected('Midao service list fixture guide id is invalid');
  const record: ActivityRecord = {
    activityId,
    guideId,
    title: typeof input.title === 'string' ? input.title : null,
    slug: typeof input.slug === 'string' ? input.slug : null,
    legacyStatus: typeof input.status === 'string' ? input.status : null,
    updatedAt: typeof (input.updatedAt ?? input.updated_at) === 'string'
      ? String(input.updatedAt ?? input.updated_at)
      : null,
  };
  activityStore.set(activityId, record);
  return { ...record };
}

export function __seedMidaoServiceListPlanForTest(input: Record<string, unknown> = {}): void {
  const activityId = normalizeUuid(input.activityId ?? input.activity_id);
  if (!activityId) throw unexpected('Midao service list fixture plan activity id is invalid');
  const price = coercePrice(input.basePrice ?? input.base_price);
  const existing = planStore.get(activityId) ?? [];
  if (price !== null) existing.push(price);
  planStore.set(activityId, existing);
}

export function __seedMidaoServiceListDraftForTest(input: Record<string, unknown> = {}): void {
  const activityId = normalizeUuid(input.activityId ?? input.activity_id);
  if (!activityId) throw unexpected('Midao service list fixture draft activity id is invalid');
  const status = input.status ?? 'active';
  if (status !== 'active') return; // 只有 active 草稿計入 draft 狀態。
  const revisionRaw = input.revision ?? 1;
  if (typeof revisionRaw !== 'number' || !Number.isInteger(revisionRaw) || revisionRaw < 1) {
    throw unexpected('Midao service list fixture draft revision must be an integer >= 1');
  }
  draftStore.set(activityId, { revision: revisionRaw });
}

export function __seedMidaoServiceListVersionForTest(input: Record<string, unknown> = {}): void {
  const activityId = normalizeUuid(input.activityId ?? input.activity_id);
  if (!activityId) throw unexpected('Midao service list fixture version activity id is invalid');
  const versionRaw = input.version ?? 1;
  if (typeof versionRaw !== 'number' || !Number.isInteger(versionRaw) || versionRaw < 1) {
    throw unexpected('Midao service list fixture version must be an integer >= 1');
  }
  const prior = versionStore.get(activityId);
  versionStore.set(activityId, prior === undefined ? versionRaw : Math.max(prior, versionRaw));
}

// ---------------------------------------------------------------------------
// 純組裝：把某 guide 的活動 + 方案價 + active 草稿 + 發布版本，組成分頁清單結果。
// ---------------------------------------------------------------------------
interface AssembleInput {
  activities: ActivityRecord[];
  pricesByActivity: Map<string, number[]>;
  draftRevisionByActivity: Map<string, number>;
  versionByActivity: Map<string, number>;
  status: ServiceListStatusFilter;
  page: number;
  pageSize: number;
}

function priceRange(prices: number[] | undefined): { minPrice: number | null; maxPrice: number | null } {
  if (!Array.isArray(prices) || prices.length === 0) return { minPrice: null, maxPrice: null };
  let min = prices[0];
  let max = prices[0];
  for (const price of prices) {
    if (price < min) min = price;
    if (price > max) max = price;
  }
  return { minPrice: min, maxPrice: max };
}

function buildItem(
  activity: ActivityRecord,
  input: AssembleInput,
): ServiceListItem | null {
  const draftRevision = input.draftRevisionByActivity.get(activity.activityId) ?? null;
  const publishedVersion = input.versionByActivity.get(activity.activityId) ?? null;
  const hasDraft = draftRevision !== null;
  const hasPublished = publishedVersion !== null;

  // 皆無 → 尚非服務項目，不列入清單。
  if (!hasDraft && !hasPublished) return null;

  // 兩者皆有時以 draft 優先顯示，並標記「有未發布變更」。
  const status: ServiceDisplayStatus = hasDraft ? 'draft' : 'published';
  const hasUnpublishedChanges = hasDraft && hasPublished;

  const { minPrice, maxPrice } = priceRange(input.pricesByActivity.get(activity.activityId));

  return {
    activityId: activity.activityId,
    title: activity.title,
    slug: activity.slug,
    status,
    hasUnpublishedChanges,
    minPrice,
    maxPrice,
    publishedVersion,
    draftRevision,
    updatedAt: activity.updatedAt,
  };
}

// updated_at desc（缺漏排在最後）→ activityId 做穩定 tiebreak。
function compareItems(left: ServiceListItem, right: ServiceListItem): number {
  const leftAt = left.updatedAt ?? '';
  const rightAt = right.updatedAt ?? '';
  if (leftAt !== rightAt) return rightAt.localeCompare(leftAt);
  return left.activityId.localeCompare(right.activityId);
}

function assembleServiceList(input: AssembleInput): ServiceListResult {
  const built = input.activities
    .map((activity) => buildItem(activity, input))
    .filter((item): item is ServiceListItem => item !== null)
    .filter((item) => input.status === 'all' || item.status === input.status)
    .sort(compareItems);

  const total = built.length;
  const totalPages = total === 0 ? 0 : Math.ceil(total / input.pageSize);
  const start = (input.page - 1) * input.pageSize;
  const items = built.slice(start, start + input.pageSize);

  return { items, page: input.page, pageSize: input.pageSize, total, totalPages };
}

// ---------------------------------------------------------------------------
// 對外主函式。
// ---------------------------------------------------------------------------
export async function resolveGuideServiceList(
  guideId: unknown,
  query: ServiceListQuery = {},
  dependencies: ServiceListDependencies = {},
): Promise<ServiceListResult> {
  const normalizedGuideId = normalizeUuid(guideId);
  if (!normalizedGuideId) throw new InvalidServiceListQueryError('guideId must be a UUID');

  const page = normalizePage(query.page);
  const pageSize = normalizePageSize(query.pageSize);
  const status = normalizeStatus(query.status);

  if (hasSupabaseEnv()) {
    return resolveInSupabase(normalizedGuideId, { page, pageSize, status }, {
      materializationEnabled: dependencies.materializationEnabled
        ?? isMidaoLegacyDraftMaterializationEnabledForGuide(normalizedGuideId),
      ensureLegacyDraftMaterialized: dependencies.ensureLegacyDraftMaterialized ?? ensureLegacyServiceDraftMaterialized,
    });
  }
  return resolveInMemory(normalizedGuideId, { page, pageSize, status });
}

function resolveInMemory(
  guideId: string,
  { page, pageSize, status }: { page: number; pageSize: number; status: ServiceListStatusFilter },
): ServiceListResult {
  const activities = [...activityStore.values()].filter((activity) => activity.guideId === guideId);
  const draftRevisionByActivity = new Map<string, number>();
  for (const activity of activities) {
    const draft = draftStore.get(activity.activityId);
    if (draft) draftRevisionByActivity.set(activity.activityId, draft.revision);
  }
  const versionByActivity = new Map<string, number>();
  for (const activity of activities) {
    const version = versionStore.get(activity.activityId);
    if (version !== undefined) versionByActivity.set(activity.activityId, version);
  }
  const pricesByActivity = new Map<string, number[]>();
  for (const activity of activities) {
    const prices = planStore.get(activity.activityId);
    if (prices) pricesByActivity.set(activity.activityId, [...prices]);
  }

  return assembleServiceList({
    activities,
    pricesByActivity,
    draftRevisionByActivity,
    versionByActivity,
    status,
    page,
    pageSize,
  });
}

async function resolveInSupabase(
  guideId: string,
  { page, pageSize, status }: { page: number; pageSize: number; status: ServiceListStatusFilter },
  dependencies: Required<ServiceListDependencies>,
): Promise<ServiceListResult> {
  const supabase = await getSupabase();

  const { data: activityRows, error: activityError } = await supabase
    .from('activities')
    .select('id, title, slug, status, updated_at')
    .eq('guide_id', guideId);
  if (activityError) throw unexpected('Midao service list activity lookup failed');

  const activities: ActivityRecord[] = (Array.isArray(activityRows) ? activityRows : [])
    .map((row: Record<string, unknown>) => {
      const activityId = normalizeUuid(row.id);
      if (!activityId) return null;
      return {
        activityId,
        guideId,
        title: typeof row.title === 'string' ? row.title : null,
        slug: typeof row.slug === 'string' ? row.slug : null,
        legacyStatus: typeof row.status === 'string' ? row.status : null,
        updatedAt: typeof row.updated_at === 'string' ? row.updated_at : null,
      };
    })
    .filter((record): record is ActivityRecord => record !== null);

  if (activities.length === 0) {
    return { items: [], page, pageSize, total: 0, totalPages: 0 };
  }

  const ids = activities.map((activity) => activity.activityId);

  const [{ data: planRows, error: planError }, { data: draftRows, error: draftError }, { data: versionRows, error: versionError }] =
    await Promise.all([
      supabase.from('activity_plans').select('activity_id, base_price').in('activity_id', ids),
      supabase
        .from('guide_service_drafts')
        .select('activity_id, revision, status')
        .eq('status', 'active')
        .in('activity_id', ids),
      supabase.from('service_publication_versions').select('activity_id, version').in('activity_id', ids),
    ]);
  if (planError) throw unexpected('Midao service list plan lookup failed');
  if (draftError) throw unexpected('Midao service list draft lookup failed');
  if (versionError) throw unexpected('Midao service list version lookup failed');

  const pricesByActivity = new Map<string, number[]>();
  for (const row of Array.isArray(planRows) ? planRows : []) {
    if (!isPlainObject(row)) continue;
    const activityId = normalizeUuid(row.activity_id);
    if (!activityId) continue;
    const price = coercePrice(row.base_price);
    if (price === null) continue;
    const existing = pricesByActivity.get(activityId) ?? [];
    existing.push(price);
    pricesByActivity.set(activityId, existing);
  }

  const draftRevisionByActivity = new Map<string, number>();
  for (const row of Array.isArray(draftRows) ? draftRows : []) {
    if (!isPlainObject(row)) continue;
    const activityId = normalizeUuid(row.activity_id);
    if (!activityId) continue;
    const revision = typeof row.revision === 'number' && Number.isInteger(row.revision) && row.revision >= 1
      ? row.revision
      : null;
    if (revision === null) continue;
    const prior = draftRevisionByActivity.get(activityId);
    draftRevisionByActivity.set(activityId, prior === undefined ? revision : Math.max(prior, revision));
  }

  const versionByActivity = new Map<string, number>();
  for (const row of Array.isArray(versionRows) ? versionRows : []) {
    if (!isPlainObject(row)) continue;
    const activityId = normalizeUuid(row.activity_id);
    if (!activityId) continue;
    const version = typeof row.version === 'number' && Number.isInteger(row.version) && row.version >= 1
      ? row.version
      : null;
    if (version === null) continue;
    const prior = versionByActivity.get(activityId);
    versionByActivity.set(activityId, prior === undefined ? version : Math.max(prior, version));
  }

  if (dependencies.materializationEnabled) {
    for (const activity of activities) {
      if (
        activity.legacyStatus !== 'published'
        || draftRevisionByActivity.has(activity.activityId)
        || versionByActivity.has(activity.activityId)
      ) continue;

      const ensured = await dependencies.ensureLegacyDraftMaterialized(activity.activityId, guideId);
      if (!ensured.ok) throw unexpected('Midao legacy draft materialization was rejected');
      if (typeof ensured.revision !== 'number' || !Number.isInteger(ensured.revision) || ensured.revision < 1) {
        throw unexpected('Midao legacy draft materialization returned an invalid revision');
      }
      draftRevisionByActivity.set(activity.activityId, ensured.revision);
    }
  }

  return assembleServiceList({
    activities,
    pricesByActivity,
    draftRevisionByActivity,
    versionByActivity,
    status,
    page,
    pageSize,
  });
}

export const __internal = {
  normalizeUuid,
  normalizePage,
  normalizePageSize,
  normalizeStatus,
  coercePrice,
  priceRange,
  assembleServiceList,
};
