import { ok, fail } from '../../../../src/lib/api';
import { createClient } from '@supabase/supabase-js';
import { getSupabaseUrl, getSupabaseServiceRoleKey } from '../../../../src/config/supabase-service-env.mjs';

export const dynamic = 'force-dynamic';

function getSupabase() {
  const url = getSupabaseUrl();
  const key = getSupabaseServiceRoleKey();
  if (!url || !key) return null;
  return createClient(url, key);
}

export async function GET(_req: Request) {
  try {
    const deploySha = process.env.VERCEL_GIT_COMMIT_SHA ?? 'local';
    const supabase = getSupabase();

    let counts: Record<string, Record<string, number>> = {};
    let recent: Array<{ source: string; severity: string; message: string; created_at: string }> = [];

    if (supabase) {
      const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

      // Last 24h incident counts grouped by source + severity
      const { data: countRows } = await supabase
        .from('incidents')
        .select('source, severity')
        .gte('created_at', since24h);

      if (countRows) {
        for (const row of countRows) {
          const src = row.source ?? 'unknown';
          const sev = row.severity ?? 'info';
          if (!counts[src]) counts[src] = {};
          counts[src][sev] = (counts[src][sev] ?? 0) + 1;
        }
      }

      // Latest 10 incidents (safe fields only — no metadata/PII)
      const { data: recentRows } = await supabase
        .from('incidents')
        .select('source, severity, message, created_at')
        .order('created_at', { ascending: false })
        .limit(10);

      if (recentRows) {
        recent = recentRows.map(r => ({
          source: r.source ?? '',
          severity: r.severity ?? '',
          message: r.message ?? '',
          created_at: r.created_at ?? '',
        }));
      }
    }

    return Response.json(ok({ counts, recent, deploySha }));
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    return Response.json(fail('SERVER_ERROR', message), { status: 500 });
  }
}
