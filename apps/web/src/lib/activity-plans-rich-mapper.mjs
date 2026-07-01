import { generatePlanSlug } from './activity-plan-slugs.mjs';

const DEFAULT_MIN_PARTICIPANTS = 1;
const DEFAULT_MAX_PARTICIPANTS = 10;

function toNullableTrimmedString(value) {
  if (value === undefined || value === null) return null;
  const s = String(value).trim();
  return s.length > 0 ? s : null;
}

function toTrimmedStringArray(value) {
  if (!Array.isArray(value)) return null;
  const arr = value
    .map((item) => toNullableTrimmedString(item))
    .filter((item) => Boolean(item));
  return arr.length > 0 ? arr : [];
}

function toPlanItinerary(value, fallbackImageUrl = null) {
  if (Array.isArray(value)) {
    const arr = value
      .map((step) => {
        if (typeof step === 'string') {
          const text = toNullableTrimmedString(step);
          return text ? { text } : null;
        }
        if (!step || typeof step !== 'object') return null;
        // 站點分區編輯（站點時間表）：icon／title／duration／description／imageUrl，
        // 同時相容舊版 { text, imageUrl } 單行格式。
        const text = toNullableTrimmedString(step.text);
        const title = toNullableTrimmedString(step.title);
        const duration = toNullableTrimmedString(step.duration);
        const description = toNullableTrimmedString(step.description);
        const icon = toNullableTrimmedString(step.icon);
        const imageUrl = toNullableTrimmedString(step.imageUrl ?? step.image_url);
        // 至少要有一項文字內容或圖片才視為有效站點（單獨的 icon／duration 不足以成站）
        if (!text && !title && !description && !imageUrl) return null;
        const normalized = {};
        if (text) normalized.text = text;
        if (title) normalized.title = title;
        if (duration) normalized.duration = duration;
        if (description) normalized.description = description;
        if (icon) normalized.icon = icon;
        if (imageUrl) normalized.imageUrl = imageUrl;
        return normalized;
      })
      .filter(Boolean);
    return arr.length > 0 ? arr : [];
  }

  const oneImage = toNullableTrimmedString(fallbackImageUrl);
  return oneImage ? [{ text: '行程圖片', imageUrl: oneImage }] : null;
}

function toNullableInteger(value) {
  if (value === undefined || value === null || value === '') return null;
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  return Math.trunc(num);
}

function normalizeParticipants(minParticipants, maxParticipants) {
  const min = toNullableInteger(minParticipants) ?? DEFAULT_MIN_PARTICIPANTS;
  const max = toNullableInteger(maxParticipants) ?? DEFAULT_MAX_PARTICIPANTS;
  return { min, max };
}

export function normalizeRichPlanPayload(input = {}) {
  const rich = {
    legacy_plan_id: toNullableTrimmedString(input.legacy_plan_id ?? input.legacyPlanId),
    details_link_text: toNullableTrimmedString(input.details_link_text ?? input.detailsLinkText),
    booking_btn_text: toNullableTrimmedString(input.booking_btn_text ?? input.bookingBtnText),
    highlights: toTrimmedStringArray(input.highlights),
    language: toNullableTrimmedString(input.language),
    earliest_departure: toNullableTrimmedString(input.earliest_departure ?? input.earliestDeparture),
    confirm_by_days: toNullableInteger(input.confirm_by_days ?? input.confirmByDays),
    free_cancel_days: toNullableInteger(input.free_cancel_days ?? input.freeCancelDays),
    plan_inclusions: toTrimmedStringArray(input.plan_inclusions ?? input.planInclusions),
    plan_exclusions: toTrimmedStringArray(input.plan_exclusions ?? input.planExclusions),
    plan_itinerary: toPlanItinerary(input.plan_itinerary ?? input.planItinerary, input.plan_itinerary_image_url),
    plan_itinerary_image_url: toNullableTrimmedString(input.plan_itinerary_image_url),
    meeting_point_name: toNullableTrimmedString(input.meeting_point_name ?? input.meetingPointName),
    meeting_address: toNullableTrimmedString(input.meeting_address ?? input.meetingAddress),
    experience_point_name: toNullableTrimmedString(input.experience_point_name ?? input.experiencePointName),
    experience_address: toNullableTrimmedString(input.experience_address ?? input.experienceAddress),
    plan_notices: toTrimmedStringArray(input.plan_notices ?? input.planNotices),
    plan_refund_rules: toTrimmedStringArray(input.plan_refund_rules ?? input.planRefundRules),
  };

  return rich;
}

function toPositivePriceOrNull(value) {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return null;
  return Math.trunc(num);
}

export function buildFormalPlanBackfillRows({ activityId, legacyPlans, existingBySlug = new Map() }) {
  const upserts = [];
  const skipped = [];

  for (const legacy of Array.isArray(legacyPlans) ? legacyPlans : []) {
    const legacyId = toNullableTrimmedString(legacy?.id);
    const name = toNullableTrimmedString(legacy?.label);
    const basePrice = toPositivePriceOrNull(legacy?.price);

    if (!legacyId) {
      skipped.push({ reason: 'missing_legacy_id', legacy_plan: legacy });
      continue;
    }
    if (!name) {
      skipped.push({ reason: 'missing_label', slug: legacyId, legacy_plan: legacy });
      continue;
    }
    if (!basePrice) {
      skipped.push({ reason: 'invalid_price', slug: legacyId, legacy_plan: legacy });
      continue;
    }

    const existing = existingBySlug.get(legacyId) || null;
    const participantRange = normalizeParticipants(legacy?.minParticipants, legacy?.maxParticipants);
    const rich = normalizeRichPlanPayload(legacy);

    // V2 專屬欄位（計價方式／時長／預約方式）在舊版 activities.plans JSON 裡並不存在，
    // 只能用 priceMultiplier 反推或寫死預設值。對「已存在於 activity_plans 的方案」，
    // 這些欄位的真實來源是後台「方案管理」(V2)；若每次從舊 JSON 回寫都覆蓋，會把
    // 操作者在方案管理改好的「每團計價／時長／預約方式」洗回每人／60 分鐘／scheduled
    // （#admin-plan-revert）。故已存在的方案一律保留現值，僅新方案才用舊 JSON 推導預設。
    const isExisting = Boolean(existing?.id);
    const priceType = isExisting && existing.price_type != null
      ? existing.price_type
      : (Number(legacy?.priceMultiplier) > 1 ? 'per_group' : 'per_person');
    const durationMinutes = isExisting && existing.duration_minutes != null
      ? existing.duration_minutes
      : 60;
    const bookingType = isExisting && existing.booking_type != null
      ? existing.booking_type
      : 'scheduled';

    upserts.push({
      ...(existing?.id ? { id: existing.id } : {}),
      activity_id: activityId,
      slug: legacyId,
      name,
      duration_minutes: durationMinutes,
      price_type: priceType,
      base_price: basePrice,
      min_participants: participantRange.min,
      max_participants: participantRange.max,
      booking_type: bookingType,
      status: 'active',
      legacy_plan_id: legacyId,
      ...rich,
    });
  }

  return { upserts, skipped };
}

const V2_PRICE_TYPES = new Set(['per_person', 'per_group']);
const V2_BOOKING_TYPES = new Set(['scheduled', 'request', 'instant']);
const DEFAULT_PLAN_DURATION_MINUTES = 60;
const MIN_PLAN_DURATION_MINUTES = 15;

function toNonNegativePriceOrNull(value) {
  const num = Number(value);
  if (!Number.isFinite(num) || num < 0) return null;
  return Math.trunc(num);
}

/**
 * 由「投稿／JSON 匯入」的 V2 方案物件組出 activity_plans insert row（只新增、不覆蓋）。
 *
 * 與 buildFormalPlanBackfillRows（綁定舊版 {label, priceMultiplier}）不同：這裡吃的是
 * 新版 V2 shape（name / priceType(每人|每團) / basePrice / durationMinutes / bookingType /
 * min/maxParticipants + rich 欄位），slug 已存在（既有或本批已產）一律 skip，確保匯入
 * 不會覆蓋操作者在「方案管理」的既有方案（#admin-plan-revert 後續：單一真實來源）。
 *
 * @param {{ activityId: string, plans: unknown[], existingSlugs?: Set<string> }} args
 * @returns {{ inserts: object[], skipped: Array<{ reason: string, name?: string, slug?: string }> }}
 */
export function buildV2PlanInsertRows({ activityId, plans, existingSlugs = new Set() }) {
  const inserts = [];
  const skipped = [];
  const seen = new Set(existingSlugs);

  for (const plan of Array.isArray(plans) ? plans : []) {
    const name = toNullableTrimmedString(plan?.name ?? plan?.label);
    if (!name) {
      skipped.push({ reason: 'missing_name', plan });
      continue;
    }

    const basePrice = toNonNegativePriceOrNull(plan?.basePrice ?? plan?.base_price ?? plan?.price);
    if (basePrice == null) {
      skipped.push({ reason: 'invalid_price', name, plan });
      continue;
    }

    const slug = generatePlanSlug({ name, slug: plan?.slug });
    if (seen.has(slug)) {
      // slug 已存在（既有方案或本批重複）→ 不覆蓋、跳過。
      skipped.push({ reason: 'slug_exists', name, slug });
      continue;
    }

    const rawPriceType = toNullableTrimmedString(plan?.priceType ?? plan?.price_type);
    const priceType = rawPriceType && V2_PRICE_TYPES.has(rawPriceType) ? rawPriceType : 'per_person';

    const rawBookingType = toNullableTrimmedString(plan?.bookingType ?? plan?.booking_type);
    const bookingType = rawBookingType && V2_BOOKING_TYPES.has(rawBookingType) ? rawBookingType : 'scheduled';

    const durationRaw = toNullableInteger(plan?.durationMinutes ?? plan?.duration_minutes);
    const durationMinutes = durationRaw != null && durationRaw >= MIN_PLAN_DURATION_MINUTES
      ? durationRaw
      : DEFAULT_PLAN_DURATION_MINUTES;

    const participantRange = normalizeParticipants(plan?.minParticipants, plan?.maxParticipants);
    const rich = normalizeRichPlanPayload(plan);

    inserts.push({
      activity_id: activityId,
      slug,
      name,
      duration_minutes: durationMinutes,
      price_type: priceType,
      base_price: basePrice,
      min_participants: participantRange.min,
      max_participants: participantRange.max,
      booking_type: bookingType,
      status: 'active',
      ...rich,
    });
    seen.add(slug);
  }

  return { inserts, skipped };
}
