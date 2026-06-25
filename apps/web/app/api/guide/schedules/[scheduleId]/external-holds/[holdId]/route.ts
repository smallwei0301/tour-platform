import { ok, fail } from '../../../../../../../src/lib/api';
import { verifyGuideSession } from '../../../../../../../src/lib/guide-auth';
import { validateCsrf } from '../../../../../../../src/lib/csrf.mjs';

async function getSupabase() {
  const { createClient } = await import('@supabase/supabase-js');
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

function mapReleaseError(error: string): { status: number; code: string; message: string } {
  switch (error) {
    case 'hold_not_found':
      return { status: 404, code: 'NOT_FOUND', message: '找不到此外部佔位' };
    case 'not_external_hold':
      return { status: 400, code: 'NOT_EXTERNAL_HOLD', message: '此筆並非外部佔位，無法以此方式釋放' };
    case 'forbidden':
      return { status: 403, code: 'FORBIDDEN', message: '無權操作此外部佔位' };
    default:
      return { status: 500, code: 'SERVER_ERROR', message: '釋放外部佔位失敗' };
  }
}

/**
 * DELETE /api/guide/schedules/[scheduleId]/external-holds/[holdId]
 * 導遊釋放外部佔位：原子退還 booked_count 並標記 booking cancelled。
 */
export async function DELETE(
  req: Request,
  context: { params: Promise<{ scheduleId: string; holdId: string }> },
) {
  const csrf = validateCsrf(req);
  if (csrf) return csrf;

  const session = verifyGuideSession(req);
  if (!session) return Response.json(fail('UNAUTHORIZED', 'session required'), { status: 401 });

  const { holdId } = await context.params;
  if (!holdId) return Response.json(fail('BAD_REQUEST', 'holdId required'), { status: 400 });

  const supabase = await getSupabase();

  const { data: rpcResult, error: rpcError } = await supabase.rpc('fn_release_external_hold', {
    p_booking_id: holdId,
    p_guide_id: session.guideId,
    p_actor_user_id: null,
  });

  if (rpcError) {
    return Response.json(fail('SERVER_ERROR', rpcError.message), { status: 500 });
  }

  if (!rpcResult || rpcResult.ok !== true) {
    const mapped = mapReleaseError(rpcResult?.error || 'unknown');
    return Response.json(fail(mapped.code, mapped.message), { status: mapped.status });
  }

  return Response.json(ok({ released: true, holdId }));
}
