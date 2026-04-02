import { ok, fail } from '../../../../../../src/lib/api';
import { updateGuideApplicationStatusDb } from '../../../../../../src/lib/db.mjs';

export async function POST(request: Request, context: { params: Promise<{ guideId: string }> }) {
  const { guideId } = await context.params;
  const body = await request.json().catch(() => ({}));
  try {
    return Response.json(ok(await updateGuideApplicationStatusDb({ applicationId: guideId, action: 'suspend', adminNote: body?.adminNote })));
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    return Response.json(fail('INVALID_REQUEST', message), { status: 400 });
  }
}
