/**
 * Guide Availability Rule Single Item API (TP-BP-007)
 * PUT    - Update an availability rule
 * DELETE - Delete an availability rule
 */

import { NextRequest } from 'next/server';
import { successV2, errorV2 } from '../../../../../../../../src/lib/api';
import { createClient } from '../../../../../../../../src/lib/supabase/server';
import { assertPlanBelongsToGuide } from '../../../../../../../../src/lib/availability-v2/assert-plan-belongs-to-guide';
import { normalizeTimeLocal } from '../../../../../../../../src/lib/availability-v2/time-local.mjs';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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
  context: { params: Promise<{ guideId: string; ruleId: string }> }
) {
  const { guideId, ruleId } = await context.params;

  if (!UUID_REGEX.test(guideId)) {
    return Response.json(errorV2('VALIDATION_ERROR', 'Invalid guideId'), { status: 400 });
  }
  if (!UUID_REGEX.test(ruleId)) {
    return Response.json(errorV2('VALIDATION_ERROR', 'Invalid ruleId'), { status: 400 });
  }

  let body: UpdateRuleBody;
  try {
    body = await request.json();
  } catch {
    return Response.json(errorV2('VALIDATION_ERROR', 'Invalid JSON body'), { status: 400 });
  }

  // Validation
  if (body.weekday !== undefined && (body.weekday < 0 || body.weekday > 6)) {
    return Response.json(errorV2('VALIDATION_ERROR', 'weekday must be 0-6'), { status: 400 });
  }
  let startTimeLocal: string | undefined;
  if (body.start_time_local !== undefined) {
    const normalized = normalizeTimeLocal(body.start_time_local);
    if (!normalized) {
      return Response.json(errorV2('VALIDATION_ERROR', '開始時間格式不正確，請使用 24 小時制 HH:MM（例如 09:00）'), { status: 400 });
    }
    startTimeLocal = normalized;
  }
  let endTimeLocal: string | undefined;
  if (body.end_time_local !== undefined) {
    const normalized = normalizeTimeLocal(body.end_time_local);
    if (!normalized) {
      return Response.json(errorV2('VALIDATION_ERROR', '結束時間格式不正確，請使用 24 小時制 HH:MM（例如 17:00）'), { status: 400 });
    }
    endTimeLocal = normalized;
  }
  if (body.timezone !== undefined && !isValidTimezone(body.timezone)) {
    return Response.json(errorV2('VALIDATION_ERROR', 'Invalid timezone'), { status: 400 });
  }
  if (body.activity_plan_id !== undefined && body.activity_plan_id !== null && !UUID_REGEX.test(body.activity_plan_id)) {
    return Response.json(errorV2('VALIDATION_ERROR', 'Invalid activity_plan_id'), { status: 400 });
  }

  try {
    const supabase = await createClient();

    // Check rule exists and belongs to guide
    const { data: existing, error: existingError } = await supabase
      .from('guide_availability_rules')
      .select('id, guide_id, start_time_local, end_time_local')
      .eq('id', ruleId)
      .eq('guide_id', guideId)
      .single();

    if (existingError || !existing) {
      return Response.json(errorV2('NOT_FOUND', 'Rule not found'), { status: 404 });
    }

    // Validate start/end ordering. Existing DB values come back as HH:MM:SS,
    // so normalize both sides before the lexical comparison.
    const startTime = startTimeLocal ?? normalizeTimeLocal(existing.start_time_local);
    const endTime = endTimeLocal ?? normalizeTimeLocal(existing.end_time_local);
    if (startTime && endTime && startTime >= endTime) {
      return Response.json(errorV2('VALIDATION_ERROR', '開始時間必須早於結束時間'), { status: 400 });
    }

    // Validate plan ownership if provided
    if (body.activity_plan_id) {
      const planCheck = await assertPlanBelongsToGuide({
        planId: body.activity_plan_id,
        guideId,
        supabase,
      });
      if (!planCheck.ok) {
        return Response.json(
          errorV2(planCheck.code, '所選方案不屬於此導遊或已停用'),
          { status: 422 }
        );
      }
    }

    const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (body.weekday !== undefined) updateData.weekday = body.weekday;
    if (startTimeLocal !== undefined) updateData.start_time_local = startTimeLocal;
    if (endTimeLocal !== undefined) updateData.end_time_local = endTimeLocal;
    if (body.timezone !== undefined) updateData.timezone = body.timezone;
    if (body.activity_plan_id !== undefined) updateData.activity_plan_id = body.activity_plan_id;
    if (body.slot_interval_minutes !== undefined) updateData.slot_interval_minutes = body.slot_interval_minutes;
    if (body.buffer_before_minutes !== undefined) updateData.buffer_before_minutes = body.buffer_before_minutes;
    if (body.buffer_after_minutes !== undefined) updateData.buffer_after_minutes = body.buffer_after_minutes;
    if (body.effective_from !== undefined) updateData.effective_from = body.effective_from;
    if (body.effective_to !== undefined) updateData.effective_to = body.effective_to;
    if (body.is_active !== undefined) updateData.is_active = body.is_active;
    if (body.use_dynamic_reemit !== undefined) updateData.use_dynamic_reemit = body.use_dynamic_reemit;

    const { data, error } = await supabase
      .from('guide_availability_rules')
      .update(updateData)
      .eq('id', ruleId)
      .select()
      .single();

    if (error) {
      console.error('Error updating availability rule:', error);
      return Response.json(errorV2('INTERNAL_ERROR', 'Failed to update rule'), { status: 500 });
    }

    return Response.json(successV2({ rule: data }));
  } catch (err) {
    console.error('Update rule API error:', err);
    return Response.json(errorV2('INTERNAL_ERROR', 'Server error'), { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ guideId: string; ruleId: string }> }
) {
  const { guideId, ruleId } = await context.params;

  if (!UUID_REGEX.test(guideId)) {
    return Response.json(errorV2('VALIDATION_ERROR', 'Invalid guideId'), { status: 400 });
  }
  if (!UUID_REGEX.test(ruleId)) {
    return Response.json(errorV2('VALIDATION_ERROR', 'Invalid ruleId'), { status: 400 });
  }

  try {
    const supabase = await createClient();

    // Verify rule exists and belongs to guide
    const { data: existing, error: existingError } = await supabase
      .from('guide_availability_rules')
      .select('id')
      .eq('id', ruleId)
      .eq('guide_id', guideId)
      .single();

    if (existingError || !existing) {
      return Response.json(errorV2('NOT_FOUND', 'Rule not found'), { status: 404 });
    }

    const { error } = await supabase
      .from('guide_availability_rules')
      .delete()
      .eq('id', ruleId);

    if (error) {
      console.error('Error deleting availability rule:', error);
      return Response.json(errorV2('INTERNAL_ERROR', 'Failed to delete rule'), { status: 500 });
    }

    return Response.json(successV2({ deleted: true }));
  } catch (err) {
    console.error('Delete rule API error:', err);
    return Response.json(errorV2('INTERNAL_ERROR', 'Server error'), { status: 500 });
  }
}
