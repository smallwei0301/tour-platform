/**
 * POST /api/v2/payments/ecpay/callback — #1649 Phase 5.1（契約 §4.1 既定端點）。
 *
 * 單一實作策略（strangler）：re-export legacy callback handler
 * （`app/api/payments/ecpay/callback` 屬凍結區，本檔只 import、不修改）。
 * 冪等三防線（RPC replay／payment_events unique／status_logs WHERE NOT EXISTS）、
 * CheckMacValue 驗簽、TradeAmt 金額比對、`1|OK` ack 全數由同一 handler 持有——
 * v2 與 legacy 路徑對同一 payload 行為等價 by construction。
 *
 * 切換策略：v2 checkout 的 ReturnURL 預設改指本路徑；`ECPAY_CALLBACK_URL` env
 * 覆寫維持有效（部署協調用）。legacy 路徑保留相容期（ECPay 站方設定與 in-flight
 * 交易的安全網），觀察窗後隨 Phase 6 另案退役。
 */
export { POST } from '../../../../payments/ecpay/callback/route';
