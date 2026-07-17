// admin 通知通道 env 診斷：只回布林、絕不洩漏 env 值本身。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { getNotificationEnvStatus } from '../../src/config/notification-env-status.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP = join(__dirname, '../..');
const read = (rel) => readFileSync(join(APP, rel), 'utf8');

function leafValues(obj, out = []) {
  for (const v of Object.values(obj)) {
    if (v && typeof v === 'object') leafValues(v, out);
    else out.push(v);
  }
  return out;
}

test('全空 env → 所有葉值為 false（且皆為布林）', () => {
  const s = getNotificationEnvStatus({});
  const leaves = leafValues(s);
  assert.ok(leaves.length >= 12, '應涵蓋各通道旗標與 secrets');
  for (const v of leaves) assert.equal(v, false);
});

test('設值 → 對應布林為 true；序列化結果不含任何 env 值（防洩漏）', () => {
  const env = {
    RESEND_API_KEY: 're_sekret_abc',
    LINE_MESSAGING_ENABLED: '1',
    LINE_CHANNEL_ACCESS_TOKEN: 'line-token-xyz',
    TELEGRAM_NOTIFY_ENABLED: 'true',
    TELEGRAM_BOT_TOKEN: '123:tg-sekret',
    TELEGRAM_ORDER_CHAT_ID: '-100987654',
    TELEGRAM_ALERT_BOT_TOKEN: '456:alert-sekret',
  };
  // 防洩漏斷言只針對 secret 值（旗標值 '1'/'true' 與 JSON 布林字面天然重疊，不在此列）。
  const secretValues = [
    env.RESEND_API_KEY, env.LINE_CHANNEL_ACCESS_TOKEN, env.TELEGRAM_BOT_TOKEN,
    env.TELEGRAM_ORDER_CHAT_ID, env.TELEGRAM_ALERT_BOT_TOKEN,
  ];
  const s = getNotificationEnvStatus(env);
  assert.equal(s.email.secrets.RESEND_API_KEY, true);
  assert.equal(s.line.flags.LINE_MESSAGING_ENABLED, true);
  assert.equal(s.line.flags.LINE_GUIDE_PUSH_ENABLED, false);
  assert.equal(s.line.secrets.LINE_CHANNEL_ACCESS_TOKEN, true);
  assert.equal(s.telegram.flags.TELEGRAM_NOTIFY_ENABLED, true);
  assert.equal(s.telegram.secrets.TELEGRAM_BOT_TOKEN, true);
  assert.equal(s.telegram.secrets.TELEGRAM_WEBHOOK_SECRET, false);
  assert.equal(s.telegram.secrets.TELEGRAM_ORDER_CHAT_ID, true);
  assert.equal(s.telegramAlert.secrets.TELEGRAM_ALERT_BOT_TOKEN, true);

  const json = JSON.stringify(s);
  for (const value of secretValues) {
    assert.ok(!json.includes(value), `診斷輸出不得含 env 值：${value}`);
  }
  for (const v of leafValues(s)) assert.equal(typeof v, 'boolean');
});

test('空字串／純空白 → secret 視為不存在；旗標 0/off → false', () => {
  const s = getNotificationEnvStatus({
    TELEGRAM_BOT_TOKEN: '   ',
    RESEND_API_KEY: '',
    TELEGRAM_NOTIFY_ENABLED: '0',
    LINE_GUIDE_PUSH_ENABLED: 'off',
  });
  assert.equal(s.telegram.secrets.TELEGRAM_BOT_TOKEN, false);
  assert.equal(s.email.secrets.RESEND_API_KEY, false);
  assert.equal(s.telegram.flags.TELEGRAM_NOTIFY_ENABLED, false);
  assert.equal(s.line.flags.LINE_GUIDE_PUSH_ENABLED, false);
});

test('route 契約：v2 admin 端點用 jsonOk、env 讀取集中 config、不直讀 process.env', () => {
  const src = read('app/api/v2/admin/notification-env-status/route.ts');
  assert.match(src, /jsonOk/);
  assert.match(src, /getNotificationEnvStatus/);
  assert.match(src, /force-dynamic/);
  assert.ok(!src.includes('process.env'), 'route 不得直讀 process.env（ratchet：env 一律經 src/config）');
});
