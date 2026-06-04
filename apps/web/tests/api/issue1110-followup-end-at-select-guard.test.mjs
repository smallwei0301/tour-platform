/**
 * GH-1110 follow-up regression guard:
 *
 * PR #1114 added `checkPlanScheduleDurationMismatch(plan, schedule)` but the
 * existing `.select(...)` for `activity_schedules` in
 * `apps/web/app/api/v2/bookings/draft/route.ts` did NOT include `end_at`.
 *
 * Result: at the live integration point, `schedule.end_at` was undefined,
 * `Date.parse(undefined)` is NaN, and the duration-mismatch helper silently
 * returned `null` (no mismatch detected). The unit test of the helper passed
 * because it constructed a synthetic schedule object that had `end_at`; only
 * the integration path was broken.
 *
 * This guard locks the SELECT statement so the same column-drop can't recur.
 */
import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROUTE = resolve(__dirname, '../../app/api/v2/bookings/draft/route.ts');

describe('GH-1110 follow-up — activity_schedules SELECT must include end_at for duration-mismatch check', () => {
  const src = readFileSync(ROUTE, 'utf8');

  test('every .from(activity_schedules).select(...) call includes end_at', () => {
    // Match all .select('...') calls that follow .from('activity_schedules')
    const segments = src.split("from('activity_schedules')").slice(1);
    assert.ok(segments.length >= 2, 'expected at least 2 activity_schedules queries (primary + fallback)');
    for (const seg of segments) {
      // Look at the next 200 chars for the .select(...) call
      const head = seg.slice(0, 200);
      const selectMatch = head.match(/\.select\('([^']+)'\)/);
      assert.ok(selectMatch, `expected .select() right after .from('activity_schedules'); got: ${head.slice(0, 100)}`);
      const cols = selectMatch[1].split(',').map((c) => c.trim());
      assert.ok(
        cols.includes('end_at'),
        `activity_schedules SELECT must include 'end_at' (required by checkPlanScheduleDurationMismatch). Missing in: ${cols.join(', ')}`,
      );
    }
  });

  test('ActivitySchedule type declares end_at', () => {
    const typeBlock = src.match(/type\s+ActivitySchedule\s*=\s*\{[\s\S]*?\};/)?.[0] || '';
    assert.ok(typeBlock.length > 0, 'expected `type ActivitySchedule = { ... };` declaration');
    assert.match(typeBlock, /end_at:\s*string;?/, 'ActivitySchedule type must declare end_at: string');
  });
});
