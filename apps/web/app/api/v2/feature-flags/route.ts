import { NextResponse } from 'next/server';
import { isBookingV2Enabled, isBookingV2ShellEnabled } from '../../../../src/config/feature-flags.mjs';

/**
 * Non-sensitive feature flag diagnostic endpoint for deployment verification.
 * Issue #621 Phase 0: confirm NEXT_PUBLIC_BOOKING_V2_ENABLED state in runtime.
 *
 * Contract:
 *   GET /api/v2/feature-flags → 200 { bookingV2: boolean, bookingV2Shell: boolean, timestamp: ISO8601 }
 *   Cache-Control: no-store
 *   No auth required — exposes only boolean flag state, no secrets or PII.
 */
export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json(
    {
      bookingV2: isBookingV2Enabled(),
      bookingV2Shell: isBookingV2ShellEnabled(),
      timestamp: new Date().toISOString(),
    },
    {
      status: 200,
      headers: { 'Cache-Control': 'no-store' },
    },
  );
}
