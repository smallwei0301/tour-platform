import test from 'node:test';
import assert from 'node:assert/strict';

import {
  pushGuideOrderEvent,
  getGuideIdForOrder,
} from '../../src/lib/line-guide-push.mjs';
import { buildGuideMessage } from '../../src/lib/line-messages.ts';
import {
  createGuideBindCode,
  redeemGuideBindCode,
  __resetGuideLineForTest,
} from '../../src/lib/guide-line-binding.mjs';

// In-memory store: experience 'exp_chaishan_001' is owned by guide slug 'andy-lee'.
const CHAISHAN = 'exp_chaishan_001';
const ANDY = 'andy-lee';

const PUSH_KEYS = ['LINE_GUIDE_PUSH_ENABLED', 'LINE_MESSAGING_ENABLED', 'LINE_CHANNEL_ACCESS_TOKEN'];
async function withEnv(overrides, fn) {
  const saved = {};
  for (const k of PUSH_KEYS) saved[k] = process.env[k];
  const savedFetch = global.fetch;
  const calls = [];
  global.fetch = async (url, init) => { calls.push({ url: String(url), init }); return { ok: true, status: 200, statusText: 'OK', json: async () => ({}) }; };
  try {
    for (const k of PUSH_KEYS) delete process.env[k];
    for (const [k, v] of Object.entries(overrides)) process.env[k] = v;
    return await fn(calls);
  } finally {
    global.fetch = savedFetch;
    for (const k of PUSH_KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
  }
}

async function bindGuide(guideId, lineUserId) {
  const { code } = await createGuideBindCode(guideId);
  await redeemGuideBindCode(code, { lineUserId });
}

test('getGuideIdForOrder resolves order activity → guide (in-memory)', async () => {
  assert.equal(await getGuideIdForOrder({ activityId: CHAISHAN }), ANDY);
  assert.equal(await getGuideIdForOrder({ activityId: 'nope' }), null);
});

test('guide push: flag OFF → skipped, no network', async () => {
  __resetGuideLineForTest();
  await withEnv({}, async (calls) => {
    const r = await pushGuideOrderEvent({ kind: 'guide_payment_received', orderId: 'o1', activityId: CHAISHAN });
    assert.equal(r.status, 'skipped');
    assert.equal(r.reason, 'guide_push_disabled');
    assert.equal(calls.length, 0);
  });
});

test('guide push: flag ON but guide not bound → no_guide_binding', async () => {
  __resetGuideLineForTest();
  await withEnv({ LINE_GUIDE_PUSH_ENABLED: '1', LINE_MESSAGING_ENABLED: '1', LINE_CHANNEL_ACCESS_TOKEN: 'T'.repeat(40) }, async () => {
    const r = await pushGuideOrderEvent({ kind: 'guide_payment_received', orderId: 'o1', activityId: CHAISHAN });
    assert.equal(r.reason, 'no_guide_binding');
  });
});

test('guide push: order with no resolvable guide → no_guide', async () => {
  __resetGuideLineForTest();
  await withEnv({ LINE_GUIDE_PUSH_ENABLED: '1', LINE_MESSAGING_ENABLED: '1', LINE_CHANNEL_ACCESS_TOKEN: 'T'.repeat(40) }, async () => {
    const r = await pushGuideOrderEvent({ kind: 'guide_payment_received', orderId: 'o1', activityId: 'unknown-activity' });
    assert.equal(r.reason, 'no_guide');
  });
});

test('guide push: flag ON + bound guide → sent to the guide', async () => {
  __resetGuideLineForTest();
  await bindGuide(ANDY, 'UandyLine');
  await withEnv({ LINE_GUIDE_PUSH_ENABLED: '1', LINE_MESSAGING_ENABLED: '1', LINE_CHANNEL_ACCESS_TOKEN: 'T'.repeat(40) }, async (calls) => {
    const r = await pushGuideOrderEvent({ kind: 'guide_payment_received', orderId: 'ord12345', activityId: CHAISHAN, activityTitle: '柴山探洞', totalTwd: 4000 });
    assert.equal(r.status, 'sent');
    const body = JSON.parse(calls[0].init.body);
    assert.equal(body.to, 'UandyLine');
  });
});

test('buildGuideMessage covers all guide kinds', () => {
  for (const kind of ['guide_new_order', 'guide_payment_received', 'guide_order_cancelled', 'guide_refund_requested', 'guide_refund_executed']) {
    const msgs = buildGuideMessage(kind, { orderId: 'ord12345', activityTitle: '柴山探洞', totalTwd: 4000, peopleCount: 2 });
    assert.equal(msgs[0].type, 'text');
    assert.match(msgs[0].text, /ORD12345/);
  }
});
