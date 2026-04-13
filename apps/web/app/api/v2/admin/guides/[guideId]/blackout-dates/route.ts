/**
 * Guide Blackout Dates API (TP-BP-007)
 * GET  - List all blackout dates for a guide
 * POST - Create a new blackout date
 */

import { NextRequest } from 'next/server';
import { successV2, errorV2 } from '../../../../../../../src/lib/api'";
import { createClient } from '../../../../../../../src/lib/supabase/server'";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isValidIsoDatetime(str: string): boolean {
  const date = new Date(str);
  return !isNaN(date.getTime());
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ guideId: string }> }
) {
  const { guideId } = await context.params;

  if (!UUID_REGEX.test(guideId)) {
    return Response.json(errorV2('VALIDATION_ERROR', 'Invalid guideId'), { status: 400 });
  }

  try {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from('guide_blackout_dates')
      .select('*')
      .eq('guide_id', guideId)
      .order('starts_at', { ascending: true });

    if (error) {
      console.error('Error fetching blackout dates:', error);
      return Response.json(errorV2('INTERNAL_ERROR', 'Failed to fetch blackouts'), { status: 500 });
    }

    return Response.json(successV2({ blackouts: data || [] }));
  } catch (err) {
    console.error('Blackout dates API error:', err);
    return Response.json(errorV2('INTERNAL_ERROR', 'Server error'), { status: 500 });
  }
}

interface CreateBlackoutBody {
  starts_at: string;
  ends_at: string;
  reason?: string;
  source?: 'manual' | 'system';
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ guideId: string }> }
) {
  const { guideId } = await context.params;

  if (!UUID_REGEX.test(guideId)) {
    return Response.json(errorV2('VALIDATION_ERROR', 'Invalid guideId'), { status: 400 });
  }

  let body: CreateBlackoutBody;
  try {
    body = await request.json();
  } catch {
    return Response.json(errorV2('VALIDATION_ERROR', 'Invalid JSON body'), { status: 400 });
  }

  // Validation
  if (!body.starts_at || !isValidIsoDatetime(body.starts_at)) {
    return Response.json(errorV2('VALIDATION_ERROR', 'Invalid starts_at datetime'), { status: 400 });
  }
  if (!body.ends_at || !isValidIsoDatetime(body.ends_at)) {
    return Response.json(errorV2('VALIDATION_ERROR', 'Invalid ends_at datetime'), { status: 400 });
  }
  if (new Date(body.starts_at) >= new Date(body.ends_at)) {
    return Response.json(errorV2('VALIDATION_ERROR', 'starts_at must be before ends_at'), { status: 400 });
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
      starts_at: body.starts_at,
      ends_at: body.ends_at,
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
      return Response.json(errorV2('INTERNAL_ERROR', 'Failed to create blackout'), { status: 500 });
    }

    return Response.json(successV2({ blackout: data }), { status: 201 });
  } catch (err) {
    console.error('Create blackout API error:', err);
    return Response.json(errorV2('INTERNAL_ERROR', 'Server error'), { status: 500 });
  }
}
