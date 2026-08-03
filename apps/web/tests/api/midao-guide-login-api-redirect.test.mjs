import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const route = readFileSync(resolve(here, '../../app/api/guide/auth/session/route.ts'), 'utf8');

function successBlocks() {
  const blocks = [];
  let cursor = 0;
  while (blocks.length < 3) {
    const start = route.indexOf('const cookies = createGuideSessionCookies', cursor);
    assert.ok(start >= 0, `missing login success block ${blocks.length + 1}`);
    const end = route.indexOf('return new Response', start);
    assert.ok(end > start);
    blocks.push(route.slice(start, route.indexOf(';', end) + 1));
    cursor = end + 1;
  }
  return blocks;
}

test('all three guide login lookups fetch canonical backend mode, name and session version', () => {
  const selects = [...route.matchAll(/\.select<GuideSession(?:Invite|Login)Profile>\('([^']+)'\)/gu)].map((match) => match[1]);
  assert.equal(selects.length, 3);
  for (const columns of selects) {
    for (const required of ['display_name', 'guide_session_version', 'backend_mode']) {
      assert.equal(columns.split(/,\s*/u).includes(required), true, `lookup omitted ${required}`);
    }
  }
  assert.match(route, /backend_mode:\s*'legacy'\s*\|\s*'midao'/u);
});

test('server canonical redirect preserves legacy new/returning behavior and always sends midao to /midao', () => {
  assert.match(route, /function canonicalGuideRedirect\(backendMode:[^,]+, isNew: boolean\)/u);
  assert.match(route, /backendMode === 'midao'[^]*return '\/midao'/u);
  assert.match(route, /isNew \? '\/guide\/profile' : '\/guide\/dashboard'/u);

  const blocks = successBlocks();
  assert.match(blocks[0], /redirectTo:\s*canonicalGuideRedirect\(guide\.backend_mode, true\)/u);
  assert.match(blocks[1], /redirectTo:\s*canonicalGuideRedirect\(guide\.backend_mode, false\)/u);
  assert.match(blocks[2], /redirectTo:\s*canonicalGuideRedirect\(guide\.backend_mode, false\)/u);
  for (const block of blocks) assert.match(block, /appendClearImpersonationCookies\(headers\)/u);
});
