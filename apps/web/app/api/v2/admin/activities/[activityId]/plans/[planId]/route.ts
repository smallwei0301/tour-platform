/**
 * Activity Plan Single Item API (TP-BP-008)
 * GET    - Get a single plan
 * PUT    - Update a plan
 * DELETE - Soft delete a plan (set status to archived)
 */

import { NextRequest } from 'next/server';
import { successV2, errorV2 } from '../../../../../../../../src/lib/api';
import { handleRouteError } from '../../../../../../../../src/lib/route-error';
import { getSupabase } from '../../../../../../../../src/lib/db.mjs';
import { normalizeRichPlanPayload } from '../../../../../../../../src/lib/activity-plans-rich-mapper.mjs';
import { applyWithMissingColumnFallback } from '../../../../../../../../src/lib/activity-plans-insert-fallback.mjs';
import { revalidateActivityById } from '../../../../../../../../src/lib/revalidate-activity-by-id.mjs';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const VALID_PRICE_TYPES = ['per_person', 'per_group'];
const VALID_BOOKING_TYPES = ['scheduled', 'request', 'instant'];
const VALID_STATUSES = ['active', 'inactive', 'archived'];

export async function GET(
  _request: NextRequest,
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
    const supabase = await getSupabase();

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
    return handleRouteError(err, { route: 'v2/admin/activities/activity/plans/plan' });
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
  is_year_round?: boolean;
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
  // #297 站點時間表（icon／title／duration／description／imageUrl）；相容舊版 { text, imageUrl }
  plan_itinerary?: Array<{ icon?: string; title?: string; duration?: string; description?: string; imageUrl?: string; text?: string }>;
  plan_itinerary_image_url?: string;
  meeting_point_name?: string;
  meeting_address?: string;
  experience_point_name?: string;
  experience_address?: string;
  plan_notices?: string[];
  plan_refund_rules?: string[];
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
  if (body.is_year_round !== undefined && typeof body.is_year_round !== 'boolean') {
    return Response.json(errorV2('VALIDATION_ERROR', 'Invalid is_year_round'), { status: 400 });
  }
  const arrayFields = ['highlights', 'plan_inclusions', 'plan_exclusions', 'plan_notices', 'plan_refund_rules'] as const;
  for (const key of arrayFields) {
    if ((body as Record<string, unknown>)[key] !== undefined && !Array.isArray((body as Record<string, unknown>)[key])) {
      return Response.json(errorV2('VALIDATION_ERROR', `${key} must be an array`), { status: 400 });
    }
  }

  try {
    const supabase = await getSupabase();

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
    if (body.is_year_round !== undefined) updateData.is_year_round = body.is_year_round;

    Object.assign(updateData, normalizeRichPlanPayload(body));

    const { data, error, droppedColumns } = await applyWithMissingColumnFallback(
      (payload: Record<string, unknown>) =>
        supabase
          .from('activity_plans')
          .update(payload)
          .eq('id', planId)
          .select()
          .single(),
      updateData,
    );

    if (error) {
      console.error('Error updating activity plan:', error);
      if ((error as { code?: string }).code === '23505') {
        return Response.json(errorV2('DUPLICATE_SLUG', 'Plan slug already exists'), { status: 409 });
      }
      if ((error as { code?: string }).code === 'SCHEMA_MISMATCH') {
        return Response.json(
          errorV2('SCHEMA_MISMATCH', '資料庫 schema 與方案欄位不一致，請聯絡技術人員套用最新 migration。'),
          { status: 500 },
        );
      }
      return Response.json(errorV2('INTERNAL_ERROR', '更新方案失敗，請稍後再試或聯絡技術人員。'), { status: 500 });
    }

    // 方案更新後立即失效該行程詳情頁／列表頁 ISR 快取，讓改動即時反映於前台，
    // 避免操作者誤以為「修改在數分鐘後被還原」。best-effort，不擋下已成功的寫入。
    await revalidateActivityById(supabase, activityId);

    return Response.json(successV2({ plan: data, droppedColumns }));
  } catch (err) {
    console.error('Update plan API error:', err);
    return Response.json(errorV2('INTERNAL_ERROR', 'Server error'), { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
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
    const supabase = await getSupabase();

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

    // Soft delete by setting status to archived.
    // If the DB schema is missing the 'archived' CHECK constraint value
    // (migration 20260513_issue497 not yet applied), the update will fail
    // with a constraint error. Surface this explicitly rather than silently
    // falling back to 'inactive', which would mislead the operator.
    const { error: archiveError } = await supabase
      .from('activity_plans')
      .update({ status: 'archived', updated_at: new Date().toISOString() })
      .eq('id', planId);

    if (archiveError) {
      console.error('Error archiving activity plan:', archiveError);
      const msg = String((archiveError as { message?: string }).message || '');
      if (/check\s*constraint|status/i.test(msg)) {
        // DB schema lacks 'archived' in the status CHECK constraint.
        // Migration 20260513_issue497_activity_plans_status_archived.sql must
        // be applied by infrastructure before this operation can succeed.
        return Response.json(
          errorV2('SCHEMA_MISMATCH', '封存狀態尚未在資料庫啟用，請聯絡管理員套用最新 migration。'),
          { status: 422 },
        );
      }
      return Response.json(errorV2('INTERNAL_ERROR', 'Failed to archive plan'), { status: 500 });
    }

    // Re-read the row to confirm the persisted status before responding.
    const { data: confirmed, error: readError } = await supabase
      .from('activity_plans')
      .select('status')
      .eq('id', planId)
      .single();

    if (readError || !confirmed) {
      console.error('Error confirming archived status:', readError);
      return Response.json(errorV2('INTERNAL_ERROR', 'Archive succeeded but could not confirm final status'), { status: 500 });
    }

    // 封存後立即失效該行程詳情頁／列表頁 ISR 快取，避免前台仍顯示已封存方案。
    await revalidateActivityById(supabase, activityId);

    const finalStatus = confirmed.status as string;
    return Response.json(successV2({ archived: finalStatus === 'archived', finalStatus }));
  } catch (err) {
    console.error('Delete plan API error:', err);
    return Response.json(errorV2('INTERNAL_ERROR', 'Server error'), { status: 500 });
  }
}
