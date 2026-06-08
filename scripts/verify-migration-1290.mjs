#!/usr/bin/env node
/**
 * GH-1290 migration verification (read-only)
 *
 * Probes Supabase PostgREST directly for guide_availability_rules.use_dynamic_reemit.
 * The migration is considered close-gate safe in either state:
 * - HTTP 200: column exists (column_status=applied)
 * - HTTP 400 with JSON code 42703: column missing (column_status=not_applied)
 *
 * Any other response is inconclusive and exits non-zero.
 * Uses Node 18+ global fetch and performs no mutations.
 */

const USAGE = `Usage: node scripts/verify-migration-1290.mjs

Required environment:
  TOUR_PLATFORM_SUPABASE_URL
  TOUR_PLATFORM_SUPABASE_SERVICE_ROLE_KEY`;

const SUPABASE_URL = process.env.TOUR_PLATFORM_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.TOUR_PLATFORM_SUPABASE_SERVICE_ROLE_KEY;

function emit(payload) {
  console.log(JSON.stringify(payload, null, 2));
}

if (process.argv.includes('--help')) {
  console.log(USAGE);
  process.exit(0);
}

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  emit({
    ok: false,
    column_status: 'inconclusive',
    error: 'missing_required_env',
    required_env: [
      'TOUR_PLATFORM_SUPABASE_URL',
      'TOUR_PLATFORM_SUPABASE_SERVICE_ROLE_KEY',
    ],
  });
  process.exit(1);
}

async function readJsonOrText(resp) {
  const text = await resp.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function main() {
  const baseUrl = SUPABASE_URL.replace(/\/+$/, '');
  const url = new URL(`${baseUrl}/rest/v1/guide_availability_rules`);
  url.searchParams.set('select', 'use_dynamic_reemit');
  url.searchParams.set('limit', '0');

  let resp;
  try {
    resp = await fetch(url, {
      method: 'GET',
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        Accept: 'application/json',
      },
    });
  } catch (err) {
    emit({
      ok: false,
      column_status: 'inconclusive',
      error: 'fetch_failed',
      detail: err instanceof Error ? err.message : String(err),
    });
    process.exit(1);
  }

  const body = await readJsonOrText(resp);

  if (resp.status === 200) {
    emit({
      ok: true,
      column_status: 'applied',
      http_status: resp.status,
      probe: 'guide_availability_rules?select=use_dynamic_reemit&limit=0',
    });
    process.exit(0);
  }

  if (resp.status === 400 && body && typeof body === 'object' && body.code === '42703') {
    emit({
      ok: true,
      column_status: 'not_applied',
      http_status: resp.status,
      postgres_code: body.code,
      probe: 'guide_availability_rules?select=use_dynamic_reemit&limit=0',
    });
    process.exit(0);
  }

  emit({
    ok: false,
    column_status: 'inconclusive',
    http_status: resp.status,
    response: body,
    probe: 'guide_availability_rules?select=use_dynamic_reemit&limit=0',
  });
  process.exit(1);
}

main().catch((err) => {
  emit({
    ok: false,
    column_status: 'inconclusive',
    error: 'unexpected_error',
    detail: err instanceof Error ? err.message : String(err),
  });
  process.exit(1);
});
