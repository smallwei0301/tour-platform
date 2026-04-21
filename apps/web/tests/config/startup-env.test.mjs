import test from 'node:test';
import assert from 'node:assert/strict';
import { assertStartupEnv, validateStartupEnv } from '../../src/config/startup-env.mjs';

test('startup env fails for missing required vars in production profile', () => {
  assert.throws(() => {
    assertStartupEnv({ NODE_ENV: 'production', GUIDE_SESSION_SECRET: '', ADMIN_ACCESS_TOKEN: '' });
  }, /STARTUP_ENV_INVALID/);
});

test('startup env fails for bad format values', () => {
  const result = validateStartupEnv({
    NODE_ENV: 'development',
    NEXT_PUBLIC_APP_URL: 'not-a-url',
  });

  assert.equal(result.ok, false);
  assert.match(result.errors[0].reason, /invalid URL format/);
});

test('startup env passes with valid required production values', () => {
  const result = validateStartupEnv({
    NODE_ENV: 'production',
    GUIDE_SESSION_SECRET: '12345678901234567890123456789012',
    ADMIN_ACCESS_TOKEN: '1234567890abcdef',
    NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
  });

  assert.equal(result.ok, true);
  assert.equal(result.profile, 'production');
});

test('startup env allows missing SUPABASE vars in production startup check', () => {
  const result = validateStartupEnv({
    NODE_ENV: 'production',
    GUIDE_SESSION_SECRET: '12345678901234567890123456789012',
    ADMIN_ACCESS_TOKEN: '1234567890abcdef',
  });

  assert.equal(result.ok, true);
  assert.equal(result.profile, 'production');
});

test('startup env allows missing SUPABASE runtime vars in preview profile', () => {
  const result = validateStartupEnv({
    NODE_ENV: 'production',
    VERCEL_ENV: 'preview',
    GUIDE_SESSION_SECRET: '12345678901234567890123456789012',
    ADMIN_ACCESS_TOKEN: '1234567890abcdef',
  });

  assert.equal(result.ok, true);
  assert.equal(result.profile, 'preview');
});
