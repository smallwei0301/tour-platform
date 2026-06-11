/**
 * DELETE /api/me/orders/[orderId]/reschedule-requests/[requestId] — 撤回改期申請（#1383）
 */
import { ok, fail } from '../../../../../../../src/lib/api';
import { createClient } from '../../../../../../../src/lib/supabase/server';
import { withdrawRescheduleRequestDb } from '../../../../../../../src/lib/db.mjs';
import { rescheduleErrorToResponseParts } from '../../../../../../../src/lib/reschedule.mjs';

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ orderId: string; requestId: string }> }
) {
  const { requestId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) {
    return Response.json(fail('UNAUTHORIZED', 'login required'), { status: 401 });
  }

  try {
    const result = await withdrawRescheduleRequestDb({ requestId, contactEmail: user.email });
    return Response.json(ok(result));
  } catch (error) {
    const parts = rescheduleErrorToResponseParts(error);
    return Response.json(fail(parts.code, parts.message), { status: parts.status });
  }
}
