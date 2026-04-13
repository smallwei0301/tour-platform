import { ok, fail } from '../../../../../../src/lib/api'";
import { generateInviteToken } from '../../../../../../src/lib/guide-auth'";

async function getSupabase() {
  const { createClient } = await import('@supabase/supabase-js');
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function POST(
  _req: Request,
  context: { params: Promise<{ guideId: string }> },
) {
  const { guideId } = await context.params;
  if (!guideId) return Response.json(fail('BAD_REQUEST', 'guideId required'), { status: 400 });

  if (!process.env.SUPABASE_URL) {
    return Response.json(fail('NOT_AVAILABLE', 'Supabase not configured'), { status: 503 });
  }

  const supabase = await getSupabase();

  // Fetch guide
  const { data: guide, error } = await supabase
    .from('guide_profiles')
    .select('id, display_name, verification_status')
    .eq('id', guideId)
    .single();

  if (error || !guide) {
    return Response.json(fail('NOT_FOUND', 'Guide not found'), { status: 404 });
  }

  if (guide.verification_status !== 'approved') {
    return Response.json(
      fail('INVALID_STATUS', `Guide must be approved (current: ${guide.verification_status})`),
      { status: 400 },
    );
  }

  const token = generateInviteToken();
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  const { error: updateError } = await supabase
    .from('guide_profiles')
    .update({ invite_token: token, invite_token_expires_at: expiresAt })
    .eq('id', guideId);

  if (updateError) {
    return Response.json(fail('SERVER_ERROR', updateError.message), { status: 500 });
  }

  const inviteUrl = `/guide/login?token=${token}`;

  return Response.json(
    ok({
      inviteUrl,
      token,
      expiresAt,
      guideName: guide.display_name,
    }),
  );
}
