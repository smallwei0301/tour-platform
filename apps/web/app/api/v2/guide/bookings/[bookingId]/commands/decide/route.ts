import { hashIdempotentRequest } from '../../../../../../../../src/lib/midao/idempotency.ts';
import { decideMidaoBookingRequestDb } from '../../../../../../../../src/lib/midao/db-booking-commands.mjs';
import { MidaoRouteError } from '../../../../../../../../src/lib/midao/route-errors.ts';
import { withMidaoGuideCommand } from '../../../../../../../../src/lib/midao/with-guide-route.ts';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

function invalid(code: 'INVALID_BOOKING_ID' | 'INVALID_REQUEST_BODY' | 'INVALID_ACTION' | 'INVALID_NOTE'): never {
  const messages = {
    INVALID_BOOKING_ID: 'Invalid booking id',
    INVALID_REQUEST_BODY: 'Invalid request body',
    INVALID_ACTION: 'Invalid action',
    INVALID_NOTE: 'Invalid note',
  } as const;
  throw new MidaoRouteError(code, messages[code], 422);
}

function normalizeBookingId(value: unknown): string {
  if (typeof value !== 'string' || !UUID_PATTERN.test(value.trim())) invalid('INVALID_BOOKING_ID');
  return value.trim().toLowerCase();
}

function normalizeDecisionBody(value: unknown): { body: Record<string, string>; action: 'approve' | 'reject'; note: string | null } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid('INVALID_REQUEST_BODY');
  const body = value as Record<string, unknown>;
  const keys = Object.keys(body).sort();
  if (keys.join(',') !== 'action' && keys.join(',') !== 'action,note') invalid('INVALID_REQUEST_BODY');

  if (body.action !== 'approve' && body.action !== 'reject') invalid('INVALID_ACTION');
  const action = body.action;
  let note: string | null = null;
  if (Object.prototype.hasOwnProperty.call(body, 'note')) {
    if (typeof body.note !== 'string') invalid('INVALID_NOTE');
    note = body.note.trim();
    if (Buffer.byteLength(note, 'utf8') > 1000) invalid('INVALID_NOTE');
    if (!note && action === 'reject') invalid('INVALID_NOTE');
  }
  if (action === 'reject' && !note) invalid('INVALID_NOTE');

  const normalizedBody: Record<string, string> = { action };
  if (note) normalizedBody.note = note;
  return { body: normalizedBody, action, note: note || null };
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ bookingId: string }> },
) {
  return withMidaoGuideCommand(
    request,
    async ({ guideId, actorType, actorId, idempotencyKey, body }) => {
      const bookingId = normalizeBookingId((await params).bookingId);
      const normalized = normalizeDecisionBody(body);
      const requestHash = hashIdempotentRequest(normalized.body);
      return decideMidaoBookingRequestDb({
        guideId,
        actorType,
        actorId,
        bookingId,
        action: normalized.action,
        note: normalized.note,
        idempotencyKey,
        requestHash,
      });
    },
    { route: 'v2/guide/bookings/[bookingId]/commands/decide' },
  );
}
