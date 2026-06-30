/**
 * Guide Availability Rules API - Single Rule Operations (TP-BP-007)
 * PUT    - Update own availability rule
 * DELETE - Delete own availability rule
 *
 * Strict ownership: Guide can only modify their own rules
 */

import { NextRequest } from 'next/server';
import { ok, fail } from '../../../../../src/lib/api';
import { validateCsrf } from '../../../../../src/lib/csrf.mjs';
import { verifyGuideSession } from '../../../../../src/lib/guide-auth';
import { normalizeTimeLocal } from '../../../../../src/lib/availability-v2/time-local.mjs';
import { isDynamicAvailabilityApplicable } from '../../../../../src/lib/booking-type-flow.mjs';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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


interface UpdateRuleBody {
  weekday?: number;
  start_time_local?: string;
  end_time_local?: string;
  timezone?: string;
  activity_plan_id?: string | null;
  slot_interval_minutes?: number;
  buffer_before_minutes?: number;
  buffer_after_minutes?: number;
  effective_from?: string | null;
  effective_to?: string | null;
  is_active?: boolean;
  use_dynamic_reemit?: boolean;
}

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ ruleId: string }> }
) {
  const csrfError = validateCsrf(request);
  if (csrfError) return csrfError;

  const session = verifyGuideSession(request);
  if (!session) {
    return Response.json(fail('UNAUTHORIZED', 'Guide session required'), { status: 401 });
  }

  const { ruleId } = await context.params;

  if (!UUID_REGEX.test(ruleId)) {
    return Response.json(fail('VALIDATION_ERROR', 'Invalid ruleId'), { status: 400 });
  }

  let body: UpdateRuleBody;
  try {
    body = await request.json();
  } catch {
    return Response.json(fail('VALIDATION_ERROR', 'Invalid JSON body'), { status: 400 });
  }

  // Validation
  if (body.weekday !== undefined && (body.weekday < 0 || body.weekday > 6)) {
    return Response.json(fail('VALIDATION_ERROR', 'weekday must be 0-6'), { status: 400 });
  }
  // Accept HH:MM and HH:MM:SS, normalizing to canonical HH:MM. Only the
  // provided fields are validated (partial update).
  let startTimeLocal: string | undefined;
  if (body.start_time_local !== undefined) {
    const normalized = normalizeTimeLocal(body.start_time_local);
    if (!normalized) {
      return Response.json(fail('VALIDATION_ERROR', '開始時間格式不正確，請使用 24 小時制 HH:MM（例如 09:00）'), { status: 400 });
    }
    startTimeLocal = normalized;
  }
  let endTimeLocal: string | undefined;
  if (body.end_time_local !== undefined) {
    const normalized = normalizeTimeLocal(body.end_time_local);
    if (!normalized) {
      return Response.json(fail('VALIDATION_ERROR', '結束時間格式不正確，請使用 24 小時制 HH:MM（例如 17:00）'), { status: 400 });
    }
    endTimeLocal = normalized;
  }
  if (body.timezone && !isValidTimezone(body.timezone)) {
    return Response.json(fail('VALIDATION_ERROR', 'Invalid timezone'), { status: 400 });
  }

  if (!process.env.SUPABASE_URL) {
    return Response.json(fail('SERVER_ERROR', 'Database not configured'), { status: 500 });
  }

  try {
    const supabase = await getSupabase();

    // First verify the rule belongs to this guide (strict ownership)
    const { data: existing, error: fetchError } = await supabase
      .from('guide_availability_rules')
      .select('id, guide_id, start_time_local, end_time_local')
      .eq('id', ruleId)
      .single();

    if (fetchError || !existing) {
      return Response.json(fail('NOT_FOUND', 'Rule not found'), { status: 404 });
    }

    if (existing.guide_id !== session.guideId) {
      return Response.json(fail('FORBIDDEN', 'Cannot modify rules of other guides'), { status: 403 });
    }

    if (body.activity_plan_id) {
      const planCheck = await ensureOwnedUsablePlan(supabase, session.guideId, body.activity_plan_id);
      if (!planCheck.ok) {
        return Response.json(fail(planCheck.code, planCheck.message), { status: planCheck.status });
      }
    }

    // Build update object with only provided fields
    const updateData: Record<string, unknown> = {};
    if (body.weekday !== undefined) updateData.weekday = body.weekday;
    if (startTimeLocal !== undefined) updateData.start_time_local = startTimeLocal;
    if (endTimeLocal !== undefined) updateData.end_time_local = endTimeLocal;
    if (body.timezone) updateData.timezone = body.timezone;
    if (body.activity_plan_id !== undefined) updateData.activity_plan_id = body.activity_plan_id;
    if (body.slot_interval_minutes !== undefined) updateData.slot_interval_minutes = body.slot_interval_minutes;
    if (body.buffer_before_minutes !== undefined) updateData.buffer_before_minutes = body.buffer_before_minutes;
    if (body.buffer_after_minutes !== undefined) updateData.buffer_after_minutes = body.buffer_after_minutes;
    if (body.effective_from !== undefined) updateData.effective_from = body.effective_from;
    if (body.effective_to !== undefined) updateData.effective_to = body.effective_to;
    if (body.is_active !== undefined) updateData.is_active = body.is_active;
    if (body.use_dynamic_reemit !== undefined) updateData.use_dynamic_reemit = body.use_dynamic_reemit;

    // Validate start/end ordering after merge. Existing DB values come back
    // as HH:MM:SS, so normalize both sides before the lexical comparison.
    const startTime = startTimeLocal ?? normalizeTimeLocal(existing.start_time_local);
    const endTime = endTimeLocal ?? normalizeTimeLocal(existing.end_time_local);
    if (startTime && endTime && startTime >= endTime) {
      return Response.json(fail('VALIDATION_ERROR', '開始時間必須早於結束時間'), { status: 400 });
    }

    const { data, error } = await supabase
      .from('guide_availability_rules')
      .update(updateData)
      .eq('id', ruleId)
      .eq('guide_id', session.guideId) // Double-check ownership
      .select()
      .single();

    if (error) {
      console.error('Error updating availability rule:', error);
      return Response.json(fail('SERVER_ERROR', 'Failed to update rule'), { status: 500 });
    }

    return Response.json(ok({ rule: data }));
  } catch (err) {
    console.error('Update rule API error:', err);
    return Response.json(fail('SERVER_ERROR', 'Server error'), { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ ruleId: string }> }
) {
  const csrfError = validateCsrf(request);
  if (csrfError) return csrfError;

  const session = verifyGuideSession(request);
  if (!session) {
    return Response.json(fail('UNAUTHORIZED', 'Guide session required'), { status: 401 });
  }

  const { ruleId } = await context.params;

  if (!UUID_REGEX.test(ruleId)) {
    return Response.json(fail('VALIDATION_ERROR', 'Invalid ruleId'), { status: 400 });
  }

  if (!process.env.SUPABASE_URL) {
    return Response.json(fail('SERVER_ERROR', 'Database not configured'), { status: 500 });
  }

  try {
    const supabase = await getSupabase();

    // First verify the rule belongs to this guide (strict ownership)
    const { data: existing, error: fetchError } = await supabase
      .from('guide_availability_rules')
      .select('id, guide_id')
      .eq('id', ruleId)
      .single();

    if (fetchError || !existing) {
      return Response.json(fail('NOT_FOUND', 'Rule not found'), { status: 404 });
    }

    if (existing.guide_id !== session.guideId) {
      return Response.json(fail('FORBIDDEN', 'Cannot delete rules of other guides'), { status: 403 });
    }

    const { error } = await supabase
      .from('guide_availability_rules')
      .delete()
      .eq('id', ruleId)
      .eq('guide_id', session.guideId); // Double-check ownership

    if (error) {
      console.error('Error deleting availability rule:', error);
      return Response.json(fail('SERVER_ERROR', 'Failed to delete rule'), { status: 500 });
    }

    return Response.json(ok({ deleted: true }));
  } catch (err) {
    console.error('Delete rule API error:', err);
    return Response.json(fail('SERVER_ERROR', 'Server error'), { status: 500 });
  }
}
