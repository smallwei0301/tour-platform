import { ok, fail } from '../../../../../src/lib/api';
import { verifyGuideSession } from '../../../../../src/lib/guide-auth';
import { SETTLEMENT_COMMISSION_RATE } from '../../../../../src/lib/settlement-config';

export const dynamic = 'force-dynamic';

async function getSupabase() {
  const { createClient } = await import('@supabase/supabase-js');
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

export async function GET(req: Request) {
  const session = verifyGuideSession(req);
  if (!session) return Response.json(fail('UNAUTHORIZED', 'session required'), { status: 401 });

  // Validate month param: must match YYYY-MM
  const url = new URL(req.url);
  const month = url.searchParams.get('month') ?? '';
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    return Response.json(fail('INVALID_PARAM', 'month must be YYYY-MM'), { status: 400 });
  }

  const emptyTotals = { gmvTwd: 0, commissionTwd: 0, netTwd: 0 };

  if (!process.env.SUPABASE_URL) {
    return Response.json(ok({ month, orders: [], totals: emptyTotals }));
  }

  const supabase = await getSupabase();
  const guideId = session.guideId;

  // Get guide's activity IDs and titles
  const { data: activities } = await supabase
    .from('activities')
    .select('id, title')
    .eq('guide_id', guideId);

  const activityIds = (activities || []).map((a: { id: string; title: string }) => a.id);
  const activityMap = Object.fromEntries(
    (activities || []).map((a: { id: string; title: string }) => [a.id, a.title])
  );

  if (activityIds.length === 0) {
    return Response.json(ok({ month, orders: [], totals: emptyTotals }));
  }

  // Build month window in Asia/Taipei (UTC+8)
  const taipeiOffset = 8 * 60; // minutes
  const [yearStr, monthStr] = month.split('-');
  const year = parseInt(yearStr, 10);
  const mon = parseInt(monthStr, 10) - 1; // 0-indexed

  const monthStart = new Date(Date.UTC(year, mon, 1) - taipeiOffset * 60000);
  const monthEnd = new Date(Date.UTC(year, mon + 1, 1) - taipeiOffset * 60000);

  // Query orders for the guide's activities in the given month.
  // Mirror the dashboard route: use orders table with created_at boundary,
  // same status filter (paid/confirmed/completed).
  const gmvStatuses = ['paid', 'confirmed', 'completed'];

  const { data: monthOrders } = await supabase
    .from('orders')
    .select('id, activity_id, total_twd, created_at')
    .in('activity_id', activityIds)
    .in('status', gmvStatuses)
    .gte('created_at', monthStart.toISOString())
    .lt('created_at', monthEnd.toISOString());

  const orderIds = (monthOrders ?? []).map((o: { id: string }) => o.id);
  let refundAmountByOrderId: Record<string, number> = {};
  if (orderIds.length > 0) {
    const { data: refundRows } = await supabase
      .from('operations_tracking')
      .select('order_id, refund_amount_twd')
      .in('order_id', orderIds);
    refundAmountByOrderId = Object.fromEntries(
      (refundRows ?? []).map((r: { order_id: string; refund_amount_twd: number | null }) => [r.order_id, Number(r.refund_amount_twd ?? 0)])
    );
  }

  const orders = (monthOrders ?? []).map((o: { id: string; activity_id: string; total_twd: number | null; created_at: string }) => {
    const totalTwd = o.total_twd ?? 0;
    const refundAmountTwd = refundAmountByOrderId[o.id] ?? 0;
    const effectiveTwd = Math.max(0, totalTwd - refundAmountTwd);
    const commissionTwd = Math.floor(effectiveTwd * SETTLEMENT_COMMISSION_RATE);
    const netTwd = effectiveTwd - commissionTwd;
    return {
      orderId: o.id,
      activityId: o.activity_id,
      activityTitle: activityMap[o.activity_id] ?? '',
      totalTwd,
      refundAmountTwd,
      effectiveTwd,
      commissionTwd,
      netTwd,
    };
  });

  const gmvTwd = orders.reduce((sum: number, o: { effectiveTwd: number }) => sum + o.effectiveTwd, 0);
  const commissionTwd = orders.reduce((sum: number, o: { commissionTwd: number }) => sum + o.commissionTwd, 0);
  const netTwd = orders.reduce((sum: number, o: { netTwd: number }) => sum + o.netTwd, 0);

  return Response.json(ok({
    month,
    orders,
    totals: { gmvTwd, commissionTwd, netTwd },
  }));
}
