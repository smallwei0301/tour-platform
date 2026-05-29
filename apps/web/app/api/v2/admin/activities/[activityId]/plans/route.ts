/**
 * Activity Plans API (TP-BP-008)
 * GET  - List all plans for an activity
 * POST - Create a new plan
 */

import { NextRequest } from 'next/server';
import { successV2, errorV2 } from '../../../../../../../src/lib/api';
import { getSupabase } from '../../../../../../../src/lib/db.mjs';
import { normalizeRichPlanPayload } from '../../../../../../../src/lib/activity-plans-rich-mapper.mjs';
import {
  duplicatePlanSlugMessage,
  generatePlanSlug,
  isDuplicatePlanSlugError,
} from '../../../../../../../src/lib/activity-plan-slugs.mjs';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const VALID_PRICE_TYPES = ['per_person', 'per_group'];
const VALID_BOOKING_TYPES = ['scheduled', 'request', 'instant'];
const VALID_STATUSES = ['active', 'inactive', 'archived'];

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ activityId: string }> }
) {
  const { activityId } = await context.params;

  if (!UUID_REGEX.test(activityId)) {
    return Response.json(errorV2('VALIDATION_ERROR', 'Invalid activityId'), { status: 400 });
  }

  try {
    const supabase = await getSupabase();

    // Verify activity exists
    const { data: activity, error: actError } = await supabase
      .from('activities')
      .select('id, title')
      .eq('id', activityId)
      .single();

    if (actError || !activity) {
      return Response.json(errorV2('NOT_FOUND', 'Activity not found'), { status: 404 });
    }

    const { data, error } = await supabase
      .from('activity_plans')
      .select('*')
      .eq('activity_id', activityId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching activity plans:', error);
      return Response.json(errorV2('INTERNAL_ERROR', 'Failed to fetch plans'), { status: 500 });
    }

    return Response.json(successV2({
      activity: { id: activity.id, title: activity.title },
      plans: data || [],
    }));
  } catch (err) {
    console.error('Activity plans API error:', err);
    return Response.json(errorV2('INTERNAL_ERROR', 'Server error'), { status: 500 });
  }
}

interface CreatePlanBody {
  name: string;
  slug?: string;
  description?: string;
  duration_minutes: number;
  price_type: 'per_person' | 'per_group';
  base_price: number;
  min_participants?: number;
  max_participants?: number;
  booking_type?: 'scheduled' | 'request' | 'instant';
  status?: 'active' | 'inactive' | 'archived';
  legacy_plan_id?: string;
  details_link_text?: string;
  booking_btn_text?: string;
  highlights?: string[];
  language?: string;
  earliest_departure?: string;
  confirm_by_days?: number;
  free_cancel_days?: number;
  plan_inclusions?: string[];
  plan_exclusions?: string[];
  plan_itinerary?: Array<{ text: string; imageUrl?: string }>;
  plan_itinerary_image_url?: string;
  meeting_point_name?: string;
  meeting_address?: string;
  experience_point_name?: string;
  experience_address?: string;
  plan_notices?: string[];
  plan_refund_rules?: string[];
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ activityId: string }> }
) {
  const { activityId } = await context.params;

  if (!UUID_REGEX.test(activityId)) {
    return Response.json(errorV2('VALIDATION_ERROR', 'Invalid activityId'), { status: 400 });
  }

  let body: CreatePlanBody;
  try {
    body = await request.json();
  } catch {
    return Response.json(errorV2('VALIDATION_ERROR', 'Invalid JSON body'), { status: 400 });
  }

  // Validation
  if (!body.name || body.name.trim().length === 0) {
    return Response.json(errorV2('VALIDATION_ERROR', 'name is required'), { status: 400 });
  }
  if (!body.duration_minutes || body.duration_minutes < 15) {
    return Response.json(errorV2('VALIDATION_ERROR', 'duration_minutes must be at least 15'), { status: 400 });
  }
  if (!body.price_type || !VALID_PRICE_TYPES.includes(body.price_type)) {
    return Response.json(errorV2('VALIDATION_ERROR', 'Invalid price_type'), { status: 400 });
  }
  if (body.base_price === undefined || body.base_price < 0) {
    return Response.json(errorV2('VALIDATION_ERROR', 'base_price must be >= 0'), { status: 400 });
  }
  if (body.booking_type && !VALID_BOOKING_TYPES.includes(body.booking_type)) {
    return Response.json(errorV2('VALIDATION_ERROR', 'Invalid booking_type'), { status: 400 });
  }
  if (body.status && !VALID_STATUSES.includes(body.status)) {
    return Response.json(errorV2('VALIDATION_ERROR', 'Invalid status'), { status: 400 });
  }
  const arrayFields = ['highlights', 'plan_inclusions', 'plan_exclusions', 'plan_notices', 'plan_refund_rules'] as const;
  const bodyRecord = body as unknown as Record<string, unknown>;
  for (const key of arrayFields) {
    if (bodyRecord[key] !== undefined && !Array.isArray(bodyRecord[key])) {
      return Response.json(errorV2('VALIDATION_ERROR', `${key} must be an array`), { status: 400 });
    }
  }

  const minParticipants = body.min_participants ?? 1;
  const maxParticipants = body.max_participants ?? 10;
  if (minParticipants < 1 || maxParticipants < minParticipants) {
    return Response.json(errorV2('VALIDATION_ERROR', 'Invalid participant range'), { status: 400 });
  }

  try {
    const supabase = await getSupabase();

    // Verify activity exists
    const { data: activity, error: actError } = await supabase
      .from('activities')
      .select('id')
      .eq('id', activityId)
      .single();

    if (actError || !activity) {
      return Response.json(errorV2('NOT_FOUND', 'Activity not found'), { status: 404 });
    }

    // Generate slug if not provided. Chinese-only names produce an empty ASCII slug,
    // so fall back to a safe unique value instead of inserting ''.
    const slug = generatePlanSlug({ name: body.name, slug: body.slug });

    const insertData = {
      activity_id: activityId,
      name: body.name.trim(),
      slug,
      description: body.description || null,
      duration_minutes: body.duration_minutes,
      price_type: body.price_type,
      base_price: body.base_price,
      min_participants: minParticipants,
      max_participants: maxParticipants,
      booking_type: body.booking_type || 'scheduled',
      status: body.status || 'active',
      ...normalizeRichPlanPayload(body),
    };

    let data: any = null;
    let error: any = null;

    // New schema supports `description`; old schema may not have it yet.
    ({ data, error } = await supabase
      .from('activity_plans')
      .insert(insertData)
      .select()
      .single());

    if (error && /description/i.test(String(error.message || ''))) {
      const { description: _omitDescription, ...fallbackInsertData } = insertData as any;
      ({ data, error } = await supabase
        .from('activity_plans')
        .insert(fallbackInsertData)
        .select()
        .single());
    }

    if (error) {
      console.error('Error creating activity plan:', error);
      if (isDuplicatePlanSlugError(error)) {
        return Response.json(errorV2('DUPLICATE_SLUG', duplicatePlanSlugMessage(slug)), { status: 409 });
      }
      return Response.json(errorV2('INTERNAL_ERROR', 'Failed to create plan'), { status: 500 });
    }

    return Response.json(successV2({ plan: data }), { status: 201 });
  } catch (err) {
    console.error('Create plan API error:', err);
    return Response.json(errorV2('INTERNAL_ERROR', 'Server error'), { status: 500 });
  }
}
