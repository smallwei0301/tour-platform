/**
 * POST /api/v2/guide/midao/availability/defaults — W-2 週預設批次工具。
 *
 * #1760 Stage 2 owner 決議 U-2 = W-2：週預設不是第二套真相，也沒有 durable 週預設表。
 * 這條路由把「選定的星期幾 × U-1 段別」展開成未來一段期間的單日 canonical CAS 寫入，
 * 逐日呼叫同一個 midao_replace_global_day_availability RPC；不寫 midao_* 舊表、不新增 RPC/migration。
 * Auth: guide session＋CSRF。
 */
import { createHash } from 'node:crypto';
import { validateCsrf } from '../../../../../../../src/lib/csrf.mjs';
import { verifyGuideSession } from '../../../../../../../src/lib/guide-auth';
import {
  applyCanonicalDayBatchDb,
  getCanonicalMonthCalendarDb,
  MidaoCanonicalAvailabilityError,
} from '../../../../../../../src/lib/midao/db-midao-canonical-availability.mjs';
import {
  MIDAO_DEFAULT_TIMEZONE,
  segmentsToCanonicalRanges,
  weekdayOf,
  listMonthDates,
  isFutureLocalDate,
} from '../../../../../../../src/lib/midao/midao-calendar-canonical.ts';
import { jsonOk, jsonError } from '../../../../../../../src/lib/api-response';
import { handleRouteError } from '../../../../../../../src/lib/route-error';

const MONTH_RE = /^\d{4}-\d{2}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

type WeekdayRow = { weekday: number; morning?: boolean; afternoon?: boolean; evening?: boolean };

/**
 * GET：不再回傳 durable 週預設，改以 canonical 月投影推導「目前每個星期幾的實際樣態」，
 * 讓 UI 有初始勾選狀態，但真相仍只有 canonical 單日資料一份。
 */
export async function GET(request: Request) {
  const session = verifyGuideSession(request);
  if (!session) return jsonError('UNAUTHORIZED', '請先登入導遊帳號', 401);
  const url = new URL(request.url);
  const month = url.searchParams.get('month') ?? '';
  if (!MONTH_RE.test(month)) return jsonError('INVALID_MONTH', '月份格式需為 YYYY-MM', 400);
  try {
    const days = await getCanonicalMonthCalendarDb(session.guideId, month);
    const weekdays = Array.from({ length: 7 }, (_, weekday) => {
      const sameWeekday = days.filter((day: { date: string }) => weekdayOf(day.date) === weekday);
      const allTrue = (period: 'morning' | 'afternoon' | 'evening') =>
        sameWeekday.length > 0 &&
        sameWeekday.every((day: { availability: Record<'morning' | 'afternoon' | 'evening', boolean> }) =>
          day.availability[period] === true);
      return {
        weekday,
        morning: allTrue('morning'),
        afternoon: allTrue('afternoon'),
        evening: allTrue('evening'),
      };
    });
    return jsonOk({ month, weekdays });
  } catch (err) {
    return handleRouteError(err, { route: 'v2/guide/midao/availability/defaults:get' });
  }
}

/**
 * POST：批次套用。body = { month, weekdays:[{weekday,morning,afternoon,evening}],
 * days:[{date, expectedRevision}], timezone? }
 * `days` 帶出每個目標日期的目前 revision，讓每日寫入都是真正的 CAS。
 */
export async function POST(request: Request) {
  const csrf = validateCsrf(request);
  if (csrf) return csrf;
  const session = verifyGuideSession(request);
  if (!session) return jsonError('UNAUTHORIZED', '請先登入導遊帳號', 401);

  const idempotencyKey = request.headers.get('idempotency-key')?.trim() || '';
  if (!idempotencyKey) return jsonError('MISSING_IDEMPOTENCY_KEY', '缺少 Idempotency-Key', 422);

  let body: {
    month?: unknown;
    weekdays?: unknown;
    days?: unknown;
    timezone?: unknown;
  } = {};
  try {
    body = await request.json();
  } catch {
    return jsonError('INVALID_REQUEST', '請求格式不正確', 400);
  }

  const month = String(body.month ?? '');
  if (!MONTH_RE.test(month)) return jsonError('INVALID_MONTH', '月份格式需為 YYYY-MM', 400);
  if (!Array.isArray(body.weekdays)) return jsonError('INVALID_REQUEST', 'weekdays 需為陣列', 400);
  if (!Array.isArray(body.days)) return jsonError('INVALID_REQUEST', 'days 需為陣列', 400);

  const timezone =
    typeof body.timezone === 'string' && body.timezone ? body.timezone : MIDAO_DEFAULT_TIMEZONE;

  const selectionByWeekday = new Map<number, WeekdayRow>();
  for (const row of body.weekdays as WeekdayRow[]) {
    const weekday = Math.trunc(Number(row?.weekday));
    if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) continue;
    selectionByWeekday.set(weekday, row);
  }

  const monthDates = new Set(listMonthDates(month));
  const days = [];
  const skipped = [];
  try {
    for (const target of body.days as { date?: unknown; expectedRevision?: unknown }[]) {
      const date = String(target?.date ?? '');
      if (!DATE_RE.test(date) || !monthDates.has(date)) {
        return jsonError('INVALID_DATE', '日期格式需為該月份內的 YYYY-MM-DD', 422);
      }
      const expectedRevision = Number(target?.expectedRevision);
      if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) {
        return jsonError('MISSING_EXPECTED_REVISION', '缺少或不正確的 expectedRevision', 422);
      }
      // W-2 只套用到未來日期：已過去（含當日）的日期一律不寫入。
      if (!isFutureLocalDate(date, timezone)) {
        skipped.push({ date, reason: 'NOT_FUTURE_DATE' });
        continue;
      }
      const selection = selectionByWeekday.get(weekdayOf(date));
      if (!selection) continue;
      const ranges = segmentsToCanonicalRanges({
        morning: selection.morning === true,
        afternoon: selection.afternoon === true,
        evening: selection.evening === true,
      });
      const requestHash = createHash('sha256')
        .update(JSON.stringify({ date, timezone, expectedRevision, ranges }))
        .digest('hex');
      days.push({
        date,
        timezone,
        expectedRevision,
        ranges,
        idempotencyKey: `${idempotencyKey}:${date}`,
        requestHash,
      });
    }
  } catch (err) {
    return jsonError('INVALID_RANGES', (err as Error)?.message || '時段格式不正確', 422);
  }

  try {
    const result = await applyCanonicalDayBatchDb({ guideId: session.guideId, days });
    return jsonOk({ month, applied: result.applied, conflicts: result.conflicts, skipped });
  } catch (err) {
    if (err instanceof MidaoCanonicalAvailabilityError) {
      return jsonError(err.code, err.message, err.status);
    }
    return handleRouteError(err, { route: 'v2/guide/midao/availability/defaults:post' });
  }
}
