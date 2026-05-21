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

// AC5: PATCH /api/admin/qa/[id] — admin sets answer + approves or rejects a question
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
    return Response.json(fail('INVALID_REQUEST', 'qa id required'), { status: 400 });
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

  // answer is optional — admin can set or update it
  const answerStr = body?.answer !== undefined
    ? String(body.answer).trim()
    : undefined;

  try {
    const supabase = getServiceClient();

    // Build update payload
    const updatePayload: Record<string, unknown> = {
      status: newStatus,
      updated_at: new Date().toISOString(),
    };
    if (answerStr !== undefined) {
      updatePayload.answer = answerStr;
    }

    const { data: qa, error: updateError } = await supabase
      .from('activity_qa')
      .update(updatePayload)
      .eq('id', id)
      .select()
      .single();

    if (updateError || !qa) {
      return Response.json(
        fail('DB_ERROR', updateError?.message || 'qa entry not found'),
        { status: updateError ? 500 : 404 }
      );
    }

    return Response.json(ok({ id, status: newStatus, answer: qa.answer, qa }));
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    return Response.json(fail('SERVER_ERROR', message), { status: 500 });
  }
}
