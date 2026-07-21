import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchActivityByIdOrSlug } from '../../src/lib/client-api.ts';

const UUID = '123e4567-e89b-42d3-a456-426614174000';

function jsonResponse(body, { status = 200 } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return body;
    },
  };
}

test('UUID activity input resolves through the public list before requesting canonical slug detail', async (t) => {
  const requests = [];
  t.mock.method(globalThis, 'fetch', async (url) => {
    requests.push(String(url));
    if (url === '/api/activities') {
      return jsonResponse({ ok: true, data: [{ id: UUID, slug: 'canonical-island-tour' }] });
    }
    if (url === '/api/activities/canonical-island-tour') {
      return jsonResponse({ ok: true, data: { id: UUID, slug: 'canonical-island-tour', title: 'Canonical activity' } });
    }
    return jsonResponse({ ok: false, error: { message: 'activity not found' } }, { status: 404 });
  });

  const result = await fetchActivityByIdOrSlug(UUID);

  assert.deepEqual(requests, ['/api/activities', '/api/activities/canonical-island-tour']);
  assert.equal(requests.includes(`/api/activities/${UUID}`), false);
  assert.equal(result.canonicalSlug, 'canonical-island-tour');
  assert.equal(result.activity.title, 'Canonical activity');
});

test('canonical slug input makes one direct detail request', async (t) => {
  const requests = [];
  t.mock.method(globalThis, 'fetch', async (url) => {
    requests.push(String(url));
    return jsonResponse({ ok: true, data: { id: UUID, slug: 'canonical-island-tour' } });
  });

  const result = await fetchActivityByIdOrSlug('canonical-island-tour');

  assert.deepEqual(requests, ['/api/activities/canonical-island-tour']);
  assert.equal(result.canonicalSlug, 'canonical-island-tour');
});

test('unknown UUID returns deterministic not-found without requesting UUID detail', async (t) => {
  const requests = [];
  t.mock.method(globalThis, 'fetch', async (url) => {
    requests.push(String(url));
    return jsonResponse({ ok: true, data: [] });
  });

  await assert.rejects(fetchActivityByIdOrSlug(UUID), /activity not found/);
  assert.deepEqual(requests, ['/api/activities']);
});

test('Postgres UUID-shaped input is resolved as an ID even when it is not an RFC versioned UUID', async (t) => {
  const postgresUuid = '00000000-0000-0000-0000-000000000000';
  const requests = [];
  t.mock.method(globalThis, 'fetch', async (url) => {
    requests.push(String(url));
    return jsonResponse({ ok: true, data: [] });
  });

  await assert.rejects(fetchActivityByIdOrSlug(postgresUuid), /activity not found/);
  assert.deepEqual(requests, ['/api/activities']);
});

test('unknown slug returns deterministic not-found without list fallback', async (t) => {
  const requests = [];
  t.mock.method(globalThis, 'fetch', async (url) => {
    requests.push(String(url));
    return jsonResponse({ ok: false, error: { message: 'database-specific missing copy' } }, { status: 404 });
  });

  await assert.rejects(fetchActivityByIdOrSlug('unknown-tour'), /^Error: activity not found$/);
  assert.deepEqual(requests, ['/api/activities/unknown-tour']);
});

test('non-404 detail failure is surfaced without a list fallback', async (t) => {
  const requests = [];
  t.mock.method(globalThis, 'fetch', async (url) => {
    requests.push(String(url));
    return jsonResponse({ ok: false, error: { message: 'activity service unavailable' } }, { status: 503 });
  });

  await assert.rejects(fetchActivityByIdOrSlug('canonical-island-tour'), /activity service unavailable/);
  assert.deepEqual(requests, ['/api/activities/canonical-island-tour']);
});
