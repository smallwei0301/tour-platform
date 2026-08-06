import { getSiteBaseUrl } from '../../../../../../../src/config/env.ts';
import { getMidaoInquiryDetailDb } from '../../../../../../../src/lib/midao/db-midao-inquiries.mjs';
import { getMidaoBookingRequestDb } from '../../../../../../../src/lib/midao/db-requests.mjs';
import {
  buildLineReplyTemplate,
  LINE_REPLY_INTENTS,
  type LineReplyIntent,
  type LineReplyTemplateResult,
} from '../../../../../../../src/lib/midao/line-reply-template.ts';
import { parseRequestRef } from '../../../../../../../src/lib/midao/request-ref.mjs';
import { MidaoRouteError } from '../../../../../../../src/lib/midao/route-errors.ts';
import { withMidaoGuideQuery } from '../../../../../../../src/lib/midao/with-guide-route.ts';

type ReplyTemplateRouteContext = {
  params: Promise<{ requestRef: string }>;
};

function notFound(): never {
  throw new MidaoRouteError('NOT_FOUND', 'Resource not found', 404);
}

function paymentLinkUnavailable(): never {
  throw new MidaoRouteError('PAYMENT_LINK_UNAVAILABLE', '此請求目前無法產生付款連結文案', 409);
}

function translateReferenceError(error: unknown): never {
  if (error && typeof error === 'object' && 'code' in error
    && (error as { code?: unknown }).code === 'INVALID_REQUEST_REF') {
    throw new MidaoRouteError('INVALID_REQUEST_REF', 'Invalid request reference', 422);
  }
  const message = error instanceof Error ? error.message : '';
  if (message.startsWith('BOOKING_NOT_FOUND:') || message.startsWith('INQUIRY_NOT_FOUND:')) {
    notFound();
  }
  throw error;
}

async function parseBody(request: Request): Promise<unknown> {
  try {
    return await request.clone().json();
  } catch {
    throw new MidaoRouteError('INVALID_REQUEST_BODY', 'Invalid JSON request body', 422);
  }
}

function parseIntent(body: unknown): LineReplyIntent {
  const candidate = body && typeof body === 'object' && !Array.isArray(body)
    ? (body as { intent?: unknown }).intent
    : undefined;
  if (typeof candidate !== 'string'
    || !LINE_REPLY_INTENTS.includes(candidate as LineReplyIntent)) {
    throw new MidaoRouteError('INVALID_REPLY_INTENT', 'Invalid reply intent', 422);
  }
  return candidate as LineReplyIntent;
}

function formatStartAtLocal(startAt: string | null, timezone: string | null): string | null {
  if (typeof startAt !== 'string' || startAt.length === 0) return null;
  const parsed = new Date(startAt);
  if (Number.isNaN(parsed.getTime())) return null;
  try {
    return new Intl.DateTimeFormat('zh-TW', {
      timeZone: timezone || 'Asia/Taipei',
      dateStyle: 'long',
      timeStyle: 'short',
    }).format(parsed);
  } catch {
    return null;
  }
}

function formatInquiryStartAtLocal(
  preferredDate: string | null,
  startTimeLocal: string | null,
): string | null {
  if (typeof preferredDate !== 'string' || preferredDate.length === 0) return null;
  return typeof startTimeLocal === 'string' && startTimeLocal.length > 0
    ? `${preferredDate} ${startTimeLocal}`
    : preferredDate;
}

function isPayableBooking(projection: {
  guideApprovalStatus?: unknown;
  bookingStatus?: unknown;
  orderStatus?: unknown;
}): boolean {
  return projection.guideApprovalStatus === 'approved'
    && projection.bookingStatus === 'draft'
    && projection.orderStatus === 'pending_payment';
}

function confirmationUrlFor(intent: LineReplyIntent, payable: boolean): string | null {
  if (intent !== 'payment_link' || !payable) return null;
  return `${getSiteBaseUrl()}/me/orders`;
}

function renderTemplate(
  input: Parameters<typeof buildLineReplyTemplate>[0],
): LineReplyTemplateResult {
  try {
    return buildLineReplyTemplate(input);
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error
      ? (error as { code?: unknown }).code
      : null;
    if (code === 'PAYMENT_LINK_UNAVAILABLE') paymentLinkUnavailable();
    if (code === 'INVALID_LINE_REPLY_INPUT') {
      throw new MidaoRouteError('INVALID_REPLY_INTENT', 'Invalid reply intent', 422);
    }
    throw error;
  }
}

async function buildBookingTemplate(
  guideId: string,
  bookingId: string,
  intent: LineReplyIntent,
  guideName: string | null,
): Promise<LineReplyTemplateResult> {
  let projection;
  try {
    projection = await getMidaoBookingRequestDb({ guideId, bookingId });
  } catch (error) {
    return translateReferenceError(error);
  }

  return renderTemplate({
    intent,
    kind: 'booking',
    referenceNo: projection.bookingNo ?? null,
    guideName,
    travelerName: projection.traveler?.displayName ?? null,
    serviceTitle: projection.service?.title ?? null,
    planName: projection.service?.planName ?? null,
    startAtLocalText: formatStartAtLocal(
      projection.request?.startAt ?? null,
      projection.request?.timezone ?? null,
    ),
    partySize: projection.request?.partySize ?? null,
    totalTwd: projection.totalTwd ?? null,
    confirmationUrl: confirmationUrlFor(intent, isPayableBooking(projection)),
  });
}

async function buildInquiryTemplate(
  guideId: string,
  inquiryId: string,
  intent: LineReplyIntent,
  guideName: string | null,
): Promise<LineReplyTemplateResult> {
  const result = await getMidaoInquiryDetailDb({
    inquiryId,
    actor: { role: 'guide', id: guideId },
  }) as { ok?: boolean; inquiry?: Record<string, unknown> | null } | null;
  const inquiry = result?.ok === true ? (result.inquiry ?? null) : null;
  if (!inquiry) notFound();

  return renderTemplate({
    intent,
    kind: 'inquiry',
    referenceNo: (inquiry.inquiryNo as string | null | undefined) ?? null,
    guideName,
    travelerName: null,
    serviceTitle: null,
    planName: null,
    startAtLocalText: formatInquiryStartAtLocal(
      (inquiry.preferredDate as string | null | undefined) ?? null,
      (inquiry.startTimeLocal as string | null | undefined) ?? null,
    ),
    partySize: (inquiry.partySize as number | null | undefined) ?? null,
    totalTwd: null,
    // inquiry 沒有訂單，永遠不可能產生付款連結。
    confirmationUrl: null,
  });
}

export async function POST(request: Request, { params }: ReplyTemplateRouteContext) {
  return withMidaoGuideQuery(
    request,
    async (context) => {
      const guideId = (context as { guideId: string }).guideId;
      const guideName = (context as { displayName?: string | null }).displayName ?? null;

      const intent = parseIntent(await parseBody(request));

      let reference;
      try {
        reference = parseRequestRef((await params).requestRef);
      } catch (error) {
        return translateReferenceError(error);
      }

      return reference.kind === 'booking'
        ? buildBookingTemplate(guideId, reference.id, intent, guideName)
        : buildInquiryTemplate(guideId, reference.id, intent, guideName);
    },
    { route: 'v2/guide/requests/reply-template' },
  );
}
