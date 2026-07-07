/**
 * GET /api/v2/admin/reports/monthly/csv?month=YYYY-MM
 * #1637 管理者每月會計報帳報表（CSV 下載，UTF-8 BOM，Excel 直開）。
 * Auth：middleware 對 /api/v2/admin/** 做 admin token 驗證，此處不重複。
 * 成功路徑回 text/csv（非 JSON envelope）；錯誤路徑仍走 jsonError／handleRouteError。
 */
import { jsonError } from '../../../../../../../src/lib/api-response';
import { handleRouteError } from '../../../../../../../src/lib/route-error';
import { isValidReportMonth, renderMonthlyAccountingCsv } from '../../../../../../../src/lib/accounting/report.mjs';
import { getMonthlyAccountingReport } from '../../../../../../../src/lib/accounting/report-service.mjs';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const month = url.searchParams.get('month') ?? '';
  if (!isValidReportMonth(month)) {
    return jsonError('INVALID_PARAM', 'month must be YYYY-MM', 400);
  }
  try {
    const report = await getMonthlyAccountingReport(month);
    const csv = renderMonthlyAccountingCsv(report);
    return new Response(csv, {
      status: 200,
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename="midao-monthly-report-${month}.csv"`,
        'cache-control': 'no-store',
      },
    });
  } catch (err) {
    return handleRouteError(err, {
      route: 'v2/admin/reports/monthly/csv',
      category: 'accounting_report',
      metadata: { month },
    });
  }
}
