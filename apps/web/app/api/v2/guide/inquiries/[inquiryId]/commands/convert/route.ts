/**
 * #1759 Package 4／Task 39：導遊把詢問單轉成 booking＋order＋確認連結。
 *
 * 契約來源：2026-08-07-issue1759-task39-conversion-gateway-plan.md §4.7。
 * route 只做「路徑／body 正規化」，一切資料寫入由 gateway 呼叫
 * `midao_convert_inquiry_to_booking` RPC 在單一交易完成，本檔不直接碰 DB。
 * `requestHash` 沿用 withMidaoGuideCommand 對原始 body 算出的值，不重算。
 */
import { convertMidaoInquiryToBookingDb } from '../../../../../../../../src/lib/midao/db-midao-booking-confirmations.mjs';
import { MidaoRouteError } from '../../../../../../../../src/lib/midao/route-errors.ts';
import { withMidaoGuideCommand } from '../../../../../../../../src/lib/midao/with-guide-route.ts';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const REQUIRED_KEYS = [
  'activityPlanId',
  'confirmationTtlHours',
  'endAt',
  'participants',
  'quotedTotalTwd',
  'startAt',
] as const;
const ALLOWED_KEYS = new Set<string>([...REQUIRED_KEYS, 'guideNote']);

function invalidBody(): never {
  throw new MidaoRouteError('INVALID_REQUEST_BODY', 'Invalid request body', 422);
}

function normalizeInquiryId(value: unknown): string {
  if (typeof value !== 'string' || !UUID_PATTERN.test(value.trim())) {
    throw new MidaoRouteError('INVALID_INQUIRY_ID', 'Invalid inquiry id', 422);
  }
  return value.trim().toLowerCase();
}

interface ConvertCommandBody {
  activityPlanId: unknown;
  startAt: unknown;
  endAt: unknown;
  participants: unknown;
  quotedTotalTwd: unknown;
  guideNote: string | null;
  confirmationTtlHours: unknown;
}

/**
 * 嚴格 key 白名單；型別／範圍一律交給 gateway 內的 Task 37 純函式判定，
 * 避免同一條規則在 route 與 validator 兩處各自為政。
 */
function normalizeConvertBody(value: unknown): ConvertCommandBody {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalidBody();
  const body = value as Record<string, unknown>;
  for (const key of Object.keys(body)) {
    if (!ALLOWED_KEYS.has(key)) invalidBody();
  }
  for (const key of REQUIRED_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(body, key)) invalidBody();
  }

  let guideNote: string | null = null;
  if (Object.prototype.hasOwnProperty.call(body, 'guideNote')) {
    if (body.guideNote !== null && typeof body.guideNote !== 'string') invalidBody();
    guideNote = typeof body.guideNote === 'string' ? body.guideNote : null;
  }

  return {
    activityPlanId: body.activityPlanId,
    startAt: body.startAt,
    endAt: body.endAt,
    participants: body.participants,
    quotedTotalTwd: body.quotedTotalTwd,
    guideNote,
    confirmationTtlHours: body.confirmationTtlHours,
  };
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ inquiryId: string }> },
) {
  return withMidaoGuideCommand(
    request,
    async ({ guideId, actorType, actorId, idempotencyKey, requestHash, body }) => {
      const inquiryId = normalizeInquiryId((await params).inquiryId);
      const normalized = normalizeConvertBody(body);
      return convertMidaoInquiryToBookingDb({
        guideId,
        actorType,
        actorId,
        inquiryId,
        activityPlanId: normalized.activityPlanId,
        startAt: normalized.startAt,
        endAt: normalized.endAt,
        participants: normalized.participants,
        quotedTotalTwd: normalized.quotedTotalTwd,
        guideNote: normalized.guideNote,
        confirmationTtlHours: normalized.confirmationTtlHours,
        idempotencyKey,
        requestHash,
      });
    },
    { route: 'v2/guide/inquiries/[inquiryId]/commands/convert' },
  );
}
