import { ok, fail } from '../../../../../src/lib/api';
import { removeFromWishlistDb } from '../../../../../src/lib/db.mjs';
import { createClient } from '../../../../../src/lib/supabase/server';

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ activityId: string }> }
) {
  const { activityId } = await context.params;

  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user?.id) {
      return Response.json(fail('UNAUTHORIZED', '請先登入'), { status: 401 });
    }

    if (!activityId) {
      return Response.json(fail('INVALID_REQUEST', 'activityId is required'), { status: 400 });
    }

    await removeFromWishlistDb({ userId: user.id, activityId });
    return Response.json(ok({ removed: true }));
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    return Response.json(fail('SERVER_ERROR', message), { status: 500 });
  }
}
