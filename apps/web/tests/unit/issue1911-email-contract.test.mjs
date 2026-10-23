// #1911 — sendEmailWithContract：Resend 回 { data:null, error } 不得被當成 sent；空收件人不得呼叫 provider。
// 全程只用 __setEmailClientForTest 注入假 client，絕不連 Resend。
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { sendEmailWithContract, __setEmailClientForTest } from '../../src/lib/email.ts';

afterEach(() => {
  __setEmailClientForTest(null);
});

function fakeClient(impl) {
  const calls = [];
  __setEmailClientForTest({
    emails: {
      send: async (args) => {
        calls.push(args);
        return impl(args);
      },
    },
  });
  return calls;
}

const input = (over = {}) => ({ fn: 'testFn', to: 'a@example.com', subject: 's', html: '<p>x</p>', ...over });

test('Resend 回 { data:null, error } → failed／EMAIL_SEND_FAILED，不得 ok', async () => {
  const calls = fakeClient(() => ({ data: null, error: { message: 'x', name: 'validation_error' } }));
  const res = await sendEmailWithContract(input());
  assert.equal(calls.length, 1);
  assert.equal(res.ok, false);
  assert.equal(res.status, 'failed');
  assert.equal(res.errorCode, 'EMAIL_SEND_FAILED');
  assert.equal(res.retriable, true);
  assert.equal(res.errorMessage, 'x');
  assert.equal(res.messageId, undefined);
});

test('Resend 回 { data:{} }（無 id）→ failed', async () => {
  fakeClient(() => ({ data: {} }));
  const res = await sendEmailWithContract(input());
  assert.equal(res.ok, false);
  assert.equal(res.status, 'failed');
  assert.equal(res.errorCode, 'EMAIL_SEND_FAILED');
});

test('Resend 同時回 error 與 data.id → 仍以 error 為準判 failed', async () => {
  fakeClient(() => ({ data: { id: 'm1' }, error: { message: 'rate limited', name: 'rate_limit_exceeded' } }));
  const res = await sendEmailWithContract(input());
  assert.equal(res.ok, false);
  assert.equal(res.status, 'failed');
  assert.equal(res.errorMessage, 'rate limited');
});

test('Resend 回 { data:{ id:"m1" } } → sent，messageId=m1', async () => {
  fakeClient(() => ({ data: { id: 'm1' } }));
  const res = await sendEmailWithContract(input());
  assert.equal(res.ok, true);
  assert.equal(res.status, 'sent');
  assert.equal(res.messageId, 'm1');
});

test('send throw → failed（既有行為）', async () => {
  fakeClient(() => { throw new Error('boom'); });
  const res = await sendEmailWithContract(input());
  assert.equal(res.ok, false);
  assert.equal(res.status, 'failed');
  assert.equal(res.errorCode, 'EMAIL_SEND_FAILED');
  assert.match(res.errorMessage, /boom/);
});

for (const to of ['', '   ']) {
  test(`空收件人 ${JSON.stringify(to)} → skipped／NO_RECIPIENT，provider 0 次呼叫`, async () => {
    const calls = fakeClient(() => ({ data: { id: 'm1' } }));
    const res = await sendEmailWithContract(input({ to }));
    assert.equal(calls.length, 0);
    assert.equal(res.ok, false);
    assert.equal(res.status, 'skipped');
    assert.equal(res.errorCode, 'NO_RECIPIENT');
    assert.equal(res.retriable, false);
  });
}

test('空收件人優先於 provider 未設定檢查：無 client 時仍回 NO_RECIPIENT', async () => {
  const saved = process.env.RESEND_API_KEY;
  delete process.env.RESEND_API_KEY;
  try {
    __setEmailClientForTest(null);
    const res = await sendEmailWithContract(input({ to: '' }));
    assert.equal(res.status, 'skipped');
    assert.equal(res.errorCode, 'NO_RECIPIENT');
  } finally {
    if (saved !== undefined) process.env.RESEND_API_KEY = saved;
  }
});
