export type BookingDecisionAction = 'approve' | 'reject';

type DecisionResult =
  | { kind: 'success' }
  | { kind: 'conflict' }
  | { kind: 'error' };

function readCsrfToken(): string {
  if (typeof document === 'undefined') return '';
  const csrfCookie = document.cookie.split('; ').find((cookie) => cookie.startsWith('tp_csrf='));
  if (!csrfCookie) return '';
  return decodeURIComponent(csrfCookie.slice('tp_csrf='.length));
}

function isSuccessEnvelope(value: unknown): value is { success: true } {
  return typeof value === 'object' && value !== null && (value as { success?: unknown }).success === true;
}

export async function decideBookingRequest(input: {
  bookingId: string;
  action: BookingDecisionAction;
  note?: string;
}): Promise<DecisionResult> {
  const body = input.action === 'reject'
    ? { action: input.action, note: input.note?.trim() || '' }
    : { action: input.action };

  try {
    const response = await fetch(
      `/api/v2/guide/bookings/${encodeURIComponent(input.bookingId)}/commands/decide`,
      {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'content-type': 'application/json',
          'x-csrf-token': readCsrfToken(),
          'idempotency-key': crypto.randomUUID(),
        },
        body: JSON.stringify(body),
      },
    );
    const payload: unknown = await response.json().catch(() => null);
    if (response.status === 200 && isSuccessEnvelope(payload)) return { kind: 'success' };
    if (response.status === 409) return { kind: 'conflict' };
  } catch {
    // Keep network failures and server details out of the guide UI.
  }
  return { kind: 'error' };
}

export type MidaoCommandResult<T> =
  | { kind: 'success'; data: T }
  | { kind: 'failure'; code: string; status: number };

export interface LineReplyTemplate {
  intent: string;
  text: string;
  shareUrl: string;
}

export interface InquiryConversionResult {
  created: boolean;
  replayed: boolean;
  inquiryId: string;
  bookingId: string;
  orderId: string;
  bookingNo: string | null;
  bookingStatus: string;
  travelerConfirmationStatus: string;
  travelerConfirmationExpiresAt: string | null;
  confirmationToken: string | null;
  confirmationUrl: string | null;
  confirmationTokenNote: string | null;
}

export interface ConvertInquiryInput {
  inquiryId: string;
  activityPlanId: string;
  confirmationTtlHours: number;
  endAt: string;
  participants: number;
  quotedTotalTwd: number;
  startAt: string;
  guideNote?: string;
}

function failure(status: number, payload: unknown): { kind: 'failure'; code: string; status: number } {
  const code = isRecord(payload) && isRecord(payload.error) && typeof payload.error.code === 'string'
    ? payload.error.code
    : 'UNKNOWN_ERROR';
  return { kind: 'failure', code, status };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function successData(payload: unknown): unknown {
  return isRecord(payload) && payload.success === true ? payload.data : undefined;
}

function isLineReplyTemplate(value: unknown): value is LineReplyTemplate {
  return isRecord(value)
    && typeof value.intent === 'string'
    && typeof value.text === 'string'
    && typeof value.shareUrl === 'string';
}

function isConversionResult(value: unknown): value is InquiryConversionResult {
  return isRecord(value)
    && typeof value.created === 'boolean'
    && typeof value.replayed === 'boolean'
    && typeof value.inquiryId === 'string'
    && typeof value.bookingId === 'string'
    && typeof value.orderId === 'string';
}

/**
 * reply-template 走 withMidaoGuideQuery：不需要 idempotency-key。
 */
export async function fetchLineReplyTemplate(input: {
  requestRef: string;
  intent: string;
}): Promise<MidaoCommandResult<LineReplyTemplate>> {
  try {
    const response = await fetch(
      `/api/v2/guide/requests/${encodeURIComponent(input.requestRef)}/reply-template`,
      {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'content-type': 'application/json',
          'x-csrf-token': readCsrfToken(),
        },
        body: JSON.stringify({ intent: input.intent }),
      },
    );
    const payload: unknown = await response.json().catch(() => null);
    const data = successData(payload);
    if (response.ok && isLineReplyTemplate(data)) return { kind: 'success', data };
    return failure(response.status, payload);
  } catch {
    return { kind: 'failure', code: 'NETWORK_ERROR', status: 0 };
  }
}

export async function markInquiryReplied(input: {
  inquiryId: string;
}): Promise<MidaoCommandResult<null>> {
  try {
    const response = await fetch(
      `/api/v2/guide/inquiries/${encodeURIComponent(input.inquiryId)}/commands/mark-replied`,
      {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'content-type': 'application/json',
          'x-csrf-token': readCsrfToken(),
          'idempotency-key': crypto.randomUUID(),
        },
        body: JSON.stringify({}),
      },
    );
    const payload: unknown = await response.json().catch(() => null);
    if (response.ok && isSuccessEnvelope(payload)) return { kind: 'success', data: null };
    return failure(response.status, payload);
  } catch {
    return { kind: 'failure', code: 'NETWORK_ERROR', status: 0 };
  }
}

export async function convertInquiry(
  input: ConvertInquiryInput,
): Promise<MidaoCommandResult<InquiryConversionResult>> {
  const body: Record<string, unknown> = {
    activityPlanId: input.activityPlanId,
    confirmationTtlHours: input.confirmationTtlHours,
    endAt: input.endAt,
    participants: input.participants,
    quotedTotalTwd: input.quotedTotalTwd,
    startAt: input.startAt,
  };
  const guideNote = input.guideNote?.trim();
  if (guideNote) body.guideNote = guideNote;

  try {
    const response = await fetch(
      `/api/v2/guide/inquiries/${encodeURIComponent(input.inquiryId)}/commands/convert`,
      {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'content-type': 'application/json',
          'x-csrf-token': readCsrfToken(),
          'idempotency-key': crypto.randomUUID(),
        },
        body: JSON.stringify(body),
      },
    );
    const payload: unknown = await response.json().catch(() => null);
    const data = successData(payload);
    if (response.ok && isConversionResult(data)) return { kind: 'success', data };
    return failure(response.status, payload);
  } catch {
    return { kind: 'failure', code: 'NETWORK_ERROR', status: 0 };
  }
}
