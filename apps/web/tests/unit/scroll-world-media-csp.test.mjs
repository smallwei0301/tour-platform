import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WORLD_MEDIA_ORIGIN } from '../../src/lib/scroll-world/scenes.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const source = fs.readFileSync(path.resolve(here, '../../next.config.mjs'), 'utf8');

// 只取未被註解、作為 csp 陣列元素的 media-src 字串，避免註解掉仍誤判通過
const directives = [...source.matchAll(/^\s*"(media-src [^"]*)",?\s*$/gm)].map((m) => m[1]);

test('影片 origin 釘在已驗證的 Blob store', () => {
  assert.equal(WORLD_MEDIA_ORIGIN, 'https://pekgelfm9z6nkvfj.public.blob.vercel-storage.com');
});

test('CSP media-src 生效且只放行 self 與影片 origin（與 scenes.mjs 一致）', () => {
  assert.equal(directives.length, 1, 'next.config.mjs 必須恰有一條未註解的 media-src 指令');
  assert.equal(directives[0], `media-src 'self' ${WORLD_MEDIA_ORIGIN}`);
  assert.ok(!directives[0].includes('*'), 'media-src 不得含萬用字元');
});
