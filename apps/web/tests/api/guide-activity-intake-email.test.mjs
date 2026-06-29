import test from 'node:test';
import assert from 'node:assert/strict';

import * as email from '../../src/lib/email.ts';
import { normalizeIntake, buildActivityIntakePrompt } from '../../src/lib/guide-activity-intake.mjs';

function capture() {
  const sent = [];
  email.__setEmailClientForTest({ emails: { send: async (msg) => { sent.push(msg); return { data: { id: 'msg_x' } }; } } });
  return sent;
}

function samplePrompt() {
  const { value } = normalizeIntake({
    title: '柴山秘境之旅',
    region: '高雄市',
    category: 'mountain',
    priceTwd: '1800',
    durationText: '4.5 小時',
    meetingPoint: '龍門亭入口',
    description: '帶旅客走柴山三個秘境：龍谷大峽谷、小錐麓、金瓜洞，沿途有獼猴與港景。',
  });
  return { value, prompt: buildActivityIntakePrompt(value) };
}

test('sendGuideActivityIntakeNotification 寄給每位 allowlist 管理者，內含提示詞與行程名', async () => {
  const saved = process.env.ADMIN_EMAIL_ALLOWLIST;
  process.env.ADMIN_EMAIL_ALLOWLIST = 'a@x.com, b@x.com';
  try {
    const sent = capture();
    const { prompt } = samplePrompt();
    const results = await email.sendGuideActivityIntakeNotification({
      title: '柴山秘境之旅', prompt, guideName: 'Andy Lee', guideContactEmail: 'andy@example.com',
    });

    assert.equal(sent.length, 2);
    assert.deepEqual(sent.map((m) => m.to), ['a@x.com', 'b@x.com']);
    assert.match(sent[0].subject, /新行程投稿/);
    assert.match(sent[0].subject, /柴山秘境之旅/);
    // 提示詞（含 schema 與導遊原始內容）有被嵌入 email
    assert.match(sent[0].html, /龍門亭入口/);
    assert.match(sent[0].html, /durationMinutes/);
    assert.match(sent[0].html, /Andy Lee/);
    assert.equal(results.filter((r) => r.ok).length, 2);
  } finally {
    if (saved === undefined) delete process.env.ADMIN_EMAIL_ALLOWLIST;
    else process.env.ADMIN_EMAIL_ALLOWLIST = saved;
    email.__setEmailClientForTest(null);
  }
});

test('sendGuideActivityIntakeNotification 無 allowlist 時回空陣列且不寄信', async () => {
  const saved = process.env.ADMIN_EMAIL_ALLOWLIST;
  delete process.env.ADMIN_EMAIL_ALLOWLIST;
  try {
    const sent = capture();
    const { prompt } = samplePrompt();
    const results = await email.sendGuideActivityIntakeNotification({ title: 'x', prompt });
    assert.deepEqual(results, []);
    assert.equal(sent.length, 0);
  } finally {
    if (saved !== undefined) process.env.ADMIN_EMAIL_ALLOWLIST = saved;
    email.__setEmailClientForTest(null);
  }
});

test('email html 對提示詞做 HTML escape（避免破版／注入）', async () => {
  const saved = process.env.ADMIN_EMAIL_ALLOWLIST;
  process.env.ADMIN_EMAIL_ALLOWLIST = 'a@x.com';
  try {
    const sent = capture();
    await email.sendGuideActivityIntakeNotification({ title: '<b>x</b>', prompt: 'a < b > c & d' });
    assert.match(sent[0].html, /&lt;b&gt;x&lt;\/b&gt;/);
    assert.match(sent[0].html, /a &lt; b &gt; c &amp; d/);
  } finally {
    if (saved === undefined) delete process.env.ADMIN_EMAIL_ALLOWLIST;
    else process.env.ADMIN_EMAIL_ALLOWLIST = saved;
    email.__setEmailClientForTest(null);
  }
});
