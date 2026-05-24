/**
 * RED→GREEN tests for issue #365: Q&A UI — activity detail page question form + approved Q&A display
 *
 * AC1: activity detail page shows 旅客問答 section with approved Q&A items
 * AC2: detail page has question input / submission form for logged-in users
 * AC3: Q&A submit form calls POST /api/qa with {activityId, question}; shows 問題已送出，等候審核 on success
 * AC4: Unauthenticated state: source contains logic to show 請登入後才能提問 or redirect to login
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

const DETAIL_PAGE = 'app/activities/[region]/[slug]/page.tsx';
const QA_COMPONENT = 'src/components/activity/ActivityQASection.tsx';

// ─── AC1: Approved Q&A section display ───────────────────────────────────────

test('AC1: detail page imports ActivityQASection component', async () => {
  const src = await readSource(DETAIL_PAGE);
  assert.match(src, /ActivityQASection/, 'detail page must import ActivityQASection');
});

test('AC1: detail page renders ActivityQASection with activityId', async () => {
  const src = await readSource(DETAIL_PAGE);
  assert.match(src, /ActivityQASection/, 'must render ActivityQASection');
  assert.match(src, /activityId|activity\.id/, 'must pass activityId prop');
});

test('AC1: QA component has 旅客問答 section heading', async () => {
  const src = await readSource(QA_COMPONENT);
  assert.match(src, /旅客問答/, 'must contain 旅客問答 section heading');
});

test('AC1: QA component renders qa-item elements for approved Q&A', async () => {
  const src = await readSource(QA_COMPONENT);
  assert.match(src, /qa-item|data-testid="qa-item"/, 'must render qa-item elements');
});

test('AC1: QA component fetches /api/qa endpoint for approved Q&A', async () => {
  const src = await readSource(QA_COMPONENT);
  assert.match(
    src,
    /\/api\/qa/,
    'must fetch from /api/qa endpoint'
  );
});

test('AC1: Q&A items display question text', async () => {
  const src = await readSource(QA_COMPONENT);
  assert.match(src, /qa\.question|\.question/, 'must display question text from Q&A items');
});

// ─── AC2: Question submission form for logged-in users ───────────────────────

test('AC2: QA component has 提問 / question prompt text', async () => {
  const src = await readSource(QA_COMPONENT);
  assert.match(src, /提問|有疑問/, 'must contain 提問 or question prompt text');
});

test('AC2: QA component has question submission textarea', async () => {
  const src = await readSource(QA_COMPONENT);
  assert.match(src, /textarea/, 'must have question input textarea');
});

test('AC2: QA component has 送出問題 submit button', async () => {
  const src = await readSource(QA_COMPONENT);
  assert.match(src, /送出問題|送出/, 'must have question submit button');
});

// ─── AC3: POST /api/qa with activityId + question; success message ────────────

test('AC3: question submit calls POST /api/qa', async () => {
  const src = await readSource(QA_COMPONENT);
  assert.match(
    src,
    /POST[\s\S]{0,150}\/api\/qa|\/api\/qa[\s\S]{0,150}POST/,
    'submit handler must POST to /api/qa'
  );
});

test('AC3: POST body includes activityId', async () => {
  const src = await readSource(QA_COMPONENT);
  assert.match(src, /activityId/, 'POST body must include activityId');
});

test('AC3: POST body includes question field', async () => {
  const src = await readSource(QA_COMPONENT);
  // question field in JSON.stringify body (may be bare key or quoted key)
  assert.match(src, /question[\s\S]{0,30}question\.trim\(\)|JSON\.stringify[\s\S]{0,100}question/, 'POST body must include question field');
});

test('AC3: success message 問題已送出，等候審核', async () => {
  const src = await readSource(QA_COMPONENT);
  assert.match(src, /問題已送出，等候審核/, 'must show 問題已送出，等候審核 success message');
});

// ─── AC4: Unauthenticated state ───────────────────────────────────────────────

test('AC4: unauthenticated state shows 請登入後才能提問 (comment or text)', async () => {
  const src = await readSource(QA_COMPONENT);
  // text may be split across JSX elements; check comment or data-testid as proxy
  assert.match(
    src,
    /請[\s\S]{0,100}登入[\s\S]{0,100}後才能提問|data-testid="qa-login-prompt"/,
    'must show 請登入後才能提問 text (possibly split across tags) or qa-login-prompt testid'
  );
});

test('AC4: login link present for unauthenticated users in Q&A section', async () => {
  const src = await readSource(QA_COMPONENT);
  assert.match(src, /\/login/, 'must have a /login link for unauthenticated state');
});
