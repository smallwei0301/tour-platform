import { ok, fail } from '../../../../src/lib/api';
import { verifyGuideSession } from '../../../../src/lib/guide-auth';
import { createClient } from '@supabase/supabase-js';

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}

// GET /api/guide/qa?status=pending_moderation — fetch Q&A for guide's own activities
export async function GET(req: Request) {
  const session = verifyGuideSession(req);
  if (!session) {
    return Response.json(fail('UNAUTHORIZED', 'session required'), { status: 401 });
  }

  if (!process.env.SUPABASE_URL && !process.env.NEXT_PUBLIC_SUPABASE_URL) {
    return Response.json(ok({ data: [] }));
  }

  const url = new URL(req.url);
  const status = url.searchParams.get('status') || 'pending_moderation';

  try {
    const supabase = getServiceClient();

    // Fetch guide's own activity IDs
    const { data: activities, error: activitiesError } = await supabase
      .from('activities')
      .select('id')
      .eq('guide_id', session.guideId);

    if (activitiesError) {
      return Response.json(fail('DB_ERROR', activitiesError.message), { status: 500 });
    }

    const activityIds = (activities || []).map((a: { id: string }) => a.id);

    if (activityIds.length === 0) {
      return Response.json(ok({ data: [] }));
    }

    // Fetch Q&A entries for guide's activities filtered by status
    const { data: qaList, error: qaError } = await supabase
      .from('activity_qa')
      .select('id, activity_id, question, answer, status, created_at, user_id')
      .in('activity_id', activityIds)
      .eq('status', status)
      .order('created_at', { ascending: false });

    if (qaError) {
      return Response.json(fail('DB_ERROR', qaError.message), { status: 500 });
    }

    return Response.json(ok({ data: qaList ?? [] }));
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    return Response.json(fail('SERVER_ERROR', message), { status: 500 });
  }
}
