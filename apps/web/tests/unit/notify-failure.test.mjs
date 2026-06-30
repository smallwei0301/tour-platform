// 失敗通知（Telegram + Email）純函式與 best-effort 行為。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildAlertMessage, notifyFailure } from '../../../../scripts/cron/notify-failure.mjs';

test('buildAlertMessage：標題含 workflow/repo，內文含 run url', () => {
  const { subject, text } = buildAlertMessage({
    WORKFLOW_NAME: 'unpaid-expiry-sweep',
    GITHUB_REPOSITORY: 'smallwei0301/tour-platform',
    RUN_URL: 'https://github.com/x/y/actions/runs/123',
    JOB_STATUS: 'failure',
    __NOW__: '2030-01-01T00:00:00Z',
  });
  assert.match(subject, /unpaid-expiry-sweep/);
  assert.match(subject, /tour-platform/);
  assert.match(text, /https:\/\/github.com\/x\/y\/actions\/runs\/123/);
  assert.match(text, /failure/);
});

test('沒設定任何通道 → 兩個都 skipped（不送）', async () => {
  let called = 0;
  const fakeFetch = async () => { called++; return { ok: true, status: 200 }; };
  const res = await notifyFailure({ WORKFLOW_NAME: 'w' }, fakeFetch);
  assert.equal(called, 0);
  assert.ok(res.every((r) => r.skipped));
});

test('設定 Telegram + Email → 各送一次（best-effort）', async () => {
  const calls = [];
  const fakeFetch = async (url) => { calls.push(url); return { ok: true, status: 200 }; };
  const env = {
    WORKFLOW_NAME: 'w', GITHUB_REPOSITORY: 'a/b', JOB_STATUS: 'failure',
    TELEGRAM_BOT_TOKEN: 'tok', TELEGRAM_CHAT_ID: 'chat',
    RESEND_API_KEY: 're_x', ALERT_EMAIL_TO: 'ops@example.com', ALERT_EMAIL_FROM: 'a@b.co',
  };
  const res = await notifyFailure(env, fakeFetch);
  assert.ok(calls.some((u) => u.includes('api.telegram.org')));
  assert.ok(calls.some((u) => u.includes('api.resend.com')));
  assert.ok(res.find((r) => r.channel === 'telegram').ok);
  assert.ok(res.find((r) => r.channel === 'email').ok);
});

test('Email 寄件人：沒設 ALERT_EMAIL_FROM 時自動沿用 EMAIL_FROM', async () => {
  let sentBody = null;
  const fakeFetch = async (url, opts) => {
    if (url.includes('api.resend.com')) sentBody = JSON.parse(opts.body);
    return { ok: true, status: 200 };
  };
  const env = {
    WORKFLOW_NAME: 'w', RESEND_API_KEY: 're_x', ALERT_EMAIL_TO: 'ops@example.com',
    EMAIL_FROM: 'Midao <noreply@verified.example>', // 無 ALERT_EMAIL_FROM
  };
  await notifyFailure(env, fakeFetch);
  assert.equal(sentBody.from, 'Midao <noreply@verified.example>');
});

test('Email 寄件人：ALERT_EMAIL_FROM 優先於 EMAIL_FROM', async () => {
  let sentBody = null;
  const fakeFetch = async (url, opts) => {
    if (url.includes('api.resend.com')) sentBody = JSON.parse(opts.body);
    return { ok: true, status: 200 };
  };
  const env = {
    WORKFLOW_NAME: 'w', RESEND_API_KEY: 're_x', ALERT_EMAIL_TO: 'ops@example.com',
    ALERT_EMAIL_FROM: 'alerts@verified.example', EMAIL_FROM: 'noreply@verified.example',
  };
  await notifyFailure(env, fakeFetch);
  assert.equal(sentBody.from, 'alerts@verified.example');
});

test('某通道 fetch 丟例外 → 不拋、回報 ok:false', async () => {
  const fakeFetch = async () => { throw new Error('network'); };
  const env = { WORKFLOW_NAME: 'w', TELEGRAM_BOT_TOKEN: 't', TELEGRAM_CHAT_ID: 'c' };
  const res = await notifyFailure(env, fakeFetch);
  const tg = res.find((r) => r.channel === 'telegram');
  assert.equal(tg.ok, false);
});
