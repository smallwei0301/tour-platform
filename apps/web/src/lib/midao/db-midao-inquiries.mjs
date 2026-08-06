import { randomUUID } from 'node:crypto';

import { canTransitionInquiryState } from './inquiry-state-machine.mjs';
import { getSupabase, hasSupabaseEnv } from '../supabase-env.mjs';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/u;
const TIME_PATTERN = /^(\d{2}):(\d{2})(?::(\d{2}))?$/u;
const INQUIRY_STATES = new Set([
  'new', 'opened', 'replied', 'ready_to_convert', 'converted', 'closed', 'expired',
]);
const INQUIRY_SELECT = [
  'id', 'inquiry_no', 'traveler_user_id', 'guide_id', 'activity_id', 'activity_plan_id', 'status',
  'preferred_date', 'backup_date', 'start_time_local', 'party_size', 'language', 'pickup_required',
  'traveler_note', 'questionnaire_snapshot', 'answers', 'last_replied_at', 'converted_booking_id',
  'expires_at', 'created_at', 'updated_at',
].join(', ');

const inquiryStore = new Map();
let nowProvider = () => new Date().toISOString();

function unexpected(message = 'Midao inquiry backend failure') {
  const error = new Error(message);
  error.name = 'MidaoInquiryBackendError';
  return error;
}

function clone(value) {
  return structuredClone(value);
}

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeUuid(value) {
  if (typeof value !== 'string' || !UUID_PATTERN.test(value.trim())) return null;
  return value.trim().toLowerCase();
}

function normalizeDate(value) {
  if (typeof value !== 'string') return null;
  const match = DATE_PATTERN.exec(value.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1 || month < 1 || month > 12) return null;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (day < 1 || day > daysInMonth[month - 1]) return null;
  return `${match[1]}-${match[2]}-${match[3]}`;
}

function normalizeTime(value) {
  if (typeof value !== 'string') return null;
  const match = TIME_PATTERN.exec(value.trim());
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  const second = match[3] === undefined ? null : Number(match[3]);
  if (hour > 23 || minute > 59 || (second !== null && second > 59)) return null;
  return match[3] === undefined ? `${match[1]}:${match[2]}` : `${match[1]}:${match[2]}:${match[3]}`;
}

function normalizeTimestamp(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return null;
  try {
    return new Date(parsed).toISOString();
  } catch {
    return null;
  }
}

function normalizeOptionalString(value) {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim();
  return normalized || null;
}

function nowIso() {
  const normalized = normalizeTimestamp(nowProvider());
  if (!normalized) throw unexpected('Midao inquiry clock returned an invalid timestamp');
  return normalized;
}

function invalidInputResult() {
  return { ok: false, status: 422, code: 'INVALID_INQUIRY_INPUT', inquiry: null };
}

function notFoundResult() {
  return { ok: false, status: 404, code: 'INQUIRY_NOT_FOUND', inquiry: null };
}

function invalidStateResult() {
  return { ok: false, status: 409, code: 'INVALID_INQUIRY_STATE', inquiry: null };
}

function invalidActorResult() {
  return { ok: false, status: 422, code: 'INVALID_INQUIRY_ACTOR', inquiries: [] };
}

function normalizeActor(actor) {
  if (!isPlainObject(actor) || !['traveler', 'guide'].includes(actor.role)) return null;
  const id = normalizeUuid(actor.id);
  if (!id) return null;
  return {
    role: actor.role,
    id,
    column: actor.role === 'traveler' ? 'traveler_user_id' : 'guide_id',
  };
}

function normalizeCreateInput(input) {
  if (!isPlainObject(input)) return null;
  const travelerUserId = normalizeUuid(input.travelerUserId);
  const guideId = normalizeUuid(input.guideId);
  const activityId = normalizeUuid(input.activityId);
  const activityPlanId = input.activityPlanId === undefined || input.activityPlanId === null
    ? null : normalizeUuid(input.activityPlanId);
  const preferredDate = input.preferredDate === undefined || input.preferredDate === null
    ? null : normalizeDate(input.preferredDate);
  const backupDate = input.backupDate === undefined || input.backupDate === null
    ? null : normalizeDate(input.backupDate);
  const startTimeLocal = input.startTimeLocal === undefined || input.startTimeLocal === null
    ? null : normalizeTime(input.startTimeLocal);
  const partySize = input.partySize === undefined || input.partySize === null ? null : input.partySize;
  const language = normalizeOptionalString(input.language);
  const travelerNote = normalizeOptionalString(input.travelerNote);
  const pickupRequired = input.pickupRequired === undefined || input.pickupRequired === null
    ? null : input.pickupRequired;
  const expiresAt = input.expiresAt === undefined || input.expiresAt === null
    ? null : normalizeTimestamp(input.expiresAt);

  if (
    !travelerUserId
    || !guideId
    || !activityId
    || (input.activityPlanId !== undefined && input.activityPlanId !== null && !activityPlanId)
    || (input.preferredDate !== undefined && input.preferredDate !== null && !preferredDate)
    || (input.backupDate !== undefined && input.backupDate !== null && !backupDate)
    || (input.startTimeLocal !== undefined && input.startTimeLocal !== null && !startTimeLocal)
    || (partySize !== null && (!Number.isInteger(partySize) || partySize < 1))
    || language === undefined
    || travelerNote === undefined
    || (pickupRequired !== null && typeof pickupRequired !== 'boolean')
    || (input.expiresAt !== undefined && input.expiresAt !== null && !expiresAt)
    || !isPlainObject(input.questionnaireSnapshot)
    || !isPlainObject(input.answers)
    || (preferredDate && backupDate && backupDate < preferredDate)
  ) return null;

  return {
    travelerUserId,
    guideId,
    activityId,
    activityPlanId,
    preferredDate,
    backupDate,
    startTimeLocal,
    partySize,
    language,
    pickupRequired,
    travelerNote,
    questionnaireSnapshot: clone(input.questionnaireSnapshot),
    answers: clone(input.answers),
    expiresAt,
  };
}

function mapInquiryRow(row, label = 'row') {
  if (!isPlainObject(row)) throw unexpected(`Midao inquiry ${label} is invalid`);
  const id = normalizeUuid(row.id);
  const travelerUserId = normalizeUuid(row.traveler_user_id);
  const guideId = normalizeUuid(row.guide_id);
  const activityId = normalizeUuid(row.activity_id);
  const activityPlanId = row.activity_plan_id === null ? null : normalizeUuid(row.activity_plan_id);
  const preferredDate = row.preferred_date === null ? null : normalizeDate(row.preferred_date);
  const backupDate = row.backup_date === null ? null : normalizeDate(row.backup_date);
  const startTimeLocal = row.start_time_local === null ? null : normalizeTime(row.start_time_local);
  const lastRepliedAt = row.last_replied_at === null ? null : normalizeTimestamp(row.last_replied_at);
  const convertedBookingId = row.converted_booking_id === null ? null : normalizeUuid(row.converted_booking_id);
  const expiresAt = row.expires_at === null ? null : normalizeTimestamp(row.expires_at);
  const createdAt = normalizeTimestamp(row.created_at);
  const updatedAt = normalizeTimestamp(row.updated_at);

  if (
    !id
    || typeof row.inquiry_no !== 'string'
    || !row.inquiry_no.trim()
    || !travelerUserId
    || !guideId
    || !activityId
    || (row.activity_plan_id !== null && !activityPlanId)
    || !INQUIRY_STATES.has(row.status)
    || (row.preferred_date !== null && !preferredDate)
    || (row.backup_date !== null && !backupDate)
    || (preferredDate && backupDate && backupDate < preferredDate)
    || (row.start_time_local !== null && !startTimeLocal)
    || (row.party_size !== null && (!Number.isInteger(row.party_size) || row.party_size < 1))
    || (row.language !== null && typeof row.language !== 'string')
    || (row.pickup_required !== null && typeof row.pickup_required !== 'boolean')
    || (row.traveler_note !== null && typeof row.traveler_note !== 'string')
    || !isPlainObject(row.questionnaire_snapshot)
    || !isPlainObject(row.answers)
    || (row.last_replied_at !== null && !lastRepliedAt)
    || (row.converted_booking_id !== null && !convertedBookingId)
    || (row.expires_at !== null && !expiresAt)
    || !createdAt
    || !updatedAt
  ) throw unexpected(`Midao inquiry ${label} is invalid`);

  return {
    id,
    inquiryNo: row.inquiry_no.trim(),
    travelerUserId,
    guideId,
    activityId,
    activityPlanId,
    status: row.status,
    preferredDate,
    backupDate,
    startTimeLocal,
    partySize: row.party_size,
    language: row.language,
    pickupRequired: row.pickup_required,
    travelerNote: row.traveler_note,
    questionnaireSnapshot: clone(row.questionnaire_snapshot),
    answers: clone(row.answers),
    lastRepliedAt,
    convertedBookingId,
    expiresAt,
    createdAt,
    updatedAt,
  };
}

function toStoredRow(view) {
  return {
    id: view.id,
    inquiry_no: view.inquiryNo,
    traveler_user_id: view.travelerUserId,
    guide_id: view.guideId,
    activity_id: view.activityId,
    activity_plan_id: view.activityPlanId,
    status: view.status,
    preferred_date: view.preferredDate,
    backup_date: view.backupDate,
    start_time_local: view.startTimeLocal,
    party_size: view.partySize,
    language: view.language,
    pickup_required: view.pickupRequired,
    traveler_note: view.travelerNote,
    questionnaire_snapshot: clone(view.questionnaireSnapshot),
    answers: clone(view.answers),
    last_replied_at: view.lastRepliedAt,
    converted_booking_id: view.convertedBookingId,
    expires_at: view.expiresAt,
    created_at: view.createdAt,
    updated_at: view.updatedAt,
  };
}

function listResult(inquiries) {
  return { ok: true, status: 200, code: null, inquiries: inquiries.map((inquiry) => clone(inquiry)) };
}

function detailResult(inquiry) {
  return { ok: true, status: 200, code: null, inquiry: clone(inquiry) };
}

function repliedResult(inquiry) {
  return { ok: true, status: 200, code: 'REPLIED', inquiry: clone(inquiry) };
}

function createResult(inquiry) {
  return { ok: true, status: 201, code: 'CREATED', inquiry: clone(inquiry) };
}

function sortNewestFirst(left, right) {
  return right.createdAt.localeCompare(left.createdAt) || right.id.localeCompare(left.id);
}

export function __resetMidaoInquiryStoreForTest() {
  inquiryStore.clear();
}

export function __seedMidaoInquiryForTest(input = {}) {
  if (!INQUIRY_STATES.has(input?.status)) {
    throw unexpected('Midao inquiry fixture status is invalid');
  }
  const view = mapInquiryRow(input, 'fixture');
  inquiryStore.set(view.id, toStoredRow(view));
  return clone(view);
}

export function __setMidaoInquiryClockForTest(clock) {
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

export async function createMidaoInquiryDb(input = {}) {
  const normalized = normalizeCreateInput(input);
  if (!normalized) return invalidInputResult();
  const timestamp = nowIso();
  const id = randomUUID();
  const view = {
    id,
    inquiryNo: `INQ-${id.replaceAll('-', '').toUpperCase()}`,
    travelerUserId: normalized.travelerUserId,
    guideId: normalized.guideId,
    activityId: normalized.activityId,
    activityPlanId: normalized.activityPlanId,
    status: 'new',
    preferredDate: normalized.preferredDate,
    backupDate: normalized.backupDate,
    startTimeLocal: normalized.startTimeLocal,
    partySize: normalized.partySize,
    language: normalized.language,
    pickupRequired: normalized.pickupRequired,
    travelerNote: normalized.travelerNote,
    questionnaireSnapshot: normalized.questionnaireSnapshot,
    answers: normalized.answers,
    lastRepliedAt: null,
    convertedBookingId: null,
    expiresAt: normalized.expiresAt,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  const row = toStoredRow(view);

  if (!hasSupabaseEnv()) {
    inquiryStore.set(view.id, clone(row));
    return createResult(view);
  }

  const supabase = await getSupabase();
  const { data, error } = await supabase
    .from('guide_inquiries')
    .insert(row)
    .select(INQUIRY_SELECT)
    .maybeSingle();
  if (error) throw unexpected('Midao inquiry create failed');
  if (!data) throw unexpected('Midao inquiry create returned no row');
  return createResult(mapInquiryRow(data));
}

export async function listMidaoInquiriesDb(input = {}) {
  const actor = normalizeActor(input?.actor);
  if (!actor) return invalidActorResult();

  if (!hasSupabaseEnv()) {
    const inquiries = [...inquiryStore.values()]
      .map((row) => mapInquiryRow(row))
      .filter((inquiry) => inquiry[actor.role === 'traveler' ? 'travelerUserId' : 'guideId'] === actor.id)
      .sort(sortNewestFirst);
    return listResult(inquiries);
  }

  const supabase = await getSupabase();
  const { data, error } = await supabase
    .from('guide_inquiries')
    .select(INQUIRY_SELECT)
    .eq(actor.column, actor.id)
    .order('created_at', { ascending: false });
  if (error) throw unexpected('Midao inquiry list query failed');
  if (!Array.isArray(data)) throw unexpected('Midao inquiry list returned an invalid payload');
  const inquiries = data.map((row) => mapInquiryRow(row));
  if (inquiries.some((inquiry) => inquiry[actor.role === 'traveler' ? 'travelerUserId' : 'guideId'] !== actor.id)) {
    throw unexpected('Midao inquiry list ownership mismatch');
  }
  return listResult(inquiries.sort(sortNewestFirst));
}

async function fetchOwnedInquiryInSupabase(supabase, inquiryId, column, ownerId) {
  const { data, error } = await supabase
    .from('guide_inquiries')
    .select(INQUIRY_SELECT)
    .eq('id', inquiryId)
    .eq(column, ownerId)
    .maybeSingle();
  if (error) throw unexpected('Midao inquiry detail query failed');
  return data ? mapInquiryRow(data) : null;
}

export async function getMidaoInquiryDetailDb(input = {}) {
  const inquiryId = normalizeUuid(input?.inquiryId);
  const actor = normalizeActor(input?.actor);
  if (!inquiryId) return invalidInputResult();
  if (!actor) return invalidActorResult();

  if (!hasSupabaseEnv()) {
    const row = inquiryStore.get(inquiryId);
    if (!row) return notFoundResult();
    const inquiry = mapInquiryRow(row);
    const owner = actor.role === 'traveler' ? inquiry.travelerUserId : inquiry.guideId;
    return owner === actor.id ? detailResult(inquiry) : notFoundResult();
  }

  const inquiry = await fetchOwnedInquiryInSupabase(await getSupabase(), inquiryId, actor.column, actor.id);
  return inquiry ? detailResult(inquiry) : notFoundResult();
}

export async function markMidaoInquiryRepliedDb(input = {}) {
  const inquiryId = normalizeUuid(input?.inquiryId);
  const guideId = normalizeUuid(input?.guideId);
  if (!inquiryId || !guideId) return invalidInputResult();

  if (!hasSupabaseEnv()) {
    const row = inquiryStore.get(inquiryId);
    if (!row) return notFoundResult();
    const inquiry = mapInquiryRow(row);
    if (inquiry.guideId !== guideId) return notFoundResult();
    if (!canTransitionInquiryState(inquiry.status, 'replied')) return invalidStateResult();
    const timestamp = nowIso();
    const replied = {
      ...inquiry,
      status: 'replied',
      lastRepliedAt: timestamp,
      updatedAt: timestamp,
    };
    inquiryStore.set(inquiryId, toStoredRow(replied));
    return repliedResult(replied);
  }

  const supabase = await getSupabase();
  const current = await fetchOwnedInquiryInSupabase(supabase, inquiryId, 'guide_id', guideId);
  if (!current) return notFoundResult();
  if (!canTransitionInquiryState(current.status, 'replied')) return invalidStateResult();

  const timestamp = nowIso();
  const { data, error } = await supabase
    .from('guide_inquiries')
    .update({ status: 'replied', last_replied_at: timestamp, updated_at: timestamp })
    .eq('id', inquiryId)
    .eq('guide_id', guideId)
    .eq('status', current.status)
    .select(INQUIRY_SELECT)
    .maybeSingle();
  if (error) throw unexpected('Midao inquiry mark-replied failed');
  if (data) {
    const replied = mapInquiryRow(data);
    if (replied.guideId !== guideId || replied.status !== 'replied') {
      throw unexpected('Midao inquiry mark-replied returned an invalid row');
    }
    return repliedResult(replied);
  }

  const latest = await fetchOwnedInquiryInSupabase(supabase, inquiryId, 'guide_id', guideId);
  if (!latest) return notFoundResult();
  if (!canTransitionInquiryState(latest.status, 'replied')) return invalidStateResult();
  throw unexpected('Midao inquiry mark-replied lost update unexpectedly');
}

export const __internal = {
  normalizeActor,
  normalizeCreateInput,
  mapInquiryRow,
  normalizeDate,
  normalizeTime,
};
