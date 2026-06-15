import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const NOTIFY = path.resolve(__dirname, '../../src/lib/line-notify.ts');

// LINE Notify was shut down by LINE on 2025-03-31. The ops notifications must
// no longer call it and must route through the Messaging API ops push instead.
test('line-notify migration: no LINE Notify endpoint remains', async () => {
  const src = await fs.readFile(NOTIFY, 'utf8');
  assert.doesNotMatch(src, /notify-api\.line\.me/);
  assert.doesNotMatch(src, /LINE_NOTIFY_ACCESS_TOKEN/);
});

test('line-notify migration: ops notifications route through Messaging API pushToOps', async () => {
  const src = await fs.readFile(NOTIFY, 'utf8');
  assert.match(src, /pushToOps/);
  assert.match(src, /from '\.\/line-messaging/);
});

test('line-notify migration: public function names + OrderNotifyData preserved', async () => {
  const src = await fs.readFile(NOTIFY, 'utf8');
  for (const fn of [
    'notifyNewOrder',
    'notifyPaymentReceived',
    'notifyOrderCancelled',
    'notifyRefundRequest',
    'notifyRefundExecuted',
    'notifySystemError',
  ]) {
    assert.match(src, new RegExp(`export async function ${fn}\\b`), `missing export ${fn}`);
  }
  assert.match(src, /export interface OrderNotifyData/);
});
