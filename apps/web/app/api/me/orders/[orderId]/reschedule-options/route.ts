/**
 * GET /api/me/orders/[orderId]/reschedule-options — 同活動可改期場次（#1383）
 * 身分驗證沿用訂單詳情 pattern（Supabase user email 或 guest contactEmail）。
 */
import { ok, fail } from '../../../../../../src/lib/api';
import { createClient } from '../../../../../../src/lib/supabase/server';
import { listRescheduleOptionsDb } from '../../../../../../src/lib/db.mjs';
import { rescheduleErrorToResponseParts } from '../../../../../../src/lib/reschedule.mjs';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ orderId: string }> }
) {
  const { orderId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const url = new URL(request.url);
  const contactEmail = user?.email || url.searchParams.get('contactEmail') || '';
  if (!contactEmail) {
    return Response.json(fail('UNAUTHORIZED', 'login required'), { status: 401 });
  }

  try {
    const options = await listRescheduleOptionsDb({ orderId, contactEmail });
    return Response.json(ok(options));
  } catch (error) {
    const parts = rescheduleErrorToResponseParts(error);
    return Response.json(fail(parts.code, parts.message), { status: parts.status });
  }
}
