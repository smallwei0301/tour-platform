export const runtime = 'nodejs';

export async function GET() {
  return Response.json({ ok: true, ping: 'debug-get' });
}

export async function POST() {
  return Response.json({ ok: true, ping: 'debug-post' });
}
