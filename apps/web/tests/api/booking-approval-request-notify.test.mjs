// 導遊審核制缺口修補：request 預約申請建立 → 通知導遊（email + LINE push）。
// 缺口背景：guide_new_order LINE 模板與 notifyNewOrder 原本皆無生產呼叫端，
// request 申請建立後導遊必須自己登入後台才會發現——本測試鎖住新的通知鏈。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { sendBookingApprovalRequested, __setEmailClientForTest } from '../../src/lib/email.ts';
import { buildGuideMessage } from '../../src/lib/line-messages.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP = join(__dirname, '../..');
const read = (rel) => readFileSync(join(APP, rel), 'utf8');

test('sendBookingApprovalRequested: 空收件人 → skipped', async () => {
  const res = await sendBookingApprovalRequested({ to: '', activityTitle: 'X' });
  assert.equal(res.status, 'skipped');
});

test('sendBookingApprovalRequested: html 含時段/人數/金額/先審核後付款說明/審核連結', async () => {
  let sent = null;
  __setEmailClientForTest({ emails: { send: async (args) => { sent = args; return { data: { id: 't' } }; } } });
  try {
    const res = await sendBookingApprovalRequested({
      to: 'guide@example.com',
      activityTitle: '無人島一日探險',
      contactName: '王小明',
      orderId: 'ord_1',
      startAt: '2030-07-07T09:00:00+08:00',
      peopleCount: 3,
      totalTwd: 4500,
    });
    assert.equal(res.ok, true);
    assert.match(sent.subject, /新預約申請待審核/);
    assert.match(sent.html, /無人島一日探險/);
    assert.match(sent.html, /王小明/);
    assert.match(sent.html, /2030-07-07 09:00/);
    assert.match(sent.html, /3 人/);
    assert.match(sent.html, /4,500/);
    assert.match(sent.html, /先審核後付款/);
    assert.match(sent.html, /\/guide\/bookings/);
    assert.match(sent.html, /前往審核/);
  } finally {
    __setEmailClientForTest(null);
  }
});

test('buildGuideMessage: guide_approval_requested 組出待審核訊息', () => {
  const msgs = buildGuideMessage('guide_approval_requested', {
    orderId: 'ord12345678',
    activityTitle: '柴山探洞',
    scheduleDate: '2030-07-07 09:00',
    peopleCount: 2,
    totalTwd: 3000,
  });
  assert.equal(msgs.length, 1);
  assert.match(msgs[0].text, /新預約申請待審核/);
  assert.match(msgs[0].text, /柴山探洞/);
  assert.match(msgs[0].text, /2030-07-07 09:00/);
  assert.match(msgs[0].text, /批准或婉拒/);
});

// wrapper 內部 import 無副檔名（Next 解析），node --test 無法直接 runtime import，
// 故比照 issue1493 慣例以 source-contract 鎖行為。
test('wrapper 契約：雙通道（email + pushGuideOrderEvent）、best-effort、orderId guard', () => {
  const src = read('src/lib/booking-approval-notify.ts');
  assert.match(src, /notifyBookingApprovalRequested/);
  assert.match(src, /sendBookingApprovalRequested/);
  assert.match(src, /pushGuideOrderEvent/);
  assert.match(src, /guide_approval_requested/);
  assert.match(src, /lookupOrderContext/);
  assert.match(src, /if \(!input\?\.orderId\) return/);
  assert.match(src, /if \(!ctx\?\.guideEmail\) return/);
});

test('draft route 契約：request 建單後 fire 導遊通知（requiresGuideApproval 分流）', () => {
  const src = read('app/api/v2/bookings/draft/route.ts');
  assert.match(src, /if \(requiresGuideApproval\(planData\.booking_type\)\)[\s\S]*notifyBookingApprovalRequested/);
});
