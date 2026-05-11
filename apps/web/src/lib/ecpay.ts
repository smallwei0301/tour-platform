import crypto from 'crypto';

/**
 * ECPay CheckMacValue verification
 * Phase 10 — Tour Platform
 *
 * Reference: https://payment.ecpay.com.tw/Integration/QueryAPIInfo/2
 */

function urlEncodeForECPay(str: string): string {
  return encodeURIComponent(str)
    .replace(/%20/g, '+')
    .replace(/!/g, '%21')
    .replace(/'/g, '%27')
    .replace(/\(/g, '%28')
    .replace(/\)/g, '%29')
    .replace(/\*/g, '%2A');
}

/**
 * Generate CheckMacValue for ECPay
 *
 * Steps:
 * 1. Remove CheckMacValue from params
 * 2. Sort params alphabetically
 * 3. Build query string: key1=value1&key2=value2...
 * 4. Build raw string: HashKey=XXX&queryString&HashIV=XXX
 * 5. URL encode (with ECPay-specific rules)
 * 6. Lowercase
 * 7. SHA256 hash
 * 8. Uppercase
 */
export function generateCheckMacValue(
  params: Record<string, any>,
  hashKey: string,
  hashIV: string
): string {
  const cleanParams = { ...params };
  delete cleanParams.CheckMacValue;

  const sortedKeys = Object.keys(cleanParams).sort();
  const paramStr = sortedKeys
    .map((key) => `${key}=${cleanParams[key]}`)
    .join('&');

  const rawString = `HashKey=${hashKey}&${paramStr}&HashIV=${hashIV}`;
  const encodedString = urlEncodeForECPay(rawString);
  const lowerCaseString = encodedString.toLowerCase();
  const hash = crypto
    .createHash('sha256')
    .update(lowerCaseString)
    .digest('hex');

  return hash.toUpperCase();
}

/**
 * Verify CheckMacValue from ECPay callback
 */
export function verifyCheckMacValue(
  params: Record<string, any>,
  hashKey: string,
  hashIV: string
): boolean {
  const receivedMac = params.CheckMacValue;
  if (!receivedMac) {
    return false;
  }

  const computedMac = generateCheckMacValue(params, hashKey, hashIV);
  return computedMac === receivedMac;
}

/**
 * Get ECPay credentials from env
 */
export function getECPayCredentials() {
  const hashKey = process.env.ECPAY_HASH_KEY;
  const hashIV = process.env.ECPAY_HASH_IV;

  if (!hashKey || !hashIV) {
    throw new Error(
      'ECPAY_HASH_KEY and ECPAY_HASH_IV must be set in environment'
    );
  }

  return { hashKey, hashIV };
}

/**
 * ECPay DoAction URL — used for AllRefund (Action=R)
 * Reference: https://payment.ecpay.com.tw/Cashier/DoAction
 */
const ECPAY_DO_ACTION_URL =
  process.env.ECPAY_ENV === 'production'
    ? 'https://payment.ecpay.com.tw/Cashier/DoAction'
    : 'https://payment-stage.ecpay.com.tw/Cashier/DoAction';

export interface AllRefundParams {
  merchantTradeNo: string;
  tradeNo: string;
  totalAmount: number;
  reason?: string;
}

export interface AllRefundResult {
  ok: boolean;
  rtnCode: string;
  rtnMsg: string;
}

/**
 * Request full refund (AllRefund) via ECPay DoAction API
 *
 * Sends Action=R to trigger a full refund for the given trade.
 * Returns parsed {ok, rtnCode, rtnMsg} — ok is true only when RtnCode === '1'.
 *
 * CONTRACT TESTS ONLY — do NOT make real ECPay API calls in tests.
 */
export async function requestAllRefund(
  params: AllRefundParams
): Promise<AllRefundResult> {
  const merchantId = process.env.ECPAY_MERCHANT_ID ?? '';
  const hashKey = process.env.ECPAY_HASH_KEY ?? '';
  const hashIV = process.env.ECPAY_HASH_IV ?? '';

  const payload: Record<string, string> = {
    MerchantID: merchantId,
    MerchantTradeNo: params.merchantTradeNo,
    TradeNo: params.tradeNo,
    Action: 'R', // R = Refund (AllRefund)
    TotalAmount: String(params.totalAmount),
  };

  const checkMacValue = generateCheckMacValue(payload, hashKey, hashIV);
  payload.CheckMacValue = checkMacValue;

  const body = new URLSearchParams(payload).toString();
  const res = await fetch(ECPAY_DO_ACTION_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  const text = await res.text();
  // ECPay DoAction returns: RtnCode=1&RtnMsg=Succeeded (or error code)
  const parsed = Object.fromEntries(new URLSearchParams(text));
  return {
    ok: parsed.RtnCode === '1',
    rtnCode: parsed.RtnCode ?? '',
    rtnMsg: parsed.RtnMsg ?? '',
  };
}
