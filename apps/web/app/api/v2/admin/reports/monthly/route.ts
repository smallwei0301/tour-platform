/**
 * GET /api/v2/admin/reports/monthly?month=YYYY-MM
 * #1637 管理者每月會計報帳報表（JSON）。
 * Auth：middleware 對 /api/v2/admin/** 做 admin token 驗證，此處不重複。
 * 讀取 payouts/payments/payout_items 等 service-role-only 表，由 service 層用 service client。
 */
import { jsonOk, jsonError } from '../../../../../../src/lib/api-response';
import { handleRouteError } from '../../../../../../src/lib/route-error';
import { isValidReportMonth } from '../../../../../../src/lib/accounting/report.mjs';
import { getMonthlyAccountingReport } from '../../../../../../src/lib/accounting/report-service.mjs';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const month = url.searchParams.get('month') ?? '';
  if (!isValidReportMonth(month)) {
    return jsonError('INVALID_PARAM', 'month must be YYYY-MM', 400);
  }
  try {
    const report = await getMonthlyAccountingReport(month);
    return jsonOk(report);
  } catch (err) {
    return handleRouteError(err, {
      route: 'v2/admin/reports/monthly',
      category: 'accounting_report',
      metadata: { month },
    });
  }
}
