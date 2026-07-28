import { getSupabase, hasSupabaseEnv } from '../supabase-env.mjs';
import { hashIdempotentRequest, parseIdempotencyKey } from './idempotency.ts';
import { MidaoRouteError } from './route-errors.ts';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const HASH_PATTERN = /^[0-9a-f]{64}$/u;
const TIMESTAMP_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?(Z|([+-])(\d{2}):(\d{2}))$/u;
const PROJECTION_KEYS = [
  'action',
  'bookingId',
  'bookingNo',
  'guideApprovalStatus',
  'orderId',
  'paymentDeadlineAt',
  'status',
];
const BOOKING_STATUSES = new Set(['draft', 'cancelled']);
const APPROVAL_STATUSES = new Set(['approved', 'rejected']);
const ACTIONS = new Set(['approve', 'reject']);
const SAFE_MESSAGES = {
  NOT_FOUND: 'Resource not found',
  IDEMPOTENCY_CONFLICT: 'Idempotency key was already used for a different request',
  IDEMPOTENCY_IN_PROGRESS: 'A request with this Idempotency-Key is already processing',
  NOT_PENDING_APPROVAL: 'Booking is no longer pending approval',
  INVALID_BOOKING_ID: 'Invalid booking id',
  INVALID_ACTION: 'Invalid action',
  INVALID_NOTE: 'Invalid note',
  INVALID_IDEMPOTENCY_KEY: 'Invalid Idempotency-Key',
};
const ERROR_STATUS = {
  NOT_FOUND: 404,
  IDEMPOTENCY_CONFLICT: 409,
  IDEMPOTENCY_IN_PROGRESS: 409,
  NOT_PENDING_APPROVAL: 409,
  INVALID_BOOKING_ID: 422,
  INVALID_ACTION: 422,
  INVALID_NOTE: 422,
  INVALID_IDEMPOTENCY_KEY: 422,
};

const bookingStore = new Map();
const idempotencyStore = new Map();
let nowProvider = () => new Date().toISOString();

function routeError(code) {
  return new MidaoRouteError(code, SAFE_MESSAGES[code] ?? 'Request rejected', ERROR_STATUS[code] ?? 422);
}

function unexpected(message = 'Midao booking decision backend failure') {
  const error = new Error(message);
  error.name = 'MidaoBookingDecisionBackendError';
  return error;
}

function normalizeUuid(value, code = 'INVALID_BOOKING_ID') {
  if (typeof value !== 'string' || !UUID_PATTERN.test(value.trim())) throw routeError(code);
  return value.trim().toLowerCase();
}

function normalizeTimestamp(value) {
  if (typeof value !== 'string') return null;
  const match = TIMESTAMP_PATTERN.exec(value);
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
  try {
    return new Date(parsed).toISOString();
  } catch {
    return null;
  }
}

function requireTimestamp(value) {
  const normalized = normalizeTimestamp(value);
  if (!normalized) throw unexpected('Midao booking decision returned an invalid timestamp');
  return normalized;
}

function normalizeCommand(input = {}) {
  const guideId = typeof input.guideId === 'string' ? input.guideId.trim() : '';
  const actorType = typeof input.actorType === 'string' ? input.actorType.trim() : '';
  const actorId = typeof input.actorId === 'string' ? input.actorId.trim() : '';
  const bookingId = normalizeUuid(input.bookingId);
  const action = typeof input.action === 'string' ? input.action.trim().toLowerCase() : '';
  const note = input.note === null || input.note === undefined
    ? null
    : (typeof input.note === 'string' ? input.note.trim() : null);
  let idempotencyKey;
  try {
    idempotencyKey = parseIdempotencyKey(input.idempotencyKey);
  } catch (error) {
    if (error?.code === 'INVALID_IDEMPOTENCY_KEY') throw error;
    throw routeError('INVALID_IDEMPOTENCY_KEY');
  }

  if (!guideId || !actorType || !actorId) throw unexpected('Midao booking decision actor context is incomplete');
  if (!ACTIONS.has(action)) throw routeError('INVALID_ACTION');
  if (note !== null && Buffer.byteLength(note, 'utf8') > 1000) throw routeError('INVALID_NOTE');
  if (action === 'reject' && !note) throw routeError('INVALID_NOTE');
  if (typeof input.requestHash !== 'string' || !HASH_PATTERN.test(input.requestHash)) {
    throw unexpected('Midao booking decision request hash is invalid');
  }

  return {
    guideId,
    actorType,
    actorId,
    bookingId,
    action,
    note,
    idempotencyKey,
    requestHash: input.requestHash,
  };
}

function normalizeProjectionUuid(value) {
  if (typeof value !== 'string' || !UUID_PATTERN.test(value.trim())) {
    throw unexpected('Midao booking decision projection UUID is invalid');
  }
  return value.trim().toLowerCase();
}

function projectionFromValues({ bookingId, bookingNo, orderId, status, guideApprovalStatus, paymentDeadlineAt, action }) {
  const normalizedBookingId = normalizeProjectionUuid(bookingId);
  const normalizedOrderId = normalizeProjectionUuid(orderId);
  const normalizedDeadline = paymentDeadlineAt === null ? null : requireTimestamp(paymentDeadlineAt);
  if (bookingNo !== null && typeof bookingNo !== 'string') throw unexpected('Midao booking decision booking number is invalid');
  if (!BOOKING_STATUSES.has(status) || !APPROVAL_STATUSES.has(guideApprovalStatus) || !ACTIONS.has(action)) {
    throw unexpected('Midao booking decision projection enum is invalid');
  }
  if (action === 'approve'
    && (status !== 'draft' || guideApprovalStatus !== 'approved' || normalizedDeadline === null)) {
    throw unexpected('Midao booking decision approve projection is inconsistent');
  }
  if (action === 'reject'
    && (status !== 'cancelled' || guideApprovalStatus !== 'rejected' || normalizedDeadline !== null)) {
    throw unexpected('Midao booking decision reject projection is inconsistent');
  }
  return {
    bookingId: normalizedBookingId,
    bookingNo: bookingNo ?? null,
    orderId: normalizedOrderId,
    status,
    guideApprovalStatus,
    paymentDeadlineAt: normalizedDeadline,
    action,
  };
}

function validateProjection(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw unexpected('Midao booking decision projection is not an object');
  }
  const keys = Object.keys(value).sort();
  if (keys.join(',') !== [...PROJECTION_KEYS].sort().join(',')) {
    throw unexpected('Midao booking decision projection shape is invalid');
  }
  return projectionFromValues(value);
}

function commandKey(command) {
  return `booking:${command.bookingId}:decide_booking_request:${command.idempotencyKey}`;
}

function clone(value) {
  return structuredClone(value);
}

function seedBookingRow(input = {}) {
  const bookingId = normalizeUuid(input.bookingId ?? input.id);
  const orderId = normalizeUuid(input.orderId ?? input.order_id, 'INTERNAL_ERROR');
  const guideId = typeof (input.guideId ?? input.guide_id) === 'string'
    ? String(input.guideId ?? input.guide_id).trim()
    : '';
  if (!guideId) throw unexpected('Midao booking decision guide ownership is missing');
  const row = {
    bookingId,
    bookingNo: input.bookingNo ?? input.booking_no ?? null,
    guideId,
    orderId,
    status: input.status ?? 'draft',
    guideApprovalStatus: input.guideApprovalStatus ?? input.guide_approval_status ?? 'pending',
    orderStatus: input.orderStatus ?? input.order_status ?? 'pending_payment',
    paymentDeadlineAt: input.paymentDeadlineAt ?? input.payment_deadline_at ?? null,
    guideApprovalNote: input.note ?? input.guideApprovalNote ?? input.guide_approval_note ?? null,
  };
  if (row.paymentDeadlineAt !== null && !normalizeTimestamp(row.paymentDeadlineAt)) {
    throw unexpected('Midao booking decision fixture timestamp is invalid');
  }
  return row;
}

export function __resetMidaoBookingCommandStoreForTest() {
  bookingStore.clear();
  idempotencyStore.clear();
}

export function __seedMidaoBookingCommandForTest(input = {}) {
  const row = seedBookingRow(input);
  bookingStore.set(row.bookingId, row);
  return clone(row);
}

export function __seedMidaoBookingCommandIdempotencyForTest(input = {}) {
  const command = normalizeCommand(input);
  const key = commandKey(command);
  const state = input.state ?? 'processing';
  if (!['processing', 'completed'].includes(state)) throw new Error('invalid idempotency state');
  const responseBody = state === 'completed' ? validateProjection(input.responseBody) : null;
  idempotencyStore.set(key, {
    state,
    requestHash: command.requestHash,
    responseBody: responseBody ? clone(responseBody) : null,
  });
}

export function __setMidaoBookingCommandClockForTest(clock) {
  if (typeof clock === 'function') {
    nowProvider = clock;
    return;
  }
  if (typeof clock === 'string') {
    nowProvider = () => clock;
    return;
  }
  nowProvider = () => new Date().toISOString();
}

function nowIso() {
  const value = nowProvider();
  return requireTimestamp(value);
}

function completedReplay(record, command) {
  if (record.requestHash !== command.requestHash) throw routeError('IDEMPOTENCY_CONFLICT');
  if (record.state === 'processing') throw routeError('IDEMPOTENCY_IN_PROGRESS');
  if (record.state !== 'completed' || !record.responseBody) throw unexpected('Midao idempotency record is invalid');
  return clone(record.responseBody);
}

function decideInMemory(command) {
  const row = bookingStore.get(command.bookingId);
  if (!row || row.guideId !== command.guideId) throw routeError('NOT_FOUND');
  if (row.orderId === null || !UUID_PATTERN.test(row.orderId)) throw unexpected('Midao booking relation is invalid');

  const key = commandKey(command);
  const existing = idempotencyStore.get(key);
  if (existing) return completedReplay(existing, command);

  idempotencyStore.set(key, { state: 'processing', requestHash: command.requestHash, responseBody: null });
  try {
    if (row.guideApprovalStatus !== 'pending'
      || row.status !== 'draft'
      || row.orderStatus !== 'pending_payment') {
      throw routeError('NOT_PENDING_APPROVAL');
    }
    const decidedAt = nowIso();
    const isApprove = command.action === 'approve';
    const paymentDeadlineAt = isApprove
      ? new Date(Date.parse(decidedAt) + (24 * 60 * 60 * 1000)).toISOString()
      : null;
    row.guideApprovalStatus = isApprove ? 'approved' : 'rejected';
    row.status = isApprove ? 'draft' : 'cancelled';
    row.orderStatus = isApprove ? 'pending_payment' : 'cancelled_by_guide';
    row.paymentDeadlineAt = paymentDeadlineAt;
    row.guideApprovalNote = command.note;
    const projection = projectionFromValues({
      bookingId: row.bookingId,
      bookingNo: row.bookingNo,
      orderId: row.orderId,
      status: row.status,
      guideApprovalStatus: row.guideApprovalStatus,
      paymentDeadlineAt,
      action: command.action,
    });
    idempotencyStore.set(key, {
      state: 'completed',
      requestHash: command.requestHash,
      responseBody: clone(projection),
    });
    return projection;
  } catch (error) {
    idempotencyStore.delete(key);
    throw error;
  }
}

const RPC_ARGS = (command) => ({
  p_guide_id: command.guideId,
  p_actor_type: command.actorType,
  p_actor_id: command.actorId,
  p_booking_id: command.bookingId,
  p_action: command.action,
  p_note: command.note,
  p_idempotency_key: command.idempotencyKey,
  p_request_hash: command.requestHash,
});

function errorToken(error) {
  const values = [error?.code, error?.message, error?.details, error?.hint]
    .filter((value) => typeof value === 'string')
    .join(' ')
    .toUpperCase();
  return Object.keys(ERROR_STATUS).find((code) => values.includes(code)) ?? null;
}

function mapSupabaseError(error) {
  const code = errorToken(error);
  if (code) throw routeError(code);
  throw unexpected();
}

async function decideInSupabase(command) {
  let response;
  try {
    const supabase = await getSupabase();
    response = await supabase.rpc('midao_decide_booking_request', RPC_ARGS(command));
  } catch (error) {
    if (error?.code && ERROR_STATUS[error.code]) throw error;
    throw unexpected();
  }
  if (response?.error) mapSupabaseError(response.error);
  return validateProjection(response?.data);
}

export async function decideMidaoBookingRequestDb(input = {}) {
  const command = normalizeCommand(input);
  if (hasSupabaseEnv()) return decideInSupabase(command);
  return decideInMemory(command);
}

export const __internal = {
  validateProjection,
  normalizeCommand,
  normalizeTimestamp,
  hashIdempotentRequest,
};
