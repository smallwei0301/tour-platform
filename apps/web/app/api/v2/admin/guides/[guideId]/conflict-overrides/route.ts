import type { NextRequest } from 'next/server';
import { errorV2, successV2 } from '../../../../../../../src/lib/api.ts';
import { isAdminAuthorized, pickAdminCredentials } from '../../../../../../../src/lib/admin-auth.mjs';
import { getAdminSecurityState, getRequiredAdminToken } from '../../../../../../../src/lib/admin-session.mjs';
import { validateCsrf } from '../../../../../../../src/lib/csrf.mjs';
import { getSupabase } from '../../../../../../../src/lib/db.mjs';
import { CAPACITY_HOLD_BOOKING_STATUSES } from '../../../../../../../src/lib/availability-v2/group-booking-rule.ts';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HELPER_STATUSES = new Set([
  'not_needed',
  'required',
  'pending_assignment',
  'assigned',
  'declined',
]);

function isUuidLike(value: string): boolean {
  return UUID_REGEX.test(value);
}

function isValidIsoDatetime(value: string): boolean {
  const date = new Date(value);
  return !Number.isNaN(date.getTime());
}

function overlaps(startA: string, endA: string, startB: string, endB: string): boolean {
  return new Date(startA) < new Date(endB) && new Date(endA) > new Date(startB);
}

function checkAdminAuth(request: Pick<NextRequest, 'headers'>): { ok: boolean; reason?: string } {
  const { token, email, expiresAt, sessionVersion, requireSession } = pickAdminCredentials(request);
  const security = getAdminSecurityState();
  return isAdminAuthorized({
    token,
    email,
    expiresAt,
    requiredToken: getRequiredAdminToken(process.env.ADMIN_ACCESS_TOKEN),
    allowlistRaw: process.env.ADMIN_EMAIL_ALLOWLIST,
    expectedSessionVersion: security.sessionVersion,
    sessionVersion: Number(sessionVersion || 0),
    requireSession,
  });
}

interface ConflictOverrideRequestBody {
  activityId?: string;
  activityPlanId?: string;
  startAt?: string;
  endAt?: string;
  reason?: string;
  requiresHelper?: boolean;
  helperStatus?: string;
  guideNote?: string | null;
  adminNote?: string | null;
}

function parseBody(body: ConflictOverrideRequestBody) {
  const activityId = String(body.activityId || '').trim();
  const activityPlanId = String(body.activityPlanId || '').trim();
  const startAt = String(body.startAt || '').trim();
  const endAt = String(body.endAt || '').trim();
  const reason = String(body.reason || '').trim();
  const helperStatus = String(body.helperStatus || '').trim();
  const requiresHelper = Boolean(body.requiresHelper);
  const guideNote = body.guideNote == null ? null : String(body.guideNote).trim() || null;
  const adminNote = body.adminNote == null ? null : String(body.adminNote).trim() || null;

  if (!activityId || !isUuidLike(activityId)) {
    return { error: Response.json(errorV2('VALIDATION_ERROR', 'Invalid activityId'), { status: 400 }) };
  }
  if (!activityPlanId || !isUuidLike(activityPlanId)) {
    return { error: Response.json(errorV2('VALIDATION_ERROR', 'Invalid activityPlanId'), { status: 400 }) };
  }
  if (!startAt || !isValidIsoDatetime(startAt)) {
    return { error: Response.json(errorV2('VALIDATION_ERROR', 'Invalid startAt'), { status: 400 }) };
  }
  if (!endAt || !isValidIsoDatetime(endAt)) {
    return { error: Response.json(errorV2('VALIDATION_ERROR', 'Invalid endAt'), { status: 400 }) };
  }
  if (new Date(startAt) >= new Date(endAt)) {
    return { error: Response.json(errorV2('VALIDATION_ERROR', 'startAt must be before endAt'), { status: 400 }) };
  }
  if (!reason) {
    return { error: Response.json(errorV2('VALIDATION_ERROR', 'reason is required'), { status: 400 }) };
  }
  if (!HELPER_STATUSES.has(helperStatus)) {
    return { error: Response.json(errorV2('VALIDATION_ERROR', 'Invalid helperStatus'), { status: 400 }) };
  }

  return {
    data: {
      activityId,
      activityPlanId,
      startAt,
      endAt,
      reason,
      requiresHelper,
      helperStatus,
      guideNote,
      adminNote,
    },
  };
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ guideId: string }> },
) {
  const { guideId } = await context.params;

  if (!isUuidLike(guideId)) {
    return Response.json(errorV2('VALIDATION_ERROR', 'Invalid guideId'), { status: 400 });
  }

  const auth = checkAdminAuth(request);
  if (!auth.ok) {
    return Response.json(errorV2('UNAUTHORIZED', auth.reason || 'unauthorized'), { status: 401 });
  }

  const csrfError = validateCsrf(request);
  if (csrfError) return csrfError;

  let body: ConflictOverrideRequestBody;
  try {
    body = await request.json();
  } catch {
    return Response.json(errorV2('VALIDATION_ERROR', 'Invalid JSON body'), { status: 400 });
  }

  const parsed = parseBody(body);
  if ('error' in parsed) return parsed.error;

  const adminEmail = String(pickAdminCredentials(request).email || '').trim().toLowerCase();
  const supabase = await getSupabase();

  const { data: guide } = await supabase.from('guide_profiles').select('id').eq('id', guideId).maybeSingle();
  if (!guide) {
    return Response.json(errorV2('NOT_FOUND', 'Guide not found'), { status: 404 });
  }

  const { data: activity } = await supabase
    .from('activities')
    .select('id, guide_id')
    .eq('id', parsed.data.activityId)
    .eq('guide_id', guideId)
    .maybeSingle();
  if (!activity) {
    return Response.json(errorV2('NOT_FOUND', 'Activity not found for guide'), { status: 404 });
  }

  const { data: plan } = await supabase
    .from('activity_plans')
    .select('id, activity_id')
    .eq('id', parsed.data.activityPlanId)
    .eq('activity_id', parsed.data.activityId)
    .maybeSingle();
  if (!plan) {
    return Response.json(errorV2('NOT_FOUND', 'Activity plan not found'), { status: 404 });
  }

  const { data: duplicate } = await supabase
    .from('guide_slot_conflict_overrides')
    .select(
      'id, guide_id, activity_id, activity_plan_id, start_at, end_at, reason, requires_helper, helper_status, guide_note, admin_note, status, created_at, created_by_admin_email'
    )
    .eq('guide_id', guideId)
    .eq('activity_id', parsed.data.activityId)
    .eq('activity_plan_id', parsed.data.activityPlanId)
    .eq('start_at', parsed.data.startAt)
    .eq('end_at', parsed.data.endAt)
    .eq('status', 'active')
    .maybeSingle();

  if (duplicate) {
    return Response.json(successV2({ override: duplicate, duplicate: true }), { status: 200 });
  }

  const { data: bookings, error: bookingsError } = await supabase
    .from('bookings')
    .select('id, guide_id, activity_id, activity_plan_id, start_at, end_at, status, participants')
    .eq('guide_id', guideId)
    .in('status', [...CAPACITY_HOLD_BOOKING_STATUSES]);

  if (bookingsError) {
    return Response.json(errorV2('INTERNAL_ERROR', 'Failed to validate booking conflict'), { status: 500 });
  }

  const hasConflict = Array.isArray(bookings)
    && bookings.some((booking) => overlaps(parsed.data.startAt, parsed.data.endAt, booking.start_at, booking.end_at));

  if (!hasConflict) {
    return Response.json(errorV2('CONFLICT_NOT_FOUND', 'No overlapping booking conflict found'), { status: 409 });
  }

  const insertPayload = {
    guide_id: guideId,
    activity_id: parsed.data.activityId,
    activity_plan_id: parsed.data.activityPlanId,
    start_at: parsed.data.startAt,
    end_at: parsed.data.endAt,
    reason: parsed.data.reason,
    requires_helper: parsed.data.requiresHelper,
    helper_status: parsed.data.helperStatus,
    guide_note: parsed.data.guideNote,
    admin_note: parsed.data.adminNote,
    status: 'active',
    created_by_admin_email: adminEmail || null,
  };

  const { data: override, error: insertError } = await supabase
    .from('guide_slot_conflict_overrides')
    .insert(insertPayload)
    .select()
    .single();

  if (insertError) {
    return Response.json(errorV2('INTERNAL_ERROR', insertError.message || 'Failed to create conflict override'), { status: 500 });
  }

  // #1497 — 主動通知導遊(best-effort,fire-and-forget,不阻斷加開主流程)。
  void import('../../../../../../../src/lib/conflict-override-notify.ts')
    .then(({ notifyGuideConflictOverrideCreated }) =>
      notifyGuideConflictOverrideCreated({
        guideId,
        activityId: parsed.data.activityId,
        startAt: parsed.data.startAt,
        endAt: parsed.data.endAt,
        reason: parsed.data.reason,
        requiresHelper: parsed.data.requiresHelper,
        guideNote: parsed.data.guideNote,
      }),
    )
    .catch((err) => {
      console.error('[conflict-override-notify] fire-and-forget failed:', err);
    });

  return Response.json(successV2({ override, duplicate: false }), { status: 201 });
}