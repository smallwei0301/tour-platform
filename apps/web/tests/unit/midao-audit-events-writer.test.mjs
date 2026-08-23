import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import {
  MIDAO_AUDIT_METADATA_KEYS,
  MIDAO_AUDIT_METADATA_LIMIT,
  buildMidaoAuditEvent,
  recordMidaoAuditEvent,
  __resetMidaoAuditEventsForTest,
  __listMidaoAuditEventsForTest,
} from '../../src/lib/midao/db-midao-audit-events.mjs';
import { hashIdempotentRequest } from '../../src/lib/midao/idempotency.ts';
import { __setSupabaseClientForTest } from '../../src/lib/supabase-env.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

const GUIDE_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const REQUEST_ID = '99999999-9999-4999-8999-999999999999';
const ACTIVITY_ID = '11111111-1111-4111-8111-111111111111';
const PLAN_ID = '22222222-2222-4222-8222-222222222222';

function baseInput(over = {}) {
  return {
    guideId: GUIDE_ID,
    action: 'midao.plan.update',
    planId: PLAN_ID,
    requestId: REQUEST_ID,
    route: 'v2/guide/midao/services/[activityId]/plans/[planId]',
    activityId: ACTIVITY_ID,
    changedFields: ['base_price'],
    before: { base_price: 1200 },
    after: { base_price: 2500 },
    expectedUpdatedAt: '2026-08-20T00:00:00.000Z',
    resultUpdatedAt: '2026-08-20T01:00:00.000Z',
    requestHash: hashIdempotentRequest({ base_price: 2500 }),
    ...over,
  };
}

test.beforeEach(() => {
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  __setSupabaseClientForTest(null);
  __resetMidaoAuditEventsForTest();
});

test.afterEach(() => {
  __setSupabaseClientForTest(null);
  __resetMidaoAuditEventsForTest();
});

test('buildMidaoAuditEvent：固定 actor/resource 欄位與 reason=null', () => {
  const event = buildMidaoAuditEvent(baseInput());
  assert.equal(event.actor_type, 'guide');
  assert.equal(event.actor_id, String(GUIDE_ID));
  assert.equal(event.guide_id, GUIDE_ID);
  assert.equal(event.action, 'midao.plan.update');
  assert.equal(event.resource_type, 'activity_plan');
  assert.equal(event.resource_id, String(PLAN_ID));
  assert.equal(event.request_id, REQUEST_ID);
  assert.equal(event.reason, null);
});

test('buildMidaoAuditEvent：metadata 只允許固定鍵，且不得挾帶額外欄位', () => {
  const event = buildMidaoAuditEvent(baseInput({
    idempotencyKey: 'raw-key-should-be-dropped',
    cookie: 'guide_token=secret',
    authorization: 'Bearer secret',
    travelerEmail: 'traveler@example.com',
  }));
  assert.deepEqual(Object.keys(event.metadata).sort(), [...MIDAO_AUDIT_METADATA_KEYS].sort());
  const serialized = JSON.stringify(event.metadata);
  assert.doesNotMatch(serialized, /raw-key-should-be-dropped/u);
  assert.doesNotMatch(serialized, /guide_token|Bearer|authorization|cookie/iu);
  assert.doesNotMatch(serialized, /traveler@example\.com/u);
  assert.equal(event.metadata.requestHash, hashIdempotentRequest({ base_price: 2500 }));
});

test('buildMidaoAuditEvent：POST 建立事件 before={} 且 expectedUpdatedAt=null', () => {
  const event = buildMidaoAuditEvent(baseInput({
    action: 'midao.plan.create',
    before: {},
    expectedUpdatedAt: null,
  }));
  assert.equal(event.action, 'midao.plan.create');
  assert.deepEqual(event.metadata.before, {});
  assert.equal(event.metadata.expectedUpdatedAt, null);
});

test('buildMidaoAuditEvent：metadata 過大時 before/after 置 null 並標記 truncated', () => {
  const huge = { description: 'x'.repeat(MIDAO_AUDIT_METADATA_LIMIT) };
  const event = buildMidaoAuditEvent(baseInput({
    changedFields: ['description'],
    before: huge,
    after: huge,
  }));
  assert.equal(event.metadata.before, null);
  assert.equal(event.metadata.after, null);
  assert.equal(event.metadata.truncated, true);
  assert.ok(JSON.stringify(event.metadata).length <= MIDAO_AUDIT_METADATA_LIMIT + 1000);
});

test('buildMidaoAuditEvent：未超限時不得出現 truncated 鍵', () => {
  const event = buildMidaoAuditEvent(baseInput());
  assert.equal(Object.prototype.hasOwnProperty.call(event.metadata, 'truncated'), false);
});

test('recordMidaoAuditEvent：in-memory 模式寫入剛好一筆', async () => {
  await recordMidaoAuditEvent(baseInput());
  const events = __listMidaoAuditEventsForTest();
  assert.equal(events.length, 1);
  assert.equal(events[0].action, 'midao.plan.update');
});

test('recordMidaoAuditEvent：Supabase 模式只 insert midao_audit_events 一次', async () => {
  process.env.SUPABASE_URL = 'https://example.supabase.test';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-test-key';
  const calls = [];
  __setSupabaseClientForTest({
    from(table) {
      return {
        async insert(payload) {
          calls.push({ table, payload });
          return { data: null, error: null };
        },
      };
    },
  });
  await recordMidaoAuditEvent(baseInput());
  assert.equal(calls.length, 1);
  assert.equal(calls[0].table, 'midao_audit_events');
  assert.equal(calls[0].payload.resource_type, 'activity_plan');
});

test('recordMidaoAuditEvent：寫入失敗回報 gap 但不得拋出（非原子性缺口）', async () => {
  process.env.SUPABASE_URL = 'https://example.supabase.test';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-test-key';
  const reported = [];
  __setSupabaseClientForTest({
    from() {
      return {
        async insert() { return { data: null, error: { message: 'insert denied' } }; },
      };
    },
  });
  const result = await recordMidaoAuditEvent(baseInput(), {
    reportError: async (err, opts) => { reported.push({ err, opts }); },
  });
  assert.equal(result.recorded, false);
  assert.equal(result.auditGap, true);
  assert.equal(reported.length, 1);
  assert.match(reported[0].opts.route, /plans/u);
});

test('結構不變式：審計檔不得使用 legacy audit-log.mjs／audit_logs／.rpc(', async () => {
  const src = await readFile(path.join(ROOT, 'src/lib/midao/db-midao-audit-events.mjs'), 'utf8');
  assert.doesNotMatch(src, /audit-log\.mjs/u);
  assert.doesNotMatch(src, /audit_logs/u);
  assert.doesNotMatch(src, /\.rpc\(/u);
  assert.doesNotMatch(src, /from ['"][^'"]*\/db\.mjs['"]/u);
});
