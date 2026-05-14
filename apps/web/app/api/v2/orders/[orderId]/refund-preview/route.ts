import { NextRequest } from 'next/server';
import { createClient as createAnonClient } from '@supabase/supabase-js';
import { successV2, errorV2 } from '../../../../../../src/lib/api';
import { calculateRefundAmount, RefundPolicy } from '../../../../../../src/lib/refund-policy';

export const dynamic = 'force-dynamic';

function isValidUuid(str: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(str);
}

type ScheduleRow = { start_at: string | null };

type OrderRow = {
  id: string;
  user_id: string | null;
  total_twd: number;
  status: string;
  schedule_id: string | null;
  activity_schedules: ScheduleRow | ScheduleRow[] | null;
};

type PolicyRow = {
  version: string;
  tiers: RefundPolicy['tiers'];
};

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ orderId: string }> }
) {
  const { orderId } = await context.params;

  if (!orderId || !isValidUuid(orderId)) {
    return Response.json(errorV2('VALIDATION_ERROR', 'Invalid orderId'), { status: 400 });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    return Response.json(errorV2('INTERNAL_ERROR', 'Server misconfigured'), { status: 500 });
  }

  // Service-role client for DB queries (bypasses RLS)
  const { createClient: createServiceClient } = await import('@supabase/supabase-js');
  const db = createServiceClient(supabaseUrl, serviceKey);

  // Fetch order
  const { data: order, error: orderError } = await db
    .from('orders')
    .select('id, user_id, total_twd, status, schedule_id, activity_schedules(start_at)')
    .eq('id', orderId)
    .single();

  if (!order) {
    return Response.json(errorV2('NOT_FOUND', 'Order not found'), { status: 404 });
  }

  if (orderError) {
    return Response.json(errorV2('INTERNAL_ERROR', 'Failed to load order'), { status: 500 });
  }

  const typedOrder = order as OrderRow;

  // Auth: optional ownership check
  const authHeader = req.headers.get('authorization') ?? '';
  if (authHeader) {
    const anonKey = process.env.SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
    const userClient = createAnonClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (user && typedOrder.user_id && typedOrder.user_id !== user.id) {
      return Response.json(errorV2('FORBIDDEN', 'You are not allowed to access this order'), { status: 403 });
    }
  }

  // Status guard: only paid/confirmed orders are eligible
  if (!['paid', 'confirmed'].includes(typedOrder.status)) {
    return Response.json(successV2({
      eligible: false,
      refundable_amount: 0,
      refund_pct: 0,
      breakdown: null,
      reason: 'order not eligible for refund in current status',
    }));
  }

  // Fetch active refund policy
  const { data: policy, error: policyError } = await db
    .from('refund_policies')
    .select('*')
    .eq('is_active', true)
    .limit(1)
    .single();

  if (policyError || !policy) {
    return Response.json(successV2({
      eligible: false,
      refundable_amount: 0,
      refund_pct: 0,
      breakdown: null,
      reason: 'refund policy not configured',
    }));
  }

  const typedPolicy = policy as PolicyRow;

  const schedule = Array.isArray(typedOrder.activity_schedules)
    ? typedOrder.activity_schedules[0]
    : typedOrder.activity_schedules;
  const tourStartAt = schedule?.start_at ?? null;

  if (!tourStartAt) {
    return Response.json(successV2({
      eligible: false,
      refundable_amount: 0,
      refund_pct: 0,
      breakdown: null,
      reason: 'tour start date not set',
    }));
  }

  const result = calculateRefundAmount(
    typedOrder.total_twd,
    new Date(tourStartAt),
    { version: typedPolicy.version, tiers: typedPolicy.tiers }
  );

  return Response.json(successV2(result));
}
