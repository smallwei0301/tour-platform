// #1497 — admin conflict override creation notifies the guide (best-effort).
// Unit-tests the email function (privacy: no admin note) + source-contract for
// the notify wrapper and the POST route fire-and-forget wiring.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { sendGuideConflictOverrideNotice, __setEmailClientForTest } from '../../src/lib/email.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP = join(__dirname, '../..');
const read = (rel) => readFileSync(join(APP, rel), 'utf8');

test('sendGuideConflictOverrideNotice: empty guide email → skipped (no send)', async () => {
  const res = await sendGuideConflictOverrideNotice({
    to: '', activityTitle: 'X', startAt: '2030-07-06T01:00:00Z', endAt: '2030-07-06T09:00:00Z',
    reason: 'r', requiresHelper: true, guideNote: null,
  });
  assert.equal(res.status, 'skipped');
  assert.equal(res.errorCode, 'NO_GUIDE_EMAIL');
});

test('sendGuideConflictOverrideNotice: html carries reason/guideNote, never the admin note', async () => {
  let sent = null;
  __setEmailClientForTest({ emails: { send: async (args) => { sent = args; return { data: { id: 'test' } }; } } });
  try {
    const res = await sendGuideConflictOverrideNotice({
      to: 'guide@example.com',
      activityTitle: '無人島一日探險',
      startAt: '2030-07-06T01:00:00+08:00',
      endAt: '2030-07-06T09:00:00+08:00',
      reason: '找到幫手，例外加開',
      requiresHelper: true,
      guideNote: '請與李小幫協調',
    });
    assert.equal(res.ok, true);
    assert.ok(sent, 'email client was called');
    assert.match(sent.html, /無人島一日探險/);
    assert.match(sent.html, /找到幫手，例外加開/);
    assert.match(sent.html, /請與李小幫協調/);
    assert.match(sent.html, /需要幫手/);
    // Subject targets the guide notification channel.
    assert.match(sent.subject, /時段例外開放/);
  } finally {
    __setEmailClientForTest(null);
  }
});

test('notify wrapper only forwards guide-visible fields (no admin_note)', () => {
  const src = read('src/lib/conflict-override-notify.ts');
  assert.match(src, /notifyGuideConflictOverrideCreated/);
  assert.match(src, /guide_email/);
  assert.match(src, /sendGuideConflictOverrideNotice/);
  // Must NOT read or forward admin_note / created_by_admin_email.
  assert.doesNotMatch(src, /admin_note|adminNote|created_by_admin_email/);
});

test('admin conflict-overrides POST fires notify after insert (best-effort)', () => {
  const src = read('app/api/v2/admin/guides/[guideId]/conflict-overrides/route.ts');
  assert.match(src, /notifyGuideConflictOverrideCreated/);
  // Fire-and-forget after the override is created.
  const insertIdx = src.indexOf('.insert(insertPayload)');
  const notifyIdx = src.indexOf('notifyGuideConflictOverrideCreated');
  assert.ok(insertIdx > -1 && notifyIdx > -1 && insertIdx < notifyIdx, 'notify after insert');
  assert.match(src, /\.catch\(/); // best-effort, must not throw into the response path
});
