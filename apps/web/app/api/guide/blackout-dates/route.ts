/**
 * Guide Blackout Dates API (TP-BP-007)
 * GET  - List own blackout dates
 * POST - Create a new blackout date (for self only)
 *
 * Strict ownership: Guide can only access/modify their own blackout dates
 */

import { NextRequest } from 'next/server';
import { ok, fail } from '../../../../src/lib/api';
import { validateCsrf } from '../../../../src/lib/csrf.mjs';
import { verifyGuideSession } from '../../../../src/lib/guide-auth';
import { getSupabaseUrl, getSupabaseServiceRoleKey } from '../../../../src/config/supabase-service-env.mjs';

async function getSupabase() {
  const { createClient } = await import('@supabase/supabase-js');
  return createClient(getSupabaseUrl()!, getSupabaseServiceRoleKey()!);
}

export async function GET(request: NextRequest) {
  const session = verifyGuideSession(request);
  if (!session) {
    return Response.json(fail('UNAUTHORIZED', 'Guide session required'), { status: 401 });
  }

  if (!getSupabaseUrl()) {
    return Response.json(ok({ blackouts: [] }));
  }

  try {
    const supabase = await getSupabase();

    const { data, error } = await supabase
      .from('guide_blackout_dates')
      .select(`
        id,
        guide_id,
        starts_at,
        ends_at,
        reason,
        source,
        created_at
      `)
      .eq('guide_id', session.guideId)
      .order('starts_at', { ascending: true });

    if (error) {
      console.error('Error fetching blackout dates:', error);
      return Response.json(fail('SERVER_ERROR', 'Failed to fetch blackout dates'), { status: 500 });
    }

    return Response.json(ok({ blackouts: data || [] }));
  } catch (err) {
    console.error('Blackout dates API error:', err);
    return Response.json(fail('SERVER_ERROR', 'Server error'), { status: 500 });
  }
}

interface CreateBlackoutBody {
  starts_at: string;
  ends_at: string;
  reason?: string | null;
  source?: 'manual' | 'system';
}

export async function POST(request: NextRequest) {
  const csrfError = validateCsrf(request);
  if (csrfError) return csrfError;

  const session = verifyGuideSession(request);
  if (!session) {
    return Response.json(fail('UNAUTHORIZED', 'Guide session required'), { status: 401 });
  }

  let body: CreateBlackoutBody;
  try {
    body = await request.json();
  } catch {
    return Response.json(fail('VALIDATION_ERROR', 'Invalid JSON body'), { status: 400 });
  }

  // Validation
  if (!body.starts_at) {
    return Response.json(fail('VALIDATION_ERROR', 'starts_at is required'), { status: 400 });
  }
  if (!body.ends_at) {
    return Response.json(fail('VALIDATION_ERROR', 'ends_at is required'), { status: 400 });
  }

  const startsAt = new Date(body.starts_at);
  const endsAt = new Date(body.ends_at);

  if (isNaN(startsAt.getTime())) {
    return Response.json(fail('VALIDATION_ERROR', 'Invalid starts_at datetime'), { status: 400 });
  }
  if (isNaN(endsAt.getTime())) {
    return Response.json(fail('VALIDATION_ERROR', 'Invalid ends_at datetime'), { status: 400 });
  }
  if (startsAt >= endsAt) {
    return Response.json(fail('VALIDATION_ERROR', 'starts_at must be before ends_at'), { status: 400 });
  }

  if (!getSupabaseUrl()) {
    return Response.json(fail('SERVER_ERROR', 'Database not configured'), { status: 500 });
  }

  try {
    const supabase = await getSupabase();

    const insertData = {
      guide_id: session.guideId, // Always use session guideId for ownership
      starts_at: startsAt.toISOString(),
      ends_at: endsAt.toISOString(),
      reason: body.reason || null,
      source: body.source || 'manual',
    };

    const { data, error } = await supabase
      .from('guide_blackout_dates')
      .insert(insertData)
      .select()
      .single();

    if (error) {
      console.error('Error creating blackout date:', error);
      return Response.json(fail('SERVER_ERROR', 'Failed to create blackout date'), { status: 500 });
    }

    return Response.json(ok({ blackout: data }), { status: 201 });
  } catch (err) {
    console.error('Create blackout API error:', err);
    return Response.json(fail('SERVER_ERROR', 'Server error'), { status: 500 });
  }
}
