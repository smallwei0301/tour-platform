import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

const SETTLEMENTS_PAGE = path.join(ROOT, 'app/(non-locale)/admin/settlements/page.tsx');

test('issue#906: /admin/settlements page file exists', async () => {
  await assert.doesNotReject(
    () => access(SETTLEMENTS_PAGE),
    'app/(non-locale)/admin/settlements/page.tsx must exist to register the route'
  );
});

test('issue#906: /admin/settlements page redirects to /admin/payouts', async () => {
  const src = await readFile(SETTLEMENTS_PAGE, 'utf8');

  // Must import redirect from next/navigation
  assert.match(src, /from 'next\/navigation'/, "must import from 'next/navigation'");

  // Must call redirect with the payouts path
  assert.match(src, /redirect\(['"]\/admin\/payouts['"]\)/, 'must redirect to /admin/payouts');
});

test('issue#906: /admin/settlements page exports a default function', async () => {
  const src = await readFile(SETTLEMENTS_PAGE, 'utf8');

  assert.match(
    src,
    /export\s+default\s+function\s+\w+/,
    'must export a named default function (Next.js page requirement)'
  );
});
