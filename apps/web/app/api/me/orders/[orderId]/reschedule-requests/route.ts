/**
 * POST /api/me/orders/[orderId]/reschedule-requests — 申請改期（#1383）
 * CSRF 由 middleware 涵蓋 /api/me/**；requestId 冪等；政策時限/資格由
 * reschedule.mjs 純規則把關。通知信 best-effort，不阻斷主流程。
 */
import { ok, fail } from '../../../../../../src/lib/api';
import { createClient } from '../../../../../../src/lib/supabase/server';
import { createRescheduleRequestDb } from '../../../../../../src/lib/db.mjs';
import { rescheduleErrorToResponseParts } from '../../../../../../src/lib/reschedule.mjs';
import { notifyRescheduleRequested } from '../../../../../../src/lib/reschedule-notify';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ orderId: string }> }
) {
  const { orderId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) {
    return Response.json(fail('UNAUTHORIZED', 'login required'), { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const requestId = String(body?.requestId || '').trim();
  const toScheduleId = String(body?.toScheduleId || '').trim();
  if (!requestId || !toScheduleId) {
    return Response.json(fail('BAD_REQUEST', 'requestId 與 toScheduleId 為必填'), { status: 400 });
  }

  try {
    const result = await createRescheduleRequestDb({
      orderId,
      requestId,
      toScheduleId,
      contactEmail: user.email,
    });

    // 通知嚮導（best-effort：寄送失敗不影響申請成立）
    void notifyRescheduleRequested(result).catch(() => {});

    return Response.json(ok(result), { status: 201 });
  } catch (error) {
    const parts = rescheduleErrorToResponseParts(error);
    return Response.json(fail(parts.code, parts.message), { status: parts.status });
  }
}
