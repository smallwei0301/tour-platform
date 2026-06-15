import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const read = (rel) => fs.readFile(path.resolve(__dirname, '../..', rel), 'utf8');

test('telegram webhook route: rate-limited, secret-verified, always 200', async () => {
  const src = await read('app/api/telegram/webhook/route.ts');
  assert.match(src, /limiters\.telegramWebhook/);
  assert.match(src, /x-telegram-bot-api-secret-token/);
  assert.match(src, /processTelegramUpdate/);
  assert.match(src, /status:\s*200/);
});

test('guide telegram-binding route: auth + CSRF, mints code + deep link', async () => {
  const src = await read('app/api/guide/telegram-binding/route.ts');
  assert.match(src, /verifyGuideSession\(req\)/);
  assert.match(src, /validateCsrf\(req\)/);
  assert.match(src, /createTelegramBindCode\(\{ role: 'guide', subjectId: session\.guideId \}\)/);
  assert.match(src, /t\.me\//);
  assert.match(src, /TELEGRAM_BOT_USERNAME/);
});

test('traveler telegram-binding route: auth-gated mint', async () => {
  const src = await read('app/api/me/telegram-binding/route.ts');
  assert.match(src, /auth\.getUser\(\)/);
  assert.match(src, /createTelegramBindCode\(\{[\s\S]*role: 'traveler'/);
  assert.match(src, /t\.me\//);
});
