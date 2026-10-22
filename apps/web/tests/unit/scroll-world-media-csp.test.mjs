import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const source = fs.readFileSync(path.resolve(here, '../../next.config.mjs'), 'utf8');

test("CSP media-src 精確放行 Blob origin，且不含萬用字元", () => {
  assert.ok(
    source.includes("media-src 'self' https://pekgelfm9z6nkvfj.public.blob.vercel-storage.com\""),
    'next.config.mjs 缺少精確的 media-src 指令'
  );
  const line = source.split('\n').find((l) => l.includes('media-src'));
  assert.ok(line && !line.includes('*'), 'media-src 不得含萬用字元');
});
