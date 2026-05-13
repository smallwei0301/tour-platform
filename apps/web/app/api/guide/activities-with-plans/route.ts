/**
 * Guide Activities With Plans API (TP-BP-497)
 * GET - List own activities with their active plans (for rule binding UI)
 *
 * Strict ownership: Guide can only see their own activities.
 * Only returns plans with status='active' (bookable plans for rule binding).
 */

import { NextRequest } from 'next/server';
import { ok, fail } from '../../../../src/lib/api';
import { verifyGuideSession } from '../../../../src/lib/guide-auth';

async function getSupabase() {
  const { createClient } = await import('@supabase/supabase-js');
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

export async function GET(request: NextRequest) {
  const session = verifyGuideSession(request);
  if (!session) {
    return Response.json(fail('UNAUTHORIZED', 'Guide session required'), { status: 401 });
  }

  if (!process.env.SUPABASE_URL) {
    return Response.json(ok({ activities: [] }));
  }

  try {
    const supabase = await getSupabase();

    // Fetch activities owned by this guide, with their active plans
    const { data, error } = await supabase
      .from('activities')
      .select(`
        id,
        title,
        status,
        activity_plans!inner (
          id,
          name,
          slug,
          duration_minutes,
          price_type,
          base_price,
          booking_type,
          status
        )
      `)
      .eq('guide_id', session.guideId)
      .eq('activity_plans.status', 'active')
      .order('title', { ascending: true });

    if (error) {
      console.error('Error fetching guide activities with plans:', error);
      return Response.json(fail('SERVER_ERROR', 'Failed to fetch activities'), { status: 500 });
    }

    return Response.json(ok({ activities: data || [] }));
  } catch (err) {
    console.error('Guide activities-with-plans API error:', err);
    return Response.json(fail('SERVER_ERROR', 'Server error'), { status: 500 });
  }
}
