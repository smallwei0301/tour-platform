import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const MIGRATIONS_DIR = path.resolve(ROOT, '../../supabase/migrations');
const MIGRATION_FILE = path.join(MIGRATIONS_DIR, '20260512_issue400_activity_qa_traveler_rls.sql');

function parseEnvFile(envPath) {
  if (!fs.existsSync(envPath)) return {};
  const data = fs.readFileSync(envPath, 'utf8');
  const out = {};
  for (const rawLine of data.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const idx = line.indexOf('=');
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    out[key] = value;
  }
  return out;
}

async function fetchUserIdFromToken({ supabaseUrl, anonKey, accessToken }) {
  const userRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
    method: 'GET',
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${accessToken}`,
    },
  });
  const body = await userRes.json();
  assert.equal(userRes.status, 200, `Cannot resolve user from access token: ${JSON.stringify(body)}`);
  return body?.id ?? null;
}

describe('Issue 400 — activity_qa traveler submit RLS contract (static)', () => {
  it('has GH-400 migration file', () => {
    assert.ok(fs.existsSync(MIGRATION_FILE), `Migration must exist: ${MIGRATION_FILE}`);
  });

  it('defines authenticated_read_own_qa select policy', () => {
    const sql = fs.readFileSync(MIGRATION_FILE, 'utf8');
    assert.match(sql, /authenticated_read_own_qa/i);
    assert.match(sql, /FOR\s+SELECT\s+\n?\s*TO\s+authenticated/i);
    assert.match(sql, /USING\s*\(\s*auth\.uid\(\)\s*=\s*user_id\s*\)/i);
  });

  it('keeps explicit grant contract for select/insert', () => {
    const sql = fs.readFileSync(MIGRATION_FILE, 'utf8');
    assert.match(sql, /GRANT\s+SELECT\s+ON\s+TABLE\s+public\.activity_qa\s+TO\s+anon/i);
    assert.match(sql, /GRANT\s+SELECT\s+ON\s+TABLE\s+public\.activity_qa\s+TO\s+authenticated/i);
    assert.match(sql, /GRANT\s+INSERT\s+ON\s+TABLE\s+public\.activity_qa\s+TO\s+authenticated/i);
  });
});

describe('Issue 400 — activity_qa traveler submit RLS contract (live PostgREST path)', () => {
  it('anon key + bearer token can insert and select own pending row', async (t) => {
    if (process.env.RUN_LIVE_QA_RLS !== '1') {
      t.skip('Set RUN_LIVE_QA_RLS=1 to run live Supabase RLS contract verification');
      return;
    }

    const envPath = '/root/.openclaw/workspace/tour-platform.env';
    const env = parseEnvFile(envPath);
    const supabaseUrl = env.TOUR_PLATFORM_SUPABASE_URL || process.env.TOUR_PLATFORM_SUPABASE_URL;
    const anonKey = env.TOUR_PLATFORM_SUPABASE_ANON_PUBLIC || env.TOUR_PLATFORM_SUPABASE_ANON_KEY || process.env.TOUR_PLATFORM_SUPABASE_ANON_PUBLIC || process.env.TOUR_PLATFORM_SUPABASE_ANON_KEY;
    const serviceRole = env.TOUR_PLATFORM_SUPABASE_SERVICE_ROLE || env.TOUR_PLATFORM_SUPABASE_SERVICE_ROLE_KEY || process.env.TOUR_PLATFORM_SUPABASE_SERVICE_ROLE || process.env.TOUR_PLATFORM_SUPABASE_SERVICE_ROLE_KEY;
    const accessToken = env.TOUR_PLATFORM_SUPABASE_ACCESS_TOKEN || process.env.TOUR_PLATFORM_SUPABASE_ACCESS_TOKEN;

    assert.ok(supabaseUrl, 'Missing TOUR_PLATFORM_SUPABASE_URL');
    assert.ok(anonKey, 'Missing TOUR_PLATFORM_SUPABASE_ANON_PUBLIC/ANON_KEY');
    assert.ok(accessToken, 'Missing TOUR_PLATFORM_SUPABASE_ACCESS_TOKEN');
    assert.ok(serviceRole, 'Missing TOUR_PLATFORM_SUPABASE_SERVICE_ROLE/SERVICE_ROLE_KEY for cleanup');

    const userId = await fetchUserIdFromToken({ supabaseUrl, anonKey, accessToken });
    assert.ok(userId, 'Cannot resolve user id from TOUR_PLATFORM_SUPABASE_ACCESS_TOKEN');

    const question = `gh400-rls-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const insertRes = await fetch(`${supabaseUrl}/rest/v1/activity_qa`, {
      method: 'POST',
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      body: JSON.stringify({
        activity_id: 'gh400-rls-contract',
        user_id: userId,
        question,
        status: 'pending_moderation',
      }),
    });

    const insertBody = await insertRes.json();
    assert.equal(insertRes.status, 201, `Insert failed: ${JSON.stringify(insertBody)}`);
    assert.ok(Array.isArray(insertBody) && insertBody.length === 1, 'Insert must return one row');

    const row = insertBody[0];
    assert.equal(row.status, 'pending_moderation');
    assert.equal(row.user_id, userId);

    const selectRes = await fetch(
      `${supabaseUrl}/rest/v1/activity_qa?select=id,user_id,status&eq.id=${encodeURIComponent(row.id)}`,
      {
        method: 'GET',
        headers: {
          apikey: anonKey,
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );
    const selectBody = await selectRes.json();
    assert.equal(selectRes.status, 200, `Select failed: ${JSON.stringify(selectBody)}`);
    assert.ok(Array.isArray(selectBody) && selectBody.length === 1, 'Owner select must return inserted row');
    assert.equal(selectBody[0].user_id, userId);

    const cleanupRes = await fetch(`${supabaseUrl}/rest/v1/activity_qa?id=eq.${encodeURIComponent(row.id)}`, {
      method: 'DELETE',
      headers: {
        apikey: serviceRole,
        Authorization: `Bearer ${serviceRole}`,
      },
    });
    assert.ok([200, 204].includes(cleanupRes.status), `Cleanup failed with status ${cleanupRes.status}`);
  });
});
