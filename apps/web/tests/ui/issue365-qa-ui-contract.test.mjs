/**
 * RED tests for issue #365: Q&A UI — activity detail page question form + approved Q&A display
 *
 * AC1: activity detail page shows 旅客問答 section with approved Q&A items
 * AC2: detail page has question input / submission form for logged-in users
 * AC3: Q&A submit form calls POST /api/qa with {activityId, question}; shows 問題已送出，等候審核 on success
 * AC4: Unauthenticated state: source contains logic to show 請登入後才能提問 or redirect to login
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();

async function readSource(relPath) {
  return readFile(path.join(ROOT, relPath), 'utf8');
}

const DETAIL_PAGE = 'app/activities/[region]/[slug]/page.tsx';

// ─── AC1: Approved Q&A section display ───────────────────────────────────────

test('AC1: detail page has 旅客問答 section heading', async () => {
  const src = await readSource(DETAIL_PAGE);
  assert.match(src, /旅客問答/, 'must contain 旅客問答 section heading');
});

test('AC1: detail page renders qa-item elements for approved Q&A', async () => {
  const src = await readSource(DETAIL_PAGE);
  assert.match(src, /qa-item|data-testid="qa-item"/, 'must render qa-item elements');
});

test('AC1: detail page fetches or loads Q&A data (approvedQA or qa data)', async () => {
  const src = await readSource(DETAIL_PAGE);
  assert.match(
    src,
    /approvedQA|activity_qa|\/api\/qa/,
    'must reference approvedQA, activity_qa table, or /api/qa endpoint'
  );
});

test('AC1: Q&A items display question text', async () => {
  const src = await readSource(DETAIL_PAGE);
  assert.match(src, /qa\.question|\.question/, 'must display question text from Q&A items');
});

// ─── AC2: Question submission form for logged-in users ───────────────────────

test('AC2: detail page has 提問 functionality (textarea or input)', async () => {
  const src = await readSource(DETAIL_PAGE);
  assert.match(src, /提問|有疑問/, 'must contain 提問 or question prompt text');
});

test('AC2: detail page has question submission form', async () => {
  const src = await readSource(DETAIL_PAGE);
  assert.match(src, /textarea|question.*input|input.*question/, 'must have question input textarea');
});

test('AC2: detail page has 送出問題 or question submit button', async () => {
  const src = await readSource(DETAIL_PAGE);
  assert.match(src, /送出問題|送出/, 'must have question submit button');
});

// ─── AC3: POST /api/qa with activityId + question; success message ────────────

test('AC3: question submit calls POST /api/qa', async () => {
  const src = await readSource(DETAIL_PAGE);
  assert.match(
    src,
    /POST[\s\S]{0,150}\/api\/qa|\/api\/qa[\s\S]{0,150}POST/,
    'submit handler must POST to /api/qa'
  );
});

test('AC3: POST body includes activityId', async () => {
  const src = await readSource(DETAIL_PAGE);
  assert.match(src, /activityId/, 'POST body must include activityId');
});

test('AC3: POST body includes question', async () => {
  const src = await readSource(DETAIL_PAGE);
  // "question" appears in the form body JSON
  assert.match(src, /['""]question['""]\s*:/, 'POST body must include question field');
});

test('AC3: success message 問題已送出，等候審核', async () => {
  const src = await readSource(DETAIL_PAGE);
  assert.match(src, /問題已送出，等候審核/, 'must show 問題已送出，等候審核 success message');
});

// ─── AC4: Unauthenticated state ───────────────────────────────────────────────

test('AC4: unauthenticated state shows 請登入後才能提問 or login redirect', async () => {
  const src = await readSource(DETAIL_PAGE);
  assert.match(
    src,
    /請登入後才能提問|login.*提問|提問.*login/,
    'must show 請登入後才能提問 message or login redirect for unauthenticated users'
  );
});

test('AC4: login link present for unauthenticated users in Q&A section', async () => {
  const src = await readSource(DETAIL_PAGE);
  assert.match(src, /\/login/, 'must have a /login link for unauthenticated state');
});
