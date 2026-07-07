import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const appDir = join(here, '..', '..', 'app', 'api', 'v2', 'admin', 'orders', '[orderId]');

function read(rel) {
  return readFileSync(join(appDir, rel), 'utf8');
}

test('admin 改訂單狀態 PATCH 路由接上 dispatchOrderEventTelegram', () => {
  const src = read('route.ts');
  assert.match(src, /dispatchOrderEventTelegram/, 'should import the telegram fan-out');
  assert.match(src, /adminStatusToTelegramKind/, 'should map admin status to an event kind');
  // 只有真的狀態改變且有對應事件種類時才派送
  assert.match(src, /statusChanged|status !== |!== before/i, 'should guard on an actual status change');
});

test('admin 取消訂單路由接上 dispatchOrderEventTelegram（order_cancelled）', () => {
  const src = read('cancel/route.ts');
  assert.match(src, /dispatchOrderEventTelegram/);
  assert.match(src, /order_cancelled/);
});

test('admin refund-execute 路由在成功時接上 dispatchOrderEventTelegram（refund_executed）', () => {
  const src = read('refund-execute/route.ts');
  assert.match(src, /dispatchOrderEventTelegram/);
  assert.match(src, /refund_executed/);
});

test('telegram 派送一律 fire-and-forget（.catch 不阻塞回應）', () => {
  for (const rel of ['route.ts', 'cancel/route.ts', 'refund-execute/route.ts']) {
    const src = read(rel);
    const idx = src.indexOf('dispatchOrderEventTelegram');
    const tail = src.slice(idx);
    assert.match(tail, /\.catch\(/, `${rel}: dispatchOrderEventTelegram 應 fire-and-forget`);
  }
});
