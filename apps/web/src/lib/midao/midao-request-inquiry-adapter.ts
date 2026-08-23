import { createHash } from 'node:crypto';

const SOURCE_KIND = 'midao_request';
const MAX_IDENTIFIER_LENGTH = 128;
const MAX_REQUEST_REFERENCE_LENGTH = 128;
const MAX_DISPLAY_NAME_LENGTH = 60;
const MAX_LINE_ID_LENGTH = 120;
const MAX_EMAIL_LENGTH = 254;
const MAX_ANSWER_COUNT = 20;
const MAX_QUESTION_ID_LENGTH = 64;
const MAX_QUESTION_LABEL_LENGTH = 120;
const MAX_ANSWER_LENGTH = 300;
const MAX_ANSWERS_JSON_LENGTH = 10240;
const PERIODS = new Set(['morning', 'afternoon', 'evening']);
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u;
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/u;
const TIME_PATTERN = /^(\d{2}):(\d{2})(?::(\d{2}))?$/u;
const HASH_PATTERN = /^[0-9a-f]{64}$/u;

export type MidaoRequestInquiryAdapterViolationCode =
  | 'INVALID_INPUT_SHAPE'
  | 'SOURCE_INVALID'
  | 'SOURCE_CONFLICT'
  | 'SOURCE_HASH_CONFLICT'
  | 'SOURCE_MAPPING_INVALID'
  | 'GUIDE_MISMATCH'
  | 'ACTIVITY_NOT_FOUND'
  | 'PLAN_NOT_FOUND'
  | 'PLAN_ACTIVITY_MISMATCH'
  | 'PLAN_INACTIVE'
  | 'PLAN_BOOKING_TYPE_NOT_REQUEST'
  | 'TRAVELER_IDENTITY_MISSING'
  | 'CONTACT_SNAPSHOT_INVALID'
  | 'REQUEST_INVALID'
  | 'ANSWERS_INVALID'
  | 'ANSWERS_TOO_LARGE';

export interface MidaoRequestInquiryAdapterViolation {
  code: MidaoRequestInquiryAdapterViolationCode;
  field: string;
  messageZh: string;
}

export interface MidaoRequestAnswer {
  questionId: string;
  label: string;
  answer: string;
}

export interface MidaoRequestContactSnapshot {
  displayName: string;
  lineId: string | null;
  email: string | null;
}

export interface MidaoRequestInquiryDraft {
  source: {
    kind: typeof SOURCE_KIND;
    id: string;
    requestRef: string;
    payloadHash: string;
  };
  guideId: string;
  activityId: string;
  activityPlanId: string;
  travelerUserId: string;
  preferredDate: string;
  backupDate: string | null;
  preferredPeriod: string | null;
  startTimeLocal: string | null;
  endTimeLocal: string | null;
  partySize: number;
  questionnaire: readonly MidaoRequestAnswer[];
  contactSnapshot: MidaoRequestContactSnapshot;
}

export interface MidaoRequestInquiryAdapterInput {
  midaoRequest: Record<string, unknown>;
  guideActor: { guideId: string };
  resolved: {
    activity: { id: string; guideId: string } | null;
    plan: {
      id: string;
      activityId: string;
      bookingType: string;
      status: string;
    } | null;
    traveler: {
      userId: string;
      contactSnapshot?: unknown;
    } | null;
    existingSource?: MidaoRequestExistingSource | null;
  };
}

export interface MidaoRequestExistingSource {
  kind: typeof SOURCE_KIND;
  id: string;
  payloadHash: string;
  inquiryId: string;
}

export type MidaoRequestInquiryAdapterResult =
  | {
      valid: true;
      replayed: false;
      existingInquiryId: null;
      draft: MidaoRequestInquiryDraft;
    }
  | {
      valid: true;
      replayed: true;
      existingInquiryId: string;
      draft: MidaoRequestInquiryDraft;
    }
  | {
      valid: false;
      violations: readonly MidaoRequestInquiryAdapterViolation[];
    };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasControlCharacter(value: string): boolean {
  return CONTROL_CHARACTER_PATTERN.test(value);
}

function readIdentifier(value: unknown, maxLength = MAX_IDENTIFIER_LENGTH): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  if (
    normalized.length === 0
    || normalized.length > maxLength
    || hasControlCharacter(normalized)
  ) return null;
  return normalized;
}

function readRequiredText(value: unknown, maxLength: number): string | null {
  return readIdentifier(value, maxLength);
}

function readNullableText(value: unknown, maxLength: number): string | null | undefined {
  if (value === undefined || value === null) return null;
  const normalized = readIdentifier(value, maxLength);
  return normalized === null ? undefined : normalized;
}

function isValidCalendarDate(value: string): boolean {
  const match = DATE_PATTERN.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12) return false;
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day >= 1 && day <= daysInMonth[month - 1];
}

function readDate(value: unknown, required: boolean): string | null | undefined {
  if (value === undefined || value === null) return required ? undefined : null;
  const normalized = readRequiredText(value, 10);
  return normalized !== null && isValidCalendarDate(normalized) ? normalized : undefined;
}

function readTime(value: unknown): string | null | undefined {
  if (value === undefined || value === null) return null;
  const normalized = readRequiredText(value, 8);
  if (normalized === null) return undefined;
  const match = TIME_PATTERN.exec(normalized);
  if (!match) return undefined;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  const second = match[3] === undefined ? null : Number(match[3]);
  if (hour > 23 || minute > 59 || (second !== null && second > 59)) return undefined;
  return match[3] === undefined ? `${match[1]}:${match[2]}` : normalized;
}

function addViolation(
  violations: MidaoRequestInquiryAdapterViolation[],
  code: MidaoRequestInquiryAdapterViolationCode,
  field: string,
  messageZh: string,
): void {
  violations.push({ code, field, messageZh });
}

function invalidResult(
  violations: readonly MidaoRequestInquiryAdapterViolation[],
): MidaoRequestInquiryAdapterResult {
  return { valid: false, violations };
}

function normalizeContactSnapshot(
  value: unknown,
): MidaoRequestContactSnapshot | null | undefined {
  if (!isRecord(value)) return undefined;
  const displayName = readRequiredText(value.displayName, MAX_DISPLAY_NAME_LENGTH);
  const lineId = readNullableText(value.lineId, MAX_LINE_ID_LENGTH);
  const email = readNullableText(value.email, MAX_EMAIL_LENGTH);
  if (
    displayName === null
    || lineId === undefined
    || email === undefined
    || (email !== null && !email.includes('@'))
    || (lineId === null && email === null)
  ) return undefined;
  return { displayName, lineId, email };
}

function normalizeAnswers(
  value: unknown,
): { answers: readonly MidaoRequestAnswer[]; tooLarge: boolean } | null {
  if (!Array.isArray(value)) return null;
  if (value.length > MAX_ANSWER_COUNT) return { answers: [], tooLarge: true };
  const answers: MidaoRequestAnswer[] = [];
  const questionIds = new Set<string>();
  for (const item of value) {
    if (!isRecord(item)) return null;
    const questionId = readRequiredText(item.questionId, MAX_QUESTION_ID_LENGTH);
    const label = readRequiredText(item.label, MAX_QUESTION_LABEL_LENGTH);
    const answer = readNullableText(item.answer, MAX_ANSWER_LENGTH);
    if (questionId === null || label === null || answer === undefined || answer === null) return null;
    if (questionIds.has(questionId) || hasControlCharacter(answer)) return null;
    questionIds.add(questionId);
    answers.push({ questionId, label, answer });
  }
  if (JSON.stringify(answers).length > MAX_ANSWERS_JSON_LENGTH) {
    return { answers: [], tooLarge: true };
  }
  return { answers, tooLarge: false };
}

function stableHash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function resolveExistingSource(value: unknown): {
  kind: unknown;
  id: unknown;
  payloadHash: unknown;
  inquiryId: unknown;
} | null {
  if (value === undefined || value === null) return null;
  if (!isRecord(value)) return { kind: null, id: null, payloadHash: null, inquiryId: null };
  return {
    kind: value.kind ?? value.sourceKind,
    id: value.id ?? value.sourceId,
    payloadHash: value.payloadHash ?? value.sourceHash,
    inquiryId: value.inquiryId ?? value.canonicalInquiryId,
  };
}

export function adaptMidaoRequestToInquiryDraft(
  input: unknown,
): MidaoRequestInquiryAdapterResult {
  const violations: MidaoRequestInquiryAdapterViolation[] = [];
  if (!isRecord(input)) {
    addViolation(violations, 'INVALID_INPUT_SHAPE', 'input', '需求單輸入格式不正確，請重新操作。');
    return invalidResult(violations);
  }

  const request = input.midaoRequest;
  const actor = input.guideActor;
  const resolved = input.resolved;
  if (!isRecord(request) || !isRecord(actor) || !isRecord(resolved)) {
    addViolation(violations, 'INVALID_INPUT_SHAPE', 'input', '需求單輸入格式不正確，請重新操作。');
    return invalidResult(violations);
  }

  const sourceId = readIdentifier(request.id);
  const requestRef = readIdentifier(request.requestRef, MAX_REQUEST_REFERENCE_LENGTH);
  if (sourceId === null || requestRef === null || (
    request.sourceKind !== undefined && request.sourceKind !== SOURCE_KIND
  )) {
    addViolation(violations, 'SOURCE_INVALID', 'midaoRequest', '需求單來源識別不正確，請重新操作。');
  }

  const actorGuideId = readIdentifier(actor.guideId);
  const activity = resolved.activity;
  const activityId = isRecord(activity) ? readIdentifier(activity.id) : null;
  const activityGuideId = isRecord(activity) ? readIdentifier(activity.guideId) : null;
  if (activityId === null || activityGuideId === null) {
    addViolation(violations, 'ACTIVITY_NOT_FOUND', 'resolved.activity', '找不到可用的活動資料，請重新操作。');
  } else if (actorGuideId === null || actorGuideId !== activityGuideId) {
    addViolation(violations, 'GUIDE_MISMATCH', 'guideActor', '目前導遊無權處理此需求單。');
  }

  const plan = resolved.plan;
  let activityPlanId: string | null = null;
  if (!isRecord(plan)) {
    addViolation(violations, 'PLAN_NOT_FOUND', 'resolved.plan', '找不到可用的活動方案，請重新操作。');
  } else {
    activityPlanId = readIdentifier(plan.id);
    const planActivityId = readIdentifier(plan.activityId);
    if (activityPlanId === null) {
      addViolation(violations, 'PLAN_NOT_FOUND', 'resolved.plan', '找不到可用的活動方案，請重新操作。');
    }
    if (activityId !== null && planActivityId !== activityId) {
      addViolation(violations, 'PLAN_ACTIVITY_MISMATCH', 'resolved.plan', '活動方案與活動不相符。');
    }
    if (plan.status !== 'active') {
      addViolation(violations, 'PLAN_INACTIVE', 'resolved.plan', '活動方案目前不可使用。');
    }
    if (plan.bookingType !== 'request') {
      addViolation(violations, 'PLAN_BOOKING_TYPE_NOT_REQUEST', 'resolved.plan', '活動方案不是詢問型方案。');
    }
  }

  const traveler = resolved.traveler;
  const travelerUserId = isRecord(traveler) ? readIdentifier(traveler.userId) : null;
  if (travelerUserId === null) {
    addViolation(violations, 'TRAVELER_IDENTITY_MISSING', 'resolved.traveler', '找不到可用的旅客身分，請先完成身分確認。');
  }

  const contactCandidate = isRecord(traveler) && traveler.contactSnapshot !== undefined
    ? traveler.contactSnapshot
    : request.contactSnapshot;
  const contactSnapshot = normalizeContactSnapshot(contactCandidate);
  if (contactSnapshot === undefined || contactSnapshot === null) {
    addViolation(violations, 'CONTACT_SNAPSHOT_INVALID', 'contactSnapshot', '聯絡資料格式不正確，請重新操作。');
  }

  const preferredDate = readDate(request.preferredDate, true);
  const backupDate = readDate(request.backupDate, false);
  const startTimeLocal = readTime(request.startTime);
  const endTimeLocal = readTime(request.endTime);
  const preferredPeriod = request.preferredPeriod === undefined || request.preferredPeriod === null
    ? null
    : (() => {
      const normalized = readRequiredText(request.preferredPeriod, 16);
      return normalized === null ? undefined : normalized;
    })();
  const partySize = request.participantsCount;
  const answersResult = normalizeAnswers(request.answers);

  if (
    preferredDate === undefined
    || backupDate === undefined
    || startTimeLocal === undefined
    || endTimeLocal === undefined
    || preferredPeriod === undefined
    || (preferredPeriod !== null && !PERIODS.has(preferredPeriod))
    || typeof partySize !== 'number'
    || !Number.isInteger(partySize)
    || partySize < 1
    || partySize > 99
  ) {
    addViolation(violations, 'REQUEST_INVALID', 'midaoRequest', '需求單內容格式不正確，請重新操作。');
  }
  if (
    preferredDate !== undefined
    && backupDate !== undefined
    && preferredDate !== null
    && backupDate !== null
    && backupDate < preferredDate
  ) {
    addViolation(violations, 'REQUEST_INVALID', 'midaoRequest', '需求單日期內容不正確，請重新操作。');
  }
  if (answersResult === null) {
    addViolation(violations, 'ANSWERS_INVALID', 'midaoRequest.answers', '問卷回答格式不正確，請重新操作。');
  } else if (answersResult.tooLarge) {
    addViolation(violations, 'ANSWERS_TOO_LARGE', 'midaoRequest.answers', '問卷回答內容過多，請重新操作。');
  }

  if (
    violations.length > 0
    || sourceId === null
    || requestRef === null
    || activityId === null
    || activityGuideId === null
    || activityPlanId === null
    || travelerUserId === null
    || contactSnapshot === undefined
    || contactSnapshot === null
    || preferredDate === undefined
    || preferredDate === null
    || backupDate === undefined
    || startTimeLocal === undefined
    || endTimeLocal === undefined
    || preferredPeriod === undefined
    || typeof partySize !== 'number'
    || !Number.isInteger(partySize)
    || answersResult === null
    || answersResult.tooLarge
  ) return invalidResult(violations);

  const source = {
    kind: SOURCE_KIND,
    id: sourceId,
    requestRef,
  } as const;
  const hashPayload = {
    ...source,
    guideId: activityGuideId,
    activityId,
    activityPlanId,
    travelerUserId,
    preferredDate,
    backupDate,
    preferredPeriod,
    startTimeLocal,
    endTimeLocal,
    partySize,
    questionnaire: answersResult.answers,
    contactSnapshot,
  };
  const draft: MidaoRequestInquiryDraft = {
    source: {
      ...source,
      payloadHash: stableHash(hashPayload),
    },
    guideId: activityGuideId,
    activityId,
    activityPlanId,
    travelerUserId,
    preferredDate,
    backupDate,
    preferredPeriod,
    startTimeLocal,
    endTimeLocal,
    partySize,
    questionnaire: answersResult.answers,
    contactSnapshot,
  };

  const existing = resolveExistingSource(resolved.existingSource);
  if (existing !== null) {
    const existingKind = existing.kind;
    const existingId = readIdentifier(existing.id);
    const existingHash = typeof existing.payloadHash === 'string'
      ? existing.payloadHash.trim().toLowerCase()
      : null;
    const existingInquiryId = readIdentifier(existing.inquiryId);
    if (
      existingKind !== SOURCE_KIND
      || existingId === null
      || existingHash === null
      || !HASH_PATTERN.test(existingHash)
      || existingInquiryId === null
    ) {
      addViolation(violations, 'SOURCE_MAPPING_INVALID', 'resolved.existingSource', '來源對應資料不正確，請重新操作。');
      return invalidResult(violations);
    }
    if (existingId !== sourceId) {
      addViolation(violations, 'SOURCE_CONFLICT', 'resolved.existingSource', '來源對應資料不相符，請重新操作。');
      return invalidResult(violations);
    }
    if (existingHash !== draft.source.payloadHash) {
      addViolation(violations, 'SOURCE_HASH_CONFLICT', 'resolved.existingSource', '來源內容與既有對應資料不相符。');
      return invalidResult(violations);
    }
    return {
      valid: true,
      replayed: true,
      existingInquiryId,
      draft,
    };
  }

  return {
    valid: true,
    replayed: false,
    existingInquiryId: null,
    draft,
  };
}
