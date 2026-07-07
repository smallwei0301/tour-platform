/**
 * POST /api/v2/payments/ecpay/create — #1649 Phase 5（非凍結部分）v2 命名空間接線。
 *
 * 單一實作策略（strangler）：re-export legacy handler（`app/api/payments/ecpay/create`
 * 屬凍結區，本檔只 import、不修改）。/order/pay 補付頁改打本路徑；
 * CustomField 已對齊 v2 canonical（src/lib/ecpay-create-orchestration.mjs）。
 * ECPay callback（ReturnURL）仍指向 legacy callback route——路徑切換屬部署協調
 * （issue #1649 Phase 5.1，owner 決策），不在本檔範圍。
 */
export { POST } from '../../../../payments/ecpay/create/route';
