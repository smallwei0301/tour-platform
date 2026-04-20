import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

const modulePath = new URL('../../src/lib/guide-auth.ts', import.meta.url).pathname;

function runSnippet(snippet, envOverrides = {}) {
  return spawnSync(
    process.execPath,
    ['--experimental-strip-types', '--input-type=module', '-e', snippet],
    {
      env: {
        ...process.env,
        ...envOverrides,
      },
      encoding: 'utf8',
    }
  );
}

describe('guide-auth env policy', () => {
  it('allows production import without GUIDE_SESSION_SECRET so builds can complete', () => {
    const result = runSnippet(`await import(${JSON.stringify(modulePath)}); console.log('IMPORT_OK');`, {
      NODE_ENV: 'production',
      GUIDE_SESSION_SECRET: '',
    });

    assert.equal(result.status, 0);
    assert.match(result.stdout, /IMPORT_OK/);
  });

  it('blocks production session signing when GUIDE_SESSION_SECRET is missing', () => {
    const result = runSnippet(
      `const mod = await import(${JSON.stringify(modulePath)}); mod.createGuideSessionCookies('guide-1', 'Guide One', 1, false);`,
      {
        NODE_ENV: 'production',
        GUIDE_SESSION_SECRET: '',
      }
    );

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /SECURITY_ENV_BLOCK/);
  });

  it('blocks production session signing when GUIDE_SESSION_SECRET is too short', () => {
    const result = runSnippet(
      `const mod = await import(${JSON.stringify(modulePath)}); mod.createGuideSessionCookies('guide-1', 'Guide One', 1, false);`,
      {
        NODE_ENV: 'production',
        GUIDE_SESSION_SECRET: 'short-secret',
      }
    );

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /GUIDE_SESSION_SECRET missing\/weak/);
  });

  it('allows production session signing with strong GUIDE_SESSION_SECRET', () => {
    const result = runSnippet(
      `const mod = await import(${JSON.stringify(modulePath)}); mod.createGuideSessionCookies('guide-1', 'Guide One', 1, false); console.log('SIGN_OK');`,
      {
        NODE_ENV: 'production',
        GUIDE_SESSION_SECRET: '0123456789abcdef0123456789abcdef',
      }
    );

    assert.equal(result.status, 0);
    assert.match(result.stdout, /SIGN_OK/);
  });
});
