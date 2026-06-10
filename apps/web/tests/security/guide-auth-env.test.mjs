import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnNodeEsm } from '../helpers/spawn-node.mjs';

const modulePath = new URL('../../src/lib/guide-auth.ts', import.meta.url).pathname;

function runImport(envOverrides = {}) {
  return spawnNodeEsm(
    `await import(${JSON.stringify(modulePath)}); console.log('IMPORT_OK');`,
    { env: { ...process.env, ...envOverrides } },
  );
}

describe('guide-auth env policy', () => {
  it('blocks production import when GUIDE_SESSION_SECRET is missing', () => {
    const result = runImport({
      NODE_ENV: 'production',
      GUIDE_SESSION_SECRET: '',
    });

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /SECURITY_ENV_BLOCK/);
  });

  it('blocks production import when GUIDE_SESSION_SECRET is too short', () => {
    const result = runImport({
      NODE_ENV: 'production',
      GUIDE_SESSION_SECRET: 'short-secret',
    });

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /GUIDE_SESSION_SECRET missing\/weak/);
  });

  it('allows production build-phase import when GUIDE_SESSION_SECRET is missing', () => {
    const result = runImport({
      NODE_ENV: 'production',
      NEXT_PHASE: 'phase-production-build',
      GUIDE_SESSION_SECRET: '',
    });

    assert.equal(result.status, 0);
    assert.match(result.stdout, /IMPORT_OK/);
  });

  it('allows production import with strong GUIDE_SESSION_SECRET', () => {
    const result = runImport({
      NODE_ENV: 'production',
      GUIDE_SESSION_SECRET: '0123456789abcdef0123456789abcdef',
    });

    assert.equal(result.status, 0);
    assert.match(result.stdout, /IMPORT_OK/);
  });
});
