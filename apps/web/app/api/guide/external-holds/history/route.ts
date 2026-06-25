import { ok, fail } from '../../../../../src/lib/api';
import { verifyGuideSession } from '../../../../../src/lib/guide-auth';

async function getSupabase() {
  const { createClient } = await import('@supabase/supabase-js');
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

/**
 * GET /api/guide/external-holds/history
 * 導遊的外部佔位登記/釋放歷史 —— 取自 booking_status_logs（reason 為
 * external_hold_created / external_hold_released），以 metadata.guide_id 限定本人。
 * 純歷史檢視，不涉及金流/營收。
 */
export async function GET(req: Request) {
  const session = verifyGuideSession(req);
  if (!session) return Response.json(fail('UNAUTHORIZED', 'session required'), { status: 401 });

  if (!process.env.SUPABASE_URL) {
    return Response.json(ok([]));
  }

  const supabase = await getSupabase();
  const { data, error } = await supabase
    .from('booking_status_logs')
    .select('id, reason, metadata, created_at, booking_id')
    .in('reason', ['external_hold_created', 'external_hold_released'])
    .eq('metadata->>guide_id', session.guideId)
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) return Response.json(fail('SERVER_ERROR', error.message), { status: 500 });

  const rows = (data || []).map((r: any) => ({
    id: r.id,
    action: r.reason === 'external_hold_created' ? 'created' : 'released',
    participants: Number(r?.metadata?.participants) || 0,
    scheduleId: r?.metadata?.schedule_id ?? null,
    note: r?.metadata?.note ?? null,
    createdAt: r.created_at,
  }));

  return Response.json(ok(rows));
}
