/**
 * /api/v2/guide/bookings/[bookingId]/approval — #1649 Phase 4 v2 命名空間接線。
 *
 * 單一實作策略（strangler）：委派 legacy handler，零行為漂移；auth 由 handler 內
 * verifyGuideSession 把關。middleware CSRF 不涵蓋 /api/v2/guide/**，故寫入方法
 * 在殼內顯式 validateCsrf（與 legacy 路徑經 middleware 的保護等價）。
 * legacy 路徑退役（Phase 6）時實作整體搬遷至此。
 */
import { validateCsrf } from '../../../../../../../src/lib/csrf.mjs';
import { POST as legacyPOST } from '../../../../../guide/bookings/[bookingId]/approval/route';

export async function POST(request: Request, context: { params: Promise<{ bookingId: string }> }) {
  const csrfError = validateCsrf(request);
  if (csrfError) return csrfError;
  return legacyPOST(request, context);
}
