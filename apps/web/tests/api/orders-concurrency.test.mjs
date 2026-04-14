import test from 'node:test';
import assert from 'node:assert/strict';
import { createOrderDb } from '../../src/lib/db.mjs';
import { experiences } from '../../src/lib/store.mjs';

function resetSchedule(scheduleId, { bookedCount, status }) {
  for (const exp of experiences) {
    const schedule = exp.schedules.find((s) => s.id === scheduleId);
    if (schedule) {
      schedule.bookedCount = bookedCount;
      schedule.status = status;
      return schedule;
    }
  }
  throw new Error(`schedule not found: ${scheduleId}`);
}

test('concurrent createOrderDb calls do not oversell in fallback store', async () => {
  const schedule = resetSchedule('sch_chaishan_0410', { bookedCount: 10, status: 'open' });

  const mkInput = (suffix) => ({
    experienceSlug: 'kaohsiung-chaishan-cave-experience',
    scheduleId: 'sch_chaishan_0410',
    peopleCount: 2,
    contactName: `User ${suffix}`,
    contactPhone: '0912345678',
    contactEmail: `user${suffix}@example.com`
  });

  const results = await Promise.allSettled([
    createOrderDb(mkInput('a')),
    createOrderDb(mkInput('b')),
  ]);

  const successCount = results.filter((r) => r.status === 'fulfilled').length;
  const failureCount = results.filter((r) => r.status === 'rejected').length;

  assert.equal(successCount, 1);
  assert.equal(failureCount, 1);
  assert.equal(schedule.bookedCount, 12);
  assert.equal(schedule.status, 'full');

  const rejected = results.find((r) => r.status === 'rejected');
  assert.match(rejected.reason.message, /not enough seats|schedule is full/);
});
