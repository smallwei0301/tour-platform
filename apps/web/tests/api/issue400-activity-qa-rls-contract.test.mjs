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

function pick(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

async function parseJsonSafe(res) {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return { _raw: text };
  }
}

function looksLikeJwt(token) {
  return typeof token === 'string' && /^[^.]+\.[^.]+\.[^.]+$/.test(token.trim());
}

async function resolveTravelerAccessToken({ supabaseUrl, anonKey, accessToken, travelerEmail, travelerPassword }) {
  const trimmedToken = pick(accessToken);

  // Prefer deterministic traveler credentials when available.
  // Some envs store Supabase PAT/CLI tokens in TOUR_PLATFORM_SUPABASE_ACCESS_TOKEN;
  // those are not JWTs and will fail /auth/v1/user with bad_jwt.
  if (travelerEmail && travelerPassword) {
    const res = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: {
        apikey: anonKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email: travelerEmail, password: travelerPassword }),
    });
    const body = await parseJsonSafe(res);
    assert.equal(
      res.status,
      200,
      `Cannot mint traveler access token via password grant: ${JSON.stringify(body)}`
    );
    assert.ok(body?.access_token, 'Password grant succeeded but access_token is missing');
    return body.access_token;
  }

  if (trimmedToken && looksLikeJwt(trimmedToken)) return trimmedToken;

  if (trimmedToken && !looksLikeJwt(trimmedToken)) {
    assert.fail(
      'TOUR_PLATFORM_SUPABASE_ACCESS_TOKEN is present but not JWT-shaped. Provide traveler email/password or a valid traveler JWT token.'
    );
  }

  assert.fail(
    'Missing traveler credentials: provide traveler email/password or a valid JWT-like TOUR_PLATFORM_SUPABASE_ACCESS_TOKEN'
  );
}

async function fetchUserIdFromToken({ supabaseUrl, anonKey, accessToken }) {
  const userRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
    method: 'GET',
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${accessToken}`,
    },
  });
  const body = await parseJsonSafe(userRes);
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

describe('Issue 400 — activity_qa traveler submit RLS contract (live Next POST /api/qa path)', () => {
  it('traveler auth through Next API can create pending_moderation row owned by auth.uid()', async (t) => {
    if (process.env.RUN_LIVE_QA_RLS !== '1') {
      t.skip('Set RUN_LIVE_QA_RLS=1 to run live Next POST /api/qa verification');
      return;
    }

    const envPath = '/root/.openclaw/workspace/tour-platform.env';
    const env = parseEnvFile(envPath);
    const supabaseUrl = pick(env.TOUR_PLATFORM_SUPABASE_URL, process.env.TOUR_PLATFORM_SUPABASE_URL);
    const anonKey = pick(
      env.TOUR_PLATFORM_SUPABASE_ANON_PUBLIC,
      env.TOUR_PLATFORM_SUPABASE_ANON_KEY,
      process.env.TOUR_PLATFORM_SUPABASE_ANON_PUBLIC,
      process.env.TOUR_PLATFORM_SUPABASE_ANON_KEY
    );
    const serviceRole = pick(
      env.TOUR_PLATFORM_SUPABASE_SERVICE_ROLE,
      env.TOUR_PLATFORM_SUPABASE_SERVICE_ROLE_KEY,
      process.env.TOUR_PLATFORM_SUPABASE_SERVICE_ROLE,
      process.env.TOUR_PLATFORM_SUPABASE_SERVICE_ROLE_KEY
    );

    const apiBaseUrl = pick(
      env.TOUR_PLATFORM_QA_API_BASE_URL,
      process.env.TOUR_PLATFORM_QA_API_BASE_URL,
      process.env.QA_API_BASE_URL
    );

    assert.ok(supabaseUrl, 'Missing TOUR_PLATFORM_SUPABASE_URL');
    assert.ok(anonKey, 'Missing TOUR_PLATFORM_SUPABASE_ANON_PUBLIC/ANON_KEY');
    assert.ok(serviceRole, 'Missing TOUR_PLATFORM_SUPABASE_SERVICE_ROLE/SERVICE_ROLE_KEY for cleanup');
    assert.ok(
      apiBaseUrl,
      'Missing TOUR_PLATFORM_QA_API_BASE_URL (must point to Next app base URL, e.g. https://<site> or http://127.0.0.1:3000)'
    );

    const travelerAccessToken = await resolveTravelerAccessToken({
      supabaseUrl,
      anonKey,
      accessToken: pick(env.TOUR_PLATFORM_SUPABASE_ACCESS_TOKEN, process.env.TOUR_PLATFORM_SUPABASE_ACCESS_TOKEN),
      travelerEmail: pick(env.TOUR_PLATFORM_TRAVELER_EMAIL, process.env.TOUR_PLATFORM_TRAVELER_EMAIL),
      travelerPassword: pick(env.TOUR_PLATFORM_TRAVELER_PASSWORD, process.env.TOUR_PLATFORM_TRAVELER_PASSWORD),
    });

    const userId = await fetchUserIdFromToken({ supabaseUrl, anonKey, accessToken: travelerAccessToken });
    assert.ok(userId, 'Cannot resolve user id from traveler token');

    const question = `gh400-next-api-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const postRes = await fetch(`${apiBaseUrl.replace(/\/$/, '')}/api/qa`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${travelerAccessToken}`,
      },
      body: JSON.stringify({
        activityId: 'gh400-rls-contract',
        question,
      }),
    });

    const postBody = await parseJsonSafe(postRes);
    assert.equal(postRes.status, 201, `POST /api/qa failed: ${JSON.stringify(postBody)}`);
    assert.equal(postBody?.ok, true, `POST /api/qa must return { ok: true }: ${JSON.stringify(postBody)}`);

    const row = postBody?.data;
    assert.ok(row?.id, `POST /api/qa must return created row with id: ${JSON.stringify(postBody)}`);
    assert.equal(row.status, 'pending_moderation');
    assert.equal(row.user_id, userId);

    const selectRes = await fetch(
      `${supabaseUrl}/rest/v1/activity_qa?select=id,user_id,status,question&id=eq.${encodeURIComponent(row.id)}`,
      {
        method: 'GET',
        headers: {
          apikey: anonKey,
          Authorization: `Bearer ${travelerAccessToken}`,
        },
      }
    );
    const selectBody = await parseJsonSafe(selectRes);
    assert.equal(selectRes.status, 200, `Owner select failed: ${JSON.stringify(selectBody)}`);
    assert.ok(Array.isArray(selectBody) && selectBody.length === 1, 'Owner select must return inserted row');
    assert.equal(selectBody[0].status, 'pending_moderation');
    assert.equal(selectBody[0].user_id, userId);
    assert.equal(selectBody[0].question, question);

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
