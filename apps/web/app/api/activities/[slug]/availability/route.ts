import { ok, fail } from '../../../../../src/lib/api';
import { getActivityBySlugDb } from '../../../../../src/lib/db.mjs';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params;
  if (!slug) {
    return Response.json(fail('INVALID_SLUG', 'slug is required'), { status: 400 });
  }

  try {
    // 即時名額：不要吃 fixture 優先，優先讀 DB 現況
    const activity = await getActivityBySlugDb(slug, { preferFixtureFirst: false });
    if (!activity) {
      return Response.json(fail('NOT_FOUND', 'activity not found'), { status: 404 });
    }

    const schedules = (activity.schedules || []).map((s: any) => ({
      id: s.id,
      startAt: s.startAt,
      endAt: s.endAt,
      capacity: s.capacity,
      bookedCount: s.bookedCount,
      status: s.status,
      planId: s.planId ?? null,
      minParticipants: s.minParticipants ?? 1,
    }));

    return Response.json(ok({ schedules, fetchedAt: new Date().toISOString() }), {
      headers: {
        'cache-control': 'no-store, no-cache, must-revalidate, max-age=0',
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown error';
    return Response.json(fail('LOAD_AVAILABILITY_FAILED', message), { status: 500 });
  }
}
