import { createHmac, timingSafeEqual } from 'node:crypto';

import { getGuideSessionSecurityEnv } from '../../config/guide-session-env.mjs';
import { formatRequestRef } from './request-ref.mjs';
import { REQUEST_BUCKETS, resolveRequestBucket } from './request-buckets.mjs';
import { getSupabase, hasSupabaseEnv } from '../supabase-env.mjs';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;
const SORTS = new Set(['priority', 'updated_desc', 'service_asc']);
const BUCKETS = new Set(['all', ...REQUEST_BUCKETS]);
const BUCKET_PRIORITY = new Map([
  ['needs_reply', 0],
  ['new', 1],
  ['replied', 2],
  ['completed', 3],
]);
const MESSAGE_SENDER_ROLES = new Set(['traveler', 'guide', 'admin']);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const WIRE_TIMESTAMP_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?(Z|([+-])(\d{2}):(\d{2}))$/u;
const BOOKING_DETAIL_SELECT = `
  id, booking_no, guide_id, order_id, activity_id, activity_plan_id,
  status, guide_approval_status, guide_approval_decided_at, guide_approval_note,
  start_at, end_at, timezone, participants, customer_note, created_at, updated_at,
  activities!inner(id, title),
  activity_plans!inner(id, name, booking_type),
  orders!orders_booking_id_fkey(
    id, booking_id, status, total_twd, contact_name, contact_email, contact_phone,
    payment_deadline_at, created_at, updated_at,
    order_messages(id, sender_role, created_at)
  )
`;

const bookingRequestStore = new Map();
const inquiryPlanStore = new Map();

export function __resetMidaoRequestsStoreForTest() {
  bookingRequestStore.clear();
  inquiryPlanStore.clear();
}

export function __seedMidaoInquiryPlanForTest(row) {
  const copy = structuredClone(row);
  inquiryPlanStore.set(copy.id, copy);
  return structuredClone(copy);
}

export function __seedMidaoBookingRequestForTest(row) {
  const copy = structuredClone(row);
  bookingRequestStore.set(copy.id, copy);
  return structuredClone(copy);
}

function badRequest(message) {
  throw new Error(`BAD_REQUEST: ${message}`);
}

function requireGuideId(guideId) {
  if (typeof guideId !== 'string' || !guideId.trim()) badRequest('guideId required');
  return guideId.trim();
}

function requireOneRelation(value, field) {
  if (Array.isArray(value)) {
    if (value.length !== 1 || !value[0] || typeof value[0] !== 'object') {
      throw new Error(`INVALID_REQUEST_ROW: ${field} relation cardinality`);
    }
    return value[0];
  }
  if (!value || typeof value !== 'object') {
    throw new Error(`INVALID_REQUEST_ROW: ${field} relation missing`);
  }
  return value;
}

function latestMessage(order) {
  const messages = order?.order_messages;
  if (!Array.isArray(messages)) throw new Error('INVALID_REQUEST_ROW: order messages malformed');
  let latest = null;
  for (const message of messages) {
    const createdAt = normalizeWireTimestamp(message?.created_at);
    if (
      !message
      || typeof message !== 'object'
      || !UUID_PATTERN.test(String(message.id || '').toLowerCase())
      || !MESSAGE_SENDER_ROLES.has(message.sender_role)
      || createdAt === null
    ) {
      throw new Error('INVALID_REQUEST_ROW: order message malformed');
    }
    const normalized = { id: message.id, sender_role: message.sender_role, created_at: createdAt };
    if (!latest || normalized.created_at > latest.created_at
      || (normalized.created_at === latest.created_at && normalized.id > latest.id)) latest = normalized;
  }
  return latest;
}

function maskEmail(value) {
  if (typeof value !== 'string') return null;
  const at = value.lastIndexOf('@');
  if (at <= 0 || at === value.length - 1) return null;
  return `${value[0]}***@${value.slice(at + 1)}`;
}

function maxTimestamp(...values) {
  return values.filter((value) => typeof value === 'string').sort().at(-1) ?? null;
}

function mapBookingRequestRow(row, { detail = false } = {}) {
  if (!row || typeof row !== 'object' || typeof row.guide_id !== 'string' || !row.guide_id) {
    throw new Error('INVALID_REQUEST_ROW: guide ownership missing');
  }

  const activity = requireOneRelation(row.activities, 'activity');
  const plan = requireOneRelation(row.activity_plans, 'activity plan');
  const order = requireOneRelation(row.orders, 'order');
  if (!UUID_PATTERN.test(String(row.id || '').toLowerCase())) {
    throw new Error('INVALID_REQUEST_ROW: invalid booking id');
  }
  if (!row.activity_id || activity.id !== row.activity_id) {
    throw new Error('INVALID_REQUEST_ROW: activity relation mismatched');
  }
  if (!row.activity_plan_id || plan.id !== row.activity_plan_id || plan.booking_type !== 'request') {
    throw new Error('INVALID_REQUEST_ROW: request plan missing or mismatched');
  }
  if (!order || !row.order_id || order.id !== row.order_id || order.booking_id !== row.id) {
    throw new Error('INVALID_REQUEST_ROW: order relation missing or mismatched');
  }
  const timestamps = {
    createdAt: normalizeWireTimestamp(row.created_at),
    updatedAt: normalizeWireTimestamp(row.updated_at),
    startAt: normalizeWireTimestamp(row.start_at),
    endAt: normalizeWireTimestamp(row.end_at),
    orderCreatedAt: normalizeWireTimestamp(order.created_at),
    orderUpdatedAt: normalizeWireTimestamp(order.updated_at),
    paymentDeadlineAt: order.payment_deadline_at === null
      ? null : normalizeWireTimestamp(order.payment_deadline_at),
    guideApprovalDecidedAt: row.guide_approval_decided_at === null
      ? null : normalizeWireTimestamp(row.guide_approval_decided_at),
  };
  if (
    [timestamps.createdAt, timestamps.updatedAt, timestamps.startAt, timestamps.endAt,
      timestamps.orderCreatedAt, timestamps.orderUpdatedAt].some((value) => value === null)
    || (order.payment_deadline_at !== null && timestamps.paymentDeadlineAt === null)
    || (row.guide_approval_decided_at !== null && timestamps.guideApprovalDecidedAt === null)
  ) {
    throw new Error('INVALID_REQUEST_ROW: timestamp malformed');
  }

  const last = latestMessage(order);
  const needsReply = last?.sender_role === 'traveler';
  const bucketResult = resolveRequestBucket({
    kind: 'booking',
    bookingStatus: row.status,
    guideApprovalStatus: row.guide_approval_status,
    orderStatus: order.status,
    needsReply,
  });
  if (!bucketResult.ok) {
    throw new Error(`INVALID_REQUEST_ROW: ${bucketResult.error.field}`);
  }

  const common = {
    kind: 'booking',
    requestRef: formatRequestRef('booking', row.id),
    bookingId: row.id,
    orderId: order.id,
    bookingNo: row.booking_no ?? null,
    bookingStatus: row.status,
    guideApprovalStatus: row.guide_approval_status,
    orderStatus: order.status,
    bucket: bucketResult.bucket,
    secondaryState: bucketResult.secondaryState,
    needsReply,
    traveler: {
      displayName: order.contact_name ?? null,
      emailMasked: maskEmail(order.contact_email),
    },
    service: {
      activityId: row.activity_id ?? activity?.id ?? null,
      activityPlanId: row.activity_plan_id ?? plan.id ?? null,
      title: activity?.title ?? null,
      planName: plan.name ?? null,
      bookingType: plan.booking_type,
    },
    request: {
      startAt: timestamps.startAt,
      endAt: timestamps.endAt,
      timezone: row.timezone ?? 'Asia/Taipei',
      partySize: row.participants ?? null,
    },
    totalTwd: order.total_twd ?? null,
    paymentDeadlineAt: timestamps.paymentDeadlineAt,
    receivedAt: timestamps.createdAt,
    updatedAt: maxTimestamp(timestamps.updatedAt, timestamps.orderUpdatedAt, last?.created_at),
    lastMessageAt: last?.created_at ?? null,
  };

  if (!detail) return common;
  return {
    ...common,
    traveler: {
      ...common.traveler,
      contactEmail: order.contact_email ?? null,
      contactPhone: order.contact_phone ?? null,
    },
    request: {
      ...common.request,
      customerNote: row.customer_note ?? null,
    },
    status: {
      bookingStatus: row.status,
      guideApprovalStatus: row.guide_approval_status,
      orderStatus: order.status,
      guideApprovalDecidedAt: timestamps.guideApprovalDecidedAt,
      guideApprovalNote: row.guide_approval_note ?? null,
    },
  };
}

function validateListInput(input) {
  const guideId = requireGuideId(input?.guideId);
  const bucket = input?.bucket ?? 'all';
  const sort = input?.sort ?? 'priority';
  const limit = input?.limit ?? DEFAULT_LIMIT;
  if (!BUCKETS.has(bucket)) badRequest('invalid bucket');
  if (!SORTS.has(sort)) badRequest('invalid sort');
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) badRequest('invalid limit');
  return { guideId, bucket, sort, limit, cursor: input?.cursor ?? null };
}

function sortKey(item, sort) {
  if (sort === 'priority') return [BUCKET_PRIORITY.get(item.bucket), item.updatedAt, item.bookingId];
  if (sort === 'updated_desc') return [item.updatedAt, item.bookingId];
  return [item.request.startAt, item.bookingId];
}

function compareKeys(sort, left, right) {
  if (sort === 'priority') {
    const rank = left[0] - right[0];
    if (rank !== 0) return rank;
    const updated = String(right[1]).localeCompare(String(left[1]));
    if (updated !== 0) return updated;
    return String(right[2]).localeCompare(String(left[2]));
  }
  if (sort === 'updated_desc') {
    const updated = String(right[0]).localeCompare(String(left[0]));
    if (updated !== 0) return updated;
    return String(right[1]).localeCompare(String(left[1]));
  }
  const service = String(left[0]).localeCompare(String(right[0]));
  if (service !== 0) return service;
  return String(left[1]).localeCompare(String(right[1]));
}

function compareItems(sort) {
  return (left, right) => compareKeys(sort, sortKey(left, sort), sortKey(right, sort));
}

function cursorSecret() {
  const secret = getGuideSessionSecurityEnv().secret;
  if (Buffer.byteLength(secret, 'utf8') < 32 || /[\r\n\0]/u.test(secret)) {
    throw new Error('CURSOR_CONFIG_ERROR: cursor signing unavailable');
  }
  return secret;
}

function cursorSignature(payload) {
  return createHmac('sha256', cursorSecret()).update(payload).digest();
}

function encodeCursor(item, options) {
  const payload = Buffer.from(JSON.stringify({
    v: 1,
    guideId: options.guideId,
    bucket: options.bucket,
    sort: options.sort,
    key: sortKey(item, options.sort),
  })).toString('base64url');
  return `${payload}.${cursorSignature(payload).toString('base64url')}`;
}

function normalizeWireTimestamp(value) {
  if (typeof value !== 'string') return null;
  const match = WIRE_TIMESTAMP_PATTERN.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  if (year < 1 || month < 1 || month > 12 || hour > 23 || minute > 59 || second > 59) return null;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (day < 1 || day > daysInMonth[month - 1]) return null;
  if (match[8] !== 'Z') {
    const offsetHour = Number(match[10]);
    const offsetMinute = Number(match[11]);
    if (offsetHour > 14 || offsetMinute > 59 || (offsetHour === 14 && offsetMinute !== 0)) return null;
  }
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return null;
  try { return new Date(parsed).toISOString(); } catch { return null; }
}

function validIsoTimestamp(value) {
  return normalizeWireTimestamp(value) !== null;
}

function validCursorKey(key, sort) {
  if (!Array.isArray(key)) return false;
  if (sort === 'priority') {
    return key.length === 3 && Number.isInteger(key[0]) && key[0] >= 0 && key[0] <= 3
      && validIsoTimestamp(key[1]) && UUID_PATTERN.test(key[2]);
  }
  return key.length === 2 && validIsoTimestamp(key[0]) && UUID_PATTERN.test(key[1]);
}

function decodeCursor(cursor, options) {
  if (cursor === null) return null;
  if (typeof cursor !== 'string' || !cursor) throw new Error('INVALID_CURSOR: invalid cursor');
  try {
    const parts = cursor.split('.');
    if (parts.length !== 2 || !parts[0] || !parts[1]) throw new Error('invalid');
    const expected = cursorSignature(parts[0]);
    const observed = Buffer.from(parts[1], 'base64url');
    if (observed.length !== expected.length || !timingSafeEqual(observed, expected)) throw new Error('invalid');
    const parsed = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
    const keys = Object.keys(parsed).sort();
    if (
      keys.join(',') !== 'bucket,guideId,key,sort,v'
      || parsed.v !== 1
      || parsed.guideId !== options.guideId
      || parsed.bucket !== options.bucket
      || parsed.sort !== options.sort
      || !validCursorKey(parsed.key, options.sort)
    ) throw new Error('invalid');
    return parsed;
  } catch (error) {
    if (error?.message?.startsWith('CURSOR_CONFIG_ERROR:')) throw error;
    throw new Error('INVALID_CURSOR: invalid cursor');
  }
}

function paginateRows(rows, options) {
  const mapped = rows.map((row) => mapBookingRequestRow(row));
  const filtered = options.bucket === 'all'
    ? mapped
    : mapped.filter((item) => item.bucket === options.bucket);
  const compare = compareItems(options.sort);
  const sorted = filtered.sort(compare);
  const cursor = decodeCursor(options.cursor, options);
  const afterCursor = cursor
    ? sorted.filter((item) => compareKeys(options.sort, sortKey(item, options.sort), cursor.key) > 0)
    : sorted;
  const items = afterCursor.slice(0, options.limit);
  return {
    items,
    nextCursor: afterCursor.length > options.limit
      ? encodeCursor(items.at(-1), options)
      : null,
  };
}

const RPC_LIST_KEYS = [
  'activity_id', 'activity_plan_id', 'activity_title', 'booking_id', 'booking_no',
  'booking_status', 'booking_type', 'bucket', 'display_name', 'email_masked', 'end_at',
  'guide_approval_status', 'guide_id', 'last_message_at', 'needs_reply', 'order_id',
  'order_status', 'party_size', 'payment_deadline_at', 'plan_name', 'priority_rank',
  'received_at', 'secondary_state', 'start_at', 'timezone', 'total_twd', 'updated_at',
].sort();

function mapRpcListRow(row, options) {
  if (!row || typeof row !== 'object' || Array.isArray(row)
    || Object.keys(row).sort().join(',') !== RPC_LIST_KEYS.join(',')) {
    throw new Error('INVALID_REQUEST_ROW: RPC projection shape');
  }
  const timestamps = {
    startAt: normalizeWireTimestamp(row.start_at),
    endAt: normalizeWireTimestamp(row.end_at),
    receivedAt: normalizeWireTimestamp(row.received_at),
    updatedAt: normalizeWireTimestamp(row.updated_at),
    lastMessageAt: row.last_message_at === null ? null : normalizeWireTimestamp(row.last_message_at),
    paymentDeadlineAt: row.payment_deadline_at === null
      ? null : normalizeWireTimestamp(row.payment_deadline_at),
  };
  if (
    !UUID_PATTERN.test(row.booking_id)
    || !UUID_PATTERN.test(row.order_id)
    || !UUID_PATTERN.test(row.activity_id)
    || !UUID_PATTERN.test(row.activity_plan_id)
    || row.guide_id !== options.guideId
    || row.booking_type !== 'request'
    || typeof row.needs_reply !== 'boolean'
    || [timestamps.startAt, timestamps.endAt, timestamps.receivedAt, timestamps.updatedAt]
      .some((value) => value === null)
    || (row.last_message_at !== null && timestamps.lastMessageAt === null)
    || (row.payment_deadline_at !== null && timestamps.paymentDeadlineAt === null)
  ) throw new Error('INVALID_REQUEST_ROW: RPC projection values');

  const bucketResult = resolveRequestBucket({
    kind: 'booking',
    bookingStatus: row.booking_status,
    guideApprovalStatus: row.guide_approval_status,
    orderStatus: row.order_status,
    needsReply: row.needs_reply,
  });
  if (!bucketResult.ok
    || bucketResult.bucket !== row.bucket
    || bucketResult.secondaryState !== row.secondary_state
    || BUCKET_PRIORITY.get(row.bucket) !== row.priority_rank
    || (options.bucket !== 'all' && row.bucket !== options.bucket)) {
    throw new Error('INVALID_REQUEST_ROW: RPC lifecycle mismatch');
  }
  if (row.email_masked !== null
    && (typeof row.email_masked !== 'string' || !/^.\*{3}@[^@]+$/u.test(row.email_masked))) {
    throw new Error('INVALID_REQUEST_ROW: RPC masked email');
  }

  return {
    kind: 'booking',
    requestRef: formatRequestRef('booking', row.booking_id),
    bookingId: row.booking_id,
    orderId: row.order_id,
    bookingNo: row.booking_no ?? null,
    bookingStatus: row.booking_status,
    guideApprovalStatus: row.guide_approval_status,
    orderStatus: row.order_status,
    bucket: row.bucket,
    secondaryState: row.secondary_state,
    needsReply: row.needs_reply,
    traveler: { displayName: row.display_name ?? null, emailMasked: row.email_masked },
    service: {
      activityId: row.activity_id,
      activityPlanId: row.activity_plan_id,
      title: row.activity_title ?? null,
      planName: row.plan_name ?? null,
      bookingType: row.booking_type,
    },
    request: {
      startAt: timestamps.startAt,
      endAt: timestamps.endAt,
      timezone: row.timezone ?? 'Asia/Taipei',
      partySize: row.party_size ?? null,
    },
    totalTwd: row.total_twd ?? null,
    paymentDeadlineAt: timestamps.paymentDeadlineAt,
    receivedAt: timestamps.receivedAt,
    updatedAt: timestamps.updatedAt,
    lastMessageAt: timestamps.lastMessageAt,
  };
}

async function fetchSupabaseListPage(options) {
  const cursor = decodeCursor(options.cursor, options);
  const cursorRank = cursor ? (options.sort === 'priority' ? cursor.key[0] : 0) : null;
  const cursorAt = cursor ? (options.sort === 'priority' ? cursor.key[1] : cursor.key[0]) : null;
  const cursorId = cursor ? cursor.key.at(-1) : null;
  const supabase = await getSupabase();
  const { data, error } = await supabase.rpc('midao_list_booking_requests', {
    p_guide_id: options.guideId,
    p_bucket: options.bucket,
    p_sort: options.sort,
    p_cursor_rank: cursorRank,
    p_cursor_at: cursorAt,
    p_cursor_id: cursorId,
    p_limit: options.limit + 1,
  });
  if (error) throw new Error('MIDAO_REQUESTS_BACKEND_ERROR: list query failed');
  if (!Array.isArray(data) || data.length > options.limit + 1) {
    throw new Error('INVALID_REQUEST_ROW: RPC page cardinality');
  }
  const mapped = data.map((row) => mapRpcListRow(row, options));
  const compare = compareItems(options.sort);
  for (let index = 1; index < mapped.length; index += 1) {
    if (compare(mapped[index - 1], mapped[index]) > 0) {
      throw new Error('INVALID_REQUEST_ROW: RPC sort order');
    }
  }
  const items = mapped.slice(0, options.limit);
  return {
    items,
    nextCursor: mapped.length > options.limit ? encodeCursor(items.at(-1), options) : null,
  };
}

async function fetchSupabaseDetailRow(guideId, bookingId) {
  const supabase = await getSupabase();
  const { data, error } = await supabase
    .from('bookings')
    .select(BOOKING_DETAIL_SELECT)
    .eq('guide_id', guideId)
    .eq('activity_plans.booking_type', 'request')
    .eq('id', bookingId)
    .maybeSingle();
  if (error) throw new Error('MIDAO_REQUESTS_BACKEND_ERROR: detail query failed');
  if (!data) throw new Error('BOOKING_NOT_FOUND: booking not found');
  return data;
}

export async function listMidaoRequestsDb(input = {}) {
  const options = validateListInput(input);
  if (hasSupabaseEnv()) return fetchSupabaseListPage(options);

  const rows = [...bookingRequestStore.values()].map((row) => structuredClone(row));
  for (const row of rows) {
    if (!row?.guide_id) throw new Error('INVALID_REQUEST_ROW: guide ownership missing');
  }
  const ownedRows = rows.filter((row) => row.guide_id === options.guideId);
  return paginateRows(ownedRows, options);
}

export async function getMidaoBookingRequestDb(input = {}) {
  const guideId = requireGuideId(input?.guideId);
  const bookingId = typeof input?.bookingId === 'string' ? input.bookingId.trim() : '';
  if (!bookingId) badRequest('bookingId required');

  let row;
  if (hasSupabaseEnv()) {
    row = await fetchSupabaseDetailRow(guideId, bookingId);
  } else {
    const candidate = bookingRequestStore.get(bookingId);
    if (!candidate || candidate.guide_id !== guideId) {
      throw new Error('BOOKING_NOT_FOUND: booking not found');
    }
    row = structuredClone(candidate);
  }
  if (row.guide_id !== guideId) throw new Error('BOOKING_NOT_FOUND: booking not found');
  return mapBookingRequestRow(row, { detail: true });
}

const INQUIRY_PLAN_SELECT = `
  id,
  activity_id,
  name,
  booking_type,
  status,
  min_participants,
  max_participants,
  base_price,
  activities!inner(id, guide_id, title)
`;

function mapInquiryPlanSummaryRow(row, { activityId, guideId }) {
  if (!row || typeof row !== 'object') return null;
  const activity = Array.isArray(row.activities) ? row.activities[0] : row.activities;
  if (!activity || typeof activity !== 'object') return null;
  if (activity.guide_id !== guideId) return null;
  if (row.activity_id !== activityId) return null;
  if (!Number.isInteger(row.min_participants) || !Number.isInteger(row.max_participants)) return null;
  if (typeof row.booking_type !== 'string' || !row.booking_type) return null;
  if (typeof row.status !== 'string' || !row.status) return null;
  if (typeof row.base_price !== 'number' || !Number.isFinite(row.base_price)) return null;
  return {
    plan: {
      activityPlanId: row.id,
      name: typeof row.name === 'string' ? row.name : null,
      bookingType: row.booking_type,
      status: row.status,
      minParticipants: row.min_participants,
      maxParticipants: row.max_participants,
      basePrice: row.base_price,
    },
    activityTitle: typeof activity.title === 'string' ? activity.title : null,
  };
}

async function fetchInquiryPlanSummary({ activityPlanId, activityId, guideId }) {
  if (!activityPlanId) return null;

  if (hasSupabaseEnv()) {
    const supabase = await getSupabase();
    const { data, error } = await supabase
      .from('activity_plans')
      .select(INQUIRY_PLAN_SELECT)
      .eq('id', activityPlanId)
      .eq('activity_id', activityId)
      .eq('activities.guide_id', guideId)
      .maybeSingle();
    if (error) throw new Error('MIDAO_REQUESTS_BACKEND_ERROR: inquiry plan query failed');
    return mapInquiryPlanSummaryRow(data, { activityId, guideId });
  }

  const fixture = inquiryPlanStore.get(activityPlanId);
  if (!fixture) return null;
  return mapInquiryPlanSummaryRow(
    {
      id: fixture.id,
      activity_id: fixture.activity_id,
      name: fixture.name,
      booking_type: fixture.booking_type,
      status: fixture.status,
      min_participants: fixture.min_participants,
      max_participants: fixture.max_participants,
      base_price: fixture.base_price,
      activities: {
        id: fixture.activity_id,
        guide_id: fixture.guide_id,
        title: fixture.activity_title ?? null,
      },
    },
    { activityId, guideId },
  );
}

function mapInquiryRequestRow(inquiry, planSummary) {
  const inquiryStatus = inquiry.status;
  const needsReply = inquiryStatus === 'new' || inquiryStatus === 'opened';
  const bucket = resolveRequestBucket({ kind: 'inquiry', inquiryStatus, needsReply });
  if (!bucket?.ok) throw new Error('INVALID_REQUEST_ROW: inquiry bucket');

  return {
    kind: 'inquiry',
    requestRef: formatRequestRef('inquiry', inquiry.id),
    inquiryId: inquiry.id,
    inquiryNo: inquiry.inquiryNo,
    inquiryStatus,
    bucket: bucket.bucket,
    secondaryState: bucket.secondaryState,
    needsReply,
    traveler: { displayName: null, emailMasked: null },
    service: {
      activityId: inquiry.activityId,
      activityPlanId: inquiry.activityPlanId,
      title: planSummary ? planSummary.activityTitle : null,
      planName: planSummary ? planSummary.plan.name : null,
      bookingType: planSummary ? 'request' : null,
    },
    request: {
      preferredDate: inquiry.preferredDate,
      backupDate: inquiry.backupDate,
      startTimeLocal: inquiry.startTimeLocal,
      partySize: inquiry.partySize,
      language: inquiry.language,
      pickupRequired: inquiry.pickupRequired,
      travelerNote: inquiry.travelerNote,
    },
    plan: planSummary ? planSummary.plan : null,
    convertedBookingId: inquiry.convertedBookingId,
    lastRepliedAt: inquiry.lastRepliedAt,
    expiresAt: inquiry.expiresAt,
    receivedAt: inquiry.createdAt,
    updatedAt: inquiry.updatedAt,
  };
}

export async function getMidaoInquiryRequestDb(input = {}) {
  const guideId = requireGuideId(input?.guideId);
  const inquiryId = typeof input?.inquiryId === 'string' ? input.inquiryId.trim() : '';
  if (!inquiryId) badRequest('inquiryId required');

  const { getMidaoInquiryDetailDb } = await import('./db-midao-inquiries.mjs');
  const result = await getMidaoInquiryDetailDb({
    inquiryId,
    actor: { role: 'guide', id: guideId },
  });
  if (!result?.ok || !result.inquiry) {
    throw new Error('INQUIRY_NOT_FOUND: inquiry not found');
  }
  const inquiry = result.inquiry;
  if (inquiry.guideId !== guideId) {
    throw new Error('INQUIRY_NOT_FOUND: inquiry not found');
  }

  const planSummary = await fetchInquiryPlanSummary({
    activityPlanId: inquiry.activityPlanId,
    activityId: inquiry.activityId,
    guideId,
  });

  return mapInquiryRequestRow(inquiry, planSummary);
}
