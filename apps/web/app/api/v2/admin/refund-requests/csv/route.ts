/**
 * #1649 Phase 6：實作自 legacy 路徑（app/api/admin/refund-requests/csv）整體搬遷至 v2 命名空間。
 * legacy 路徑已退役刪除；行為與測試契約以本檔為準。
 */
import { reportRouteError } from '../../../../../../src/lib/route-error';
import { refundRequestsCsvDb } from '../../../../../../src/lib/db.mjs';

export async function GET() {
  try {
    const csv = await refundRequestsCsvDb();
    return new Response(csv, {
      status: 200,
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename="refund-records-${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  } catch (err) {
    // #1598：未預期例外上報（fire-and-forget，不改變回應行為）。
    void reportRouteError(err, { route: 'v2/admin/refund-requests/csv' });
    const message = err instanceof Error ? err.message : 'unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    });
  }
}
