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
