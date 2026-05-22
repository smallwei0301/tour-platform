import { NextResponse } from 'next/server';

/**
 * Public liveness endpoint — no auth, no DB, no secrets in response.
 * Issue #629: synthetic health checks before soft launch.
 *
 * Contract:
 *   GET /api/health → 200 { ok: true, status: "ok", service: "tour-platform",
 *                           timestamp: ISO8601, version: string }
 *   Cache-Control: no-store
 *   No middleware auth required (not in matcher).
 */
export const dynamic = 'force-dynamic';

export async function GET() {
  const now = new Date().toISOString();

  return NextResponse.json(
    {
      ok: true,
      status: 'ok',
      service: 'tour-platform',
      timestamp: now,
      version: process.env.VERCEL_GIT_COMMIT_SHA ?? 'unknown',
    },
    {
      status: 200,
      headers: {
        'Cache-Control': 'no-store',
      },
    },
  );
}
