import { ok, fail } from '../../../../../src/lib/api';
import { verifyGuideSession } from '../../../../../src/lib/guide-auth';
import { parseGuideContactGuideId } from '../../../../../src/lib/guide-contact-qa.mjs';
import { createClient } from '@supabase/supabase-js';

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}

// PATCH /api/guide/qa/[id] — guide answers and approves question for own activity
export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const session = verifyGuideSession(request);
  if (!session) {
    return Response.json(fail('UNAUTHORIZED', 'session required'), { status: 401 });
  }

  const { id } = await context.params;
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
  if (newStatus !== 'approved') {
    return Response.json(fail('INVALID_STATUS', "status must be 'approved'"), { status: 400 });
  }

  const answer = String(body?.answer || '').trim();
  if (!answer) {
    return Response.json(fail('INVALID_REQUEST', 'answer is required'), { status: 400 });
  }

  try {
    const supabase = getServiceClient();

    const { data: qa, error: qaError } = await supabase
      .from('activity_qa')
      .select('id, activity_id, answer, status')
      .eq('id', id)
      .single();

    if (qaError || !qa) {
      return Response.json(
        fail('DB_ERROR', qaError?.message || 'qa entry not found'),
        { status: qaError ? 500 : 404 }
      );
    }

    // 導遊頁訊息（sentinel activity_id = guide:<guideId>）不對應任何 activities 列，
    // 以 sentinel 內嵌的 guideId 直接比對 session.guideId 判定擁有權；
    // 一般行程問答仍走 activities.guide_id 比對。
    const contactGuideId = parseGuideContactGuideId(qa.activity_id);
    if (contactGuideId !== null) {
      if (contactGuideId !== session.guideId) {
        return Response.json(fail('FORBIDDEN', '無權更新此問題'), { status: 403 });
      }
    } else {
      const { data: activity, error: activityError } = await supabase
        .from('activities')
        .select('id')
        .eq('id', qa.activity_id)
        .eq('guide_id', session.guideId)
        .single();

      if (activityError || !activity) {
        return Response.json(fail('FORBIDDEN', '無權更新此問題'), { status: 403 });
      }
    }

    const { data: updatedQa, error: updateError } = await supabase
      .from('activity_qa')
      .update({
        answer,
        status: 'approved',
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (updateError || !updatedQa) {
      return Response.json(
        fail('DB_ERROR', updateError?.message || 'failed to update qa entry'),
        { status: updateError ? 500 : 404 }
      );
    }

    return Response.json(ok({ id, status: 'approved', answer: updatedQa.answer, qa: updatedQa }));
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    return Response.json(fail('SERVER_ERROR', message), { status: 500 });
  }
}
