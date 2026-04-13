/**
 * Guide Availability Rules API - Single Rule Operations (TP-BP-007)
 * PUT    - Update own availability rule
 * DELETE - Delete own availability rule
 *
 * Strict ownership: Guide can only modify their own rules
 */

import { NextRequest } from 'next/server';
import { ok, fail } from '../../../../../src/lib/api'";
import { verifyGuideSession } from '../../../../../src/lib/guide-auth'";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function getSupabase() {
  const { createClient } = await import('@supabase/supabase-js');
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

function isValidTimezone(tz: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

function isValidTimeString(time: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(time);
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
}

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ ruleId: string }> }
) {
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
  if (body.start_time_local && !isValidTimeString(body.start_time_local)) {
    return Response.json(fail('VALIDATION_ERROR', 'Invalid start_time_local (HH:MM)'), { status: 400 });
  }
  if (body.end_time_local && !isValidTimeString(body.end_time_local)) {
    return Response.json(fail('VALIDATION_ERROR', 'Invalid end_time_local (HH:MM)'), { status: 400 });
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

    // Build update object with only provided fields
    const updateData: Record<string, unknown> = {};
    if (body.weekday !== undefined) updateData.weekday = body.weekday;
    if (body.start_time_local) updateData.start_time_local = body.start_time_local;
    if (body.end_time_local) updateData.end_time_local = body.end_time_local;
    if (body.timezone) updateData.timezone = body.timezone;
    if (body.activity_plan_id !== undefined) updateData.activity_plan_id = body.activity_plan_id;
    if (body.slot_interval_minutes !== undefined) updateData.slot_interval_minutes = body.slot_interval_minutes;
    if (body.buffer_before_minutes !== undefined) updateData.buffer_before_minutes = body.buffer_before_minutes;
    if (body.buffer_after_minutes !== undefined) updateData.buffer_after_minutes = body.buffer_after_minutes;
    if (body.effective_from !== undefined) updateData.effective_from = body.effective_from;
    if (body.effective_to !== undefined) updateData.effective_to = body.effective_to;
    if (body.is_active !== undefined) updateData.is_active = body.is_active;

    // Validate start/end times after merge
    const startTime = (updateData.start_time_local as string) || existing.start_time_local;
    const endTime = (updateData.end_time_local as string) || existing.end_time_local;
    if (startTime && endTime && startTime >= endTime) {
      return Response.json(fail('VALIDATION_ERROR', 'start_time must be before end_time'), { status: 400 });
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
