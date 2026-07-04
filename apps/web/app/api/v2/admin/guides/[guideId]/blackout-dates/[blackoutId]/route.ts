/**
 * Guide Blackout Date Single Item API (TP-BP-007)
 * DELETE - Delete a blackout date
 */

import { NextRequest } from 'next/server';
import { successV2, errorV2 } from '../../../../../../../../src/lib/api';
import { handleRouteError } from '../../../../../../../../src/lib/route-error';
import { createClient } from '../../../../../../../../src/lib/supabase/server';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ guideId: string; blackoutId: string }> }
) {
  const { guideId, blackoutId } = await context.params;

  if (!UUID_REGEX.test(guideId)) {
    return Response.json(errorV2('VALIDATION_ERROR', 'Invalid guideId'), { status: 400 });
  }
  if (!UUID_REGEX.test(blackoutId)) {
    return Response.json(errorV2('VALIDATION_ERROR', 'Invalid blackoutId'), { status: 400 });
  }

  try {
    const supabase = await createClient();

    // Verify blackout exists and belongs to guide
    const { data: existing, error: existingError } = await supabase
      .from('guide_blackout_dates')
      .select('id')
      .eq('id', blackoutId)
      .eq('guide_id', guideId)
      .single();

    if (existingError || !existing) {
      return Response.json(errorV2('NOT_FOUND', 'Blackout not found'), { status: 404 });
    }

    const { error } = await supabase
      .from('guide_blackout_dates')
      .delete()
      .eq('id', blackoutId);

    if (error) {
      console.error('Error deleting blackout date:', error);
      return Response.json(errorV2('INTERNAL_ERROR', 'Failed to delete blackout'), { status: 500 });
    }

    return Response.json(successV2({ deleted: true }));
  } catch (err) {
    return handleRouteError(err, { route: 'v2/admin/guides/guide/blackout-dates/blackout' });
  }
}
