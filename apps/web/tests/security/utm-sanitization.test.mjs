import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnNodeEsm } from '../helpers/spawn-node.mjs';

const modulePath = new URL('../../src/lib/utm.ts', import.meta.url).pathname;

function runUtmCase({ mode, search = '', presetStorageJson = null }) {
  const script = `
    const storage = new Map();
    const sessionStorage = {
      getItem(key) { return storage.has(key) ? storage.get(key) : null; },
      setItem(key, value) { storage.set(key, String(value)); },
      removeItem(key) { storage.delete(key); }
    };

    globalThis.window = { location: { search: ${JSON.stringify(search)} } };
    globalThis.sessionStorage = sessionStorage;

    if (${JSON.stringify(presetStorageJson)} !== null) {
      sessionStorage.setItem('tp_utm', ${JSON.stringify(presetStorageJson)});
    }

    const mod = await import(${JSON.stringify(modulePath)});

    let result = null;
    if (${JSON.stringify(mode)} === 'capture') {
      result = mod.captureUtm(${JSON.stringify(search)});
    } else if (${JSON.stringify(mode)} === 'read') {
      result = mod.getStoredUtm();
    }

    const payload = {
      result,
      stored: sessionStorage.getItem('tp_utm')
    };
    console.log('JSON_RESULT:' + JSON.stringify(payload));
  `;

  const run = spawnNodeEsm(script, { env: process.env });

  assert.equal(run.status, 0, run.stderr || run.stdout);
  const line = run.stdout
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l.startsWith('JSON_RESULT:'));

  assert.ok(line, `missing JSON_RESULT marker: ${run.stdout}`);
  return JSON.parse(line.slice('JSON_RESULT:'.length));
}

test('captureUtm accepts supported keys and normalizes values', () => {
  const out = runUtmCase({
    mode: 'capture',
    search: '?utm_source= Google Ads &utm_medium= CPC&utm_campaign=Spring Sale 2026&utm_content=Banner_A&utm_term=台北 行程',
  });

  assert.deepEqual(out.result, {
    utm_source: 'google_ads',
    utm_medium: 'cpc',
    utm_campaign: 'spring_sale_2026',
    utm_content: 'banner_a',
    utm_term: '台北_行程',
  });
});

test('captureUtm rejects dangerous/abnormal values and unknown keys', () => {
  const out = runUtmCase({
    mode: 'capture',
    search: '?utm_source=<script>alert(1)</script>&utm_medium=javascript:alert(1)&utm_campaign=%20%20&utm_hacker=xxx',
  });

  assert.equal(out.result, null);
  assert.equal(out.stored, null);
});

test('captureUtm bounds oversized values', () => {
  const huge = 'X'.repeat(500);
  const out = runUtmCase({
    mode: 'capture',
    search: `?utm_campaign=${huge}`,
  });

  assert.ok(out.result.utm_campaign.length <= 80);
});

test('getStoredUtm sanitizes existing storage and removes junk fields', () => {
  const out = runUtmCase({
    mode: 'read',
    presetStorageJson: JSON.stringify({
      utm_source: '  Meta  ',
      utm_medium: 'Social',
      utm_campaign: '<b>Flash</b> Sale',
      utm_hacker: 'DROP TABLE',
    }),
  });

  assert.deepEqual(out.result, {
    utm_source: 'meta',
    utm_medium: 'social',
  });
});
