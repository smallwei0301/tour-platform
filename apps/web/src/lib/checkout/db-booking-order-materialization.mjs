// @ts-check
/**
 * Issue #1811 — booking/order 基本 materialization 的 service-role gateway。
 *
 * 寫入只准呼叫單一 atomic RPC；RPC 成功回應代表 statement transaction 已提交。
 * 之後以獨立的 orders projection 讀回 booking、base item 與 persisted total，呼叫端
 * 不得把 request 或 RPC 暫存金額直接發布給付款／通知。
 */
import { getSupabase, hasSupabaseEnv } from '../supabase-env.mjs';

export const BOOKING_DRAFT_RPC_MISSING_CODE = 'BOOKING_DRAFT_RPC_NOT_DEPLOYED';

const RPC_NAME = 'fn_create_booking_draft_with_addons_points_idempotent';
const MATERIALIZATION_SELECT = `
  id,
  booking_id,
  activity_id,
  status,
  payment_status,
  total_twd,
  discount_amount,
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
    subtotal_amount,
    metadata
  ),
  addons:order_addons!order_addons_order_id_fkey(
    id,
    order_id,
    addon_id,
    quantity,
    unit_price_twd,
    subtotal_twd
  ),
  point_ledger:user_points_ledger!user_points_ledger_order_id_fkey(
    id,
    user_id,
    delta,
    reason,
    order_id,
    expires_at
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

const ADDON_INPUT_ERROR_CODES = new Set(['ADDON_UNAVAILABLE', 'ADDON_SELECTIONS_INVALID']);
const POINTS_INPUT_ERROR_CODES = new Set(['POINTS_UNAVAILABLE']);
const IDEMPOTENCY_INPUT_ERROR_CODES = new Set(['IDEMPOTENCY_CONFLICT', 'IDEMPOTENCY_IN_PROGRESS']);

// 單程序 fallback：僅供無 Supabase 的 route/unit 契約；真正的 claim 仍只能由原子 RPC 建立。
// key 與 DB unique scope 相同，避免 fallback 測試把不同 command 的資料混在一起。
const checkoutIdempotencyReplayStore = new Map();

/** @param {{idempotencyKey:string}} input */
function replayStoreKey(input) {
  return `checkout:create_booking_draft:${input.idempotencyKey}`;
}

/** @param {{idempotencyKey:string}} input @param {any} row */
export function __seedBookingDraftIdempotencyReplayForTest(input, row) {
  checkoutIdempotencyReplayStore.set(replayStoreKey(input), structuredClone(row));
}

export function __resetBookingDraftIdempotencyReplayStoreForTest() {
  checkoutIdempotencyReplayStore.clear();
}

/** @param {any} error */
function addonInputError(error) {
  const code = String(error?.message ?? '').trim();
  if (!ADDON_INPUT_ERROR_CODES.has(code)) return null;
  const wrapped = /** @type {Error & {code?: string, addonId?: string|null}} */ (new Error(code));
  wrapped.code = code;
  wrapped.addonId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(String(error?.details ?? ''))
    ? String(error.details)
    : null;
  return wrapped;
}

/** @param {any} error */
function pointsInputError(error) {
  const code = String(error?.message ?? '').trim();
  if (!POINTS_INPUT_ERROR_CODES.has(code)) return null;
  const wrapped = /** @type {Error & {code?: string}} */ (new Error(code));
  wrapped.code = code;
  return wrapped;
}

/** @param {any} error */
function idempotencyInputError(error) {
  const code = String(error?.message ?? '').trim();
  if (!IDEMPOTENCY_INPUT_ERROR_CODES.has(code)) return null;
  const wrapped = /** @type {Error & {code?: string}} */ (new Error(code));
  wrapped.code = code;
  return wrapped;
}

/** @param {any} error @param {string} fallbackMessage @returns {Error & {code?: string}} */
function databaseError(error, fallbackMessage) {
  const addonError = addonInputError(error);
  if (addonError) return addonError;
  const pointsError = pointsInputError(error);
  if (pointsError) return pointsError;
  const idempotencyError = idempotencyInputError(error);
  if (idempotencyError) return idempotencyError;
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

/** @param {unknown} error */
export function isAddonInputError(error) {
  return !!error
    && typeof error === 'object'
    && ADDON_INPUT_ERROR_CODES.has(String(/** @type {any} */ (error).code ?? ''));
}

/** @param {unknown} error */
export function isPointsInputError(error) {
  return !!error
    && typeof error === 'object'
    && POINTS_INPUT_ERROR_CODES.has(String(/** @type {any} */ (error).code ?? ''));
}

/** @param {unknown} error */
export function isCheckoutIdempotencyError(error) {
  return !!error
    && typeof error === 'object'
    && IDEMPOTENCY_INPUT_ERROR_CODES.has(String(/** @type {any} */ (error).code ?? ''));
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
 * @param {unknown} input.addonSelections
 * @param {number|undefined} input.redeemPoints
 * @param {string} input.idempotencyKey
 * @param {string} input.requestHash
 * @param {'traveler'|'guest'} input.idempotencyActorType
 * @param {string} input.idempotencyActorId
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
    p_addon_selections: input.addonSelections ?? [],
    p_redeem_points: input.redeemPoints ?? 0,
    p_idempotency_key: input.idempotencyKey,
    p_request_hash: input.requestHash,
    p_idempotency_actor_type: input.idempotencyActorType,
    p_idempotency_actor_id: input.idempotencyActorId,
  });

  if (error) throw databaseError(error, `${RPC_NAME} failed`);
  const row = firstRow(data);
  if (!row || typeof row.booking_id !== 'string' || typeof row.order_id !== 'string') {
    throw new Error(`${RPC_NAME} returned no materialization identifiers`);
  }
  return {
    bookingId: row.booking_id,
    orderId: row.order_id,
    replayed: row.replayed === true,
  };
}

/**
 * 只讀已完成 snapshot，讓順序重送能在可用性檢查前回到同一筆已持久化結果。
 * 初次請求仍必須由原子 RPC claim，避免讀後寫競態。
 *
 * @param {{idempotencyKey:string, requestHash:string, actorType:'traveler'|'guest', actorId:string}} input
 * @param {any} [supabase]
 */
export async function findBookingDraftIdempotencyReplayDb(input, supabase) {
  if (!supabase && !hasSupabaseEnv()) {
    return projectBookingDraftIdempotencyReplay(
      input,
      checkoutIdempotencyReplayStore.get(replayStoreKey(input)) ?? null,
    );
  }
  const client = supabase ?? await getSupabase();
  const { data, error } = await client
    .from('midao_idempotency_records')
    .select('actor_type, actor_id, request_hash, state, response_body')
    .eq('scope_type', 'checkout')
    .eq('scope_id', '18140000-0000-4000-8000-000000000000')
    .eq('command_name', 'create_booking_draft')
    .eq('idempotency_key', input.idempotencyKey)
    .maybeSingle();

  if (error) throw databaseError(error, 'checkout idempotency replay lookup failed');
  return projectBookingDraftIdempotencyReplay(input, data);
}

/**
 * DB 與 in-memory fallback 共用同一個 completed/processing/conflict 投影。
 * @param {{requestHash:string, actorType:'traveler'|'guest', actorId:string}} input
 * @param {any} data
 */
export function projectBookingDraftIdempotencyReplay(input, data) {
  if (!data) return null;
  if (
    data.actor_type !== input.actorType
    || data.actor_id !== input.actorId
    || data.request_hash !== input.requestHash
  ) {
    const conflict = /** @type {Error & {code?: string}} */ (new Error('IDEMPOTENCY_CONFLICT'));
    conflict.code = 'IDEMPOTENCY_CONFLICT';
    throw conflict;
  }
  if (data.state === 'processing') {
    const processing = /** @type {Error & {code?: string}} */ (new Error('IDEMPOTENCY_IN_PROGRESS'));
    processing.code = 'IDEMPOTENCY_IN_PROGRESS';
    throw processing;
  }
  const body = data.response_body;
  if (
    data.state !== 'completed'
    || !body
    || typeof body.booking_id !== 'string'
    || typeof body.order_id !== 'string'
    || !['scheduled', 'request', 'instant'].includes(body.booking_type)
  ) {
    throw new Error('checkout idempotency replay snapshot is invalid');
  }
  return {
    bookingId: body.booking_id,
    orderId: body.order_id,
    bookingType: body.booking_type,
    replayed: true,
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
  const addonItems = items.filter((/** @type {any} */ item) => (
    item?.item_type === 'fee' && item?.metadata?.kind === 'addon'
  ));
  const pointsItems = items.filter((/** @type {any} */ item) => (
    item?.item_type === 'discount' && item?.metadata?.kind === 'points_redemption'
  ));
  /** @type {any[]} */
  const addons = Array.isArray(order.addons) ? order.addons : [];
  /** @type {any[]} */
  const pointLedger = Array.isArray(order.point_ledger) ? order.point_ledger : [];

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
  if (items.length !== activityItems.length + addonItems.length + pointsItems.length) {
    throw new Error('booking/order read-back contains an unexpected payable item');
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
  const discountAmount = integer(order.discount_amount, 'order discount amount');
  if (quantity * unitPrice !== baseSubtotal) {
    throw new Error('base activity item subtotal is not reconciled');
  }
  const addonSubtotal = addons.reduce((/** @type {number} */ sum, /** @type {any} */ addon) => (
    sum + integer(addon?.subtotal_twd, 'addon snapshot subtotal')
  ), 0);
  const itemSubtotal = items.reduce((/** @type {number} */ sum, /** @type {any} */ item) => (
    sum + integer(item?.subtotal_amount, 'order item subtotal', { min: -2147483648 })
  ), 0);
  if (addonItems.length !== addons.length) {
    throw new Error('add-on snapshot and payable item counts do not reconcile');
  }
  const unusedAddonItems = [...addonItems];
  for (const addon of addons) {
    const snapshotQuantity = integer(addon?.quantity, 'addon snapshot quantity', { min: 1 });
    const snapshotUnitPrice = integer(addon?.unit_price_twd, 'addon snapshot unit price');
    const snapshotSubtotal = integer(addon?.subtotal_twd, 'addon snapshot subtotal');
    const itemIndex = unusedAddonItems.findIndex((item) => (
      item?.order_id === orderId
      && item?.ref_id === addon?.addon_id
      && integer(item?.unit_price, 'add-on item unit price') === snapshotUnitPrice
      && integer(item?.subtotal_amount, 'add-on item subtotal') === snapshotSubtotal
      && integer(item?.metadata?.selectedQuantity, 'add-on item selected quantity', { min: 1 }) === snapshotQuantity
      && item?.metadata?.addonId === addon?.addon_id
    ));
    if (itemIndex < 0) throw new Error('add-on snapshot and payable item do not reconcile');
    unusedAddonItems.splice(itemIndex, 1);
  }
  if (discountAmount === 0) {
    if (pointsItems.length !== 0 || pointLedger.length !== 0) {
      throw new Error('zero-discount order must not contain points redemption data');
    }
  } else {
    if (pointsItems.length !== 1 || pointLedger.length !== 1) {
      throw new Error('points redemption must contain exactly one ledger and discount item');
    }
    const pointsItem = pointsItems[0];
    const ledger = pointLedger[0];
    if (
      pointsItem.order_id !== orderId
      || integer(pointsItem.quantity, 'points item quantity', { min: 1 }) !== 1
      || integer(pointsItem.unit_price, 'points item unit price', { min: -2147483648 }) !== -discountAmount
      || integer(pointsItem.subtotal_amount, 'points item subtotal', { min: -2147483648 }) !== -discountAmount
      || integer(pointsItem?.metadata?.requestedPoints, 'requested points', { min: 1 }) !== discountAmount
      || integer(pointsItem?.metadata?.redeemedPoints, 'redeemed points', { min: 1 }) !== discountAmount
      || ledger.order_id !== orderId
      || ledger.reason !== 'redeem_order'
      || integer(-Number(ledger.delta), 'redeemed ledger points', { min: 1 }) !== discountAmount
    ) {
      throw new Error('points ledger and discount item do not reconcile');
    }
  }
  if (requireTotalMatch && itemSubtotal !== totalTwd) {
    throw new Error('payable order items do not reconcile to persisted order total');
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
    addonSubtotal,
    pointsRedeemed: discountAmount,
    paymentDeadlineAt: order.payment_deadline_at ?? null,
  };
}
