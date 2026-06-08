/**
 * GH-1290 Post-apply verification script (read-only)
 *
 * Probes production via PostgREST information_schema to confirm the
 * use_dynamic_reemit column exists on guide_availability_rules.
 *
 * Exits 0 when all checks pass, 1 when any fail.
 *
 * Usage:
 *   SUPABASE_URL=https://xxx.supabase.co \
 *   SUPABASE_SERVICE_ROLE_KEY=eyJ... \
 *   node scripts/verify-migration-1290.mjs [--json] [--markdown]
 *
 * This script performs NO mutations — all calls are HTTP GET via PostgREST.
 */

const USAGE = `Usage: node scripts/verify-migration-1290.mjs [options]

Options:
  --help          Show this message
  --json          Emit JSON (default: markdown)
  --markdown      Emit markdown
  --no-env-check  Skip env validation (for CI dry-run without credentials)`;

const args = process.argv.slice(2);
if (args.includes('--help')) { console.log(USAGE); process.exit(0); }
const emitJson = args.includes('--json');
const noEnvCheck = args.includes('--no-env-check');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!noEnvCheck && (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY)) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.\nPass --no-env-check for dry-run.\n' + USAGE);
  process.exit(1);
}

/**
 * Read-only probe: query information_schema.columns via PostgREST REST endpoint.
 * Returns the column row if it exists.
 */
async function probeColumn(tableName, columnName) {
  const url = new URL(`${SUPABASE_URL}/rest/v1/information_schema.columns`);
  url.searchParams.set('table_name', `eq.${tableName}`);
  url.searchParams.set('column_name', `eq.${columnName}`);
  url.searchParams.set('table_schema', 'eq.public');
  url.searchParams.set('select', 'table_name,column_name,data_type,column_default,is_nullable');

  const resp = await fetch(url.toString(), {
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      Accept: 'application/json',
    },
  });

  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`HTTP ${resp.status}: ${body}`);
  }
  return resp.json();
}

const CHECKS = [
  {
    name: 'guide_availability_rules.use_dynamic_reemit_exists',
    description: 'guide_availability_rules has use_dynamic_reemit BOOLEAN NOT NULL DEFAULT false',
    async run() {
      const rows = await probeColumn('guide_availability_rules', 'use_dynamic_reemit');
      if (!rows || rows.length === 0) {
        return { ok: false, detail: 'column use_dynamic_reemit does not exist — migration not applied' };
      }
      const col = rows[0];
      const isBoolean = col.data_type === 'boolean';
      const isNotNull = col.is_nullable === 'NO';
      const hasDefault = (col.column_default ?? '').toLowerCase().includes('false');
      if (!isBoolean) return { ok: false, detail: `data_type=${col.data_type} (expected boolean)` };
      if (!isNotNull) return { ok: false, detail: 'column is nullable (expected NOT NULL)' };
      if (!hasDefault) return { ok: false, detail: `column_default=${col.column_default} (expected false)` };
      return { ok: true, detail: `data_type=${col.data_type}, is_nullable=${col.is_nullable}, default=${col.column_default}` };
    },
  },
];

async function main() {
  const results = [];

  if (noEnvCheck) {
    console.log('--no-env-check: dry run, skipping actual probes.');
    if (emitJson) console.log(JSON.stringify({ dry_run: true, checks: CHECKS.map((c) => c.name) }));
    process.exit(0);
  }

  for (const check of CHECKS) {
    let result;
    try {
      result = await check.run();
    } catch (err) {
      result = { ok: false, detail: `error: ${err.message}` };
    }
    results.push({ name: check.name, description: check.description, ...result });
  }

  const allPass = results.every((r) => r.ok);

  if (emitJson) {
    console.log(JSON.stringify({ ok: allPass, checks: results }, null, 2));
  } else {
    console.log('## GH-1290 Migration Verification\n');
    for (const r of results) {
      const icon = r.ok ? '✅' : '❌';
      console.log(`${icon} **${r.name}**`);
      console.log(`   ${r.description}`);
      console.log(`   Detail: ${r.detail}\n`);
    }
    console.log(allPass ? '**All checks PASSED.**' : '**Some checks FAILED — migration not fully applied.**');
  }

  process.exit(allPass ? 0 : 1);
}

main().catch((err) => { console.error(err); process.exit(1); });
