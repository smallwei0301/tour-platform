import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createOrderDb, createRefundRequestDb, getMyOrderDetailDb, listRefundRequestsDb } from '../../src/lib/db.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATION_FILE = path.resolve(__dirname, '../../../../supabase/migrations/20260515_issue536_refund_request_id_repair.sql');


test('migration repair for request_id exists and is idempotent', () => {
  assert.ok(fs.existsSync(MIGRATION_FILE), `migration must exist: ${MIGRATION_FILE}`);
  const sql = fs.readFileSync(MIGRATION_FILE, 'utf8');
  assert.match(sql, /ALTER TABLE\s+refund_requests[\s\S]*ADD COLUMN IF NOT EXISTS\s+request_id\s+text;/i);
  assert.match(sql, /CREATE UNIQUE INDEX IF NOT EXISTS\s+refund_requests_order_request_id_unique/i);
  assert.match(sql, /ON\s+refund_requests\(order_id,\s*request_id\)/i);
});

test('requestId is required for refund request', async () => {
  const order = await createOrderDb({
    experienceSlug: 'dadadaocheng-walk',
    scheduleId: 'sch_dadaocheng_0402',
    peopleCount: 1,
    contactName: 'NoReq',
    contactPhone: '0911000000',
    contactEmail: 'noreq@example.com'
  });

  await assert.rejects(() => createRefundRequestDb({ orderId: order.id, reason: 'user_request' }), /requestId is required/);
});

test('create refund request updates order status to refund_pending', async () => {
  const order = await createOrderDb({
    experienceSlug: 'kaohsiung-chaishan-cave-experience',
    scheduleId: 'sch_chaishan_0410',
    peopleCount: 1,
    contactName: 'Wei',
    contactPhone: '0912345678',
    contactEmail: 'wei@example.com'
  });

  const refund = await createRefundRequestDb({ orderId: order.id, requestId: 'req-1', reason: 'user_request' });
  assert.equal(refund.status, 'requested');

  const detail = await getMyOrderDetailDb({ orderId: order.id });
  assert.equal(detail.status, 'refund_pending');

  const list = await listRefundRequestsDb({ orderId: order.id });
  assert.ok(list.length >= 1);
});

test('duplicate refund request is blocked', async () => {
  const order = await createOrderDb({
    experienceSlug: 'dadadaocheng-walk',
    scheduleId: 'sch_dadaocheng_0402',
    peopleCount: 1,
    contactName: 'Amy',
    contactPhone: '0911222333',
    contactEmail: 'amy@example.com'
  });

  await createRefundRequestDb({ orderId: order.id, requestId: 'req-dup-1', reason: 'user_request' });
  await assert.rejects(() => createRefundRequestDb({ orderId: order.id, requestId: 'req-dup-2', reason: 'user_request' }), /refund already requested/);
});

test('same requestId retry is idempotent and stable', async () => {
  const order = await createOrderDb({
    experienceSlug: 'dadadaocheng-walk',
    scheduleId: 'sch_dadaocheng_0402',
    peopleCount: 1,
    contactName: 'Retry',
    contactPhone: '0911222333',
    contactEmail: 'retry@example.com'
  });

  const first = await createRefundRequestDb({ orderId: order.id, requestId: 'req-stable-1', reason: 'user_request' });
  const second = await createRefundRequestDb({ orderId: order.id, requestId: 'req-stable-1', reason: 'user_request' });

  assert.equal(first.id, second.id);
  assert.equal(second.idempotentReplay, true);
});

test('timeout-retry behavior with same requestId remains idempotent', async () => {
  const order = await createOrderDb({
    experienceSlug: 'kaohsiung-chaishan-cave-experience',
    scheduleId: 'sch_chaishan_0410',
    peopleCount: 1,
    contactName: 'Timeout',
    contactPhone: '0912000111',
    contactEmail: 'timeout@example.com'
  });

  const requestId = 'req-timeout-1';
  await createRefundRequestDb({ orderId: order.id, requestId, reason: 'user_request' });
  const retry = await createRefundRequestDb({ orderId: order.id, requestId, reason: 'user_request' });

  assert.equal(retry.idempotentReplay, true);
});

test('concurrent same requestId submissions do not create duplicate refund request', async () => {
  const order = await createOrderDb({
    experienceSlug: 'dadadaocheng-walk',
    scheduleId: 'sch_dadaocheng_0402',
    peopleCount: 1,
    contactName: 'Concurrent',
    contactPhone: '0911888777',
    contactEmail: 'concurrent@example.com'
  });

  const requestId = 'req-concurrent-1';
  const [a, b] = await Promise.all([
    createRefundRequestDb({ orderId: order.id, requestId, reason: 'user_request' }),
    createRefundRequestDb({ orderId: order.id, requestId, reason: 'user_request' }),
  ]);

  assert.equal(a.id, b.id);

  const list = await listRefundRequestsDb({ orderId: order.id });
  const sameRequestRows = list.filter((r) => r.id === a.id);
  assert.equal(sameRequestRows.length, 1);
});
