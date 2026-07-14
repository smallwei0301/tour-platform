/**
 * GET /api/v2/orders/[orderId]/payments — 訂單付款紀錄（#1649 Phase 2）
 *
 * 契約既定端點（10-api-spec-v2-booking-pos.md §4.2）。ownership 先以 orders 讀取
 * ＋ isOrderOwner 把關（登入旅客或 guest ?contactEmail=），再以 service-role 讀
 * payments（#614 後 payments 表 service_role-only）。回應只含非敏感欄位，
 * 不外洩 provider 原始 payload。
 */
import { jsonOk, jsonError } from '../../../../../../src/lib/api-response';
import { handleRouteError } from '../../../../../../src/lib/route-error';
import { createClient } from '../../../../../../src/lib/supabase/server';
import { createServiceRoleClient } from '../../../../../../src/lib/supabase/service';
import { isOrderOwner } from '../../../../../../src/lib/v2-order-authz';
import { getTravelerIdentity } from '../../../../../../src/lib/v2/traveler-auth';
import { hasSupabaseEnv, getMyOrderDetailDb } from '../../../../../../src/lib/db.mjs';

type PaymentRow = {
  id: string;
  provider: string | null;
  amount_twd: number | null;
  status: string | null;
  paid_at: string | null;
  created_at: string | null;
};

export async function GET(
  request: Request,
  context: { params: Promise<{ orderId: string }> }
) {
  const { orderId } = await context.params;
  if (!orderId) {
    return jsonError('VALIDATION_ERROR', 'Invalid orderId', 400);
  }

  const url = new URL(request.url);
  const guestEmail = (url.searchParams.get('contactEmail') || '').trim();

  try {
    const user = await getTravelerIdentity();
    if (!user?.id && !user?.email && !guestEmail) {
      return jsonError('UNAUTHORIZED', 'Please login first', 401);
    }

    if (!hasSupabaseEnv()) {
      // in-memory fallback：ownership 由 gateway 過濾；in-memory store 無 payments 表。
      const row = await getMyOrderDetailDb({
        orderId,
        userId: user?.id ?? null,
        contactEmail: user?.email || guestEmail,
      }).catch((): null => null);
      if (!row) return jsonError('NOT_FOUND', 'Order not found', 404);
      return jsonOk({ items: [] });
    }

    const supabase = await createClient();
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('id, user_id, contact_email')
      .eq('id', orderId)
      .single();

    if (orderError || !order) {
      return jsonError('NOT_FOUND', 'Order not found', 404);
    }

    const hasAccess = isOrderOwner(
      { user_id: order.user_id ?? null, contact_email: order.contact_email ?? '' },
      { id: user?.id ?? null, email: user?.email ?? (guestEmail || null) },
    );
    if (!hasAccess) {
      return jsonError('FORBIDDEN', 'You are not allowed to access this order', 403);
    }

    const svcClient = createServiceRoleClient();
    const { data: payments, error: paymentsError } = await svcClient
      .from('payments')
      .select('id, provider, amount_twd, status, paid_at, created_at')
      .eq('order_id', orderId)
      .order('created_at', { ascending: true });

    if (paymentsError) {
      return handleRouteError(new Error(paymentsError.message), { route: 'v2/orders/payments' });
    }

    const items = ((payments ?? []) as PaymentRow[]).map((p) => ({
      id: p.id,
      provider: p.provider,
      amount: p.amount_twd,
      status: p.status,
      paidAt: p.paid_at ?? null,
      createdAt: p.created_at ?? null,
    }));

    return jsonOk({ items });
  } catch (err) {
    return handleRouteError(err, { route: 'v2/orders/payments' });
  }
}
