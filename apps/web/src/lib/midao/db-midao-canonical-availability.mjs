// @ts-check
/**
 * Issue #1760 Stage 2 — /midao2 行事曆 canonical 可用性 gateway。
 *
 * 單一真相：`guide_availability_rules`（scope_type='global'）＋
 * `guide_availability_day_revisions` ＋ `activity_plans.availability_policy`，
 * 讀取一律經 `createCanonicalAvailabilityRuleSelector()`。
 *
 * 本檔不是第二套引擎：寫入只透過既有原子 RPC
 * `midao_replace_global_day_availability(uuid,date,text,bigint,jsonb,text,text)`，
 * 不在 JS 重造 CAS／idempotency／重疊驗證的第二套真相，也不做 fallback 或雙寫。
 * client 取得使用既有 service-role seam（supabase-env.mjs），永不經 db.mjs。
 */

import { hasSupabaseEnv, getSupabase } from '../supabase-env.mjs';
import { createCanonicalAvailabilityRuleSelector } from '../availability-v2/effective-availability-resolver.ts';
import {
  MIDAO_DEFAULT_TIMEZONE,
  buildDayAvailabilityProjection,
  listMonthDates,
  rulesToDayRanges,
  daysInMonth,
} from './midao-calendar-canonical.ts';

export class MidaoCanonicalAvailabilityError extends Error {
  /**
   * @param {string} code @param {string} message @param {number} status
   * @param {Record<string, unknown>} [details]
   */
  constructor(code, message, status, details) {
    super(message);
    this.name = 'MidaoCanonicalAvailabilityError';
    this.code = code;
    this.status = status;
    if (details) this.details = details;
  }
}

/** RPC code → HTTP status／對外錯誤碼（RPC 自帶 status，這裡只做嚴格白名單）。 */
const RPC_ERROR_STATUS = {
  REVISION_CONFLICT: 409,
  IDEMPOTENCY_KEY_REUSED: 409,
  DAY_TIMEZONE_MISMATCH: 422,
  INVALID_RANGES: 422,
  INVALID_IDEMPOTENCY: 422,
  INVALID_ARGUMENT: 422,
  GUIDE_NOT_FOUND: 404,
};

const RPC_ERROR_MESSAGE = {
  REVISION_CONFLICT: '此日期已被其他更新覆蓋，請重新載入後再試',
  IDEMPOTENCY_KEY_REUSED: '相同請求識別碼已用於不同內容',
  DAY_TIMEZONE_MISMATCH: '時區與既有設定不符',
  INVALID_RANGES: '時段格式不正確或有重疊',
  INVALID_IDEMPOTENCY: '請求識別碼不正確',
  INVALID_ARGUMENT: '請求參數不正確',
  GUIDE_NOT_FOUND: '找不到此導遊',
};

/* ------------------------------------------------------------------ *
 * in-memory fallback seam（與 db.mjs 同慣例：無 Supabase env 時走記憶體）
 * ------------------------------------------------------------------ */

/** @type {any[]} */
const _memRules = []; // guide_availability_rules（scope_type='global'）
/** @type {any[]} */
const _memDayRevisions = []; // guide_availability_day_revisions
/** @type {Map<string, any>} */
const _memIdempotency = new Map();

export function __resetMemCanonicalAvailability() {
  _memRules.length = 0;
  _memDayRevisions.length = 0;
  _memIdempotency.clear();
}

/** 測試用：直接種入 canonical 規則／日修訂。 */
export function __seedMemCanonicalAvailability({ rules = [], dayRevisions = [] } = {}) {
  _memRules.push(...rules);
  _memDayRevisions.push(...dayRevisions);
}

/* ------------------------------------------------------------------ *
 * 讀：月投影
 * ------------------------------------------------------------------ */

/**
 * @param {string} guideId @param {string} month 'YYYY-MM'
 * @returns {Promise<{rules:any[], dayRevisions:any[]}>}
 */
async function loadCanonicalMonthSources(guideId, month) {
  const firstDate = `${month}-01`;
  const lastDate = `${month}-${String(daysInMonth(month)).padStart(2, '0')}`;
  if (!hasSupabaseEnv()) {
    return {
      rules: _memRules.filter((r) => r.guide_id === guideId),
      dayRevisions: _memDayRevisions.filter(
        (d) => d.guide_id === guideId && d.local_date >= firstDate && d.local_date <= lastDate,
      ),
    };
  }
  const supabase = await getSupabase();
  const [rulesResult, revisionsResult] = await Promise.all([
    supabase
      .from('guide_availability_rules')
      .select('id, guide_id, activity_plan_id, weekday, start_time_local, end_time_local, timezone, effective_from, effective_to, is_active')
      .eq('guide_id', guideId)
      .is('activity_plan_id', null)
      .eq('is_active', true),
    supabase
      .from('guide_availability_day_revisions')
      .select('guide_id, local_date, timezone, revision, is_closed')
      .eq('guide_id', guideId)
      .gte('local_date', firstDate)
      .lte('local_date', lastDate),
  ]);
  // 可用性讀取失敗必須 5xx；絕不 degrade 成「全部可用」，也不退回 midao_* 舊表。
  if (rulesResult?.error) {
    throw new MidaoCanonicalAvailabilityError('AVAILABILITY_READ_FAILED', '可用性讀取失敗', 500);
  }
  if (revisionsResult?.error) {
    throw new MidaoCanonicalAvailabilityError('AVAILABILITY_READ_FAILED', '可用性讀取失敗', 500);
  }
  return {
    rules: Array.isArray(rulesResult?.data) ? rulesResult.data : [],
    dayRevisions: Array.isArray(revisionsResult?.data) ? revisionsResult.data : [],
  };
}

/**
 * 該月每日 canonical 生效可用性投影。
 * @param {string} guideId
 * @param {string} month 'YYYY-MM'
 * @param {{ timezone?: string, policy?: 'inherit'|'restrict'|'closed' }} [options]
 */
export async function getCanonicalMonthCalendarDb(guideId, month, options = {}) {
  const timezone = options.timezone || MIDAO_DEFAULT_TIMEZONE;
  const { rules, dayRevisions } = await loadCanonicalMonthSources(guideId, month);
  const selectRules = createCanonicalAvailabilityRuleSelector({
    guideId,
    planId: '',
    policy: options.policy || 'inherit',
    rules,
    dayRevisions,
    timezone,
  });
  return listMonthDates(month).map((date) => {
    const revisionRow = dayRevisions.find(
      (row) => row.guide_id === guideId && row.local_date === date,
    );
    const dayRules = selectRules(date);
    return buildDayAvailabilityProjection({
      date,
      ranges: rulesToDayRanges(dayRules, date),
      revision: revisionRow ? Number(revisionRow.revision) : 0,
      isClosed: revisionRow ? revisionRow.is_closed === true : false,
      timezone: revisionRow?.timezone || timezone,
    });
  });
}

/**
 * 單一日期 canonical 投影（PUT 後回讀用）。
 * @param {string} guideId @param {string} date 'YYYY-MM-DD'
 * @param {{ timezone?: string }} [options]
 */
export async function getCanonicalDayDb(guideId, date, options = {}) {
  const month = String(date).slice(0, 7);
  const days = await getCanonicalMonthCalendarDb(guideId, month, options);
  return days.find((day) => day.date === date) ?? null;
}

/* ------------------------------------------------------------------ *
 * 寫：單日 CAS（唯一寫入路徑）
 * ------------------------------------------------------------------ */

/** 記憶體 fallback 下模擬 RPC 語意（僅供無 Supabase env 的測試環境）。 */
function replaceDayInMemory({ guideId, date, timezone, expectedRevision, ranges, idempotencyKey, requestHash }) {
  const idemKey = `${guideId}:${date}:${idempotencyKey}`;
  const existing = _memIdempotency.get(idemKey);
  if (existing) {
    if (existing.requestHash !== requestHash) {
      return { code: 'IDEMPOTENCY_KEY_REUSED', status: 409 };
    }
    return existing.response;
  }
  let row = _memDayRevisions.find((d) => d.guide_id === guideId && d.local_date === date);
  if (!row) {
    row = { guide_id: guideId, local_date: date, timezone, revision: 0, is_closed: false };
    _memDayRevisions.push(row);
  }
  let response;
  if (row.timezone !== timezone) {
    response = { code: 'DAY_TIMEZONE_MISMATCH', status: 422, localDate: date, timezone: row.timezone };
  } else if (Number(row.revision) !== Number(expectedRevision)) {
    response = {
      code: 'REVISION_CONFLICT', status: 409,
      currentRevision: Number(row.revision), localDate: date, timezone: row.timezone,
    };
  } else {
    for (let i = _memRules.length - 1; i >= 0; i -= 1) {
      const rule = _memRules[i];
      if (rule.guide_id === guideId && rule.effective_from === date && rule.effective_to === date) {
        _memRules.splice(i, 1);
      }
    }
    const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
    for (const range of ranges) {
      _memRules.push({
        guide_id: guideId, activity_plan_id: null, weekday,
        start_time_local: range.startTimeLocal, end_time_local: range.endTimeLocal,
        timezone, effective_from: date, effective_to: date, is_active: true,
      });
    }
    row.revision = Number(row.revision) + 1;
    row.is_closed = ranges.length === 0;
    response = {
      code: 'UPDATED', localDate: date, timezone,
      revision: row.revision, isClosed: row.is_closed, ranges,
    };
  }
  _memIdempotency.set(idemKey, { requestHash, response });
  return response;
}

/**
 * 單日 canonical 取代（CAS＋冪等），唯一寫入路徑。
 * guideId 必須來自已驗證的 guide session，永不信任 client 傳入。
 * @param {{ guideId:string, date:string, timezone:string, expectedRevision:number,
 *  ranges:Array<{startTimeLocal:string,endTimeLocal:string}>,
 *  idempotencyKey:string, requestHash:string }} command
 */
export async function replaceCanonicalDayAvailabilityDb(command) {
  const payload = {
    p_guide_id: command.guideId,
    p_local_date: command.date,
    p_timezone: command.timezone,
    p_expected_revision: command.expectedRevision,
    p_ranges: command.ranges,
    p_idempotency_key: command.idempotencyKey,
    p_request_hash: command.requestHash,
  };
  let result;
  if (!hasSupabaseEnv()) {
    result = replaceDayInMemory(command);
  } else {
    const supabase = await getSupabase();
    const { data, error } = await supabase.rpc('midao_replace_global_day_availability', payload);
    if (error) {
      throw new MidaoCanonicalAvailabilityError('AVAILABILITY_WRITE_FAILED', '可用時段更新失敗', 500);
    }
    result = data;
  }
  const code = String(result?.code || '');
  if (code !== 'UPDATED') {
    const status = RPC_ERROR_STATUS[code];
    if (!status) {
      throw new MidaoCanonicalAvailabilityError('AVAILABILITY_WRITE_FAILED', '可用時段更新失敗', 500);
    }
    const details = {};
    if (result?.currentRevision !== undefined) details.currentRevision = Number(result.currentRevision);
    if (result?.timezone !== undefined) details.timezone = result.timezone;
    throw new MidaoCanonicalAvailabilityError(code, RPC_ERROR_MESSAGE[code], status, details);
  }
  return {
    date: result.localDate,
    timezone: result.timezone,
    revision: Number(result.revision),
    isClosed: result.isClosed === true,
    ranges: Array.isArray(result.ranges) ? result.ranges : [],
  };
}

/**
 * W-2：週預設是 UI 批次工具，不是第二套真相。
 * 把選定的 U-1 段別展開成未來單日 canonical CAS 寫入，逐日呼叫同一個 RPC。
 * 不寫任何 weekly defaults 表，不新增 RPC/migration。
 * @param {{ guideId:string, days:Array<{date:string, timezone:string, expectedRevision:number,
 *  ranges:Array<{startTimeLocal:string,endTimeLocal:string}>, idempotencyKey:string, requestHash:string}> }} batch
 */
export async function applyCanonicalDayBatchDb(batch) {
  const applied = [];
  const conflicts = [];
  for (const day of batch.days ?? []) {
    try {
      applied.push(await replaceCanonicalDayAvailabilityDb({ guideId: batch.guideId, ...day }));
    } catch (err) {
      if (err instanceof MidaoCanonicalAvailabilityError && err.status === 409) {
        conflicts.push({
          date: day.date,
          code: err.code,
          currentRevision: err.details?.currentRevision ?? null,
        });
        continue;
      }
      throw err;
    }
  }
  return { applied, conflicts };
}
