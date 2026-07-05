/**
 * Guide Blackout Dates API - Single Blackout Operations (TP-BP-007)
 * PUT    - Update own blackout date
 * DELETE - Delete own blackout date
 *
 * Strict ownership: Guide can only modify their own blackout dates
 */

import { NextRequest } from 'next/server';
import { ok, fail } from '../../../../../src/lib/api';
import { validateCsrf } from '../../../../../src/lib/csrf.mjs';
import { verifyGuideSession } from '../../../../../src/lib/guide-auth';
import { getSupabaseUrl, getSupabaseServiceRoleKey } from '../../../../../src/config/supabase-service-env.mjs';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

interface UpdateBlackoutBody {
  starts_at?: string;
  ends_at?: string;
  reason?: string | null;
}

async function getSupabase() {
  const { createClient } = await import('@supabase/supabase-js');
  return createClient(getSupabaseUrl()!, getSupabaseServiceRoleKey()!);
}

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ blackoutId: string }> }
) {
  const csrfError = validateCsrf(request);
  if (csrfError) return csrfError;

  const session = verifyGuideSession(request);
  if (!session) {
    return Response.json(fail('UNAUTHORIZED', 'Guide session required'), { status: 401 });
  }

  const { blackoutId } = await context.params;

  if (!UUID_REGEX.test(blackoutId)) {
    return Response.json(fail('VALIDATION_ERROR', 'Invalid blackoutId'), { status: 400 });
  }

  let body: UpdateBlackoutBody;
  try {
    body = await request.json();
  } catch {
    return Response.json(fail('VALIDATION_ERROR', 'Invalid JSON body'), { status: 400 });
  }

  if (!getSupabaseUrl()) {
    return Response.json(fail('SERVER_ERROR', 'Database not configured'), { status: 500 });
  }

  try {
    const supabase = await getSupabase();

    const { data: existing, error: fetchError } = await supabase
      .from('guide_blackout_dates')
      .select('id, guide_id, starts_at, ends_at')
      .eq('id', blackoutId)
      .single();

    if (fetchError || !existing) {
      return Response.json(fail('NOT_FOUND', 'Blackout date not found'), { status: 404 });
    }

    if (existing.guide_id !== session.guideId) {
      return Response.json(fail('FORBIDDEN', 'Cannot modify blackout dates of other guides'), { status: 403 });
    }

    const startsAtIso = body.starts_at ? new Date(body.starts_at).toISOString() : existing.starts_at;
    const endsAtIso = body.ends_at ? new Date(body.ends_at).toISOString() : existing.ends_at;

    if (Number.isNaN(new Date(startsAtIso).getTime()) || Number.isNaN(new Date(endsAtIso).getTime())) {
      return Response.json(fail('VALIDATION_ERROR', 'Invalid starts_at/ends_at datetime'), { status: 400 });
    }
    if (new Date(startsAtIso) >= new Date(endsAtIso)) {
      return Response.json(fail('VALIDATION_ERROR', 'starts_at must be before ends_at'), { status: 400 });
    }

    const updateData: Record<string, unknown> = {
      starts_at: startsAtIso,
      ends_at: endsAtIso,
    };
    if (body.reason !== undefined) updateData.reason = body.reason;

    const { data, error } = await supabase
      .from('guide_blackout_dates')
      .update(updateData)
      .eq('id', blackoutId)
      .eq('guide_id', session.guideId)
      .select()
      .single();

    if (error) {
      console.error('Error updating blackout date:', error);
      return Response.json(fail('SERVER_ERROR', 'Failed to update blackout date'), { status: 500 });
    }

    return Response.json(ok({ blackout: data }));
  } catch (err) {
    console.error('Update blackout API error:', err);
    return Response.json(fail('SERVER_ERROR', 'Server error'), { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ blackoutId: string }> }
) {
  const csrfError = validateCsrf(request);
  if (csrfError) return csrfError;

  const session = verifyGuideSession(request);
  if (!session) {
    return Response.json(fail('UNAUTHORIZED', 'Guide session required'), { status: 401 });
  }

  const { blackoutId } = await context.params;

  if (!UUID_REGEX.test(blackoutId)) {
    return Response.json(fail('VALIDATION_ERROR', 'Invalid blackoutId'), { status: 400 });
  }

  if (!getSupabaseUrl()) {
    return Response.json(fail('SERVER_ERROR', 'Database not configured'), { status: 500 });
  }

  try {
    const supabase = await getSupabase();

    // First verify the blackout belongs to this guide (strict ownership)
    const { data: existing, error: fetchError } = await supabase
      .from('guide_blackout_dates')
      .select('id, guide_id')
      .eq('id', blackoutId)
      .single();

    if (fetchError || !existing) {
      return Response.json(fail('NOT_FOUND', 'Blackout date not found'), { status: 404 });
    }

    if (existing.guide_id !== session.guideId) {
      return Response.json(fail('FORBIDDEN', 'Cannot delete blackout dates of other guides'), { status: 403 });
    }

    const { error } = await supabase
      .from('guide_blackout_dates')
      .delete()
      .eq('id', blackoutId)
      .eq('guide_id', session.guideId); // Double-check ownership

    if (error) {
      console.error('Error deleting blackout date:', error);
      return Response.json(fail('SERVER_ERROR', 'Failed to delete blackout date'), { status: 500 });
    }

    return Response.json(ok({ deleted: true }));
  } catch (err) {
    console.error('Delete blackout API error:', err);
    return Response.json(fail('SERVER_ERROR', 'Server error'), { status: 500 });
  }
}
