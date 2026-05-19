import { verifyGuideSession } from '../../../../../../src/lib/guide-auth';
import { SETTLEMENT_COMMISSION_RATE } from '../../../../../../src/lib/settlement-config';

export const dynamic = 'force-dynamic';

async function getSupabase() {
  const { createClient } = await import('@supabase/supabase-js');
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

export async function GET(req: Request) {
  const session = verifyGuideSession(req);
  if (!session) {
    return new Response('Unauthorized', { status: 401 });
  }

  // Validate month param: must match YYYY-MM
  const url = new URL(req.url);
  const month = url.searchParams.get('month') ?? '';
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    return new Response('month must be YYYY-MM', { status: 400 });
  }

  const csvHeader = '行程,出團日,訂單金額(NT$),已退款(NT$),實付扣退款(NT$),平台抽成(NT$),預計入帳(NT$)\n';

  if (!process.env.SUPABASE_URL) {
    const emptyCsv = csvHeader + `合計,,,,0,0,0\n`;
    return new Response(emptyCsv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="payout-${month}.csv"`,
      },
    });
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
    const emptyCsv = csvHeader + `合計,,,,0,0,0\n`;
    return new Response(emptyCsv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="payout-${month}.csv"`,
      },
    });
  }

  // Build month window in Asia/Taipei (UTC+8)
  const taipeiOffset = 8 * 60; // minutes
  const [yearStr, monthStr] = month.split('-');
  const year = parseInt(yearStr, 10);
  const mon = parseInt(monthStr, 10) - 1; // 0-indexed

  const monthStart = new Date(Date.UTC(year, mon, 1) - taipeiOffset * 60000);
  const monthEnd = new Date(Date.UTC(year, mon + 1, 1) - taipeiOffset * 60000);

  // Same status filter as the monthly JSON route
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
    const activityTitle = activityMap[o.activity_id] ?? '';
    const scheduleDate = o.created_at.slice(0, 10);
    return { activityTitle, scheduleDate, totalTwd, refundAmountTwd, effectiveTwd, commissionTwd, netTwd };
  });

  const gmvTwd = orders.reduce((sum: number, o: { effectiveTwd: number }) => sum + o.effectiveTwd, 0);
  const totalCommission = orders.reduce((sum: number, o: { commissionTwd: number }) => sum + o.commissionTwd, 0);
  const totalNet = orders.reduce((sum: number, o: { netTwd: number }) => sum + o.netTwd, 0);

  const rows = orders.map((o: { activityTitle: string; scheduleDate: string; totalTwd: number; refundAmountTwd: number; effectiveTwd: number; commissionTwd: number; netTwd: number }) =>
    `${o.activityTitle},${o.scheduleDate},${o.totalTwd},${o.refundAmountTwd},${o.effectiveTwd},${o.commissionTwd},${o.netTwd}`
  );

  const csvContent =
    csvHeader +
    rows.join('\n') +
    (rows.length > 0 ? '\n' : '') +
    `合計,,,,${gmvTwd},${totalCommission},${totalNet}\n`;

  return new Response(csvContent, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="payout-${month}.csv"`,
    },
  });
}
