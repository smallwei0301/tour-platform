import { canTransitionInquiryState } from './inquiry-state-machine.mjs';
import { resolveRequestBucket } from './request-buckets.mjs';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;
const CANONICAL_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/u;
const TIME_PATTERN = /^\d{2}:\d{2}(?::\d{2})?$/u;

const INQUIRY_ITEM_KEYS = [
  'kind',
  'requestRef',
  'inquiryId',
  'inquiryNo',
  'inquiryStatus',
  'bucket',
  'secondaryState',
  'needsReply',
  'traveler',
  'service',
  'request',
  'plan',
  'convertedBookingId',
  'lastRepliedAt',
  'expiresAt',
  'receivedAt',
  'updatedAt',
];
const INQUIRY_TRAVELER_KEYS = ['displayName', 'emailMasked'];
const INQUIRY_SERVICE_KEYS = ['activityId', 'activityPlanId', 'title', 'planName', 'bookingType'];
const INQUIRY_REQUEST_KEYS = [
  'preferredDate',
  'backupDate',
  'startTimeLocal',
  'partySize',
  'language',
  'pickupRequired',
  'travelerNote',
];
const INQUIRY_PLAN_KEYS = [
  'activityPlanId',
  'name',
  'bookingType',
  'status',
  'minParticipants',
  'maxParticipants',
  'basePrice',
];
const INQUIRY_STATUSES = new Set([
  'new',
  'opened',
  'replied',
  'ready_to_convert',
  'converted',
  'closed',
  'expired',
]);

export class InvalidMidaoInquiryProjectionError extends TypeError {
  readonly code = 'INVALID_MIDAO_INQUIRY_PROJECTION';

  constructor() {
    super('Invalid Midao inquiry projection');
    this.name = 'InvalidMidaoInquiryProjectionError';
  }
}

function fail(): never {
  throw new InvalidMidaoInquiryProjectionError();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: unknown, expected: readonly string[]): value is Record<string, unknown> {
  if (!isRecord(value)) return false;
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  return actual.length === wanted.length && actual.every((key, index) => key === wanted[index]);
}

function requireExactObject(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!hasExactKeys(value, keys)) fail();
  return value;
}

function requireNonEmptyString(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0) fail();
  return value;
}

function requireNullableString(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value !== 'string') fail();
  return value;
}

function requireNullableBoolean(value: unknown): boolean | null {
  if (value === null) return null;
  if (typeof value !== 'boolean') fail();
  return value;
}

function requireUuid(value: unknown): string {
  if (typeof value !== 'string' || !UUID_PATTERN.test(value)) fail();
  return value;
}

function requireNullableUuid(value: unknown): string | null {
  if (value === null) return null;
  return requireUuid(value);
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

function requireNullableDate(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value !== 'string' || !DATE_PATTERN.test(value)) fail();
  return value;
}

function requireNullableTime(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value !== 'string' || !TIME_PATTERN.test(value)) fail();
  return value;
}

function requireNullablePartySize(value: unknown): number | null {
  if (value === null) return null;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) fail();
  return value;
}

function requirePositiveInteger(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) fail();
  return value;
}

function requireNonNegativeFinite(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) fail();
  return value;
}

type InquiryPlanSummary = {
  activityPlanId: string;
  name: string | null;
  bookingType: string;
  status: string;
  minParticipants: number;
  maxParticipants: number;
  basePrice: number;
};

function resolvePlanSummary(value: unknown, activityPlanId: string | null): InquiryPlanSummary | null {
  if (value === null) return null;
  const plan = requireExactObject(value, INQUIRY_PLAN_KEYS);
  const planId = requireUuid(plan.activityPlanId);
  if (activityPlanId === null || planId !== activityPlanId) fail();
  const minParticipants = requirePositiveInteger(plan.minParticipants);
  const maxParticipants = requirePositiveInteger(plan.maxParticipants);
  if (maxParticipants < minParticipants) fail();
  return {
    activityPlanId: planId,
    name: requireNullableString(plan.name),
    bookingType: requireNonEmptyString(plan.bookingType),
    status: requireNonEmptyString(plan.status),
    minParticipants,
    maxParticipants,
    basePrice: requireNonNegativeFinite(plan.basePrice),
  };
}

export function resolveMidaoInquiryDetail(projection: unknown) {
  const item = requireExactObject(projection, INQUIRY_ITEM_KEYS);
  if (item.kind !== 'inquiry') fail();

  const inquiryId = requireUuid(item.inquiryId);
  if (item.requestRef !== `inquiry_${inquiryId}`) fail();
  const inquiryNo = requireNonEmptyString(item.inquiryNo);
  const inquiryStatus = requireNonEmptyString(item.inquiryStatus);
  if (!INQUIRY_STATUSES.has(inquiryStatus)) fail();

  const needsReply = item.needsReply;
  if (typeof needsReply !== 'boolean') fail();
  if (needsReply !== (inquiryStatus === 'new' || inquiryStatus === 'opened')) fail();

  const bucketResult: unknown = resolveRequestBucket({ kind: 'inquiry', inquiryStatus, needsReply });
  if (!isRecord(bucketResult)
    || bucketResult.ok !== true
    || typeof bucketResult.bucket !== 'string'
    || (bucketResult.secondaryState !== null && typeof bucketResult.secondaryState !== 'string')
    || bucketResult.bucket !== item.bucket
    || bucketResult.secondaryState !== item.secondaryState) fail();

  const traveler = requireExactObject(item.traveler, INQUIRY_TRAVELER_KEYS);
  if (traveler.displayName !== null || traveler.emailMasked !== null) fail();

  const service = requireExactObject(item.service, INQUIRY_SERVICE_KEYS);
  const activityId = requireUuid(service.activityId);
  const activityPlanId = requireNullableUuid(service.activityPlanId);
  const title = requireNullableString(service.title);
  const planName = requireNullableString(service.planName);
  if (service.bookingType !== 'request' && service.bookingType !== null) fail();
  const bookingType = service.bookingType as 'request' | null;

  const request = requireExactObject(item.request, INQUIRY_REQUEST_KEYS);
  const preferredDate = requireNullableDate(request.preferredDate);
  const backupDate = requireNullableDate(request.backupDate);
  if (preferredDate !== null && backupDate !== null && backupDate < preferredDate) fail();

  const plan = resolvePlanSummary(item.plan, activityPlanId);

  const allowedActions = {
    approve: false as const,
    reject: false as const,
    markReplied: canTransitionInquiryState(inquiryStatus, 'replied') === true,
    convertInquiry: canTransitionInquiryState(inquiryStatus, 'converted') === true
      && plan !== null
      && plan.status === 'active'
      && plan.bookingType === 'request',
  };

  return {
    kind: 'inquiry' as const,
    requestRef: `inquiry_${inquiryId}`,
    inquiryId,
    inquiryNo,
    inquiryStatus,
    bucket: bucketResult.bucket,
    secondaryState: bucketResult.secondaryState,
    needsReply,
    traveler: { displayName: null, emailMasked: null },
    service: { activityId, activityPlanId, title, planName, bookingType },
    request: {
      preferredDate,
      backupDate,
      startTimeLocal: requireNullableTime(request.startTimeLocal),
      partySize: requireNullablePartySize(request.partySize),
      language: requireNullableString(request.language),
      pickupRequired: requireNullableBoolean(request.pickupRequired),
      travelerNote: requireNullableString(request.travelerNote),
    },
    plan,
    convertedBookingId: requireNullableUuid(item.convertedBookingId),
    lastRepliedAt: requireNullableTimestamp(item.lastRepliedAt),
    expiresAt: requireNullableTimestamp(item.expiresAt),
    receivedAt: requireCanonicalTimestamp(item.receivedAt),
    updatedAt: requireCanonicalTimestamp(item.updatedAt),
    allowedActions,
  };
}
