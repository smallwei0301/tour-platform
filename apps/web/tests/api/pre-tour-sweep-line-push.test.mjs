import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const { sendReminder } = await import('../../src/lib/pre-tour-reminder.ts');

const FLAGS = ['LINE_MESSAGING_ENABLED', 'LINE_CHANNEL_ACCESS_TOKEN'];

function withFetch(overrides, fn) {
  const saved = {};
  for (const k of FLAGS) saved[k] = process.env[k];
  const savedFetch = global.fetch;
  const calls = [];
  global.fetch = async (url, init) => {
    calls.push({ url, init });
    return { ok: true, status: 200, statusText: 'OK', json: async () => ({}) };
  };
  for (const k of FLAGS) delete process.env[k];
  for (const [k, v] of Object.entries(overrides)) process.env[k] = v;
  return Promise.resolve(fn(calls)).finally(() => {
    global.fetch = savedFetch;
    for (const k of FLAGS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });
}

test('sendReminder line_push: composes → pushes to lineUserId', async () => {
  await withFetch({ LINE_MESSAGING_ENABLED: '1', LINE_CHANNEL_ACCESS_TOKEN: 'tok'.repeat(12) }, async (calls) => {
    await sendReminder('line_push', { lineUserId: 'Urem', body: '明天出發提醒' });
    assert.equal(calls.length, 1);
    const body = JSON.parse(calls[0].init.body);
    assert.equal(body.to, 'Urem');
    assert.match(JSON.stringify(body.messages), /明天出發提醒/);
  });
});

test('sendReminder line_push: no lineUserId → no push', async () => {
  await withFetch({ LINE_MESSAGING_ENABLED: '1', LINE_CHANNEL_ACCESS_TOKEN: 'tok'.repeat(12) }, async (calls) => {
    await sendReminder('line_push', { body: '提醒' });
    assert.equal(calls.length, 0);
  });
});

// Sweep route contract: line_push channel is flag-gated, resolves a binding,
// skips unbound travelers, and uses the existing (order,kind,channel) idempotency.
test('pre-tour-sweep: line_push channel is flag-gated and binding-resolved', async () => {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const src = await fs.readFile(
    path.resolve(__dirname, '../../app/api/internal/reminders/pre-tour-sweep/route.ts'),
    'utf8',
  );
  assert.match(src, /isLinePushEnabled/);
  assert.match(src, /'line_push'/);
  assert.match(src, /getLineUserIdForOrder/);
  assert.match(src, /no_line_binding/);
  // user_id must be selected so bindings resolve by traveler
  assert.match(src, /\buser_id\b/);
});

test('pre-tour-reminder: ReminderChannel includes line_push', async () => {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const src = await fs.readFile(path.resolve(__dirname, '../../src/lib/pre-tour-reminder.ts'), 'utf8');
  assert.match(src, /'line_push'/);
});
