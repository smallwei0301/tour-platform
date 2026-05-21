import { ok, fail } from '../../../../../src/lib/api';
import { isAdminAuthorized, pickAdminCredentials } from '../../../../../src/lib/admin-auth.mjs';
import { getAdminSecurityState, getRequiredAdminToken } from '../../../../../src/lib/admin-session.mjs';
import { createClient } from '@supabase/supabase-js';

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}

// AC5: PATCH /api/admin/reviews/[id] — approve or reject review
export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const params = await context.params;
  const { token, email, expiresAt, sessionVersion, requireSession } = pickAdminCredentials(request);

  const security = getAdminSecurityState();
  const auth = isAdminAuthorized({
    token,
    email,
    expiresAt,
    requiredToken: getRequiredAdminToken(process.env.ADMIN_ACCESS_TOKEN),
    allowlistRaw: process.env.ADMIN_EMAIL_ALLOWLIST,
    expectedSessionVersion: security.sessionVersion,
    sessionVersion: Number(sessionVersion || 0),
    requireSession,
  });

  if (!auth.ok) {
    return Response.json(fail('UNAUTHORIZED', auth.reason || 'unauthorized'), { status: 401 });
  }

  const { id } = params;
  if (!id) {
    return Response.json(fail('INVALID_REQUEST', 'review id required'), { status: 400 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return Response.json(fail('INVALID_REQUEST', 'invalid JSON body'), { status: 400 });
  }

  const newStatus = String(body?.status || '');
  if (newStatus !== 'approved' && newStatus !== 'rejected') {
    return Response.json(
      fail('INVALID_STATUS', "status must be 'approved' or 'rejected'"),
      { status: 400 }
    );
  }

  try {
    const supabase = getServiceClient();

    // Update the review status
    const { data: review, error: updateError } = await supabase
      .from('activity_reviews')
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (updateError || !review) {
      return Response.json(
        fail('DB_ERROR', updateError?.message || 'review not found'),
        { status: updateError ? 500 : 404 }
      );
    }

    // AC5: On approve, recompute rating_avg and review_count on activities table
    if (newStatus === 'approved') {
      const { data: reviews } = await supabase
        .from('activity_reviews')
        .select('rating')
        .eq('activity_slug', review.activity_slug)
        .eq('status', 'approved');

      const reviewCount = reviews?.length ?? 0;
      const ratingAvg =
        reviewCount > 0
          ? reviews!.reduce((sum: number, r: { rating: number }) => sum + r.rating, 0) / reviewCount
          : null;

      await supabase
        .from('activities')
        .update({
          rating_avg: ratingAvg !== null ? parseFloat(ratingAvg.toFixed(2)) : null,
          review_count: reviewCount,
        })
        .eq('slug', review.activity_slug);
    }

    return Response.json(ok({ id, status: newStatus, review }));
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    return Response.json(fail('SERVER_ERROR', message), { status: 500 });
  }
}
