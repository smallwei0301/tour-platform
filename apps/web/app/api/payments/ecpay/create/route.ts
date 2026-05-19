import { fail, ok } from '../../../../../src/lib/api';
import { getOrderDetailForPayment, upsertEcpayPaymentAttemptDb } from '../../../../../src/lib/db.mjs';
import { generateCheckMacValue, getECPayCredentials } from '../../../../../src/lib/ecpay';
import { limiters, RateLimiter, createRateLimitResponse } from '../../../../../src/lib/rate-limit';

/**
 * ECPay 正式付款建立 API
 * Phase 10 — Tour Platform
 *
 * 生成 ECPay 付款表單所需的參數和 CheckMacValue
 * 前端收到後會自動 submit 表單跳轉到 ECPay 付款頁面
 */

// ECPay 環境配置
const ECPAY_ENDPOINTS = {
  sandbox: 'https://payment-stage.ecpay.com.tw/Cashier/AioCheckOut/V5',
  production: 'https://payment.ecpay.com.tw/Cashier/AioCheckOut/V5',
};

function getECPayEndpoint(): string {
  const env = process.env.ECPAY_ENV || 'sandbox';
  return ECPAY_ENDPOINTS[env as keyof typeof ECPAY_ENDPOINTS] || ECPAY_ENDPOINTS.sandbox;
}

function formatDate(date: Date): string {
  // ECPay 要求格式: yyyy/MM/dd HH:mm:ss
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

export async function POST(request: Request) {
  // Rate Limiting
  const clientIp = RateLimiter.getClientIp(request);
  const result = limiters.orders.check(clientIp);

  const rateLimitResponse = createRateLimitResponse(result);
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  try {
    const body = await request.json().catch(() => ({}));
    const orderId = String(body?.orderId || '').trim();

    if (!orderId) {
      return Response.json(fail('INVALID_REQUEST', 'orderId is required'), { status: 400 });
    }

    // 取得訂單詳情
    const order = await getOrderDetailForPayment({ orderId });

    if (!order) {
      return Response.json(fail('NOT_FOUND', 'Order not found'), { status: 404 });
    }

    if (order.status !== 'pending_payment') {
      return Response.json(
        fail('INVALID_STATE', `Order is not pending payment (current: ${order.status})`),
        { status: 400 }
      );
    }

    // 取得 ECPay 憑證
    const { hashKey, hashIV } = getECPayCredentials();
    const merchantId = process.env.ECPAY_MERCHANT_ID;

    if (!merchantId) {
      return Response.json(
        fail('CONFIG_ERROR', 'ECPAY_MERCHANT_ID is not configured'),
        { status: 500 }
      );
    }

    // 構建 ECPay 付款參數
    const callbackUrl = process.env.ECPAY_CALLBACK_URL || `${process.env.NEXT_PUBLIC_SITE_URL}/api/payments/ecpay/callback`;
    const returnUrl = `${process.env.NEXT_PUBLIC_SITE_URL}/order/success?orderId=${orderId}`;

    const now = new Date();
    const tradeDate = formatDate(now);

    // MerchantTradeNo 必須是唯一的，使用 orderId + timestamp
    const merchantTradeNo = `${orderId.replace(/-/g, '').slice(0, 12)}${Date.now().toString().slice(-8)}`;

    const ecpayParams: Record<string, string> = {
      MerchantID: merchantId,
      MerchantTradeNo: merchantTradeNo,
      MerchantTradeDate: tradeDate,
      PaymentType: 'aio',
      TotalAmount: String(order.totalTwd),
      TradeDesc: encodeURIComponent('Tour Platform 行程預訂'),
      ItemName: order.title || '行程預訂',
      ReturnURL: callbackUrl,
      ClientBackURL: returnUrl,
      ChoosePayment: 'ALL',
      EncryptType: '1', // SHA256
      // 訂單關聯資訊
      CustomField2: orderId,
      CustomField4: order.contactEmail || '',
    };

    await upsertEcpayPaymentAttemptDb({
      orderId,
      merchantTradeNo,
      amountTwd: Number(order.totalTwd || 0),
    });

    // 生成 CheckMacValue
    const checkMacValue = generateCheckMacValue(ecpayParams, hashKey, hashIV);

    return Response.json(
      ok({
        endpoint: getECPayEndpoint(),
        params: {
          ...ecpayParams,
          CheckMacValue: checkMacValue,
        },
        orderId,
        merchantTradeNo,
      })
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    console.error('[ecpay/create] Error:', message);
    return Response.json(fail('SERVER_ERROR', message), { status: 500 });
  }
}
