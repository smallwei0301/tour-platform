import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();

test('issue621 availability route exposes explicit v2/legacy/fallback source contract', async () => {
  const rel = 'app/api/activities/[slug]/availability/route.ts';
  const src = await readFile(path.join(ROOT, rel), 'utf8');

  assert.match(src, /x-availability-source': 'v2'/, 'v2 branch must expose v2 source header');
  assert.match(src, /source: 'v2'/, 'v2 branch must expose source=v2 in response body');

  assert.match(src, /source: 'legacy'/, 'legacy path must expose source=legacy in response body');
  assert.match(src, /x-availability-source': 'legacy'/, 'legacy path must expose legacy source header');

  assert.match(
    src,
    /source:\s*'legacy_fallback'|x-availability-source': 'legacy-fallback'/,
    'v2 generation failure fallback must be explicitly marked as fallback source'
  );

  assert.match(
    src,
    /explicitSource\s*===\s*'legacy'|explicitMode\s*===\s*'legacy'/,
    'route must support explicit legacy mode override signal (source=legacy or mode=legacy)'
  );

  assert.match(
    src,
    /x-availability-requested-mode'/,
    'route should expose a non-sensitive requested-mode diagnostic header for QA/UI contract checks'
  );
});
