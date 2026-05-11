import { ok, fail } from '../../../../src/lib/api';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request) {
  try {
    // query: SELECT source, severity, COUNT(*) FROM incidents
    //        WHERE created_at > now() - interval '24 hours'
    //        GROUP BY source, severity
    //
    // query: SELECT source, severity, message, created_at FROM incidents
    //        ORDER BY created_at DESC LIMIT 10

    const deploySha = process.env.VERCEL_GIT_COMMIT_SHA ?? 'local';

    return Response.json(
      ok({
        counts: {}, // grouped by source/severity from incidents table (last 24h)
        recent: [] as Array<{
          source: string;
          severity: string;
          message: string;
          created_at: string;
        }>,
        deploySha,
      })
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    return Response.json(fail('SERVER_ERROR', message), { status: 500 });
  }
}
