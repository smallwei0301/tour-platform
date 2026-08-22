/**
 * PUT /api/v2/guide/midao/availability/days/[date] — 單日 canonical 可用時段取代。
 * #1760 Stage 2：唯一寫入路徑為 midao_replace_global_day_availability RPC（CAS＋冪等）。
 * 必填 expectedRevision 與 Idempotency-Key；guideId 一律取自已驗證 session。
 * Auth: guide session＋CSRF。
 */
import { createHash } from 'node:crypto';
import { validateCsrf } from '../../../../../../../../src/lib/csrf.mjs';
import { verifyGuideSession } from '../../../../../../../../src/lib/guide-auth';
import {
  replaceCanonicalDayAvailabilityDb,
  getCanonicalDayDb,
  MidaoCanonicalAvailabilityError,
} from '../../../../../../../../src/lib/midao/db-midao-canonical-availability.mjs';
import {
  MIDAO_DEFAULT_TIMEZONE,
  segmentsToCanonicalRanges,
  normalizeCanonicalRanges,
} from '../../../../../../../../src/lib/midao/midao-calendar-canonical.ts';
import { jsonOk, jsonError, jsonErrorWithExtras } from '../../../../../../../../src/lib/api-response';
import { handleRouteError } from '../../../../../../../../src/lib/route-error';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

type DayBody = {
  expectedRevision?: unknown;
  timezone?: unknown;
  ranges?: unknown;
  morning?: unknown;
  afternoon?: unknown;
  evening?: unknown;
  custom?: unknown;
};

/** body 支援兩種輸入：canonical ranges 或 U-1 段別開關（＋自訂區間）。 */
function toCanonicalRanges(body: DayBody) {
  if (Array.isArray(body.ranges)) {
    return normalizeCanonicalRanges(body.ranges);
  }
  return segmentsToCanonicalRanges(
    {
      morning: body.morning === true,
      afternoon: body.afternoon === true,
      evening: body.evening === true,
    },
    Array.isArray(body.custom) ? (body.custom as { startTimeLocal: string; endTimeLocal: string }[]) : [],
  );
}

export async function PUT(request: Request, { params }: { params: Promise<{ date: string }> }) {
  const csrf = validateCsrf(request);
  if (csrf) return csrf;
  const session = verifyGuideSession(request);
  if (!session) return jsonError('UNAUTHORIZED', '請先登入導遊帳號', 401);
  const { date } = await params;
  if (!DATE_RE.test(date)) return jsonError('INVALID_DATE', '日期格式需為 YYYY-MM-DD', 400);

  const idempotencyKey = request.headers.get('idempotency-key')?.trim() || '';
  if (!idempotencyKey) {
    return jsonError('MISSING_IDEMPOTENCY_KEY', '缺少 Idempotency-Key', 422);
  }

  let body: DayBody = {};
  let rawBody = '';
  try {
    rawBody = await request.text();
    body = rawBody ? JSON.parse(rawBody) : {};
  } catch {
    return jsonError('INVALID_REQUEST', '請求格式不正確', 400);
  }

  const expectedRevision = Number(body.expectedRevision);
  if (
    body.expectedRevision === undefined ||
    body.expectedRevision === null ||
    !Number.isSafeInteger(expectedRevision) ||
    expectedRevision < 0
  ) {
    return jsonError('MISSING_EXPECTED_REVISION', '缺少或不正確的 expectedRevision', 422);
  }

  let ranges;
  try {
    ranges = toCanonicalRanges(body);
  } catch (err) {
    return jsonError('INVALID_RANGES', (err as Error)?.message || '時段格式不正確', 422);
  }

  const timezone = typeof body.timezone === 'string' && body.timezone ? body.timezone : MIDAO_DEFAULT_TIMEZONE;
  const requestHash = createHash('sha256')
    .update(JSON.stringify({ date, timezone, expectedRevision, ranges }))
    .digest('hex');

  try {
    const result = await replaceCanonicalDayAvailabilityDb({
      guideId: session.guideId,
      date,
      timezone,
      expectedRevision,
      ranges,
      idempotencyKey,
      requestHash,
    });
    const effective = await getCanonicalDayDb(session.guideId, date, { timezone });
    return jsonOk({ date, revision: result.revision, isClosed: result.isClosed, ranges: result.ranges, effective });
  } catch (err) {
    if (err instanceof MidaoCanonicalAvailabilityError) {
      const details = (err as { details?: Record<string, unknown> }).details;
      return details
        ? jsonErrorWithExtras(err.code, err.message, err.status, details)
        : jsonError(err.code, err.message, err.status);
    }
    return handleRouteError(err, { route: 'v2/guide/midao/availability/day:put' });
  }
}
