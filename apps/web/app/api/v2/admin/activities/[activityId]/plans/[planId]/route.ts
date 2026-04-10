/**
 * Activity Plan Single Item API (TP-BP-008)
 * GET    - Get a single plan
 * PUT    - Update a plan
 * DELETE - Soft delete a plan (set status to archived)
 */

import { NextRequest } from 'next/server';
import { successV2, errorV2 } from '../../../../../../../../src/lib/api';
import { createClient } from '../../../../../../../../src/lib/supabase/server';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const VALID_PRICE_TYPES = ['per_person', 'per_group'];
const VALID_BOOKING_TYPES = ['scheduled', 'request', 'instant'];
const VALID_STATUSES = ['active', 'inactive', 'archived'];

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ activityId: string; planId: string }> }
) {
  const { activityId, planId } = await context.params;

  if (!UUID_REGEX.test(activityId)) {
    return Response.json(errorV2('VALIDATION_ERROR', 'Invalid activityId'), { status: 400 });
  }
  if (!UUID_REGEX.test(planId)) {
    return Response.json(errorV2('VALIDATION_ERROR', 'Invalid planId'), { status: 400 });
  }

  try {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from('activity_plans')
      .select(`
        *,
        activities (
          id,
          title,
          guide_id
        )
      `)
      .eq('id', planId)
      .eq('activity_id', activityId)
      .single();

    if (error || !data) {
      return Response.json(errorV2('NOT_FOUND', 'Plan not found'), { status: 404 });
    }

    return Response.json(successV2({ plan: data }));
  } catch (err) {
    console.error('Get plan API error:', err);
    return Response.json(errorV2('INTERNAL_ERROR', 'Server error'), { status: 500 });
  }
}

interface UpdatePlanBody {
  name?: string;
  slug?: string;
  description?: string;
  duration_minutes?: number;
  price_type?: 'per_person' | 'per_group';
  base_price?: number;
  min_participants?: number;
  max_participants?: number;
  booking_type?: 'scheduled' | 'request' | 'instant';
  status?: 'active' | 'inactive' | 'archived';
}

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ activityId: string; planId: string }> }
) {
  const { activityId, planId } = await context.params;

  if (!UUID_REGEX.test(activityId)) {
    return Response.json(errorV2('VALIDATION_ERROR', 'Invalid activityId'), { status: 400 });
  }
  if (!UUID_REGEX.test(planId)) {
    return Response.json(errorV2('VALIDATION_ERROR', 'Invalid planId'), { status: 400 });
  }

  let body: UpdatePlanBody;
  try {
    body = await request.json();
  } catch {
    return Response.json(errorV2('VALIDATION_ERROR', 'Invalid JSON body'), { status: 400 });
  }

  // Validation
  if (body.name !== undefined && body.name.trim().length === 0) {
    return Response.json(errorV2('VALIDATION_ERROR', 'name cannot be empty'), { status: 400 });
  }
  if (body.duration_minutes !== undefined && body.duration_minutes < 15) {
    return Response.json(errorV2('VALIDATION_ERROR', 'duration_minutes must be at least 15'), { status: 400 });
  }
  if (body.price_type !== undefined && !VALID_PRICE_TYPES.includes(body.price_type)) {
    return Response.json(errorV2('VALIDATION_ERROR', 'Invalid price_type'), { status: 400 });
  }
  if (body.base_price !== undefined && body.base_price < 0) {
    return Response.json(errorV2('VALIDATION_ERROR', 'base_price must be >= 0'), { status: 400 });
  }
  if (body.booking_type !== undefined && !VALID_BOOKING_TYPES.includes(body.booking_type)) {
    return Response.json(errorV2('VALIDATION_ERROR', 'Invalid booking_type'), { status: 400 });
  }
  if (body.status !== undefined && !VALID_STATUSES.includes(body.status)) {
    return Response.json(errorV2('VALIDATION_ERROR', 'Invalid status'), { status: 400 });
  }

  try {
    const supabase = await createClient();

    // Check plan exists and belongs to activity
    const { data: existing, error: existingError } = await supabase
      .from('activity_plans')
      .select('id, min_participants, max_participants')
      .eq('id', planId)
      .eq('activity_id', activityId)
      .single();

    if (existingError || !existing) {
      return Response.json(errorV2('NOT_FOUND', 'Plan not found'), { status: 404 });
    }

    // Validate participant range
    const minP = body.min_participants ?? existing.min_participants;
    const maxP = body.max_participants ?? existing.max_participants;
    if (minP < 1 || maxP < minP) {
      return Response.json(errorV2('VALIDATION_ERROR', 'Invalid participant range'), { status: 400 });
    }

    const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (body.name !== undefined) updateData.name = body.name.trim();
    if (body.slug !== undefined) updateData.slug = body.slug;
    if (body.description !== undefined) updateData.description = body.description;
    if (body.duration_minutes !== undefined) updateData.duration_minutes = body.duration_minutes;
    if (body.price_type !== undefined) updateData.price_type = body.price_type;
    if (body.base_price !== undefined) updateData.base_price = body.base_price;
    if (body.min_participants !== undefined) updateData.min_participants = body.min_participants;
    if (body.max_participants !== undefined) updateData.max_participants = body.max_participants;
    if (body.booking_type !== undefined) updateData.booking_type = body.booking_type;
    if (body.status !== undefined) updateData.status = body.status;

    const { data, error } = await supabase
      .from('activity_plans')
      .update(updateData)
      .eq('id', planId)
      .select()
      .single();

    if (error) {
      console.error('Error updating activity plan:', error);
      if (error.code === '23505') {
        return Response.json(errorV2('DUPLICATE_SLUG', 'Plan slug already exists'), { status: 409 });
      }
      return Response.json(errorV2('INTERNAL_ERROR', 'Failed to update plan'), { status: 500 });
    }

    return Response.json(successV2({ plan: data }));
  } catch (err) {
    console.error('Update plan API error:', err);
    return Response.json(errorV2('INTERNAL_ERROR', 'Server error'), { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ activityId: string; planId: string }> }
) {
  const { activityId, planId } = await context.params;

  if (!UUID_REGEX.test(activityId)) {
    return Response.json(errorV2('VALIDATION_ERROR', 'Invalid activityId'), { status: 400 });
  }
  if (!UUID_REGEX.test(planId)) {
    return Response.json(errorV2('VALIDATION_ERROR', 'Invalid planId'), { status: 400 });
  }

  try {
    const supabase = await createClient();

    // Verify plan exists and belongs to activity
    const { data: existing, error: existingError } = await supabase
      .from('activity_plans')
      .select('id')
      .eq('id', planId)
      .eq('activity_id', activityId)
      .single();

    if (existingError || !existing) {
      return Response.json(errorV2('NOT_FOUND', 'Plan not found'), { status: 404 });
    }

    // Soft delete by setting status to archived
    const { error } = await supabase
      .from('activity_plans')
      .update({ status: 'archived', updated_at: new Date().toISOString() })
      .eq('id', planId);

    if (error) {
      console.error('Error archiving activity plan:', error);
      return Response.json(errorV2('INTERNAL_ERROR', 'Failed to archive plan'), { status: 500 });
    }

    return Response.json(successV2({ archived: true }));
  } catch (err) {
    console.error('Delete plan API error:', err);
    return Response.json(errorV2('INTERNAL_ERROR', 'Server error'), { status: 500 });
  }
}
