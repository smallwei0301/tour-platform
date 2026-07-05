import { ok, fail } from '../../../../src/lib/api';
import { verifyGuideSession } from '../../../../src/lib/guide-auth';
import { buildGuideContactActivityId } from '../../../../src/lib/guide-contact-qa.mjs';
import { createClient } from '@supabase/supabase-js';
import { getSupabaseUrl, getSupabaseServiceRoleKey } from '../../../../src/config/supabase-service-env.mjs';

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    getSupabaseServiceRoleKey()!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}

// GET /api/guide/qa?status=pending_moderation — fetch Q&A for guide's own activities
export async function GET(req: Request) {
  const session = verifyGuideSession(req);
  if (!session) {
    return Response.json(fail('UNAUTHORIZED', 'session required'), { status: 401 });
  }

  if (!getSupabaseUrl() && !process.env.NEXT_PUBLIC_SUPABASE_URL) {
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

    // 「認識導遊」頁的 inline 訊息以 sentinel activity_id（guide:<guideId>）儲存，
    // 不綁定任何行程，但仍須流進此導遊的收件匣 — 故一併查詢該 sentinel。
    // 即使導遊尚無上架行程，也要能收到導遊頁訊息（不可在 activityIds 為空時提早 return）。
    const guideContactActivityId = buildGuideContactActivityId(session.guideId);
    const queryActivityIds = [...activityIds, guideContactActivityId];

    // Fetch Q&A entries for guide's activities + guide-page messages, filtered by status
    const { data: qaList, error: qaError } = await supabase
      .from('activity_qa')
      .select('id, activity_id, question, answer, status, created_at, user_id')
      .in('activity_id', queryActivityIds)
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
