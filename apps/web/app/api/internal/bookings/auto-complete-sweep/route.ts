/**
 * POST /api/internal/bookings/auto-complete-sweep — #1554
 *
 * Internal cron sweep：出團開始時間已過寬限期（預設 48h）仍停在 confirmed 的
 * 訂單自動轉 completed，讓 settlement sweep 與評論邀請不再依賴人工按「完成」。
 * 停滯訂單（超過寬限期×2 仍 confirmed、或無時間來源的老單）走 recordIncident
 * 告警通知營運（訊息不含 PII，只帶 orderId）。
 *
 * 三道防線定位（健檢 v2 P0-1）：掃碼核銷（未來，最佳）→ 本 sweep（兜底）
 * → 停滯告警（保險）→ admin 手動（終極）。
 *
 * Auth：x-internal-token header 必須等於 INTERNAL_ALERT_TOKEN（缺/不符回 401）。
 * 可重入、可重跑：compare-and-swap 更新，已完成者一律 noop。
 */
import { NextRequest, NextResponse } from 'next/server';
import { autoCompleteConfirmedOrdersDb } from '../../../../../src/lib/db-auto-complete.mjs';
import { recordIncident } from '../../../../../src/lib/incidents';

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
  let graceHours: number | undefined;
  try {
    const body = await req.json();
    if (body && Number.isInteger(body.limit) && body.limit > 0) limit = Math.min(body.limit, 1000);
    if (body && Number.isFinite(body.graceHours) && body.graceHours > 0) graceHours = body.graceHours;
  } catch {
    // empty/invalid body → use defaults
  }

  try {
    const now = new Date().toISOString();
    const result = await autoCompleteConfirmedOrdersDb({ now, limit, graceHours });

    // 漏單對帳告警：sweep 消化不了的停滯 confirmed 單需要人看（fire-and-forget）
    if (result.stalled.length > 0) {
      void recordIncident({
        severity: 'warn',
        source: 'auto-complete-sweep',
        category: 'booking',
        message: `#1554 停滯 confirmed 訂單 ${result.stalled.length} 筆無法自動完成，需人工確認`,
        metadata: {
          stalledOrderIds: result.stalled.map((s: { orderId: string }) => s.orderId),
          reasons: result.stalled.map((s: { reason: string }) => s.reason),
          sweepTime: now,
        },
      });
    }

    return NextResponse.json({
      ok: true,
      scanned: result.scanned,
      completed: result.completed,
      stalled: result.stalled.length,
      sweep_time: now,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    console.error('[auto-complete-sweep] error:', message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
