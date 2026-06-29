/**
 * POST /api/internal/bookings/unpaid-expiry-sweep — #1493
 *
 * Internal cron sweep：將已過付款期限（payment_deadline_at）仍未付款的訂單自動取消，
 * 釋出該時段／場次容量。逐筆走 fn_expire_unpaid_order_atomic（冪等、鎖序與付款 callback 一致）。
 *
 * Auth：x-internal-token header 必須等於 INTERNAL_ALERT_TOKEN（缺/不符回 401）。
 * 可重入、可重跑：已付款／已取消／未到期者一律 noop。
 */
import { NextRequest, NextResponse } from 'next/server';
import { expireUnpaidOrdersDb } from '../../../../../src/lib/db.mjs';

function isAuthorized(req: NextRequest): boolean {
  const token = req.headers.get('x-internal-token');
  const expected = process.env.INTERNAL_ALERT_TOKEN;
  if (!token || !expected) return false;
  return token === expected;
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let limit = 200;
  try {
    const body = await req.json();
    if (body && Number.isInteger(body.limit) && body.limit > 0) limit = Math.min(body.limit, 1000);
  } catch {
    // empty/invalid body → use default limit
  }

  try {
    const now = new Date().toISOString();
    const result = await expireUnpaidOrdersDb({ now, limit });
    return NextResponse.json({
      ok: true,
      scanned: result.scanned,
      expired: result.expired,
      sweep_time: now,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    console.error('[unpaid-expiry-sweep] error:', message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
