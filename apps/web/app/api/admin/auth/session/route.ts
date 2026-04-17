export const runtime = 'nodejs';

export async function POST() {
  return Response.json({ ok: true, ping: 'auth-session-minimal' });
}
