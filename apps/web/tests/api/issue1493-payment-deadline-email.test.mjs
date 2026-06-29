// #1493 — 付款期限通知信：email 函式（截止時間/付款連結/逾時取消）+ wrapper/wiring source-contract。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  sendPaymentDeadlineNotice,
  sendUnpaidOrderCancelledNotice,
  __setEmailClientForTest,
} from '../../src/lib/email.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP = join(__dirname, '../..');
const read = (rel) => readFileSync(join(APP, rel), 'utf8');

test('sendPaymentDeadlineNotice: 空收件人 → skipped', async () => {
  const res = await sendPaymentDeadlineNotice({
    to: '', activityTitle: 'X', paymentDeadlineAt: '2030-07-07T00:00:00+08:00',
  });
  assert.equal(res.status, 'skipped');
});

test('sendPaymentDeadlineNotice: html 含截止時間（台灣時間）與付款連結', async () => {
  let sent = null;
  __setEmailClientForTest({ emails: { send: async (args) => { sent = args; return { data: { id: 't' } }; } } });
  try {
    const res = await sendPaymentDeadlineNotice({
      to: 'a@example.com',
      activityTitle: '無人島一日探險',
      contactName: '王小明',
      paymentDeadlineAt: '2030-07-07T09:00:00+08:00',
      orderId: 'ord_1',
    });
    assert.equal(res.ok, true);
    assert.match(sent.html, /無人島一日探險/);
    assert.match(sent.html, /2030\/07\/07/);
    assert.match(sent.html, /前往付款/);
    assert.match(sent.subject, /完成付款/);
  } finally {
    __setEmailClientForTest(null);
  }
});

test('sendUnpaidOrderCancelledNotice: html 標示逾時自動取消、未付款不收費', async () => {
  let sent = null;
  __setEmailClientForTest({ emails: { send: async (args) => { sent = args; return { data: { id: 't' } }; } } });
  try {
    const res = await sendUnpaidOrderCancelledNotice({
      to: 'a@example.com', activityTitle: '無人島一日探險', contactName: '王小明', orderId: 'ord_1',
    });
    assert.equal(res.ok, true);
    assert.match(sent.subject, /逾時自動取消/);
    assert.match(sent.html, /不會產生任何費用/);
  } finally {
    __setEmailClientForTest(null);
  }
});

test('wrapper 只在有 orderId/email 時寄信（best-effort）', () => {
  const src = read('src/lib/payment-deadline-notify.ts');
  assert.match(src, /notifyPaymentDeadlineSet/);
  assert.match(src, /notifyUnpaidOrderCancelled/);
  assert.match(src, /lookupOrderContext/);
  assert.match(src, /if \(!input\?\.orderId/);
});

test('draft route 建立 instant/scheduled 訂單後 fire 付款期限通知', () => {
  const src = read('app/api/v2/bookings/draft/route.ts');
  assert.match(src, /notifyPaymentDeadlineSet/);
});

test('approval 通過信帶 paymentDeadlineAt；expire gateway fire 取消通知', () => {
  const notify = read('src/lib/booking-approval-notify.ts');
  assert.match(notify, /paymentDeadlineAt/);
  const db = read('src/lib/db.mjs');
  assert.match(db, /notifyUnpaidOrderCancelled/);
});
