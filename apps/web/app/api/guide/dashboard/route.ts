import { ok, fail } from '../../../../src/lib/api';
import { verifyGuideSession } from '../../../../src/lib/guide-auth';
import { getSettlementConfig, computeGuidePayoutEstimate } from '../../../../src/lib/settlement-config';

async function getSupabase() {
  const { createClient } = await import('@supabase/supabase-js');
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

export async function GET(req: Request) {
  const session = verifyGuideSession(req);
  if (!session) return Response.json(fail('UNAUTHORIZED', 'session required'), { status: 401 });

  if (!process.env.SUPABASE_URL) {
    return Response.json(ok({
      monthlyBookings: 0,
      pendingBookings: [],
      upcomingSchedules: [],
      monthGmvTwd: 0,
      monthGmvOrderCount: 0,
      revenueTrend6m: [],
      expectedPayoutTwd: null,
      nextPayoutDate: null,
      currentBalanceTwd: null,
      lastSettledAt: null,
      minWithdrawalTwd: 5000,
      pendingPayoutTwd: null,
      settlementRulesVersion: 'env-fallback',
      pendingSettlementOrders: [],
    }));
  }

  const supabase = await getSupabase();
  const guideId = session.guideId;

  const settlementConfig = await getSettlementConfig(supabase);

  // 1. Get guide's activity IDs
  const { data: activities } = await supabase
    .from('activities')
    .select('id, title, slug')
    .eq('guide_id', guideId);

  const activityIds = (activities || []).map((a: any) => a.id);
  const activityMap = Object.fromEntries((activities || []).map((a: any) => [a.id, a]));

  if (activityIds.length === 0) {
    return Response.json(ok({
      monthlyBookings: 0,
      pendingBookings: [],
      upcomingSchedules: [],
      monthGmvTwd: 0,
      monthGmvOrderCount: 0,
      revenueTrend6m: [],
      expectedPayoutTwd: null,
      nextPayoutDate: null,
      currentBalanceTwd: null,
      lastSettledAt: null,
      minWithdrawalTwd: settlementConfig.min_withdrawal_twd,
      pendingPayoutTwd: null,
      settlementRulesVersion: settlementConfig.version ?? 'v1',
      pendingSettlementOrders: [],
    }));
  }

  // 2. Monthly bookings count (current month)
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const { count: monthlyBookings } = await supabase
    .from('orders')
    .select('id', { count: 'exact', head: true })
    .in('activity_id', activityIds)
    .gte('created_at', monthStart.toISOString());

  // 3. Recent pending/confirmed bookings (last 5), including total_twd for AC6
  const { data: recentOrders } = await supabase
    .from('orders')
    .select('id, contact_name, people_count, status, created_at, schedule_id, activity_id, total_twd')
    .in('activity_id', activityIds)
    .order('created_at', { ascending: false })
    .limit(5);

  const pendingBookings = (recentOrders || []).map((o: any) => ({
    id: o.id,
    guestName: o.contact_name || '未知',
    partySize: o.people_count,
    status: o.status,
    createdAt: o.created_at,
    tourTitle: activityMap[o.activity_id]?.title || '',
    totalTwd: o.total_twd ?? 0,
  }));

  // 4. Upcoming schedules (next 7 days)
  const now = new Date();
  const weekLater = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const { data: schedules } = await supabase
    .from('activity_schedules')
    .select('id, activity_id, start_at, capacity, booked_count, status, plan_id')
    .in('activity_id', activityIds)
    .gte('start_at', now.toISOString())
    .lte('start_at', weekLater.toISOString())
    .order('start_at', { ascending: true })
    .limit(10);

  const upcomingSchedules = (schedules || []).map((s: any) => ({
    id: s.id,
    tourTitle: activityMap[s.activity_id]?.title || '',
    date: s.start_at,
    planId: s.plan_id,
    bookedCount: s.booked_count,
    maxCapacity: s.capacity,
    status: s.status,
  }));

  // 5. Monthly GMV (Asia/Taipei month boundary) — AC1, AC3
  const taipeiOffset = 8 * 60; // UTC+8 minutes
  const taipeiNow = new Date(now.getTime() + taipeiOffset * 60000);
  const gmvMonthStart = new Date(
    Date.UTC(taipeiNow.getUTCFullYear(), taipeiNow.getUTCMonth(), 1) - taipeiOffset * 60000
  );
  const gmvMonthEnd = new Date(
    Date.UTC(taipeiNow.getUTCFullYear(), taipeiNow.getUTCMonth() + 1, 1) - taipeiOffset * 60000
  );

  // AC3: only paid/confirmed/completed orders count toward GMV
  const gmvStatuses = ['paid', 'confirmed', 'completed'];

  const { data: monthOrders } = await supabase
    .from('orders')
    .select('id, total_twd, created_at')
    .in('activity_id', activityIds)
    .in('status', gmvStatuses)
    .gte('created_at', gmvMonthStart.toISOString())
    .lt('created_at', gmvMonthEnd.toISOString());

  const monthOrderIds = (monthOrders ?? []).map((o: any) => o.id);
  // #1284: also fetch hold flags so expectedPayoutTwd can use computeGuidePayoutEstimate
  let monthOpsByOrderId: Record<string, { refund_amount_twd: number; has_complaint: boolean; has_oversell_issue: boolean; is_disputed: boolean; is_safety_case: boolean }> = {};
  // Keep legacy map for GMV reduce (unchanged — GMV counts effective, not payable)
  let monthRefundAmountByOrderId: Record<string, number> = {};
  if (monthOrderIds.length > 0) {
    const { data: monthOpsRows } = await supabase
      .from('operations_tracking')
      .select('order_id, refund_amount_twd, has_complaint, has_oversell_issue, is_disputed, is_safety_case')
      .in('order_id', monthOrderIds);
    monthOpsByOrderId = Object.fromEntries(
      (monthOpsRows ?? []).map((r: any) => [
        r.order_id,
        {
          refund_amount_twd: Number(r.refund_amount_twd ?? 0),
          has_complaint: r.has_complaint === true,
          has_oversell_issue: r.has_oversell_issue === true,
          is_disputed: r.is_disputed === true,
          is_safety_case: r.is_safety_case === true,
        },
      ])
    );
    monthRefundAmountByOrderId = Object.fromEntries(
      Object.entries(monthOpsByOrderId).map(([id, ops]) => [id, ops.refund_amount_twd])
    );
  }

  const monthGmvTwd = (monthOrders ?? []).reduce((sum: number, o: any) => {
    const totalTwd = o.total_twd ?? 0;
    const refundAmountTwd = monthRefundAmountByOrderId[o.id] ?? 0;
    const effectiveTwd = Math.max(0, totalTwd - refundAmountTwd);
    return sum + effectiveTwd;
  }, 0);
  const effectiveMonthGmvTwd = monthGmvTwd;
  const monthGmvOrderCount = (monthOrders ?? []).length;

  // 6. 6-month revenue trend — AC1
  const revenueTrend6m: Array<{ month: string; gmvTwd: number; orderCount: number }> = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(taipeiNow);
    d.setUTCMonth(d.getUTCMonth() - i);
    const mStart = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) - taipeiOffset * 60000);
    const mEnd = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1) - taipeiOffset * 60000);
    const { data: mOrders } = await supabase
      .from('orders')
      .select('id, total_twd')
      .in('activity_id', activityIds)
      .in('status', gmvStatuses)
      .gte('created_at', mStart.toISOString())
      .lt('created_at', mEnd.toISOString());
    const mOrderIds = (mOrders ?? []).map((o: any) => o.id);
    let mRefundAmountByOrderId: Record<string, number> = {};
    if (mOrderIds.length > 0) {
      const { data: mRefundRows } = await supabase
        .from('operations_tracking')
        .select('order_id, refund_amount_twd')
        .in('order_id', mOrderIds);
      mRefundAmountByOrderId = Object.fromEntries(
        (mRefundRows ?? []).map((r: any) => [r.order_id, Number(r.refund_amount_twd ?? 0)])
      );
    }
    revenueTrend6m.push({
      month: `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`,
      gmvTwd: (mOrders ?? []).reduce((s: number, o: any) => {
        const totalTwd = o.total_twd ?? 0;
        const refundAmountTwd = mRefundAmountByOrderId[o.id] ?? 0;
        const effectiveTwd = Math.max(0, totalTwd - refundAmountTwd);
        return s + effectiveTwd;
      }, 0),
      orderCount: (mOrders ?? []).length,
    });
  }

  // 7. Settlement v1: expectedPayout + nextPayoutDate
  // Query the most recent completed tour schedule for this guide
  const { data: latestScheduleRows } = await supabase
    .from('activity_schedules')
    .select('start_at')
    .in('activity_id', activityIds)
    .lt('start_at', now.toISOString())
    .order('start_at', { ascending: false })
    .limit(1);

  const latestCompletedTourDate =
    latestScheduleRows && latestScheduleRows.length > 0
    ? new Date((latestScheduleRows[0] as { start_at: string }).start_at)
    : null;

  // #1284: use canonical helper so hold semantics align with settlement sweep
  // On-hold orders contribute 0 to expectedPayoutTwd (payableNetTwd = 0 for held orders)
  const expectedPayoutTwd = (monthOrders ?? []).reduce((sum: number, o: any) => {
    const opsTracking = monthOpsByOrderId[o.id] ?? null;
    const estimate = computeGuidePayoutEstimate(
      { total_twd: o.total_twd },
      opsTracking,
      settlementConfig,
    );
    return sum + estimate.payableNetTwd;
  }, 0);
  const nextPayoutDateObj = latestCompletedTourDate
    ? new Date(latestCompletedTourDate.getTime() + settlementConfig.t_days * 24 * 60 * 60 * 1000)
    : null;
  const nextPayoutDate = nextPayoutDateObj ? nextPayoutDateObj.toISOString().slice(0, 10) : null;

  // 8. Guide balance from settlement sweep
  const { data: balanceRow } = await supabase
    .from('guide_balances')
    .select('balance_twd, last_settled_at')
    .eq('guide_id', guideId)
    .maybeSingle();

  // 9. Pending payout (max one per unique index, but aggregate defensively)
  const { data: pendingPayouts } = await supabase
    .from('payouts')
    .select('total_twd')
    .eq('guide_id', guideId)
    .eq('state', 'pending');

  const pendingPayoutTwd = (pendingPayouts ?? []).reduce((s: number, p: any) => s + (p.total_twd ?? 0), 0);

  // 10. Pending settlement orders (refund_pending) — 待對帳
  const { data: refundPendingOrders } = await supabase
    .from('orders')
    .select('id, status, total_twd, schedule_id, activity_id, created_at')
    .in('activity_id', activityIds)
    .eq('status', 'refund_pending')
    .order('created_at', { ascending: false });

  // Fetch schedule dates for refund_pending orders
  const refundScheduleIds = [...new Set(
    (refundPendingOrders ?? []).map((o: any) => o.schedule_id).filter(Boolean)
  )];
  let refundScheduleMap: Record<string, string> = {};
  if (refundScheduleIds.length > 0) {
    const { data: refundSchedules } = await supabase
      .from('activity_schedules')
      .select('id, start_at')
      .in('id', refundScheduleIds);
    refundScheduleMap = Object.fromEntries(
      (refundSchedules ?? []).map((s: any) => [s.id, s.start_at])
    );
  }

  const pendingSettlementOrders = (refundPendingOrders ?? []).map((o: any) => ({
    orderId: o.id,
    tourTitle: activityMap[o.activity_id]?.title || '',
    scheduleDate: o.schedule_id ? (refundScheduleMap[o.schedule_id] ?? null) : null,
    totalTwd: o.total_twd ?? 0,
    status: o.status,
  }));

  return Response.json(ok({
    monthlyBookings: monthlyBookings || 0,
    pendingBookings,
    upcomingSchedules,
    monthGmvTwd,
    effectiveMonthGmvTwd,
    monthGmvOrderCount,
    revenueTrend6m,
    expectedPayoutTwd,
    nextPayoutDate,
    currentBalanceTwd: balanceRow?.balance_twd ?? null,
    lastSettledAt: balanceRow?.last_settled_at ?? null,
    minWithdrawalTwd: settlementConfig.min_withdrawal_twd,
    pendingPayoutTwd: pendingPayouts && pendingPayouts.length > 0 ? pendingPayoutTwd : null,
    settlementRulesVersion: settlementConfig.version ?? 'v1',
    pendingSettlementOrders,
  }));
}
