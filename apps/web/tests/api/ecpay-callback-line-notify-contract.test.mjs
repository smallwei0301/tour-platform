import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../../app/api/payments/ecpay/callback/route.ts');

test('ecpay callback line notify contract: gate notify by source_channel=line', async () => {
  const src = await fs.readFile(ROOT, 'utf8');

  assert.match(src, /select\('source_channel'\)/);
  assert.match(src, /if \(sourceChannel === 'line'\)/);
  // Migrated off LINE Notify (#302b): ops notify via Messaging API, gated on LINE source.
  assert.match(src, /notifyPaymentReceived/);
  assert.match(src, /ops notify via Messaging API/);
});
