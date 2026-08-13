/**
 * Payment must be based on a fully committed checkout aggregate, never a
 * request-time amount or a partially-created order. This stays pure so both
 * the database gateway and release tests exercise the same boundary.
 */
export function isMaterializedOrderReadyForPayment(order = {}) {
  const booking = Array.isArray(order.booking) ? order.booking[0] : order.booking;
  const items = Array.isArray(order.items) ? order.items : [];
  const baseItems = items.filter((item) => item?.item_type === 'activity_booking');
  const totalTwd = Number(order.totalTwd);

  if (
    !order.id
    || !order.bookingId
    || order.status !== 'pending_payment'
    || order.paymentStatus !== 'pending'
    || !Number.isSafeInteger(totalTwd)
    || totalTwd < 0
    || !booking
    || booking.id !== order.bookingId
    || booking.order_id !== order.id
    || booking.status !== 'draft'
  ) return false;

  if (baseItems.length !== 1) return false;
  const itemTotal = items.reduce((sum, item) => {
    if (item?.order_id !== order.id || item?.booking_id !== order.bookingId) return Number.NaN;
    const subtotal = Number(item?.subtotal_amount);
    const allowed = item?.item_type === 'activity_booking'
      || (item?.item_type === 'fee' && item?.metadata?.kind === 'addon')
      || (item?.item_type === 'discount' && item?.metadata?.kind === 'points_redemption');
    return allowed && Number.isSafeInteger(subtotal) ? sum + subtotal : Number.NaN;
  }, 0);
  return itemTotal === totalTwd;
}

export function buildEcpayCheckoutParams(input = {}) {
  const merchantId = String(input?.merchantId || '').trim();
  const merchantTradeNo = String(input?.merchantTradeNo || '').trim();
  const tradeDate = String(input?.tradeDate || '').trim();
  const orderId = String(input?.orderId || '').trim();

  if (!merchantId) throw new Error('merchantId is required');
  if (!merchantTradeNo) throw new Error('merchantTradeNo is required');
  if (!tradeDate) throw new Error('tradeDate is required');
  if (!orderId) throw new Error('orderId is required');

  return {
    MerchantID: merchantId,
    MerchantTradeNo: merchantTradeNo,
    MerchantTradeDate: tradeDate,
    PaymentType: 'aio',
    TotalAmount: String(input?.totalTwd ?? ''),
    TradeDesc: encodeURIComponent('Midao 祕島 行程預訂'),
    ItemName: input?.title || '行程預訂',
    ReturnURL: String(input?.callbackUrl || ''),
    ClientBackURL: String(input?.returnUrl || ''),
    ChoosePayment: 'ALL',
    EncryptType: '1',
    CustomField2: orderId,
    CustomField4: String(input?.contactEmail || ''),
  };
}
