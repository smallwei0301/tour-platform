import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();

async function readOrderRoute() {
  const full = path.join(ROOT, 'app/api/v2/orders/[orderId]/route.ts');
  return readFile(full, 'utf8');
}

test('order detail route enforces unauthenticated access as 401', async () => {
  const src = await readOrderRoute();

  assert.match(src, /if \(!user\?\.id && !user\?\.email\)\s*\{[\s\S]*status:\s*401/);
  assert.match(src, /errorV2\('UNAUTHORIZED',\s*'Please login first'\)/);
});

test('order detail route denies non-owner with 403 and no success payload leakage', async () => {
  const src = await readOrderRoute();

  assert.match(src, /const hasAccess = isOrderOwner\(typedOrder,\s*\{[\s\S]*\}\);/);
  assert.match(src, /if \(!hasAccess\)\s*\{[\s\S]*errorV2\('FORBIDDEN',[\s\S]*status:\s*403/);

  const forbiddenBlock = src.match(/if \(!hasAccess\)\s*\{([\s\S]*?)\n\s*\}/);
  assert.ok(forbiddenBlock, 'FORBIDDEN block should exist');
  assert.doesNotMatch(forbiddenBlock[1], /contact_email|contact_phone|contact_name|total_twd|people_count/);
});

test('order detail route owner success payload includes expected fields', async () => {
  const src = await readOrderRoute();

  assert.match(src, /return Response\.json\(successV2\(\{/);
  assert.match(src, /id:\s*order\.id/);
  assert.match(src, /status:\s*order\.status/);
  assert.match(src, /paymentStatus:\s*order\.payment_status/);
  assert.match(src, /totalTwd:\s*order\.total_twd/);
  assert.match(src, /peopleCount:\s*order\.people_count/);
  assert.match(src, /contactName:\s*order\.contact_name/);
  assert.match(src, /contactEmail:\s*order\.contact_email/);
  assert.match(src, /contactPhone:\s*order\.contact_phone/);
  assert.match(src, /sourceChannel:\s*order\.source_channel/);
  assert.match(src, /createdAt:\s*order\.created_at/);
  assert.match(src, /items:\s*items\s*\|\|\s*\[\]/);
});
