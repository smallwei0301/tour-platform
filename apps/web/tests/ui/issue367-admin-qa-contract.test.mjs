/**
 * RED tests for issue #367: Admin Q&A management — answer + approve/reject interface
 *
 * AC1: app/(non-locale)/admin/qa/page.tsx exists, references /api/admin/qa, shows activity_id/question/status
 * AC2: Source calls PATCH /api/admin/qa/${id} with {status:'approved'|'rejected'} + {answer}
 * AC3: AdminShell.tsx has Q&A管理 link to /admin/qa
 * AC4: Form contains answer textarea + submit (guide/admin fills answer before approving)
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

async function readSource(relPath) {
  return readFile(path.join(ROOT, relPath), 'utf8');
}

// ─── AC1: Admin Q&A page ─────────────────────────────────────────────────────

test('AC1: app/(non-locale)/admin/qa/page.tsx exists and is non-empty', async () => {
  const src = await readSource('app/(non-locale)/admin/qa/page.tsx');
  assert.ok(src.length > 0, 'admin qa page must exist and be non-empty');
});

test('AC1: admin/qa/page.tsx references /api/admin/qa endpoint', async () => {
  const src = await readSource('app/(non-locale)/admin/qa/page.tsx');
  assert.match(src, /\/api\/admin\/qa/, 'must reference /api/admin/qa');
});

test('AC1: admin/qa/page.tsx shows activity_id field', async () => {
  const src = await readSource('app/(non-locale)/admin/qa/page.tsx');
  assert.match(src, /activity_id/, 'must display activity_id field');
});

test('AC1: admin/qa/page.tsx shows question field', async () => {
  const src = await readSource('app/(non-locale)/admin/qa/page.tsx');
  assert.match(src, /question/, 'must display question field');
});

test('AC1: admin/qa/page.tsx shows status field', async () => {
  const src = await readSource('app/(non-locale)/admin/qa/page.tsx');
  assert.match(src, /status/, 'must display status field');
});

// ─── AC2: PATCH with answer + status ─────────────────────────────────────────

test('AC2: admin/qa/page.tsx calls PATCH /api/admin/qa/${id}', async () => {
  const src = await readSource('app/(non-locale)/admin/qa/page.tsx');
  assert.match(
    src,
    /PATCH[\s\S]{0,200}\/api\/admin\/qa\/|\/api\/admin\/qa\/[\s\S]{0,200}PATCH/,
    'must call PATCH /api/admin/qa/{id}'
  );
});

test('AC2: PATCH body includes status approved', async () => {
  const src = await readSource('app/(non-locale)/admin/qa/page.tsx');
  assert.match(src, /approved/, 'must send status:approved');
});

test('AC2: PATCH body includes status rejected', async () => {
  const src = await readSource('app/(non-locale)/admin/qa/page.tsx');
  assert.match(src, /rejected/, 'must send status:rejected');
});

test('AC2: PATCH body includes answer field', async () => {
  const src = await readSource('app/(non-locale)/admin/qa/page.tsx');
  assert.match(src, /answer/, 'must include answer field in PATCH body');
});

// ─── AC3: AdminShell nav link ─────────────────────────────────────────────────

test('AC3: AdminShell.tsx has Q&A管理 nav entry', async () => {
  const src = await readSource('src/components/admin/AdminShell.tsx');
  assert.match(src, /Q&A管理/, 'AdminShell nav must have Q&A管理 entry');
});

test('AC3: AdminShell.tsx links to /admin/qa', async () => {
  const src = await readSource('src/components/admin/AdminShell.tsx');
  assert.match(src, /\/admin\/qa/, 'AdminShell nav must link to /admin/qa');
});

// ─── AC4: Answer textarea + submit form ───────────────────────────────────────

test('AC4: admin/qa/page.tsx contains textarea for answer', async () => {
  const src = await readSource('app/(non-locale)/admin/qa/page.tsx');
  assert.match(src, /textarea/, 'must have textarea element for answer');
});

test('AC4: admin/qa/page.tsx has answer state variable', async () => {
  const src = await readSource('app/(non-locale)/admin/qa/page.tsx');
  assert.match(src, /answer/, 'must have answer state or field');
});

test('AC4: admin/qa/page.tsx has approve button', async () => {
  const src = await readSource('app/(non-locale)/admin/qa/page.tsx');
  assert.match(src, /核准/, 'must have 核准 (approve) button');
});

test('AC4: admin/qa/page.tsx has reject button', async () => {
  const src = await readSource('app/(non-locale)/admin/qa/page.tsx');
  assert.match(src, /拒絕/, 'must have 拒絕 (reject) button');
});
