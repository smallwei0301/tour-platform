import crypto from 'crypto';

const ECPAY_QUERY_TRADE_INFO_URL =
  process.env.ECPAY_ENV === 'production'
    ? 'https://payment.ecpay.com.tw/Cashier/QueryTradeInfo/V5'
    : 'https://payment-stage.ecpay.com.tw/Cashier/QueryTradeInfo/V5';

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
 * Get ECPay merchant id from env.
 */
export function getECPayMerchantId() {
  const merchantId = process.env.ECPAY_MERCHANT_ID;

  if (!merchantId) {
    throw new Error('ECPAY_MERCHANT_ID must be set in environment');
  }

  return merchantId;
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
  ecpayTradeNo: string | null;
}

function getFirstNonEmpty(values: Array<string | undefined>): string | null {
  for (const value of values) {
    if (typeof value === 'string' && value.trim() !== '') {
      return value;
    }
  }

  return null;
}

function extractEcpayTradeNo(parsed: Record<string, string>): string | null {
  return getFirstNonEmpty([
    parsed.RefundTradeNo,
    parsed.RefundNo,
    parsed.RefundTradeNo2,
    parsed.OriginalTradeNo,
    parsed.RtnTradeNo,
    parsed.TradeNo,
    parsed.ECPayTradeNo,
  ]);
}

function getResponseField(parsed: Record<string, string>, key: 'RtnCode' | 'RtnMsg'): string | null {
  const value = parsed[key];
  if (!value || typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parseResponseText(text: string): {
  rtnCode: string;
  rtnMsg: string;
  ecpayTradeNo: string | null;
} {
  const parsed = Object.fromEntries(new URLSearchParams(text));

  const rtnCode = getResponseField(parsed, 'RtnCode') || '';
  const rtnMsg = getResponseField(parsed, 'RtnMsg') || '';
  const ecpayTradeNo = extractEcpayTradeNo(parsed);

  return { rtnCode, rtnMsg, ecpayTradeNo };
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
  const merchantId = getECPayMerchantId();
  const { hashKey, hashIV } = getECPayCredentials();

  const payload: Record<string, string> = {
    MerchantID: merchantId,
    MerchantTradeNo: params.merchantTradeNo,
    TradeNo: params.tradeNo,
    Action: 'R', // R = Refund (AllRefund)
    TotalAmount: String(params.totalAmount),
    ...('reason' in params && params.reason ? {Remark: params.reason} : {}),
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
  const parsed = parseResponseText(text);
  return {
    ok: parsed.rtnCode === '1',
    rtnCode: parsed.rtnCode,
    rtnMsg: parsed.rtnMsg,
    ecpayTradeNo: parsed.ecpayTradeNo,
  };
}


export interface QueryTradeInfoParams {
  merchantTradeNo: string;
}

export interface QueryTradeInfoResult {
  ok: boolean;
  rtnCode: string;
  rtnMsg: string;
  tradeStatus: string;
  tradeNo: string;
  raw: Record<string, string>;
  sanitized: Record<string, string | null>;
}

function sanitizeProviderText(value: unknown, max = 128): string | null {
  if (value === null || value === undefined) return null;
  const normalized = String(value).replace(/[\r\n\t]+/g, ' ').trim();
  if (!normalized) return null;
  return normalized.slice(0, max);
}

function sanitizeQueryTradeInfoPayload(payload: Record<string, string>) {
  return {
    MerchantTradeNo: sanitizeProviderText(payload.MerchantTradeNo, 64),
    TradeNo: sanitizeProviderText(payload.TradeNo, 64),
    TradeAmt: sanitizeProviderText(payload.TradeAmt, 32),
    PaymentType: sanitizeProviderText(payload.PaymentType, 64),
    TradeStatus: sanitizeProviderText(payload.TradeStatus, 16),
    RtnCode: sanitizeProviderText(payload.RtnCode, 32),
    RtnMsg: sanitizeProviderText(payload.RtnMsg, 128),
    PaymentDate: sanitizeProviderText(payload.PaymentDate, 64),
    ProcessDate: sanitizeProviderText(payload.ProcessDate, 64),
  };
}

export async function queryEcpayTradeInfo(
  params: QueryTradeInfoParams
): Promise<QueryTradeInfoResult> {
  const merchantTradeNo = String(params?.merchantTradeNo || '').trim();
  if (!merchantTradeNo) {
    throw new Error('merchantTradeNo is required');
  }

  const merchantId = getECPayMerchantId();
  const { hashKey, hashIV } = getECPayCredentials();

  const requestPayload: Record<string, string> = {
    MerchantID: merchantId,
    MerchantTradeNo: merchantTradeNo,
    TimeStamp: String(Math.floor(Date.now() / 1000)),
  };
  requestPayload.CheckMacValue = generateCheckMacValue(requestPayload, hashKey, hashIV);

  const body = new URLSearchParams(requestPayload).toString();
  const response = await fetch(ECPAY_QUERY_TRADE_INFO_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  if (!response.ok) {
    return {
      ok: false,
      rtnCode: '',
      rtnMsg: `http_${response.status}`,
      tradeStatus: '',
      tradeNo: '',
      raw: {},
      sanitized: {},
    };
  }

  const text = await response.text();
  const raw = Object.fromEntries(new URLSearchParams(text));
  const sanitized = sanitizeQueryTradeInfoPayload(raw);
  return {
    ok: String(raw.RtnCode || '').trim() === '1',
    rtnCode: String(raw.RtnCode || '').trim(),
    rtnMsg: String(raw.RtnMsg || '').trim(),
    tradeStatus: String(raw.TradeStatus || '').trim(),
    tradeNo: String(raw.TradeNo || '').trim(),
    raw,
    sanitized,
  };
}
