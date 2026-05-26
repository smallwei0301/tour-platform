/**
 * GET /api/v2/activities/:activityId/available-slots
 *
 * Available Slots API (TP-BP-004)
 * Returns available booking slots for an activity plan.
 *
 * Query params:
 *   - planId (required): Activity plan UUID or plan slug
 *   - dateFrom (required): Start date YYYY-MM-DD
 *   - dateTo (required): End date YYYY-MM-DD
 *   - timezone (required): IANA timezone (e.g., Asia/Taipei)
 *   - participants (optional): Number of participants (default: 1)
 */

import type { NextRequest } from 'next/server';
import { getAvailableSlots } from './route-handler';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ activityId: string }> }
) {
  return getAvailableSlots(request, context);
}
