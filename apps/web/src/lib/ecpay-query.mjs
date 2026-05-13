/**
 * ECPay QueryTradeInfo helper (pure JS, no TS deps — safe for cron scripts)
 * Issue #479 — refund reconciliation cron job
 *
 * Reference: https://payment.ecpay.com.tw/Cashier/QueryTradeInfo/V5
 */
import crypto from 'crypto';

const QUERY_TRADE_URL_PROD = 'https://payment.ecpay.com.tw/Cashier/QueryTradeInfo/V5';
const QUERY_TRADE_URL_SANDBOX = 'https://payment-stage.ecpay.com.tw/Cashier/QueryTradeInfo/V5';

/**
 * URL-encode following ECPay-specific rules (mirrors ecpay.ts)
 * @param {string} str
 * @returns {string}
 */
function urlEncodeForECPay(str) {
  return encodeURIComponent(str)
    .replace(/%20/g, '+')
    .replace(/!/g, '%21')
    .replace(/'/g, '%27')
    .replace(/\(/g, '%28')
    .replace(/\)/g, '%29')
    .replace(/\*/g, '%2A');
}

/**
 * Generate CheckMacValue (SHA256, same algorithm as ecpay.ts)
 * @param {Record<string, string|number>} params
 * @param {string} hashKey
 * @param {string} hashIV
 * @returns {string}
 */
function generateCheckMacValue(params, hashKey, hashIV) {
  const cleanParams = { ...params };
  delete cleanParams.CheckMacValue;

  const sortedKeys = Object.keys(cleanParams).sort();
  const paramStr = sortedKeys.map((k) => `${k}=${cleanParams[k]}`).join('&');

  const rawString = `HashKey=${hashKey}&${paramStr}&HashIV=${hashIV}`;
  const encodedString = urlEncodeForECPay(rawString);
  const lowerCaseString = encodedString.toLowerCase();
  const hash = crypto.createHash('sha256').update(lowerCaseString).digest('hex');
  return hash.toUpperCase();
}

/**
 * Query ECPay for trade status using QueryTradeInfo V5.
 *
 * @param {{
 *   merchantTradeNo: string,
 *   merchantId: string,
 *   hashKey: string,
 *   hashIV: string,
 *   isSandbox?: boolean,
 * }} opts
 * @returns {Promise<{
 *   ok: boolean,
 *   rtnCode: string,
 *   tradeStatus: string,
 *   tradeAmt: string,
 *   tradeNo: string,
 *   raw: Record<string, string>,
 * }>}
 */
export async function queryTradeInfo({ merchantTradeNo, merchantId, hashKey, hashIV, isSandbox = false }) {
  const timeStamp = String(Math.floor(Date.now() / 1000));

  const params = {
    MerchantID: merchantId,
    MerchantTradeNo: merchantTradeNo,
    TimeStamp: timeStamp,
  };
  params.CheckMacValue = generateCheckMacValue(params, hashKey, hashIV);

  const url = isSandbox ? QUERY_TRADE_URL_SANDBOX : QUERY_TRADE_URL_PROD;

  const body = new URLSearchParams(params).toString();
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  if (!response.ok) {
    return {
      ok: false,
      rtnCode: '',
      tradeStatus: '',
      tradeAmt: '',
      tradeNo: '',
      raw: {},
    };
  }

  const text = await response.text();

  // Parse URL-encoded response
  const raw = Object.fromEntries(new URLSearchParams(text).entries());

  return {
    ok: true,
    rtnCode: raw.RtnCode ?? '',
    tradeStatus: raw.TradeStatus ?? '',
    tradeAmt: raw.TradeAmt ?? '',
    tradeNo: raw.TradeNo ?? '',
    raw,
  };
}
