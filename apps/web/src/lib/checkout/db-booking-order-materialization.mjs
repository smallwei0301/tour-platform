// @ts-check
/**
 * Issue #1811 — booking/order 基本 materialization 的 service-role gateway。
 *
 * 寫入只准呼叫單一 atomic RPC；RPC 成功回應代表 statement transaction 已提交。
 * 之後以獨立的 orders projection 讀回 booking、base item 與 persisted total，呼叫端
 * 不得把 request 或 RPC 暫存金額直接發布給付款／通知。
 */
import { getSupabase } from '../supabase-env.mjs';

export const BOOKING_DRAFT_RPC_MISSING_CODE = 'BOOKING_DRAFT_RPC_NOT_DEPLOYED';

const RPC_NAME = 'fn_create_booking_draft_atomic';
const MATERIALIZATION_SELECT = `
  id,
  booking_id,
  activity_id,
  status,
  payment_status,
  total_twd,
  payment_deadline_at,
  booking:bookings!orders_booking_id_fkey(
    id,
    booking_no,
    status,
    order_id,
    activity_id,
    activity_plan_id
  ),
  items:order_items!order_items_order_id_fkey(
    id,
    order_id,
    booking_id,
    item_type,
    ref_id,
    quantity,
    unit_price,
    subtotal_amount
  )
`;

/** @param {any} data */
function firstRow(data) {
  if (Array.isArray(data)) return data[0] ?? null;
  return data ?? null;
}

/** @param {any} value @param {string} label */
function oneRelated(value, label) {
  if (Array.isArray(value)) {
    if (value.length !== 1) throw new Error(`${label} read-back must contain exactly one row`);
    return value[0];
  }
  if (!value || typeof value !== 'object') throw new Error(`${label} read-back is missing`);
  return value;
}

/** @param {any} error */
function isMissingFunctionError(error) {
  if (!error) return false;
  if (error.code === 'PGRST202') return true;
  return /could not find the function|does not exist/iu.test(String(error.message ?? ''))
    && String(error.message ?? '').includes(RPC_NAME);
}

/** @param {any} error @param {string} fallbackMessage @returns {Error & {code?: string}} */
function databaseError(error, fallbackMessage) {
  if (isMissingFunctionError(error)) {
    const missing = /** @type {Error & {code?: string}} */ (new Error(
      `${BOOKING_DRAFT_RPC_MISSING_CODE}: 原子建單 RPC 尚未套用，已停止以避免非原子資料。`,
    ));
    missing.code = BOOKING_DRAFT_RPC_MISSING_CODE;
    return missing;
  }
  const wrapped = /** @type {Error & {code?: string}} */ (new Error(error?.message ?? fallbackMessage));
  if (error?.code) wrapped.code = error.code;
  return wrapped;
}

/**
 * @param {unknown} value
 * @param {string} label
 * @param {{min?: number}} [options]
 */
function integer(value, label, { min = 0 } = {}) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < min) {
    throw new Error(`${label} read-back is not a valid integer`);
  }
  return parsed;
}

/**
 * @param {object} input
 * @param {string|null|undefined} input.travelerId
 * @param {string} input.planId
 * @param {string} input.startAt
 * @param {string} input.endAt
 * @param {string} input.timezone
 * @param {number} input.participants
 * @param {string} input.sourceChannel
 * @param {string} input.contactName
 * @param {string} input.contactPhone
 * @param {string} input.contactEmail
 * @param {string|null|undefined} input.customerNote
 * @param {string|null|undefined} input.conflictOverrideId
 * @param {unknown} input.conflictOverrideSnapshot
 * @param {string} input.correlationId
 * @param {string|null} input.paymentDeadlineAt
 * @param {any} [supabase]
 */
export async function createBookingDraftAtomicDb(input, supabase) {
  const client = supabase ?? await getSupabase();
  const { data, error } = await client.rpc(RPC_NAME, {
    p_traveler_id: input.travelerId ?? null,
    p_activity_plan_id: input.planId,
    p_start_at: input.startAt,
    p_end_at: input.endAt,
    p_timezone: input.timezone,
    p_participants: input.participants,
    p_source_channel: input.sourceChannel,
    p_contact_name: input.contactName,
    p_contact_phone: input.contactPhone,
    p_contact_email: input.contactEmail,
    p_customer_note: input.customerNote ?? null,
    p_conflict_override_id: input.conflictOverrideId ?? null,
    p_conflict_override_snapshot: input.conflictOverrideSnapshot ?? null,
    p_correlation_id: input.correlationId,
    p_payment_deadline_at: input.paymentDeadlineAt,
  });

  if (error) throw databaseError(error, `${RPC_NAME} failed`);
  const row = firstRow(data);
  if (!row || typeof row.booking_id !== 'string' || typeof row.order_id !== 'string') {
    throw new Error(`${RPC_NAME} returned no materialization identifiers`);
  }
  return {
    bookingId: row.booking_id,
    orderId: row.order_id,
  };
}

/**
 * @param {{
 *   bookingId: string,
 *   orderId: string,
 *   expectedActivityId?: string,
 *   expectedPlanId?: string,
 *   requireTotalMatch?: boolean,
 * }} input
 * @param {any} [supabase]
 */
export async function readBackBookingOrderMaterializationDb(
  { bookingId, orderId, expectedActivityId, expectedPlanId, requireTotalMatch = true },
  supabase,
) {
  const client = supabase ?? await getSupabase();
  const { data, error } = await client
    .from('orders')
    .select(MATERIALIZATION_SELECT)
    .eq('id', orderId)
    .single();

  if (error) throw databaseError(error, 'booking/order materialization read-back failed');
  const order = firstRow(data);
  if (!order || order.id !== orderId) throw new Error('order read-back is missing');
  const booking = oneRelated(order.booking, 'booking');
  const items = Array.isArray(order.items) ? order.items : [];
  const activityItems = items.filter((/** @type {any} */ item) => item?.item_type === 'activity_booking');

  if (booking.id !== bookingId || booking.order_id !== orderId || order.booking_id !== bookingId) {
    throw new Error('booking/order reciprocal read-back mismatch');
  }
  if (order.activity_id !== booking.activity_id) {
    throw new Error('booking/order activity read-back mismatch');
  }
  if (
    (expectedActivityId && booking.activity_id !== expectedActivityId)
    || (expectedPlanId && booking.activity_plan_id !== expectedPlanId)
  ) {
    throw new Error('booking/order requested aggregate read-back mismatch');
  }
  if (
    booking.status !== 'draft'
    || order.status !== 'pending_payment'
    || order.payment_status !== 'pending'
  ) {
    throw new Error('booking/order status read-back mismatch');
  }
  if (activityItems.length !== 1) {
    throw new Error('booking/order read-back must contain exactly one base activity item');
  }

  const baseItem = activityItems[0];
  if (
    baseItem.order_id !== orderId
    || baseItem.booking_id !== bookingId
    || baseItem.ref_id !== bookingId
  ) {
    throw new Error('base activity item read-back mismatch');
  }
  const quantity = integer(baseItem.quantity, 'base item quantity', { min: 1 });
  const unitPrice = integer(baseItem.unit_price, 'base item unit price');
  const baseSubtotal = integer(baseItem.subtotal_amount, 'base item subtotal');
  const totalTwd = integer(order.total_twd, 'order total');
  if (quantity * unitPrice !== baseSubtotal) {
    throw new Error('base activity item subtotal is not reconciled');
  }
  if (requireTotalMatch && baseSubtotal !== totalTwd) {
    throw new Error('base activity item does not reconcile to persisted order total');
  }

  return {
    bookingId: booking.id,
    bookingNo: booking.booking_no,
    bookingStatus: booking.status,
    activityId: booking.activity_id,
    planId: booking.activity_plan_id,
    orderId: order.id,
    orderStatus: order.status,
    totalTwd,
    baseSubtotal,
    paymentDeadlineAt: order.payment_deadline_at ?? null,
  };
}
