import { jsonError, jsonOk } from '../../../../../../src/lib/api-response';
import { upsertEcpayPaymentAttemptDb } from '../../../../../../src/lib/db.mjs';
import { generateCheckMacValue, getECPayCredentials } from '../../../../../../src/lib/ecpay';
import { buildEcpayCheckoutParams, isMaterializedOrderReadyForPayment } from '../../../../../../src/lib/ecpay-create-orchestration.mjs';
import { canCheckoutTravelerConfirmation } from '../../../../../../src/lib/booking-type-flow.mjs';
import { getMaterializedOrderDetailForPayment } from '../../../../../../src/lib/payment/db-payment-detail.mjs';
import { limiters, RateLimiter, createRateLimitResponse } from '../../../../../../src/lib/rate-limit';
import { getEcpayRuntimeConfig } from '../../../../../../src/config/ecpay-runtime-env.mjs';
import { handleRouteError } from '../../../../../../src/lib/route-error';

const ECPAY_ENDPOINTS = {
  sandbox: 'https://payment-stage.ecpay.com.tw/Cashier/AioCheckOut/V5',
  production: 'https://payment.ecpay.com.tw/Cashier/AioCheckOut/V5',
};

function formatDate(date: Date): string {
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

/** V2-only payment boundary: only a committed checkout aggregate may open ECPay. */
export async function POST(request: Request) {
  const rateLimitResponse = createRateLimitResponse(limiters.orders.check(RateLimiter.getClientIp(request)));
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const body = await request.json().catch(() => ({}));
    const orderId = String(body?.orderId || '').trim();
    if (!orderId) return jsonError('INVALID_REQUEST', 'orderId is required', 400);

    const order = await getMaterializedOrderDetailForPayment(orderId);
    if (!order) return jsonError('NOT_FOUND', 'Order not found', 404);
    if (!isMaterializedOrderReadyForPayment(order)) {
      return jsonError('ORDER_NOT_MATERIALIZED', 'Order is not ready for payment', 409);
    }
    const confirmation = canCheckoutTravelerConfirmation({
      sourceInquiryId: order.sourceInquiryId,
      travelerConfirmationStatus: order.travelerConfirmationStatus,
    });
    if (!confirmation.allowed) return jsonError(confirmation.code, confirmation.messageZh, 409);

    const { hashKey, hashIV } = getECPayCredentials();
    const config = getEcpayRuntimeConfig();
    if (!config.merchantId) return jsonError('CONFIG_ERROR', 'ECPAY_MERCHANT_ID is not configured', 500);
    const generatedMerchantTradeNo = `${orderId.replace(/-/g, '').slice(0, 12)}${Date.now().toString().slice(-8)}`;
    const paymentAttempt = await upsertEcpayPaymentAttemptDb({
      orderId, merchantTradeNo: generatedMerchantTradeNo, amountTwd: Number(order.totalTwd),
    });
    const params = buildEcpayCheckoutParams({
      merchantId: config.merchantId, merchantTradeNo: paymentAttempt.merchantTradeNo, tradeDate: formatDate(new Date()),
      totalTwd: order.totalTwd, title: order.title,
      callbackUrl: config.callbackUrl,
      returnUrl: `${config.siteBaseUrl}/order/success?orderId=${orderId}`,
      orderId, contactEmail: order.contactEmail,
    });
    return jsonOk({
      endpoint: ECPAY_ENDPOINTS[config.environment as keyof typeof ECPAY_ENDPOINTS] || ECPAY_ENDPOINTS.sandbox,
      params: { ...params, CheckMacValue: generateCheckMacValue(params, hashKey, hashIV) },
      orderId, merchantTradeNo: paymentAttempt.merchantTradeNo,
    });
  } catch (err) {
    return handleRouteError(err, { route: 'v2/payments/ecpay/create' });
  }
}
