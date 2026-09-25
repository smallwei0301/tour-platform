import test from 'node:test';
import assert from 'node:assert/strict';

import { getVibeaiAdminBaseUrl } from '../../src/config/feature-flags.mjs';

test('未設定 → 空字串（入口不渲染，而不是 undefined/... 死連結）', () => {
  assert.equal(getVibeaiAdminBaseUrl({}), '');
  assert.equal(getVibeaiAdminBaseUrl({ NEXT_PUBLIC_VIBEAI_ADMIN_URL: '' }), '');
  assert.equal(getVibeaiAdminBaseUrl({ NEXT_PUBLIC_VIBEAI_ADMIN_URL: '   ' }), '');
});

test('合法 http(s) 絕對網址 → 原樣回傳', () => {
  assert.equal(
    getVibeaiAdminBaseUrl({ NEXT_PUBLIC_VIBEAI_ADMIN_URL: 'https://vibeaico-admin-rebuild.vercel.app' }),
    'https://vibeaico-admin-rebuild.vercel.app',
  );
  assert.equal(
    getVibeaiAdminBaseUrl({ NEXT_PUBLIC_VIBEAI_ADMIN_URL: 'http://127.0.0.1:3000' }),
    'http://127.0.0.1:3000',
  );
});

test('尾斜線去掉，避免組出 //tenant/impersonate', () => {
  assert.equal(
    getVibeaiAdminBaseUrl({ NEXT_PUBLIC_VIBEAI_ADMIN_URL: 'https://admin.example.com///' }),
    'https://admin.example.com',
  );
});

test('前後空白容錯', () => {
  assert.equal(
    getVibeaiAdminBaseUrl({ NEXT_PUBLIC_VIBEAI_ADMIN_URL: '  https://admin.example.com  ' }),
    'https://admin.example.com',
  );
});

test('不是 http(s) 絕對網址一律 fail closed', () => {
  for (const bad of [
    '/tenant/impersonate',
    'vibeaico-admin-rebuild.vercel.app',
    'javascript:alert(1)',
    'ftp://admin.example.com',
    'https://has space.example.com',
  ]) {
    assert.equal(getVibeaiAdminBaseUrl({ NEXT_PUBLIC_VIBEAI_ADMIN_URL: bad }), '', `should reject: ${bad}`);
  }
});
