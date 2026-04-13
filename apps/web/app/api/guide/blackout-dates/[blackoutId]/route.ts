/**
 * Guide Blackout Dates API - Single Blackout Operations (TP-BP-007)
 * DELETE - Delete own blackout date
 *
 * Strict ownership: Guide can only delete their own blackout dates
 */

import { NextRequest } from 'next/server';
import { ok, fail } from '../../../../../src/lib/api';
import { verifyGuideSession } from '../../../../../src/lib/guide-auth';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function getSupabase() {
  const { createClient } = await import('@supabase/supabase-js');
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ blackoutId: string }> }
) {
  const session = verifyGuideSession(request);
  if (!session) {
    return Response.json(fail('UNAUTHORIZED', 'Guide session required'), { status: 401 });
  }

  const { blackoutId } = await context.params;

  if (!UUID_REGEX.test(blackoutId)) {
    return Response.json(fail('VALIDATION_ERROR', 'Invalid blackoutId'), { status: 400 });
  }

  if (!process.env.SUPABASE_URL) {
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
