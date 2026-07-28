import { resolveRequestBucket } from './request-buckets.mjs';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;
const CANONICAL_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
const MASKED_EMAIL_PATTERN = /^[^@\s]\*\*\*@[^@\s]+$/u;
const LIST_INPUT_KEYS = ['items', 'nextCursor'];
const LIST_ITEM_KEYS = [
  'kind',
  'requestRef',
  'bookingId',
  'orderId',
  'bookingNo',
  'bookingStatus',
  'guideApprovalStatus',
  'orderStatus',
  'bucket',
  'secondaryState',
  'needsReply',
  'traveler',
  'service',
  'request',
  'totalTwd',
  'paymentDeadlineAt',
  'receivedAt',
  'updatedAt',
  'lastMessageAt',
];
const DETAIL_ITEM_KEYS = [...LIST_ITEM_KEYS, 'status'];
const TRAVELER_KEYS = ['displayName', 'emailMasked'];
const DETAIL_TRAVELER_KEYS = [...TRAVELER_KEYS, 'contactEmail', 'contactPhone'];
const SERVICE_KEYS = ['activityId', 'activityPlanId', 'title', 'planName', 'bookingType'];
const REQUEST_KEYS = ['startAt', 'endAt', 'timezone', 'partySize'];
const DETAIL_REQUEST_KEYS = [...REQUEST_KEYS, 'customerNote'];
const DETAIL_STATUS_KEYS = [
  'bookingStatus',
  'guideApprovalStatus',
  'orderStatus',
  'guideApprovalDecidedAt',
  'guideApprovalNote',
];

export class InvalidMidaoRequestProjectionError extends TypeError {
  readonly code = 'INVALID_MIDAO_REQUEST_PROJECTION';

  constructor() {
    super('Invalid Midao request projection');
    this.name = 'InvalidMidaoRequestProjectionError';
  }
}

function fail(): never {
  throw new InvalidMidaoRequestProjectionError();
}

type ResolvedBucket = {
  ok: true;
  bucket: string;
  secondaryState: string | null;
};

function isResolvedBucket(value: unknown): value is ResolvedBucket {
  return isRecord(value)
    && value.ok === true
    && typeof value.bucket === 'string'
    && (value.secondaryState === null || typeof value.secondaryState === 'string');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: unknown, expected: readonly string[]): value is Record<string, unknown> {
  if (!isRecord(value)) return false;
  const actual = Object.keys(value).sort();
  return actual.length === expected.length
    && actual.every((key, index) => key === [...expected].sort()[index]);
}

function requireExactObject(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!hasExactKeys(value, keys)) fail();
  return value;
}

function requireNullableString(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value !== 'string') fail();
  return value;
}

function requireNonEmptyString(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0) fail();
  return value;
}

function requireUuid(value: unknown): string {
  if (typeof value !== 'string' || !UUID_PATTERN.test(value)) fail();
  return value;
}

function requireCanonicalTimestamp(value: unknown): string {
  if (typeof value !== 'string' || !CANONICAL_TIMESTAMP_PATTERN.test(value)) fail();
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString() !== value) fail();
  return value;
}

function requireNullableTimestamp(value: unknown): string | null {
  if (value === null) return null;
  return requireCanonicalTimestamp(value);
}

function requireNullableFiniteNumber(value: unknown): number | null {
  if (value === null) return null;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) fail();
  return value;
}

function requireNullablePartySize(value: unknown): number | null {
  if (value === null) return null;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) fail();
  return value;
}

function resolveBookingProjection(value: unknown, detail: boolean) {
  const item = requireExactObject(value, detail ? DETAIL_ITEM_KEYS : LIST_ITEM_KEYS);
  if (item.kind !== 'booking') fail();

  const bookingId = requireUuid(item.bookingId);
  const orderId = requireUuid(item.orderId);
  if (bookingId === orderId || item.requestRef !== `booking_${bookingId}`) fail();

  const bookingNo = requireNullableString(item.bookingNo);
  const bookingStatus = requireNonEmptyString(item.bookingStatus);
  const guideApprovalStatus = requireNonEmptyString(item.guideApprovalStatus);
  const orderStatus = requireNonEmptyString(item.orderStatus);
  const needsReply = item.needsReply;
  if (typeof needsReply !== 'boolean') fail();

  const bucketResult: unknown = resolveRequestBucket({
    kind: 'booking',
    bookingStatus,
    guideApprovalStatus,
    orderStatus,
    needsReply,
  });
  if (!isResolvedBucket(bucketResult)
    || bucketResult.bucket !== item.bucket
    || bucketResult.secondaryState !== item.secondaryState) fail();

  const traveler = requireExactObject(
    item.traveler,
    detail ? DETAIL_TRAVELER_KEYS : TRAVELER_KEYS,
  );
  const displayName = requireNullableString(traveler.displayName);
  const emailMasked = requireNullableString(traveler.emailMasked);
  if (emailMasked !== null && !MASKED_EMAIL_PATTERN.test(emailMasked)) fail();
  const contactEmail = detail ? requireNullableString(traveler.contactEmail) : null;
  const contactPhone = detail ? requireNullableString(traveler.contactPhone) : null;

  const service = requireExactObject(item.service, SERVICE_KEYS);
  const activityId = requireUuid(service.activityId);
  const activityPlanId = requireUuid(service.activityPlanId);
  const title = requireNullableString(service.title);
  const planName = requireNullableString(service.planName);
  if (service.bookingType !== 'request') fail();

  const request = requireExactObject(
    item.request,
    detail ? DETAIL_REQUEST_KEYS : REQUEST_KEYS,
  );
  const startAt = requireCanonicalTimestamp(request.startAt);
  const endAt = requireCanonicalTimestamp(request.endAt);
  const timezone = requireNonEmptyString(request.timezone);
  const partySize = requireNullablePartySize(request.partySize);
  const customerNote = detail ? requireNullableString(request.customerNote) : null;

  const base = {
    kind: 'booking' as const,
    requestRef: `booking_${bookingId}`,
    bookingId,
    orderId,
    bookingNo,
    bookingStatus,
    guideApprovalStatus,
    orderStatus,
    bucket: bucketResult.bucket,
    secondaryState: bucketResult.secondaryState,
    needsReply,
    traveler: { displayName, emailMasked },
    service: { activityId, activityPlanId, title, planName, bookingType: 'request' as const },
    request: { startAt, endAt, timezone, partySize },
    totalTwd: requireNullableFiniteNumber(item.totalTwd),
    paymentDeadlineAt: requireNullableTimestamp(item.paymentDeadlineAt),
    receivedAt: requireCanonicalTimestamp(item.receivedAt),
    updatedAt: requireCanonicalTimestamp(item.updatedAt),
    lastMessageAt: requireNullableTimestamp(item.lastMessageAt),
  };

  if (!detail) return base;

  const status = requireExactObject(item.status, DETAIL_STATUS_KEYS);
  const statusBookingStatus = requireNonEmptyString(status.bookingStatus);
  const statusGuideApprovalStatus = requireNonEmptyString(status.guideApprovalStatus);
  const statusOrderStatus = requireNonEmptyString(status.orderStatus);
  if (statusBookingStatus !== bookingStatus
    || statusGuideApprovalStatus !== guideApprovalStatus
    || statusOrderStatus !== orderStatus) fail();

  return {
    ...base,
    traveler: { ...base.traveler, contactEmail, contactPhone },
    request: { ...base.request, customerNote },
    status: {
      bookingStatus: statusBookingStatus,
      guideApprovalStatus: statusGuideApprovalStatus,
      orderStatus: statusOrderStatus,
      guideApprovalDecidedAt: requireNullableTimestamp(status.guideApprovalDecidedAt),
      guideApprovalNote: requireNullableString(status.guideApprovalNote),
    },
  };
}

export function projectMidaoBookingDetail(value: unknown) {
  return resolveBookingProjection(value, true);
}

export function resolveMidaoRequestList(input: unknown) {
  const projection = requireExactObject(input, LIST_INPUT_KEYS);
  if (!Array.isArray(projection.items)) fail();
  if (projection.nextCursor !== null && typeof projection.nextCursor !== 'string') fail();

  return {
    items: projection.items.map((item) => resolveBookingProjection(item, false)),
    nextCursor: projection.nextCursor,
  };
}
