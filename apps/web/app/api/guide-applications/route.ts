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
    // 照片（個人照／封面／活動照）全部選填：單頁流程改版後不再 gating，
    // 申請者可於通過審核、進入嚮導後台後再補上（欄位仍照原樣持久化）。
    // 必填驗證由 createGuideApplicationDb 收斂（fullName/phone/email/city/bio）。
    return Response.json(ok(await createGuideApplicationDb(body)));
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    const status = message.includes('required') ? 400 : 500;
    return Response.json(fail('INVALID_REQUEST', message), { status });
  }
}
