import { ok, fail } from '../../../../../src/lib/api';
import { getSettlementRulesDb, updateSettlementRulesDb, getSupabase } from '../../../../../src/lib/db.mjs';

export async function GET() {
  try {
    const supabase = await getSupabase();
    const data = await getSettlementRulesDb(supabase);
    if (!data) return Response.json(fail('NOT_FOUND', 'no active settlement rule'), { status: 404 });
    return Response.json(ok(data));
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    return Response.json(fail('SERVER_ERROR', message), { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const body = await request.json().catch(() => ({}));
  try {
    const supabase = await getSupabase();
    const {
      commission_rate,
      t_days,
      min_withdrawal_twd,
      fee_absorbed_by,
      notes,
      version,
      created_by,
    } = body;

    const patch = {
      commission_rate,
      t_days,
      min_withdrawal_twd,
      fee_absorbed_by,
      notes,
      version: version ?? 'v1',
    };

    const data = await updateSettlementRulesDb(supabase, patch, created_by ?? 'admin');
    return Response.json(ok(data));
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    return Response.json(fail('INVALID_REQUEST', message), { status: 400 });
  }
}
