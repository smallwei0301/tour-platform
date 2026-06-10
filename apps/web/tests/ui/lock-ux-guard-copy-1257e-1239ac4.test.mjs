/**
 * Source-contract guards for two UX safety copies that the audit (second
 * sweep, see #1316 follow-ups + #1317) flagged as unprotected:
 *
 *   1. `app/admin/activities/[id]/edit/page.tsx:272` — the schedule guard
 *      copy that tells admins NOT to bypass guide conflicts via
 *      activity_schedules / specific-date schedules, and instead to use
 *      the "例外開放此場" flow surfaced by #1257 slice C. PR #1262 shipped
 *      this copy without a source-contract lock; if a future edit deletes
 *      or weakens this line, admins lose the in-product instruction that
 *      keeps them on the safe-by-default override flow.
 *
 *   2. `app/guide/availability/page.tsx:584` — the dropdown empty-state
 *      copy that tells the guide WHY their activity/plan dropdown is empty
 *      (no published active V2 plan assigned to them). PR #1241 shipped
 *      this copy as #1239 AC#4 but without a contract lock; if a future
 *      refactor deletes it, guides hit a silent dropdown with no
 *      explanation and the support load spikes.
 *
 * Both tests are pure regex assertions over source files — they do not
 * run the components. The point is to make removing or significantly
 * weakening these strings impossible without CI flagging it.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = path.resolve(__dirname, '../..');

async function readSrc(rel) {
  return readFile(path.join(WEB_ROOT, rel), 'utf8');
}

test('admin schedule editor still tells operators NOT to bypass conflicts and to use 例外開放此場 (refs #1257 slice E)', async () => {
  const src = await readSrc('app/admin/activities/[id]/edit/page.tsx');

  // Core guard phrasing — "不會略過導遊／資源衝突" is the literal warning.
  assert.match(
    src,
    /不會略過導遊／資源衝突/,
    'admin schedule editor must keep the "不會略過導遊／資源衝突" warning so operators understand schedules do not skip conflict checks',
  );

  // Routes the operator to the conflict-override flow shipped in #1257.
  assert.match(
    src,
    /例外開放此場/,
    'admin schedule editor must point operators to the "例外開放此場" flow (#1257) instead of trying to bypass via schedules',
  );

  // Requires reason + note — keeps audit trail meaningful.
  assert.match(
    src,
    /留下原因與備註/,
    'guidance must remind operators to record reason + note (matches #1257 admin override payload requirement)',
  );
});

test('guide availability editor still explains why the plan dropdown is empty (refs #1239 AC#4)', async () => {
  const src = await readSrc('app/guide/availability/page.tsx');

  // The empty-state branch must remain gated on `activityPlanOptions.length === 0`.
  assert.match(
    src,
    /activityPlanOptions\.length\s*===\s*0/,
    'empty-state branch must keep gating on activityPlanOptions.length === 0 so the explanation only shows when the dropdown is actually empty',
  );

  // The copy that tells the guide what to do.
  assert.match(
    src,
    /目前找不到可選的活動或方案/,
    'guide availability editor must keep the "目前找不到可選的活動或方案" empty-state hint so guides understand the cause',
  );

  // The two concrete pre-conditions a guide can verify with admin.
  assert.match(
    src,
    /已上架/,
    'empty-state copy must call out the "已上架" activity precondition',
  );
  assert.match(
    src,
    /啟用中.*V2/,
    'empty-state copy must call out the "啟用中 V2 方案" precondition so admins know what to flip',
  );
});
