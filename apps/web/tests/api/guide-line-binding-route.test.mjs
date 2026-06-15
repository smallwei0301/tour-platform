import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// Route files use extensionless imports resolved by the Next bundler, so they
// are not importable under node:test. Following the repo convention we assert
// the route's contract via source text; behaviour is covered at the lib level
// in guide-line-binding.test.mjs.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROUTE = path.resolve(__dirname, '../../app/api/guide/line-binding/route.ts');

test('guide line-binding route: auth + CSRF gated, mints code + deep link', async () => {
  const src = await fs.readFile(ROUTE, 'utf8');

  // both verbs require a guide session
  assert.match(src, /verifyGuideSession\(req\)/);
  assert.match(src, /fail\('UNAUTHORIZED'/);
  assert.match(src, /export async function GET/);
  assert.match(src, /export async function POST/);

  // POST is CSRF-protected (cookie mutation)
  assert.match(src, /validateCsrf\(req\)/);

  // POST mints a one-time code for the signed-in guide and builds the deep link
  assert.match(src, /createGuideBindCode\(session\.guideId\)/);
  assert.match(src, /LINE_BOT_BASIC_ID/);
  assert.match(src, /line\.me\/R\/oaMessage/);

  // GET reports binding status without leaking the raw line_user_id
  assert.match(src, /getGuideBinding\(session\.guideId\)/);
  assert.match(src, /maskLineUserId/);
});
