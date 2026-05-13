import { ok, fail } from '../../../../src/lib/api';
import { addToWishlistDb, listWishlistDb } from '../../../../src/lib/db.mjs';
import { createClient } from '../../../../src/lib/supabase/server';

export async function GET(_request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user?.id) {
      return Response.json(fail('UNAUTHORIZED', '請先登入'), { status: 401 });
    }

    const rows = await listWishlistDb({ userId: user.id });
    return Response.json(ok(rows));
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    return Response.json(fail('SERVER_ERROR', message), { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user?.id) {
      return Response.json(fail('UNAUTHORIZED', '請先登入'), { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    let activityId = String(body?.activityId || '').trim();

    if (!activityId) {
      return Response.json(fail('INVALID_REQUEST', 'activityId is required'), { status: 400 });
    }

    // If activityId is a slug (not a UUID), resolve it to the real UUID
    const UUID_RE = /^[0-9a-f-]{36}$/i;
    if (!UUID_RE.test(activityId)) {
      const { data: activity, error: slugErr } = await supabase
        .from('activities')
        .select('id')
        .eq('slug', activityId)
        .single();
      if (slugErr || !activity) {
        return Response.json(fail('NOT_FOUND', `Activity not found for slug: ${activityId}`), { status: 404 });
      }
      activityId = activity.id;
    }

    const entry = await addToWishlistDb({ userId: user.id, activityId });
    return Response.json(ok(entry), { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    return Response.json(fail('SERVER_ERROR', message), { status: 500 });
  }
}
