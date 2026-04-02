import test from 'node:test';
import assert from 'node:assert/strict';
import { createOrderDb } from '../../src/lib/db.mjs';

test('createOrderDb success with fallback store', async () => {
  const order = await createOrderDb({
    experienceSlug: 'kaohsiung-chaishan-cave-experience',
    scheduleId: 'sch_chaishan_0410',
    peopleCount: 2,
    contactName: 'Wei',
    contactPhone: '0912345678',
    contactEmail: 'wei@example.com'
  });
  assert.equal(order.status, 'pending_payment');
  assert.equal(order.totalTwd, 4000);
  assert.equal(order.peopleCount, 2);
});

test('createOrderDb supports legacy experience alias', async () => {
  const order = await createOrderDb({
    experienceSlug: 'chaishan-cave-tour',
    scheduleId: 'sch_chaishan_0401',
    peopleCount: 1,
    contactName: 'Wei',
    contactPhone: '0912345678',
    contactEmail: 'wei@example.com'
  });
  assert.equal(order.status, 'pending_payment');
  assert.equal(order.experienceSlug, 'kaohsiung-chaishan-cave-experience');
});

test('createOrderDb throws when required fields missing', async () => {
  await assert.rejects(() => createOrderDb({ experienceSlug: 'kaohsiung-chaishan-cave-experience' }), /scheduleId is required/);
});

test('createOrderDb throws when schedule is full', async () => {
  await assert.rejects(
    () => createOrderDb({
      experienceSlug: 'kaohsiung-chaishan-cave-experience',
      scheduleId: 'sch_chaishan_0403',
      peopleCount: 1,
      contactName: 'Wei',
      contactPhone: '0912345678',
      contactEmail: 'wei@example.com'
    }),
    /schedule is full/
  );
});
