import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(process.cwd(), 'app/api/payments/ecpay/callback/route.ts');

test('ecpay callback line notify contract: gate notify by source_channel=line', async () => {
  const src = await fs.readFile(ROOT, 'utf8');

  assert.match(src, /select\('source_channel'\)/);
  assert.match(src, /if \(sourceChannel === 'line'\)/);
  assert.match(src, /Truthful scope: current implementation uses LINE Notify/);
});
