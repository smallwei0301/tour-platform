import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const routePath = join(__dirname, '../../app/api/v2/orders/[orderId]/refund-preview/route.ts');
const routeSrc = readFileSync(routePath, 'utf8');

test('route exports GET handler', () => {
  assert.match(routeSrc, /export async function GET/);
});

test('route uses SUPABASE_URL (not NEXT_PUBLIC_SUPABASE_URL)', () => {
  // Must reference SUPABASE_URL (the private env var)
  assert.match(routeSrc, /getSupabaseUrl\(\)/); // #1616 env 走 config getter
  // Must NOT use NEXT_PUBLIC_SUPABASE_URL for the primary DB client
  // (it may reference it as a fallback for anon key but not for the service client URL)
  const serviceClientLines = routeSrc
    .split('\n')
    .filter(l => l.includes('createServiceClient(') || l.includes('createClient(supabaseUrl'));
  assert.ok(
    serviceClientLines.every(l => !l.includes('NEXT_PUBLIC_SUPABASE_URL')),
    'Service client must not use NEXT_PUBLIC_SUPABASE_URL'
  );
});

test('route imports calculateRefundAmount from refund-policy', () => {
  assert.match(routeSrc, /import.*calculateRefundAmount.*from.*refund-policy/);
});

test('route contains status guard for paid/confirmed', () => {
  // Must check for 'paid' and 'confirmed' statuses before proceeding
  assert.match(routeSrc, /['"]paid['"].*['"]confirmed['"]|['"]confirmed['"].*['"]paid['"]/);
  assert.match(routeSrc, /includes\(typedOrder\.status\)|includes\(order\.status\)/);
});

test('route handles missing active policy with graceful fallback', () => {
  // Must check for missing policy and return eligible:false
  assert.match(routeSrc, /refund policy not configured/);
  assert.match(routeSrc, /eligible: false/);
});

test('route uses Next.js 15 async params pattern', () => {
  // Must use await context.params
  assert.match(routeSrc, /await context\.params/);
});

test('route does not export anything other than GET and dynamic', () => {
  // Find all named exports
  const exportMatches = [...routeSrc.matchAll(/^export\s+(async\s+function|const|let|var|function)\s+(\w+)/gm)];
  const exportNames = exportMatches.map(m => m[2]);
  const allowedExports = new Set(['GET', 'dynamic']);
  for (const name of exportNames) {
    assert.ok(allowedExports.has(name), `Unexpected export: ${name}`);
  }
});
