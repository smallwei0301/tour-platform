/**
 * Guide Availability Rules API (TP-BP-007)
 * GET  - List all availability rules for a guide
 * POST - Create a new availability rule
 */

import { NextRequest } from 'next/server';
import { successV2, errorV2 } from '../../../../../../../src/lib/api';
import { createClient } from '../../../../../../../src/lib/supabase/server';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ guideId: string }> }
) {
  const { guideId } = await context.params;

  if (!UUID_REGEX.test(guideId)) {
    return Response.json(errorV2('VALIDATION_ERROR', 'Invalid guideId'), { status: 400 });
  }

  try {
    const supabase = await createClient();

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
        created_at,
        updated_at,
        activity_plans (
          id,
          name,
          min_participants,
          max_participants
        )
      `)
      .eq('guide_id', guideId)
      .order('weekday', { ascending: true })
      .order('start_time_local', { ascending: true });

    if (error) {
      console.error('Error fetching availability rules:', error);
      return Response.json(errorV2('INTERNAL_ERROR', 'Failed to fetch rules'), { status: 500 });
    }

    return Response.json(successV2({ rules: data || [] }));
  } catch (err) {
    console.error('Availability rules API error:', err);
    return Response.json(errorV2('INTERNAL_ERROR', 'Server error'), { status: 500 });
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
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ guideId: string }> }
) {
  const { guideId } = await context.params;

  if (!UUID_REGEX.test(guideId)) {
    return Response.json(errorV2('VALIDATION_ERROR', 'Invalid guideId'), { status: 400 });
  }

  let body: CreateRuleBody;
  try {
    body = await request.json();
  } catch {
    return Response.json(errorV2('VALIDATION_ERROR', 'Invalid JSON body'), { status: 400 });
  }

  // Validation
  if (body.weekday === undefined || body.weekday < 0 || body.weekday > 6) {
    return Response.json(errorV2('VALIDATION_ERROR', 'weekday must be 0-6'), { status: 400 });
  }
  if (!body.start_time_local || !isValidTimeString(body.start_time_local)) {
    return Response.json(errorV2('VALIDATION_ERROR', 'Invalid start_time_local (HH:MM)'), { status: 400 });
  }
  if (!body.end_time_local || !isValidTimeString(body.end_time_local)) {
    return Response.json(errorV2('VALIDATION_ERROR', 'Invalid end_time_local (HH:MM)'), { status: 400 });
  }
  if (body.start_time_local >= body.end_time_local) {
    return Response.json(errorV2('VALIDATION_ERROR', 'start_time must be before end_time'), { status: 400 });
  }
  if (!body.timezone || !isValidTimezone(body.timezone)) {
    return Response.json(errorV2('VALIDATION_ERROR', 'Invalid timezone'), { status: 400 });
  }
  if (body.activity_plan_id && !UUID_REGEX.test(body.activity_plan_id)) {
    return Response.json(errorV2('VALIDATION_ERROR', 'Invalid activity_plan_id'), { status: 400 });
  }

  try {
    const supabase = await createClient();

    // Verify guide exists
    const { data: guide, error: guideError } = await supabase
      .from('guide_profiles')
      .select('id')
      .eq('id', guideId)
      .single();

    if (guideError || !guide) {
      return Response.json(errorV2('NOT_FOUND', 'Guide not found'), { status: 404 });
    }

    const insertData = {
      guide_id: guideId,
      weekday: body.weekday,
      start_time_local: body.start_time_local,
      end_time_local: body.end_time_local,
      timezone: body.timezone,
      activity_plan_id: body.activity_plan_id || null,
      slot_interval_minutes: body.slot_interval_minutes ?? 60,
      buffer_before_minutes: body.buffer_before_minutes ?? 15,
      buffer_after_minutes: body.buffer_after_minutes ?? 15,
      effective_from: body.effective_from || null,
      effective_to: body.effective_to || null,
      is_active: body.is_active ?? true,
    };

    const { data, error } = await supabase
      .from('guide_availability_rules')
      .insert(insertData)
      .select()
      .single();

    if (error) {
      console.error('Error creating availability rule:', error);
      return Response.json(errorV2('INTERNAL_ERROR', 'Failed to create rule'), { status: 500 });
    }

    return Response.json(successV2({ rule: data }), { status: 201 });
  } catch (err) {
    console.error('Create rule API error:', err);
    return Response.json(errorV2('INTERNAL_ERROR', 'Server error'), { status: 500 });
  }
}
