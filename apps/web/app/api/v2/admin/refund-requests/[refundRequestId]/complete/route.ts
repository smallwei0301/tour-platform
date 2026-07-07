/**
 * /api/v2/admin/refund-requests/[refundRequestId]/complete — #1649 Phase 3 v2 命名空間接線。
 *
 * 單一實作策略（strangler）：直接 re-export legacy handler，零行為漂移——
 * auth/CSRF 由 middleware 對 /api/v2/admin/** 施加與 legacy 相同的規則，
 * envelope 與錯誤碼完全不變；legacy 路徑退役（Phase 6）時實作整體搬遷至此。
 */
export { POST } from '../../../../../admin/refund-requests/[refundRequestId]/complete/route';
