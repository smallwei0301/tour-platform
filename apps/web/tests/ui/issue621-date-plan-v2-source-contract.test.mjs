import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

test('issue621 date-plan section requests v2 availability and renders explicit source/fallback notice contract', async () => {
  const rel = 'src/components/activity/DatePlanSection.tsx';
  const src = await readFile(path.join(ROOT, rel), 'utf8');

  assert.match(
    src,
    /\/availability`/,
    'post-#1407: date-plan availability fetch hits the v2-only endpoint (no ?v2=1 param needed)'
  );

  assert.match(
    src,
    /json\?\.data\?\.source\s*===\s*'legacy_fallback'/,
    'ui must explicitly detect legacy_fallback source and surface truthful fallback wording'
  );

  assert.match(
    src,
    /備援|fallback/i,
    'fallback notice copy must explicitly include legacy/fallback semantics for travelers/operators'
  );

  assert.match(
    src,
    /source\s*!==\s*'v2'/,
    'ui should still warn when source is non-v2, not silently treat it as canonical v2'
  );
});
