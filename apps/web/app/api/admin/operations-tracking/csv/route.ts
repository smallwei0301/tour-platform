import { operationsTrackingCsvDb } from '../../../../../src/lib/db.mjs';

export async function GET() {
  const csv = await operationsTrackingCsvDb();
  return new Response(csv, {
    status: 200,
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="operations-tracking-${new Date().toISOString().slice(0, 10)}.csv"`
    }
  });
}
