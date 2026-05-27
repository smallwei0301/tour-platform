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
    plan_itinerary_image_url: toNullableTrimmedString(input.plan_itinerary_image_url ?? input.planItinerary?.imageUrl),
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

    upserts.push({
      ...(existing?.id ? { id: existing.id } : {}),
      activity_id: activityId,
      slug: legacyId,
      name,
      duration_minutes: 60,
      price_type: Number(legacy?.priceMultiplier) > 1 ? 'per_group' : 'per_person',
      base_price: basePrice,
      min_participants: participantRange.min,
      max_participants: participantRange.max,
      booking_type: 'scheduled',
      status: 'active',
      legacy_plan_id: legacyId,
      ...rich,
    });
  }

  return { upserts, skipped };
}
