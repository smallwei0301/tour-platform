import { ok, fail } from '../../../../src/lib/api';
import { listExternalHoldsDb } from '../../../../src/lib/db.mjs';

// GET /api/admin/external-holds — 列出目前所有外部佔位（external_hold，非營收）。
// admin 權限由 middleware（isAdminAuthorized）於 /api/admin/* 統一守門。
export async function GET() {
  try {
    return Response.json(ok(await listExternalHoldsDb()));
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    return Response.json(fail('SERVER_ERROR', message), { status: 500 });
  }
}
