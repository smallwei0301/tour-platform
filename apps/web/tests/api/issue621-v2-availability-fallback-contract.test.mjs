import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
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

test('issue621 regression: legacy no-schedules path must return 404/NOT_FOUND instead of bubbling into 500', async () => {
  const rel = 'app/api/activities/[slug]/availability/route.ts';
  const src = await readFile(path.join(ROOT, rel), 'utf8');

  const hasLegacyNotFoundSignal = /legacy_schedules_not_found/.test(src);
  const hasNotFoundResponse = /fail\('NOT_FOUND',\s*'activity not found'\)/.test(src);
  const hasLoadFailure500 = /fail\('LOAD_AVAILABILITY_FAILED',\s*message\),\s*\{\s*status:\s*500\s*\}/.test(src);
  const catchBlock = src.match(/catch \(error\) \{[\s\S]*?\n\s*\}\n\}/)?.[0] ?? '';
  const hasLegacy404Guard = /legacy_schedules_not_found/.test(catchBlock) && /status:\s*404/.test(catchBlock);

  assert.equal(hasLegacyNotFoundSignal, true, 'test precondition: route must keep explicit legacy no-schedules signal');
  assert.equal(hasNotFoundResponse, true, 'route must preserve existing 404 NOT_FOUND payload shape');
  assert.equal(hasLoadFailure500, true, 'test precondition: generic failures still map to 500 LOAD_AVAILABILITY_FAILED');

  const classifyHttpStatus = ({ legacySchedulesNotFound }) => {
    if (legacySchedulesNotFound) return 404;
    return 500;
  };

  assert.equal(classifyHttpStatus({ legacySchedulesNotFound: true }), 404, 'legacy no-schedules semantic expectation must remain 404');
  assert.equal(hasLegacy404Guard, true, 'route must explicitly map legacy_schedules_not_found to 404 before generic 500 catch');
});

test('issue621 justification doc records why legacy_fallback slugs are not V2-positive fixtures', async () => {
  const rel = 'docs/qa/issue-621-v2-primary-availability-fallback-justification.md';
  const full = path.join(ROOT, rel);
  assert.equal(existsSync(full), true, `justification doc must exist: ${rel}`);

  const src = await readFile(full, 'utf8');
  assert.match(src, /hualien-river-trekking/);
  assert.match(src, /legacy-fallback|legacy_fallback/);
  assert.match(src, /not an approved V2-positive fixture/i);
  assert.match(src, /kaohsiung-chaishan-cave-experience/);
  assert.match(src, /x-availability-source:\s*v2|data.source:\s*v2/i);
});
