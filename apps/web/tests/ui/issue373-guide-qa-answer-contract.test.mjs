/**
 * RED tests for issue #373: Guide dashboard Q&A — answer pending questions for own activities
 *
 * AC1: guide/dashboard/page.tsx references /api/guide/qa or /api/admin/qa to fetch pending Q&A,
 *      and shows a question list (待回答的問題 section)
 * AC2: source contains answer textarea + submit button that calls PATCH /api/guide/qa/${id}
 *      with {answer, status:'approved'}
 * AC3: after answer submitted, item disappears from pending list (state update or refetch)
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

// ─── AC1: Guide dashboard fetches pending Q&A ────────────────────────────────

test('AC1: guide/dashboard/page.tsx exists and is non-empty', async () => {
  const src = await readSource('app/(non-locale)/guide/dashboard/page.tsx');
  assert.ok(src.length > 0, 'guide dashboard page must exist and be non-empty');
});

test('AC1: guide/dashboard/page.tsx references a Q&A fetch endpoint', async () => {
  const src = await readSource('app/(non-locale)/guide/dashboard/page.tsx');
  assert.match(
    src,
    /\/api\/guide\/qa|\/api\/admin\/qa/,
    'must reference /api/guide/qa or /api/admin/qa endpoint'
  );
});

test('AC1: guide/dashboard/page.tsx contains 待回答的問題 section', async () => {
  const src = await readSource('app/(non-locale)/guide/dashboard/page.tsx');
  assert.match(src, /待回答的問題/, 'must show 待回答的問題 section title');
});

test('AC1: guide/dashboard/page.tsx renders question field', async () => {
  const src = await readSource('app/(non-locale)/guide/dashboard/page.tsx');
  assert.match(src, /question/, 'must display question field from Q&A entries');
});

// ─── AC2: Answer textarea + PATCH submit ─────────────────────────────────────

test('AC2: guide/dashboard/page.tsx contains textarea for answer input', async () => {
  const src = await readSource('app/(non-locale)/guide/dashboard/page.tsx');
  assert.match(src, /textarea/, 'must have textarea element for answer input');
});

test('AC2: guide/dashboard/page.tsx calls PATCH /api/guide/qa/${id}', async () => {
  const src = await readSource('app/(non-locale)/guide/dashboard/page.tsx');
  assert.match(
    src,
    /PATCH[\s\S]{0,300}\/api\/guide\/qa\/|\/api\/guide\/qa\/[\s\S]{0,300}PATCH/,
    'must call PATCH /api/guide/qa/{id} for submitting answer'
  );
});

test('AC2: guide/dashboard/page.tsx must not submit via admin-only endpoint', async () => {
  const src = await readSource('app/(non-locale)/guide/dashboard/page.tsx');
  assert.doesNotMatch(src, /\/api\/admin\/qa\//, 'guide dashboard must not call admin-only qa patch endpoint');
});

test('AC2: PATCH body includes status approved', async () => {
  const src = await readSource('app/(non-locale)/guide/dashboard/page.tsx');
  assert.match(src, /approved/, 'must send status:approved in PATCH body');
});

test('AC2: guide/dashboard/page.tsx has 回答並發布 (or answer submit) button', async () => {
  const src = await readSource('app/(non-locale)/guide/dashboard/page.tsx');
  assert.match(src, /回答並發布|回答/, 'must have 回答並發布 or 回答 submit button');
});

// ─── AC3: After answer submitted, item disappears from list ───────────────────

test('AC3: guide/dashboard/page.tsx updates state or refetches after answer', async () => {
  const src = await readSource('app/(non-locale)/guide/dashboard/page.tsx');
  // Must either filter the item out of state OR call a load/refetch function after success
  assert.match(
    src,
    /setQaList|setPendingQa|loadQa|fetchQa|filter\(|\.filter\(/,
    'must update Q&A list state or refetch after submission to remove answered item'
  );
});

test('AC3: /api/guide/qa route exists', async () => {
  const src = await readSource('app/api/guide/qa/route.ts');
  assert.ok(src.length > 0, '/api/guide/qa route must exist and be non-empty');
});

test('AC3: /api/guide/qa route uses verifyGuideSession for auth', async () => {
  const src = await readSource('app/api/guide/qa/route.ts');
  assert.match(src, /verifyGuideSession/, 'guide QA route must use verifyGuideSession for auth');
});

test('AC3: /api/guide/qa route filters by guide activity_ids', async () => {
  const src = await readSource('app/api/guide/qa/route.ts');
  assert.match(
    src,
    /activity_ids?|activityIds|guide_id/,
    'guide QA route must filter Q&A by guide activity IDs'
  );
});

test('AC3: /api/guide/qa/[id] PATCH route exists', async () => {
  const src = await readSource('app/api/guide/qa/[id]/route.ts');
  assert.ok(src.length > 0, '/api/guide/qa/[id] PATCH route must exist and be non-empty');
});

test('AC3: /api/guide/qa/[id] PATCH route uses verifyGuideSession auth', async () => {
  const src = await readSource('app/api/guide/qa/[id]/route.ts');
  assert.match(src, /verifyGuideSession/, 'guide qa patch route must use verifyGuideSession');
  assert.match(src, /UNAUTHORIZED|session required/, 'must reject unauthenticated guide session');
});

test('AC3: /api/guide/qa/[id] PATCH route enforces guide ownership on activities', async () => {
  const src = await readSource('app/api/guide/qa/[id]/route.ts');
  assert.match(src, /from\('activities'\)/, 'must verify ownership from activities table');
  assert.match(src, /guide_id/, 'must scope by guide_id');
  assert.match(src, /FORBIDDEN|無權/, 'must deny update when qa is not owned by guide');
});
