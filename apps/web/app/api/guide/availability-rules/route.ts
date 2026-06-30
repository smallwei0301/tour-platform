/**
 * Guide Availability Rules API (TP-BP-007)
 * GET  - List own availability rules
 * POST - Create a new availability rule (for self only)
 *
 * Strict ownership: Guide can only access/modify their own rules
 */

import { NextRequest } from 'next/server';
import { ok, fail } from '../../../../src/lib/api';
import { validateCsrf } from '../../../../src/lib/csrf.mjs';
import { verifyGuideSession } from '../../../../src/lib/guide-auth';
import { normalizeTimeLocal } from '../../../../src/lib/availability-v2/time-local.mjs';
import { isDynamicAvailabilityApplicable } from '../../../../src/lib/booking-type-flow.mjs';

async function getSupabase() {
  const { createClient } = await import('@supabase/supabase-js');
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

async function ensureOwnedUsablePlan(
  supabase: any,
  guideId: string,
  activityPlanId: string
): Promise<{ ok: true } | { ok: false; status: number; code: string; message: string }> {
  const { data, error } = await supabase
    .from('activity_plans')
    .select(
      `
        id,
        status,
        booking_type,
        activities!inner (
          guide_id
        )
      `
    )
    .eq('id', activityPlanId)
    .eq('activities.guide_id', guideId)
    .single();

  if (error || !data) {
    return { ok: false, status: 403, code: 'FORBIDDEN', message: 'activity_plan_id is not owned by this guide' };
  }

  if (data.status !== 'active') {
    return {
      ok: false,
      status: 400,
      code: 'VALIDATION_ERROR',
      message: 'activity_plan_id is not in usable status',
    };
  }

  // 排程方案只看固定場次（activity_schedules），動態可預約時段規則對它無效。
  // 對稱 #1495（排程方案不得新增動態規則 / 非排程方案不得新增固定場次）。
  if (!isDynamicAvailabilityApplicable(data.booking_type)) {
    return {
      ok: false,
      status: 422,
      code: 'RULE_NOT_APPLICABLE_FOR_BOOKING_TYPE',
      message: '排程預約方案僅使用固定場次，請改用「場次管理」；動態可預約時段規則僅適用即時／申請預約方案。',
    };
  }

  return { ok: true };
}

function isValidTimezone(tz: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}


export async function GET(request: NextRequest) {
  const session = verifyGuideSession(request);
  if (!session) {
    return Response.json(fail('UNAUTHORIZED', 'Guide session required'), { status: 401 });
  }

  if (!process.env.SUPABASE_URL) {
    return Response.json(ok({ rules: [] }));
  }

  try {
    const supabase = await getSupabase();

    const { data, error } = await supabase
      .from('guide_availability_rules')
      .select(`
        id,
        guide_id,
        activity_plan_id,
        weekday,
        start_time_local,
        end_time_local,
        timezone,
        slot_interval_minutes,
        buffer_before_minutes,
        buffer_after_minutes,
        effective_from,
        effective_to,
        is_active,
        use_dynamic_reemit,
        created_at,
        updated_at,
        activity_plans (
          id,
          name,
          min_participants,
          max_participants
        )
      `)
      .eq('guide_id', session.guideId)
      .order('weekday', { ascending: true })
      .order('start_time_local', { ascending: true });

    if (error) {
      console.error('Error fetching availability rules:', error);
      return Response.json(fail('SERVER_ERROR', 'Failed to fetch rules'), { status: 500 });
    }

    // Postgres `time` columns come back as "HH:MM:SS". Normalize to HH:MM so
    // the client card and <input type="time"> render correctly and an
    // unchanged edit round-trips through the write validators cleanly.
    const rules = (data || []).map((rule) => ({
      ...rule,
      start_time_local: normalizeTimeLocal(rule.start_time_local) ?? rule.start_time_local,
      end_time_local: normalizeTimeLocal(rule.end_time_local) ?? rule.end_time_local,
    }));

    return Response.json(ok({ rules }));
  } catch (err) {
    console.error('Availability rules API error:', err);
    return Response.json(fail('SERVER_ERROR', 'Server error'), { status: 500 });
  }
}

interface CreateRuleBody {
  weekday: number;
  start_time_local: string;
  end_time_local: string;
  timezone: string;
  activity_plan_id?: string | null;
  slot_interval_minutes?: number;
  buffer_before_minutes?: number;
  buffer_after_minutes?: number;
  effective_from?: string | null;
  effective_to?: string | null;
  is_active?: boolean;
  use_dynamic_reemit?: boolean;
}

export async function POST(request: NextRequest) {
  const csrfError = validateCsrf(request);
  if (csrfError) return csrfError;

  const session = verifyGuideSession(request);
  if (!session) {
    return Response.json(fail('UNAUTHORIZED', 'Guide session required'), { status: 401 });
  }

  let body: CreateRuleBody;
  try {
    body = await request.json();
  } catch {
    return Response.json(fail('VALIDATION_ERROR', 'Invalid JSON body'), { status: 400 });
  }

  // Validation
  if (body.weekday === undefined || body.weekday < 0 || body.weekday > 6) {
    return Response.json(fail('VALIDATION_ERROR', 'weekday must be 0-6'), { status: 400 });
  }
  // Accept HH:MM and HH:MM:SS (Postgres `time` round-trips with seconds),
  // normalizing to canonical HH:MM for both comparison and storage.
  const startTimeLocal = normalizeTimeLocal(body.start_time_local);
  if (!startTimeLocal) {
    return Response.json(fail('VALIDATION_ERROR', '開始時間格式不正確，請使用 24 小時制 HH:MM（例如 09:00）'), { status: 400 });
  }
  const endTimeLocal = normalizeTimeLocal(body.end_time_local);
  if (!endTimeLocal) {
    return Response.json(fail('VALIDATION_ERROR', '結束時間格式不正確，請使用 24 小時制 HH:MM（例如 17:00）'), { status: 400 });
  }
  if (startTimeLocal >= endTimeLocal) {
    return Response.json(fail('VALIDATION_ERROR', '開始時間必須早於結束時間'), { status: 400 });
  }
  if (!body.timezone || !isValidTimezone(body.timezone)) {
    return Response.json(fail('VALIDATION_ERROR', 'Invalid timezone'), { status: 400 });
  }

  if (!process.env.SUPABASE_URL) {
    return Response.json(fail('SERVER_ERROR', 'Database not configured'), { status: 500 });
  }

  try {
    const supabase = await getSupabase();

    if (body.activity_plan_id) {
      const planCheck = await ensureOwnedUsablePlan(supabase, session.guideId, body.activity_plan_id);
      if (!planCheck.ok) {
        return Response.json(fail(planCheck.code, planCheck.message), { status: planCheck.status });
      }
    }

    const insertData = {
      guide_id: session.guideId, // Always use session guideId for ownership
      weekday: body.weekday,
      start_time_local: startTimeLocal,
      end_time_local: endTimeLocal,
      timezone: body.timezone,
      activity_plan_id: body.activity_plan_id || null,
      slot_interval_minutes: body.slot_interval_minutes ?? 60,
      buffer_before_minutes: body.buffer_before_minutes ?? 15,
      buffer_after_minutes: body.buffer_after_minutes ?? 15,
      effective_from: body.effective_from || null,
      effective_to: body.effective_to || null,
      is_active: body.is_active ?? true,
      use_dynamic_reemit: body.use_dynamic_reemit ?? false,
    };

    const { data, error } = await supabase
      .from('guide_availability_rules')
      .insert(insertData)
      .select()
      .single();

    if (error) {
      console.error('Error creating availability rule:', error);
      return Response.json(fail('SERVER_ERROR', 'Failed to create rule'), { status: 500 });
    }

    return Response.json(ok({ rule: data }), { status: 201 });
  } catch (err) {
    console.error('Create rule API error:', err);
    return Response.json(fail('SERVER_ERROR', 'Server error'), { status: 500 });
  }
}
