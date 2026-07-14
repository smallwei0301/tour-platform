/**
 * #1649 Phase 6：實作自 legacy 路徑（app/api/guide/payout/monthly）整體搬遷至 v2 命名空間。
 * legacy 路徑已退役刪除；行為與測試契約以本檔為準。
 */
import { ok, fail } from '../../../../../../src/lib/api';
import { verifyGuideSession } from '../../../../../../src/lib/guide-auth';
import { getSettlementConfig, computeGuidePayoutEstimate } from '../../../../../../src/lib/settlement-config';
import { getSupabaseUrl, getSupabaseServiceRoleKey } from '../../../../../../src/config/supabase-service-env.mjs';

export const dynamic = 'force-dynamic';

async function getSupabase() {
  const { createClient } = await import('@supabase/supabase-js');
  return createClient(getSupabaseUrl()!, getSupabaseServiceRoleKey()!);
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

  if (!getSupabaseUrl()) {
    return Response.json(ok({ month, orders: [], totals: emptyTotals, settlementRulesVersion: 'env-fallback' }));
  }

  const supabase = await getSupabase();
  const settlementConfig = await getSettlementConfig(supabase);
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
    .select('id, activity_id, schedule_id, total_twd, created_at')
    .in('activity_id', activityIds)
    .in('status', gmvStatuses)
    .gte('created_at', monthStart.toISOString())
    .lt('created_at', monthEnd.toISOString());

  // Batch-fetch schedule start dates to use tour date instead of order created_at
  const scheduleIds = [...new Set((monthOrders ?? []).filter((o: { schedule_id?: string | null }) => o.schedule_id).map((o: { schedule_id: string }) => o.schedule_id))];
  const scheduleDates: Record<string, string> = {};
  if (scheduleIds.length > 0) {
    const { data: schedules } = await supabase
      .from('activity_schedules')
      .select('id, start_at')
      .in('id', scheduleIds);
    (schedules || []).forEach((s: { id: string; start_at: string }) => {
      scheduleDates[s.id] = s.start_at.slice(0, 10);
    });
  }

  const orderIds = (monthOrders ?? []).map((o: { id: string }) => o.id);
  // #1284: also fetch hold flags from operations_tracking
  let opsByOrderId: Record<string, { refund_amount_twd: number; has_complaint: boolean; has_oversell_issue: boolean; is_disputed: boolean; is_safety_case: boolean }> = {};
  if (orderIds.length > 0) {
    const { data: opsRows } = await supabase
      .from('operations_tracking')
      .select('order_id, refund_amount_twd, has_complaint, has_oversell_issue, is_disputed, is_safety_case')
      .in('order_id', orderIds);
    opsByOrderId = Object.fromEntries(
      (opsRows ?? []).map((r: { order_id: string; refund_amount_twd: number | null; has_complaint: boolean | null; has_oversell_issue: boolean | null; is_disputed: boolean | null; is_safety_case: boolean | null }) => [
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
  }

  const orders = (monthOrders ?? []).map((o: { id: string; activity_id: string; schedule_id?: string | null; total_twd: number | null; created_at: string }) => {
    const opsTracking = opsByOrderId[o.id] ?? null;
    const scheduleDate = (o.schedule_id && scheduleDates[o.schedule_id]) ? scheduleDates[o.schedule_id] : null;
    // #1284: use canonical helper so hold semantics align with settlement sweep
    const estimate = computeGuidePayoutEstimate(
      { total_twd: o.total_twd },
      opsTracking,
      settlementConfig,
    );
    return {
      orderId: o.id,
      activityId: o.activity_id,
      activityTitle: activityMap[o.activity_id] ?? '',
      scheduleDate,
      // #1284: OR with hold-based needsManualReview (preserve existing schedule-missing logic)
      needsManualReview: !o.schedule_id || !scheduleDates[o.schedule_id] || estimate.needsManualReview,
      totalTwd: estimate.totalTwd,
      refundAmountTwd: estimate.refundAmountTwd,
      effectiveTwd: estimate.effectiveTwd,
      commissionTwd: estimate.commissionTwd,
      netTwd: estimate.netTwd,
      payableNetTwd: estimate.payableNetTwd,
      payoutHoldReason: estimate.payoutHoldReason,
    };
  });

  const gmvTwd = orders.reduce((sum: number, o: { effectiveTwd: number }) => sum + o.effectiveTwd, 0);
  const commissionTwd = orders.reduce((sum: number, o: { commissionTwd: number }) => sum + o.commissionTwd, 0);
  // #1284: totals.netTwd uses payableNetTwd — held/fully-refunded orders are not counted
  const netTwd = orders.reduce((sum: number, o: { payableNetTwd: number }) => sum + o.payableNetTwd, 0);

  return Response.json(ok({
    month,
    orders,
    totals: { gmvTwd, commissionTwd, netTwd },
    settlementRulesVersion: settlementConfig.version ?? 'v1',
  }));
}
