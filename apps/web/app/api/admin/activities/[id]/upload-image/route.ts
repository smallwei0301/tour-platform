import { ok, fail } from '../../../../../../src/lib/api';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const BUCKET = 'activity-images';

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const slug = (formData.get('slug') as string) || id;
    const type = (formData.get('type') as string) || 'cover'; // 'cover' | 'gallery'

    if (!file) return Response.json(fail('INVALID_REQUEST', 'file is required'), { status: 400 });

    const ext = file.type === 'image/webp' ? 'webp' : 'jpg';
    const filename = `${type}-${Date.now()}.${ext}`;
    const path = `activities/${slug}/${filename}`;

    const arrayBuffer = await file.arrayBuffer();
    const uploadRes = await fetch(
      `${SUPABASE_URL}/storage/v1/object/${BUCKET}/${path}`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
          'Content-Type': file.type || 'image/webp',
          'Cache-Control': 'max-age=31536000',
        },
        body: arrayBuffer,
      }
    );

    if (!uploadRes.ok) {
      const errText = await uploadRes.text();
      return Response.json(fail('UPLOAD_ERROR', errText), { status: 500 });
    }

    const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path}`;
    return Response.json(ok({ url: publicUrl, path, type }));
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    return Response.json(fail('SERVER_ERROR', message), { status: 500 });
  }
}
