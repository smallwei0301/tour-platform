/**
 * Contract tests for issue #655 — payout routes must use activity_schedules.start_at
 * (tour schedule date) instead of orders.created_at.
 *
 * These are static source-text assertions: they verify the actual route source
 * contains the correct patterns without needing a live DB.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

const __dirname = dirname(fileURLToPath(import.meta.url));
const routeDir = join(__dirname, '../../app/api/v2/guide/payout/monthly');

const monthlySource = readFileSync(join(routeDir, 'route.ts'), 'utf8');
const csvSource = readFileSync(join(routeDir, 'csv/route.ts'), 'utf8');

describe('issue #655 — payout schedule date fix', () => {
  describe('monthly JSON route (route.ts)', () => {
    it('selects schedule_id from orders', () => {
      assert.match(monthlySource, /\.select\(['"].*schedule_id.*['"]\)/);
    });

    it('fetches activity_schedules.start_at', () => {
      assert.match(monthlySource, /from\(['"]activity_schedules['"]\)/);
      assert.match(monthlySource, /start_at/);
    });

    it('includes needsManualReview field in mapped order', () => {
      assert.match(monthlySource, /needsManualReview/);
    });

    it('uses scheduleDates lookup (not created_at) for scheduleDate', () => {
      assert.match(monthlySource, /scheduleDates/);
      // Must NOT derive scheduleDate from created_at
      assert.doesNotMatch(monthlySource, /scheduleDate\s*=\s*o\.created_at/);
    });
  });

  describe('monthly CSV route (csv/route.ts)', () => {
    it('selects schedule_id from orders', () => {
      assert.match(csvSource, /\.select\(['"].*schedule_id.*['"]\)/);
    });

    it('fetches activity_schedules.start_at', () => {
      assert.match(csvSource, /from\(['"]activity_schedules['"]\)/);
      assert.match(csvSource, /start_at/);
    });

    it('uses needs_manual_review fallback string (not created_at) in CSV', () => {
      assert.match(csvSource, /needs_manual_review/);
      // Must NOT derive scheduleDate directly from created_at
      assert.doesNotMatch(csvSource, /scheduleDate\s*=\s*o\.created_at/);
    });

    it('uses scheduleDates lookup for schedule date', () => {
      assert.match(csvSource, /scheduleDates/);
    });
  });
});
