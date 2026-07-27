import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const routePath = resolve(here, '../../app/api/admin/guides/[guideId]/route.ts');
const helperPath = resolve(here, '../../src/lib/admin/guide-profile.mjs');
const route = readFileSync(routePath, 'utf8');

function fakeClient(results) {
  const selects = [];
  return {
    selects,
    from(table) {
      assert.equal(table, 'guide_profiles');
      return {
        select(columns) {
          selects.push(columns);
          return {
            eq(field, value) {
              assert.equal(field, 'id');
              assert.equal(value, 'guide-1');
              return {
                async maybeSingle() {
                  assert.ok(results.length, 'fixture result missing');
                  return results.shift();
                },
              };
            },
          };
        },
      };
    },
  };
}

async function loadHelper() {
  assert.equal(existsSync(helperPath), true, 'runtime guide-profile fallback helper missing');
  return import(`${pathToFileURL(helperPath).href}?t=${Date.now()}`);
}

test('admin guide detail route delegates profile resolution to the fail-closed runtime helper', () => {
  assert.match(route, /getAdminGuideProfileDb\(supabase, guideId\)/u);
});

test('runtime profile resolver projects backend_mode on rich success', async () => {
  const { getAdminGuideProfileDb } = await loadHelper();
  const client = fakeClient([{ data: { id: 'guide-1', backend_mode: 'midao' }, error: null }]);
  const profile = await getAdminGuideProfileDb(client, 'guide-1');
  assert.equal(profile.backend_mode, 'midao');
  assert.equal(client.selects.length, 1);
  assert.match(client.selects[0], /backend_mode/u);
});

test('runtime profile resolver performs rich to base to legacy missing-column fallback', async () => {
  const { getAdminGuideProfileDb } = await loadHelper();
  const missing = { data: null, error: { code: '42703', message: 'column does not exist' } };
  const client = fakeClient([
    missing,
    missing,
    { data: { id: 'guide-1', display_name: 'Legacy' }, error: null },
  ]);
  const profile = await getAdminGuideProfileDb(client, 'guide-1');
  assert.equal(profile.display_name, 'Legacy');
  assert.equal(profile.backend_mode, undefined);
  assert.equal(client.selects.length, 3);
  assert.match(client.selects[0], /backend_mode/u);
  assert.match(client.selects[1], /backend_mode/u);
  assert.doesNotMatch(client.selects[2], /backend_mode/u);
});

test('runtime profile resolver stops immediately on non-column database error', async () => {
  const { getAdminGuideProfileDb } = await loadHelper();
  const denied = { code: '42501', message: 'permission denied' };
  const client = fakeClient([{ data: null, error: denied }]);
  await assert.rejects(() => getAdminGuideProfileDb(client, 'guide-1'), (error) => error === denied);
  assert.equal(client.selects.length, 1);
});

test('runtime profile resolver stops immediately when a non-42703 error mimics missing-column text', async () => {
  const { getAdminGuideProfileDb } = await loadHelper();
  const spoofed = { code: '42501', message: 'column backend_mode does not exist' };
  const client = fakeClient([{ data: null, error: spoofed }]);
  await assert.rejects(() => getAdminGuideProfileDb(client, 'guide-1'), (error) => error === spoofed);
  assert.equal(client.selects.length, 1);
});

test('runtime profile resolver propagates the final legacy fallback error', async () => {
  const { getAdminGuideProfileDb } = await loadHelper();
  const missing = { data: null, error: { code: '42703', message: 'column does not exist' } };
  const timeout = { code: '57014', message: 'statement timeout' };
  const client = fakeClient([missing, missing, { data: null, error: timeout }]);
  await assert.rejects(() => getAdminGuideProfileDb(client, 'guide-1'), (error) => error === timeout);
  assert.equal(client.selects.length, 3);
});
