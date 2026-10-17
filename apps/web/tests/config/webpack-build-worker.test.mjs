import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const cwd = fileURLToPath(new URL('../../', import.meta.url));
function probe(mode, disableSentry = '1', valid = true) {
  return spawnSync(process.execPath, ['--input-type=module', '-e', `
    import assert from 'node:assert/strict';
    const { default: config } = await import('./next.config.mjs');
    assert.equal(config.experimental.webpackBuildWorker, true);
    assert.equal(config.typescript.ignoreBuildErrors, false);
    assert.equal(config.eslint.ignoreDuringBuilds, false);
    assert.equal(config.reactStrictMode, true);
    const headers = await config.headers();
    const csp = headers[0].headers.find(h => h.key === 'Content-Security-Policy').value;
    assert.ok(csp.includes("object-src 'none'"));
    assert.equal(csp.includes("'unsafe-eval'"), process.env.NODE_ENV !== 'production');
    assert.ok((await config.redirects()).some(r => r.source === '/orders' && r.destination === '/me/orders'));
    if (process.env.DISABLE_SENTRY_BUILD === '1') {
      const dev = process.env.NODE_ENV !== 'production';
      const built = config.webpack({ context: process.cwd(), resolve: { alias: { retained: 'value' } } }, { dev });
      assert.equal(built.resolve.alias.retained, 'value');
      assert.ok(built.resolve.alias['next-intl/config'].endsWith('/src/i18n/request.ts'));
      assert.equal(Boolean(built.resolve.alias['@sentry/nextjs']), dev);
    }
  `], { cwd, encoding: 'utf8', env: {
    PATH: process.env.PATH, NODE_ENV: mode, DISABLE_SENTRY_BUILD: disableSentry,
    GUIDE_SESSION_SECRET: valid ? 'ci-guide-session-secret-0123456789abcdef' : '',
    ADMIN_ACCESS_TOKEN: valid ? 'ci-admin-token-0123456789abcdef' : '',
    MIDAO_REQUEST_CLAIM_PEPPER: valid ? 'AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE' : '',
    NEXT_TELEMETRY_DISABLED: '1',
  } });
}
for (const mode of ['development', 'production']) {
  test(`worker survives next-intl wrapping and existing ${mode} behavior`, () => {
    const result = probe(mode);
    assert.equal(result.status, 0, result.stderr);
  });
}
test('worker survives the production Sentry and next-intl wrappers', () => {
  const result = probe('production', '0');
  assert.equal(result.status, 0, result.stderr);
});
test('production startup validation remains fail-closed', () => {
  const result = probe('production', '1', false);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /STARTUP_ENV_INVALID/);
});
