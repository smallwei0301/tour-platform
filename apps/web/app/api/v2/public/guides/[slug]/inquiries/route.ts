import { validateCsrf } from '../../../../../../../src/lib/csrf.mjs';
import { createMidaoInquiryDb } from '../../../../../../../src/lib/midao/db-midao-inquiries.mjs';
import { RateLimiter } from '../../../../../../../src/lib/rate-limit.ts';
import { getSupabase } from '../../../../../../../src/lib/supabase-env.mjs';
import { publicInquiryJsonError, publicInquiryJsonSuccess } from '../../../../../../../src/lib/midao/public-inquiry-api-response.ts';

const inquiryLimiter = new RateLimiter(5, 60_000);
const SAFE_MESSAGE = '找不到可用的詢問資源。';
const UNAVAILABLE_MESSAGE = '目前無法送出詢問，請稍後再試。';
const SEASON_MESSAGE = '你選擇的旅遊日期不在這個方案的適用季節，請調整旅遊日期後再送出詢問。';
const VERSION_MESSAGE = '這份問題表已更新，請重新確認並填寫後再送出詢問。';
const FORBIDDEN_BODY_FIELDS = new Set([
  'traveler_user_id', 'travelerId', 'guide_id', 'guideId', 'activity_plan_id', 'activityPlanId',
  'plan', 'plan_details', 'planDetails',
]);
const ALLOWED_BODY_FIELDS = new Set([
  'activity_id', 'preferred_date', 'plan_selector', 'questionnaire_version', 'answers',
  'backup_date', 'start_time_local', 'party_size', 'language', 'pickup_required', 'traveler_note',
]);
const DANGEROUS_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

type RateLimitResult = { allowed: boolean; resetAt: number };
type Dependencies = {
  getTravelerIdentity: () => Promise<{ id: string | null; email?: string | null }>;
  validateCsrf: typeof validateCsrf;
  getClientIp: typeof RateLimiter.getClientIp;
  checkRateLimit: (ip: string) => RateLimitResult;
  getSupabase: typeof getSupabase;
  createMidaoInquiryDb: typeof createMidaoInquiryDb;
};
type ParsedDate = { canonical: string; month: number; day: number };
type RawInquiryBody = Record<string, unknown>;
type NormalizedInquiryBody = {
  activityId: string;
  preferredDate: ParsedDate | null;
  planSelectorSlug: string;
  questionnaireVersion: number;
  answers: unknown[];
  backupDate: string | undefined;
  startTimeLocal: string | undefined;
  partySize: number | undefined;
  language: string | undefined;
  pickupRequired: boolean | undefined;
  travelerNote: string | undefined;
};
type NormalizeBodyResult =
  | { kind: 'ok'; body: NormalizedInquiryBody }
  | { kind: 'invalid_activity_id' }
  | { kind: 'invalid_answers' };

const defaults: Dependencies = {
  getTravelerIdentity: async () => {
    const { getTravelerIdentity } = await import('../../../../../../../src/lib/v2/traveler-auth.ts');
    return getTravelerIdentity();
  },
  validateCsrf,
  getClientIp: RateLimiter.getClientIp,
  checkRateLimit: (ip) => inquiryLimiter.check(ip),
  getSupabase,
  createMidaoInquiryDb,
};
let dependencies: Dependencies = defaults;

export function __setPublicInquiryDependenciesForTest(overrides: Partial<Dependencies> | null = null) {
  dependencies = overrides ? { ...defaults, ...overrides } : defaults;
}

function errorResponse(status: number, code: string, message: string, retryable = false, headers?: HeadersInit) {
  return publicInquiryJsonError(code, message, retryable, status, headers === undefined ? undefined : { headers });
}

function notFound() {
  return errorResponse(404, 'RESOURCE_NOT_FOUND', SAFE_MESSAGE);
}

function invalidAnswers() {
  return errorResponse(422, 'INVALID_ANSWERS', '詢問資料格式不正確。');
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseDate(value: unknown): ParsedDate | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) return null;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return { canonical: value, month, day };
}

function isDateInSeason(date: { month: number; day: number }, plan: Record<string, unknown>, seasons: Record<string, unknown>[]) {
  if (plan.is_year_round === true) return true;
  if (seasons.length === 0) return false;
  const value = date.month * 100 + date.day;
  return seasons.some((season) => {
    const start = Number(season.start_month) * 100 + Number(season.start_day);
    const end = Number(season.end_month) * 100 + Number(season.end_day);
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 101 || end < 101) return false;
    return start <= end ? value >= start && value <= end : value >= start || value <= end;
  });
}

function normalizeBody(value: unknown): NormalizeBodyResult {
  if (!isPlainObject(value)) return { kind: 'invalid_answers' };
  const raw: RawInquiryBody = value;
  const keys = Object.keys(raw);
  if (keys.some((key) => FORBIDDEN_BODY_FIELDS.has(key) || !ALLOWED_BODY_FIELDS.has(key))) return { kind: 'invalid_answers' };

  const activityId = raw.activity_id;
  if (typeof activityId !== 'string' || !activityId.trim()) return { kind: 'invalid_activity_id' };

  const planSelector = raw.plan_selector;
  if (!isPlainObject(planSelector) || typeof planSelector.slug !== 'string' || !planSelector.slug.trim()) return { kind: 'invalid_answers' };
  if (Object.keys(planSelector).some((key) => key !== 'slug')) return { kind: 'invalid_answers' };

  const answers = raw.answers;
  if (!Array.isArray(answers)) return { kind: 'invalid_answers' };
  const questionnaireVersion = raw.questionnaire_version;
  if (typeof questionnaireVersion !== 'number' || !Number.isInteger(questionnaireVersion) || questionnaireVersion < 1) return { kind: 'invalid_answers' };

  const preferredDate = parseDate(raw.preferred_date);
  const backupDate = raw.backup_date;
  const parsedBackupDate = backupDate === undefined ? undefined : parseDate(backupDate);
  if (backupDate !== undefined && !parsedBackupDate) return { kind: 'invalid_answers' };

  const startTimeLocal = raw.start_time_local;
  if (startTimeLocal !== undefined && (typeof startTimeLocal !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/u.test(startTimeLocal))) return { kind: 'invalid_answers' };
  const partySize = raw.party_size;
  if (partySize !== undefined && (typeof partySize !== 'number' || !Number.isInteger(partySize) || partySize < 1)) return { kind: 'invalid_answers' };
  const language = raw.language;
  if (language !== undefined && (typeof language !== 'string' || !language.trim())) return { kind: 'invalid_answers' };
  const pickupRequired = raw.pickup_required;
  if (pickupRequired !== undefined && typeof pickupRequired !== 'boolean') return { kind: 'invalid_answers' };
  const travelerNote = raw.traveler_note;
  if (travelerNote !== undefined && typeof travelerNote !== 'string') return { kind: 'invalid_answers' };

  return {
    kind: 'ok',
    body: {
      activityId: activityId.trim(),
      preferredDate,
      planSelectorSlug: planSelector.slug.trim(),
      questionnaireVersion,
      answers,
      backupDate: parsedBackupDate?.canonical,
      startTimeLocal: typeof startTimeLocal === 'string' ? startTimeLocal : undefined,
      partySize: typeof partySize === 'number' ? partySize : undefined,
      language: typeof language === 'string' ? language : undefined,
      pickupRequired: typeof pickupRequired === 'boolean' ? pickupRequired : undefined,
      travelerNote: typeof travelerNote === 'string' ? travelerNote : undefined,
    },
  };
}

function isEmpty(value: unknown) {
  return value === null || value === undefined || (typeof value === 'string' && !value.trim()) || (Array.isArray(value) && value.length === 0);
}

function unicodeLength(value: string) {
  return Array.from(value).length;
}

function validateAndMapAnswers(answers: unknown[], snapshot: Record<string, unknown>) {
  const questions = snapshot.questions;
  if (!Array.isArray(questions)) return null;
  const published = new Map<string, Record<string, unknown>>();
  for (const rawQuestion of questions) {
    if (!isPlainObject(rawQuestion) || typeof rawQuestion.question_key !== 'string' || !rawQuestion.question_key || DANGEROUS_KEYS.has(rawQuestion.question_key)) return null;
    if (published.has(rawQuestion.question_key)) return null;
    published.set(rawQuestion.question_key, rawQuestion);
  }

  const received = new Map<string, unknown>();
  for (const answer of answers) {
    if (!isPlainObject(answer) || typeof answer.question_id !== 'string' || !answer.question_id || DANGEROUS_KEYS.has(answer.question_id) || !Object.hasOwn(answer, 'value')) return null;
    if (received.has(answer.question_id) || !published.has(answer.question_id)) return null;
    received.set(answer.question_id, answer.value);
  }

  for (const [questionId, question] of published) {
    const value = received.get(questionId);
    if (question.required === true && (!received.has(questionId) || isEmpty(value))) return null;
    if (!received.has(questionId)) continue;
    const options = Array.isArray(question.options) ? question.options : [];
    switch (question.type) {
      case 'single_choice':
        if (typeof value !== 'string' || !options.includes(value)) return null;
        break;
      case 'multi_choice':
        if (!Array.isArray(value) || new Set(value).size !== value.length || !value.every((item) => typeof item === 'string' && options.includes(item))) return null;
        break;
      case 'short_text':
      case 'long_text': {
        const maximum = typeof question.max_length === 'number' && Number.isInteger(question.max_length) && question.max_length > 0
          ? question.max_length : question.type === 'short_text' ? 200 : 2_000;
        if (typeof value !== 'string' || !value.trim() || unicodeLength(value.trim()) > maximum) return null;
        received.set(questionId, value.trim());
        break;
      }
      case 'boolean':
        if (typeof value !== 'boolean') return null;
        break;
      case 'number':
        if (typeof value !== 'number' || !Number.isFinite(value)) return null;
        break;
      default:
        return null;
    }
  }

  const mapped: Record<string, unknown> = {};
  for (const [questionId, value] of received) mapped[questionId] = value;
  return mapped;
}

async function readBody(request: Request): Promise<NormalizeBodyResult> {
  try {
    return normalizeBody(await request.json());
  } catch {
    return { kind: 'invalid_answers' };
  }
}

export async function POST(request: Request, context: { params: Promise<{ slug: string }> }) {
  try {
    let identity: { id: string | null; email?: string | null; invalid?: boolean };
    try {
      identity = await dependencies.getTravelerIdentity();
    } catch {
      return errorResponse(401, 'SESSION_INVALID', '登入狀態已失效，請重新登入。');
    }
    if (!identity?.id) {
      return errorResponse(401, identity?.invalid ? 'SESSION_INVALID' : 'AUTH_REQUIRED', identity?.invalid ? '登入狀態已失效，請重新登入。' : '請先登入後再送出詢問。');
    }

    if (dependencies.validateCsrf(request)) return errorResponse(403, 'CSRF_INVALID', '請重新取得安全憑證後再試。');
    const limit = dependencies.checkRateLimit(dependencies.getClientIp(request));
    if (!limit.allowed) {
      const retryAfter = Math.max(1, Math.ceil((limit.resetAt - Date.now()) / 1_000));
      return errorResponse(429, 'RATE_LIMITED', '送出次數過多，請稍後再試。', true, { 'Retry-After': String(retryAfter) });
    }

    const normalized = await readBody(request);
    if (normalized.kind === 'invalid_activity_id') return errorResponse(400, 'INVALID_REQUEST', 'activity_id must be a non-empty string');
    if (normalized.kind === 'invalid_answers') return invalidAnswers();
    const body = normalized.body;
    const { slug } = await context.params;
    if (typeof slug !== 'string' || !slug.trim() || !body.preferredDate) return body.preferredDate === null
      ? errorResponse(422, 'PREFERRED_DATE_OUTSIDE_PLAN_SEASON', SEASON_MESSAGE)
      : notFound();

    const supabase = await dependencies.getSupabase();
    const { data: guide, error: guideError } = await supabase
      .from('guide_profiles')
      .select('id, slug')
      .eq('slug', slug)
      .eq('verification_status', 'approved')
      .maybeSingle();
    if (guideError) throw guideError;
    if (!guide) return notFound();

    const { data: activity, error: activityError } = await supabase
      .from('activities')
      .select('id, guide_slug, status, inquiry_enabled')
      .eq('id', body.activityId)
      .eq('guide_slug', slug)
      .eq('status', 'published')
      .eq('inquiry_enabled', true)
      .maybeSingle();
    if (activityError) throw activityError;
    if (!activity) return notFound();

    const { data: plans, error: planError } = await supabase
      .from('activity_plans')
      .select('id, activity_id, slug, status, is_year_round')
      .eq('activity_id', activity.id)
      .eq('slug', body.planSelectorSlug)
      .eq('status', 'active');
    if (planError) throw planError;
    if (!Array.isArray(plans) || plans.length !== 1 || !isPlainObject(plans[0])) return notFound();
    const plan = plans[0];

    const { data: seasons, error: seasonError } = await supabase
      .from('activity_plan_seasons')
      .select('start_month, start_day, end_month, end_day, is_active')
      .eq('activity_plan_id', plan.id)
      .eq('is_active', true);
    if (seasonError) throw seasonError;
    if (!isDateInSeason(body.preferredDate, plan, Array.isArray(seasons) ? seasons.filter(isPlainObject) : [])) {
      return errorResponse(422, 'PREFERRED_DATE_OUTSIDE_PLAN_SEASON', SEASON_MESSAGE);
    }

    const { data: publication, error: publicationError } = await supabase
      .from('service_publication_versions')
      .select('version, snapshot')
      .eq('activity_id', activity.id)
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (publicationError) throw publicationError;
    if (!publication || !Number.isInteger(publication.version) || publication.version < 1 || !isPlainObject(publication.snapshot)) return notFound();
    if (body.questionnaireVersion !== publication.version) return errorResponse(409, 'QUESTIONNAIRE_VERSION_MISMATCH', VERSION_MESSAGE);
    const questionnairePayload = publication.snapshot.payload;
    if (!isPlainObject(questionnairePayload)) return notFound();
    const answers = validateAndMapAnswers(body.answers, questionnairePayload);
    if (!answers) return invalidAnswers();

    const result = await dependencies.createMidaoInquiryDb({
      travelerUserId: identity.id,
      guideId: guide.id,
      activityId: activity.id,
      activityPlanId: plan.id,
      preferredDate: body.preferredDate.canonical,
      ...(body.backupDate !== undefined ? { backupDate: body.backupDate } : {}),
      ...(body.startTimeLocal !== undefined ? { startTimeLocal: body.startTimeLocal } : {}),
      ...(body.partySize !== undefined ? { partySize: body.partySize } : {}),
      ...(body.language !== undefined ? { language: body.language.trim() } : {}),
      ...(body.pickupRequired !== undefined ? { pickupRequired: body.pickupRequired } : {}),
      ...(body.travelerNote !== undefined ? { travelerNote: body.travelerNote.trim() } : {}),
      questionnaireSnapshot: structuredClone(publication.snapshot),
      answers,
    });
    if (!result?.ok || result.status !== 201 || !result.inquiry) throw new Error('inquiry gateway rejected normalized input');
    return publicInquiryJsonSuccess({
      inquiry_id: result.inquiry.id,
      inquiry_no: result.inquiry.inquiryNo,
      status: result.inquiry.status,
    }, { status: 201 });
  } catch {
    return errorResponse(503, 'INQUIRY_UNAVAILABLE', UNAVAILABLE_MESSAGE, true);
  }
}
