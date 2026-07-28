import { listGuideMessageThreadsDb } from '../db-order-messages.mjs';
import { listMidaoRequestsDb } from './db-requests.mjs';
import { resolveMidaoRequestList } from './request-list-resolver.ts';

const REQUEST_PAGE_LIMIT = 50;
const MAX_REQUEST_PAGES = 1000;
const PRIORITY_RANK = new Map([
  ['needs_reply', 0],
  ['new', 1],
  ['replied', 2],
  ['completed', 3],
]);
const THREAD_KEYS = [
  'activityTitle',
  'canPost',
  'contactName',
  'lastMessage',
  'messageCount',
  'needsReply',
  'orderId',
  'orderStatus',
  'scheduleStartAt',
];
const LAST_MESSAGE_KEYS = ['body', 'createdAt', 'id', 'orderId', 'senderId', 'senderRole'];
const SENDER_ROLES = new Set(['traveler', 'guide', 'admin']);
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;

export class InvalidMidaoHomeProjectionError extends TypeError {
  readonly code = 'INVALID_MIDAO_HOME_PROJECTION';

  constructor() {
    super('Invalid Midao home projection');
    this.name = 'InvalidMidaoHomeProjectionError';
  }
}

function fail(): never {
  throw new InvalidMidaoHomeProjectionError();
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
  return requireNonEmptyString(value);
}

function requireTimestamp(value: unknown): string {
  if (typeof value !== 'string' || !ISO_TIMESTAMP.test(value)) fail();
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString() !== value) fail();
  return value;
}

function requireNullableTimestamp(value: unknown): string | null {
  if (value === null) return null;
  return requireTimestamp(value);
}

function requireNonNegativeInteger(value: unknown): number {
  if (!Number.isInteger(value) || (value as number) < 0) fail();
  return value as number;
}

function comparePriority(left: ResolvedBooking, right: ResolvedBooking): number {
  const rank = (PRIORITY_RANK.get(left.bucket) ?? Number.MAX_SAFE_INTEGER)
    - (PRIORITY_RANK.get(right.bucket) ?? Number.MAX_SAFE_INTEGER);
  if (rank !== 0) return rank;
  const updated = right.updatedAt.localeCompare(left.updatedAt);
  if (updated !== 0) return updated;
  return right.requestRef.localeCompare(left.requestRef);
}

function compareRecent(left: ResolvedBooking, right: ResolvedBooking): number {
  const updated = right.updatedAt.localeCompare(left.updatedAt);
  if (updated !== 0) return updated;
  return left.requestRef.localeCompare(right.requestRef);
}

type ResolvedBooking = ReturnType<typeof resolveMidaoRequestList>['items'][number];

type ResolvedRequestPage = {
  items: ResolvedBooking[];
  nextCursor: string | null;
};

type HomeInput = {
  guideName: unknown;
  requestPages: unknown;
  messageThreads: unknown;
};

function resolveMessageThread(value: unknown): { needsReply: boolean; latestAt: string } {
  const thread = requireExactObject(value, THREAD_KEYS);
  const orderId = requireNonEmptyString(thread.orderId);
  requireNonEmptyString(thread.orderStatus);
  requireNullableString(thread.activityTitle);
  requireNullableString(thread.contactName);
  requireNullableTimestamp(thread.scheduleStartAt);
  const messageCount = requireNonNegativeInteger(thread.messageCount);
  if (messageCount < 1 || typeof thread.canPost !== 'boolean' || typeof thread.needsReply !== 'boolean') fail();

  const lastMessage = requireExactObject(thread.lastMessage, LAST_MESSAGE_KEYS);
  const messageOrderId = requireNonEmptyString(lastMessage.orderId);
  if (messageOrderId !== orderId) fail();
  requireNonEmptyString(lastMessage.id);
  requireNonEmptyString(lastMessage.body);
  requireNullableString(lastMessage.senderId);
  const senderRole = requireNonEmptyString(lastMessage.senderRole);
  if (!SENDER_ROLES.has(senderRole)) fail();
  const latestAt = requireTimestamp(lastMessage.createdAt);
  if (thread.needsReply !== (senderRole === 'traveler')) fail();

  return { needsReply: thread.needsReply, latestAt };
}

function resolveRequestPages(requestPages: unknown): ResolvedBooking[] {
  if (!Array.isArray(requestPages)) fail();
  const resolved: ResolvedBooking[] = [];
  for (const page of requestPages) {
    const projection = resolveMidaoRequestList(page) as ResolvedRequestPage;
    resolved.push(...projection.items);
  }
  return resolved;
}

export function resolveMidaoHome({ guideName, requestPages, messageThreads }: HomeInput) {
  const displayName = requireNonEmptyString(guideName);
  const requests = resolveRequestPages(requestPages);
  if (!Array.isArray(messageThreads)) fail();

  let messageThreadsNeedingReply = 0;
  let latestNeedsReplyAt: string | null = null;
  for (const thread of messageThreads) {
    const resolved = resolveMessageThread(thread);
    if (!resolved.needsReply) continue;
    messageThreadsNeedingReply += 1;
    if (latestNeedsReplyAt === null || resolved.latestAt > latestNeedsReplyAt) {
      latestNeedsReplyAt = resolved.latestAt;
    }
  }

  const pendingBookingRequests = requests.filter((request) => (
    request.kind === 'booking'
    && request.bucket === 'new'
    && request.guideApprovalStatus === 'pending'
  )).length;
  const priorityRequests = [...requests]
    .sort(comparePriority)
    .slice(0, 3)
    .map((request) => ({
      requestRef: request.requestRef,
      travelerDisplayName: request.traveler.displayName,
      serviceTitle: request.service.title,
      startAt: request.request.startAt,
      partySize: request.request.partySize,
      receivedAt: request.receivedAt,
      paymentDeadlineAt: request.paymentDeadlineAt,
      needsReply: request.needsReply,
    }));
  const recentProgress = [...requests]
    .sort(compareRecent)
    .slice(0, 3)
    .map((request) => ({
      requestRef: request.requestRef,
      serviceTitle: request.service.title,
      bucket: request.bucket,
      secondaryState: request.secondaryState,
      updatedAt: request.updatedAt,
    }));

  return {
    profile: { displayName },
    counters: { pendingBookingRequests, messageThreadsNeedingReply },
    priorityRequests,
    recentProgress,
    messages: { latestNeedsReplyAt },
  };
}

export async function loadMidaoHome({ guideId, guideName }: { guideId: string; guideName: string }) {
  if (typeof guideId !== 'string' || guideId.length === 0) fail();
  const requestPages: ResolvedRequestPage[] = [];
  const seenCursors = new Set<string>();
  let cursor: string | null = null;

  for (let pageNumber = 0; pageNumber < MAX_REQUEST_PAGES; pageNumber += 1) {
    const projection = await listMidaoRequestsDb({
      guideId,
      bucket: 'all',
      sort: 'priority',
      limit: REQUEST_PAGE_LIMIT,
      cursor,
    });
    const page = resolveMidaoRequestList(projection) as ResolvedRequestPage;
    requestPages.push(page);
    if (page.nextCursor === null) {
      const messageThreads = await listGuideMessageThreadsDb({ guideId, guideSlug: guideId });
      return resolveMidaoHome({ guideName, requestPages, messageThreads });
    }
    if (page.nextCursor.length === 0 || seenCursors.has(page.nextCursor)) fail();
    seenCursors.add(page.nextCursor);
    cursor = page.nextCursor;
  }

  fail();
}
