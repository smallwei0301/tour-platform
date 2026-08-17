import { getSiteBaseUrl } from './env.ts';

export function getEcpayRuntimeConfig() {
  return {
    merchantId: process.env.ECPAY_MERCHANT_ID || '',
    environment: process.env.ECPAY_ENV || 'sandbox',
    callbackUrl: process.env.ECPAY_CALLBACK_URL || `${getSiteBaseUrl()}/api/payments/ecpay/callback`,
    siteBaseUrl: getSiteBaseUrl(),
  };
}
