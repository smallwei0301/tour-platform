import test from 'node:test';
import assert from 'node:assert/strict';

import * as email from '../../src/lib/email.ts';

const KINDS = ['new_order', 'payment_received', 'order_cancelled', 'refund_requested', 'refund_executed'];

function capture() {
  const sent = [];
  email.__setEmailClientForTest({ emails: { send: async (msg) => { sent.push(msg); return { data: { id: 'msg_x' } }; } } });
  return sent;
}

test('sendGuideOrderNotification emails the guide for every order event kind', async () => {
  for (const kind of KINDS) {
    const sent = capture();
    const r = await email.sendGuideOrderNotification({
      to: 'guide@example.com', kind, orderId: 'ord12345678', activityTitle: '柴山探洞', totalTwd: 4000, peopleCount: 2,
    });
    assert.equal(r.ok, true, `${kind} should send`);
    assert.equal(sent.length, 1, `${kind} should produce one email`);
    assert.equal(sent[0].to, 'guide@example.com');
    assert.match(sent[0].subject, /.+/);
  }
});

test('sendGuideOrderNotification skips silently when guide has no email', async () => {
  const sent = capture();
  const r = await email.sendGuideOrderNotification({ to: '', kind: 'new_order', orderId: 'o', activityTitle: 'x' });
  assert.equal(r.status, 'skipped');
  assert.equal(sent.length, 0);
});

test('sendAdminOrderNotification emails every allowlisted admin for non-payment events', async () => {
  const saved = process.env.ADMIN_EMAIL_ALLOWLIST;
  process.env.ADMIN_EMAIL_ALLOWLIST = 'a@x.com, b@x.com';
  try {
    const sent = capture();
    await email.sendAdminOrderNotification({ kind: 'order_cancelled', orderId: 'ord12345678', activityTitle: '柴山探洞', totalTwd: 4000 });
    assert.equal(sent.length, 2);
    assert.deepEqual(sent.map((m) => m.to).sort(), ['a@x.com', 'b@x.com']);
  } finally {
    if (saved === undefined) delete process.env.ADMIN_EMAIL_ALLOWLIST; else process.env.ADMIN_EMAIL_ALLOWLIST = saved;
  }
});

test('sendAdminOrderNotification no-ops when allowlist empty', async () => {
  const saved = process.env.ADMIN_EMAIL_ALLOWLIST;
  delete process.env.ADMIN_EMAIL_ALLOWLIST;
  try {
    const sent = capture();
    await email.sendAdminOrderNotification({ kind: 'refund_requested', orderId: 'o', activityTitle: 'x' });
    assert.equal(sent.length, 0);
  } finally {
    if (saved !== undefined) process.env.ADMIN_EMAIL_ALLOWLIST = saved;
  }
});
