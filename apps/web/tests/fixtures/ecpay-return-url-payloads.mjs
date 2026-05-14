export function ecpayReturnUrlPayload(overrides = {}) {
  return {
    MerchantID: '2000132',
    MerchantTradeNo: 'TPQA202605140001',
    StoreID: '',
    RtnCode: '1',
    RtnMsg: 'Succeeded',
    TradeNo: '2605141234567890',
    TradeAmt: '30',
    PaymentDate: '2026/05/14 07:30:00',
    PaymentType: 'Credit_CreditCard',
    PaymentTypeChargeFee: '1',
    TradeDate: '2026/05/14 07:29:00',
    SimulatePaid: '0',
    CheckMacValue: 'TEST_CHECK_MAC_VALUE',
    ...overrides,
  };
}

export function ecpaySimulatePaidReturnUrlPayload(overrides = {}) {
  return ecpayReturnUrlPayload({
    SimulatePaid: '1',
    RtnMsg: '模擬付款成功',
    ...overrides,
  });
}
