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
    TradeDesc: encodeURIComponent('Tour Platform 行程預訂'),
    ItemName: input?.title || '行程預訂',
    ReturnURL: String(input?.callbackUrl || ''),
    ClientBackURL: String(input?.returnUrl || ''),
    ChoosePayment: 'ALL',
    EncryptType: '1',
    CustomField2: orderId,
    CustomField4: String(input?.contactEmail || ''),
  };
}
