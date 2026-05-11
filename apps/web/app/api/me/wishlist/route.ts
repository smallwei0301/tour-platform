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
    const activityId = String(body?.activityId || '').trim();

    if (!activityId) {
      return Response.json(fail('INVALID_REQUEST', 'activityId is required'), { status: 400 });
    }

    const entry = await addToWishlistDb({ userId: user.id, activityId });
    return Response.json(ok(entry), { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    return Response.json(fail('SERVER_ERROR', message), { status: 500 });
  }
}
