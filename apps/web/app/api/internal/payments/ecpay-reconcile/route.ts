import { NextRequest, NextResponse } from 'next/server';
import { reconcileEcpayPendingPayments } from '../../../../../src/lib/payment-reconciliation';

function isAuthorized(req: NextRequest): boolean {
  const token = req.headers.get('x-internal-token');
  const expected = process.env.INTERNAL_ALERT_TOKEN;
  if (!token || !expected) return false;
  return token === expected;
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const limit = Number(body?.limit || 20);
    const results = await reconcileEcpayPendingPayments(limit);

    const summary = results.reduce(
      (acc, item) => {
        acc[item.outcome] = (acc[item.outcome] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );

    return NextResponse.json({
      ok: true,
      processed: results.length,
      summary,
      results,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown error';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
