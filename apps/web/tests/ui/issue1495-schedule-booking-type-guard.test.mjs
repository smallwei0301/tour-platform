// Source-contract (#1495): fixed schedules (activity_schedules) only apply to
// 排程預約 (scheduled) plans. The admin 新增場次 modal must block/warn for
// instant/request plans, and the V2 schedules POST must reject them (final
// defense). Capacity is defaulted from the plan.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP = join(__dirname, '../..');
const read = (rel) => readFileSync(join(APP, rel), 'utf8');

const ROUTE = read('app/api/v2/admin/activities/[activityId]/schedules/route.ts');
const EDIT = read('app/admin/activities/[id]/edit/page.tsx');

test('schedules POST reads booking_type and rejects non-scheduled plans (422)', () => {
  assert.match(ROUTE, /booking_type/);
  assert.match(ROUTE, /SCHEDULE_NOT_APPLICABLE_FOR_BOOKING_TYPE/);
  assert.match(ROUTE, /!==\s*'scheduled'/);
  // The guard runs after plan resolution and before createScheduleDb.
  const guardIdx = ROUTE.indexOf('SCHEDULE_NOT_APPLICABLE_FOR_BOOKING_TYPE');
  const createIdx = ROUTE.indexOf('await createScheduleDb(');
  assert.ok(guardIdx > -1 && createIdx > -1 && guardIdx < createIdx, 'guard precedes create');
});

test('add-schedule modal computes planNotScheduled and blocks instant/request', () => {
  assert.match(EDIT, /planNotScheduled/);
  assert.match(EDIT, /booking_type !== 'scheduled'/);
  // Warning surfaced + submit guarded.
  assert.match(EDIT, /schedule-booking-type-warning/);
  assert.match(EDIT, /disabled=\{saving[^}]*planNotScheduled\}/);
  // handleSubmit early-returns for non-scheduled plans.
  assert.match(EDIT, /if \(planNotScheduled\) return setErr/);
});

test('add-schedule modal defaults capacity from the plan max_participants', () => {
  // Seed from the single plan, and re-seed on plan switch.
  assert.match(EDIT, /initialPlan\?\.max_participants/);
  assert.match(EDIT, /setCapacity\(String\(selectedPlan\.max_participants\)\)/);
});
