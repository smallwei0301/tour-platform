import { ok, fail } from '../../../src/lib/api';
import { createGuideApplicationDb, listGuideApplicationsDb } from '../../../src/lib/db.mjs';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const status = url.searchParams.get('status') || '';
  try {
    return Response.json(ok(await listGuideApplicationsDb({ status })));
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    return Response.json(fail('SERVER_ERROR', message), { status: 500 });
  }
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  try {
    // 個人照片為申請必要項（審核者與旅客都會看到）；封面/活動照片選填。
    const profilePhotoUrl = String((body as Record<string, unknown>)?.profilePhotoUrl || '').trim();
    if (!profilePhotoUrl) {
      return Response.json(
        fail('INVALID_REQUEST', 'profilePhotoUrl is required（請先上傳個人照片）'),
        { status: 400 },
      );
    }
    return Response.json(ok(await createGuideApplicationDb(body)));
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    const status = message.includes('required') ? 400 : 500;
    return Response.json(fail('INVALID_REQUEST', message), { status });
  }
}
