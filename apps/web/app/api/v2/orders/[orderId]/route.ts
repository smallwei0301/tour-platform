/**
 * GET /api/v2/orders/[orderId] — 旅人訂單詳情（#1649 Phase 1 接線）
 *
 * 原始版本只回 order 基本欄位＋items、僅限登入旅客。為承接 legacy
 * GET /api/me/orders/[orderId] 的消費者（/me/orders/[orderId]、/order/success），
 * 本 route 補齊：
 * - legacy 詳情欄位（title/experienceSlug/guideSlug/scheduleId/scheduleStartAt/
 *   paidAt/paymentDeadlineAt）——欄位聯集，既有 v2 欄位一個不少。
 * - guest 存取：未登入時允許 ?contactEmail= 查自己的訂單（order-status-by-email
 *   pattern，/order/success 未登入情境；ownership 仍由 isOrderOwner 把關）。
 * - #1565 電子憑證：confirmed 訂單附 voucherToken/voucherShortCode（server 簽發）。
 * - in-memory fallback：無 Supabase env 時走 db.mjs gateway（測試 seam）。
 */
import { NextRequest } from 'next/server';
import { jsonOk, jsonError } from '../../../../../src/lib/api-response';
import { handleRouteError } from '../../../../../src/lib/route-error';
import { createClient } from '../../../../../src/lib/supabase/server';
import { isOrderOwner } from '../../../../../src/lib/v2-order-authz';
import { getTravelerIdentity } from '../../../../../src/lib/v2/traveler-auth';
import { hasSupabaseEnv, getMyOrderDetailDb } from '../../../../../src/lib/db.mjs';
import { selectWithOptionalColumnFallback } from '../../../../../src/lib/optional-column-fallback.mjs';
import { signVoucherToken, shortCodeForOrder, resolveVoucherSecret } from '../../../../../src/lib/voucher-token.mjs';

type OrderItem = {
  id: string;
  item_type: string;
  title: string;
  quantity: number;
  unit_price: number;
  subtotal_amount: number;
};

type OrderRow = {
  id: string;
  status: string;
  payment_status: string;
  total_twd: number;
  people_count: number;
  contact_name: string;
  contact_email: string;
  contact_phone: string;
  user_id: string | null;
  source_channel: string;
  created_at: string;
  paid_at: string | null;
  payment_deadline_at?: string | null;
  activity_id: string | null;
  schedule_id: string | null;
  order_items: OrderItem[] | null;
};

function isValidUuid(str: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(str);
}

/** confirmed 訂單簽發電子憑證（#1565，與 legacy 詳情 route 相同語意）。 */
function voucherFields(orderId: string, status: string): { voucherToken: string | null; voucherShortCode: string | null } {
  if (status !== 'confirmed') return { voucherToken: null, voucherShortCode: null };
  return {
    voucherToken: signVoucherToken(orderId, resolveVoucherSecret()),
    voucherShortCode: shortCodeForOrder(orderId),
  };
}

const ORDER_SELECT_BASE =
  'id, status, payment_status, total_twd, people_count, user_id, contact_name, contact_email, contact_phone, source_channel, created_at, paid_at, activity_id, schedule_id, order_items(id, item_type, title, quantity, unit_price, subtotal_amount)';
// #1493 部署順序安全：payment_deadline_at 缺欄位時退到不含該欄位的 select。
const ORDER_SELECT_WITH_DEADLINE = `${ORDER_SELECT_BASE}, payment_deadline_at`;

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ orderId: string }> }
) {
  const { orderId } = await context.params;

  if (!orderId || !isValidUuid(orderId)) {
    return jsonError('VALIDATION_ERROR', 'Invalid orderId', 400);
  }

  const url = new URL(request.url);
  const guestEmail = (url.searchParams.get('contactEmail') || '').trim();

  try {
    const user = await getTravelerIdentity();

    if (!user?.id && !user?.email) {
      // guest 僅能以 ?contactEmail= 查自己的訂單（/order/success 未登入情境）；
      // 完全無身分才回 401。
      if (!guestEmail) {
        return jsonError('UNAUTHORIZED', 'Please login first', 401);
      }
    }

    if (!hasSupabaseEnv()) {
      // in-memory fallback（測試／無環境變數本機）：ownership 由 gateway 以
      // contactEmail 過濾（查不到＝非本人或不存在，一律 404 不洩漏存在性）。
      const row = await getMyOrderDetailDb({
        orderId,
        userId: user?.id ?? null,
        contactEmail: user?.email || guestEmail,
      }).catch((): null => null);
      if (!row) {
        return jsonError('NOT_FOUND', 'Order not found', 404);
      }
      return jsonOk({
        ...row,
        paymentStatus: row.paidAt ? 'paid' : null,
        sourceChannel: row.sourceChannel ?? null,
        ...voucherFields(orderId, row.status),
        items: [],
      });
    }

    const supabase = await createClient();

    const { data, error: orderError } = await selectWithOptionalColumnFallback(
      (sel: string) => supabase.from('orders').select(sel).eq('id', orderId).single(),
      [ORDER_SELECT_WITH_DEADLINE, ORDER_SELECT_BASE],
    );
    const order = data as OrderRow | null;

    if (orderError || !order) {
      return jsonError('NOT_FOUND', 'Order not found', 404);
    }

    const typedOrder = order as OrderRow;
    const hasAccess = isOrderOwner(typedOrder, {
      id: user?.id ?? null,
      email: user?.email ?? (guestEmail || null),
    });

    if (!hasAccess) {
      return jsonError('FORBIDDEN', 'You are not allowed to access this order', 403);
    }

    // 補齊 legacy 詳情欄位：活動標題/slug/導遊 slug ＋ 場次出發時間。
    let activity: { id: string; title: string | null; slug: string | null; guide_slug: string | null } | null = null;
    if (typedOrder.activity_id) {
      const { data: act } = await supabase
        .from('activities')
        .select('id, title, slug, guide_slug')
        .eq('id', typedOrder.activity_id)
        .maybeSingle();
      activity = act ?? null;
    }

    let schedule: { id: string; start_at: string | null } | null = null;
    if (typedOrder.schedule_id) {
      const { data: sched } = await supabase
        .from('activity_schedules')
        .select('id, start_at')
        .eq('id', typedOrder.schedule_id)
        .maybeSingle();
      schedule = sched ?? null;
    }

    const items = typedOrder.order_items ?? [];
    return jsonOk({
      id: order.id,
      status: order.status,
      paymentStatus: order.payment_status,
      totalTwd: order.total_twd,
      peopleCount: order.people_count,
      contactName: order.contact_name,
      contactEmail: order.contact_email,
      contactPhone: order.contact_phone,
      sourceChannel: order.source_channel,
      createdAt: order.created_at,
      paidAt: order.paid_at ?? null,
      paymentDeadlineAt: order.payment_deadline_at ?? null,
      title: activity?.title ?? null,
      experienceId: typedOrder.activity_id ?? null,
      experienceSlug: activity?.slug ?? null,
      guideSlug: activity?.guide_slug ?? null,
      scheduleId: typedOrder.schedule_id ?? null,
      scheduleStartAt: schedule?.start_at ?? null,
      ...voucherFields(order.id, order.status),
      items: items || [],
    });
  } catch (err) {
    return handleRouteError(err, { route: 'v2/orders/detail' });
  }
}
