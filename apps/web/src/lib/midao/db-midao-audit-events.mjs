// @ts-check
/**
 * /midao2 直接生效稽核事件寫入器（#1860 Stage 1B）。
 *
 * 只寫 canonical `midao_audit_events`；不使用 legacy 稽核路徑。
 * 契約：
 *   - 每次成功的 canonical 方案寫入恰好記一筆事件；失敗／衝突／驗證錯誤寫零筆。
 *   - metadata 只允許固定鍵；before/after 只放「已變更」的可編輯欄位值。
 *   - 永不記錄原始 Idempotency-Key、cookie、token、金流資料或旅客 PII。
 *   - 序列化後超過上限時 before/after 置 null 並標記 truncated。
 *   - 寫入失敗不得回滾資料、不得把 HTTP 成功轉成 500；只回報並標記非原子稽核缺口。
 */
import { getSupabase, hasSupabaseEnv } from '../supabase-env.mjs';
import { reportRouteError } from '../route-error.ts';

export const MIDAO_AUDIT_METADATA_KEYS = [
  'route',
  'activityId',
  'planId',
  'changedFields',
  'before',
  'after',
  'expectedUpdatedAt',
  'resultUpdatedAt',
  'requestHash',
];

export const MIDAO_AUDIT_METADATA_LIMIT = 8000;

export const MIDAO_PLAN_AUDIT_ACTIONS = ['midao.plan.create', 'midao.plan.update'];

/** @type {any[]} */
const _memEvents = [];

export function __resetMidaoAuditEventsForTest() { _memEvents.length = 0; }
export function __listMidaoAuditEventsForTest() { return _memEvents.map((e) => ({ ...e })); }

/** @param {any} value */
function plainOrNull(value) {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'object' || Array.isArray(value)) return null;
  /** @type {Record<string, any>} */
  const out = {};
  for (const key of Object.keys(value)) out[key] = value[key];
  return out;
}

/**
 * 組出 midao_audit_events 的插入列（純函式，便於契約測試）。
 * @param {{
 *   guideId: string,
 *   action: string,
 *   planId: string,
 *   requestId: string,
 *   route: string,
 *   activityId: string,
 *   changedFields?: string[],
 *   before?: Record<string, any>|null,
 *   after?: Record<string, any>|null,
 *   expectedUpdatedAt?: string|null,
 *   resultUpdatedAt?: string|null,
 *   requestHash?: string|null,
 * }} input
 */
export function buildMidaoAuditEvent(input) {
  if (!MIDAO_PLAN_AUDIT_ACTIONS.includes(input.action)) {
    throw new Error(`MIDAO_AUDIT_INVALID_ACTION: ${input.action}`);
  }

  /** @type {Record<string, any>} */
  const metadata = {
    route: String(input.route ?? ''),
    activityId: String(input.activityId ?? ''),
    planId: String(input.planId ?? ''),
    changedFields: Array.isArray(input.changedFields) ? [...input.changedFields] : [],
    before: input.action === 'midao.plan.create' ? {} : (plainOrNull(input.before) ?? {}),
    after: plainOrNull(input.after) ?? {},
    expectedUpdatedAt: input.action === 'midao.plan.create' ? null : (input.expectedUpdatedAt ?? null),
    resultUpdatedAt: input.resultUpdatedAt ?? null,
    requestHash: input.requestHash ?? null,
  };

  if (JSON.stringify(metadata).length > MIDAO_AUDIT_METADATA_LIMIT) {
    metadata.before = null;
    metadata.after = null;
    metadata.truncated = true;
  }

  return {
    actor_type: 'guide',
    actor_id: String(input.guideId),
    guide_id: input.guideId,
    action: input.action,
    resource_type: 'activity_plan',
    resource_id: String(input.planId),
    request_id: input.requestId,
    reason: null,
    metadata,
  };
}

/**
 * 在 canonical 寫入成功之後記錄稽核事件。永不拋出：失敗只回報並標記 auditGap。
 * @param {Parameters<typeof buildMidaoAuditEvent>[0]} input
 * @param {{reportError?: (err: unknown, opts: {route: string, metadata?: Record<string, any>}) => Promise<unknown>}} [options]
 * @returns {Promise<{recorded: boolean, auditGap: boolean}>}
 */
export async function recordMidaoAuditEvent(input, options = {}) {
  const report = options.reportError ?? reportRouteError;
  let event;
  try {
    event = buildMidaoAuditEvent(input);
  } catch (error) {
    await report(error, {
      route: `${input?.route ?? 'v2/guide/midao/services/[activityId]/plans'}:audit-build`,
      metadata: { auditGap: true, action: input?.action ?? null },
    });
    return { recorded: false, auditGap: true };
  }

  try {
    if (!hasSupabaseEnv()) {
      _memEvents.push({ ...event, created_at: new Date().toISOString() });
      return { recorded: true, auditGap: false };
    }
    const supabase = await getSupabase();
    const { error } = await supabase.from('midao_audit_events').insert(event);
    if (error) throw new Error(String(error.message || 'MIDAO_AUDIT_INSERT_ERROR'));
    return { recorded: true, auditGap: false };
  } catch (error) {
    await report(error, {
      route: `${input.route}:audit-write`,
      metadata: { auditGap: true, action: event.action, resourceId: event.resource_id },
    });
    return { recorded: false, auditGap: true };
  }
}
