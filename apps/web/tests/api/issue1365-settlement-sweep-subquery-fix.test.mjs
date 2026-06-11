import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Issue #1365 — settlement sweep raw-subquery hotfix.
 *
 * Live smoke against production (workflow_dispatch settlement-sweep) returned:
 *   HTTP 500 {"ok":false,"error":"invalid input syntax for type uuid:
 *             \"SELECT order_id FROM payout_items\""}
 *
 * Root cause: the route passed a raw SQL subquery string to PostgREST
 *   .not('id', 'in', '(SELECT order_id FROM payout_items)')
 * PostgREST does not support subqueries in in()/not.in() — it parsed the
 * literal text "SELECT order_id FROM payout_items" and tried to cast it to
 * uuid, crashing the whole sweep (settlement pipeline never ran).
 *
 * Fix: pre-fetch the already-settled order_ids from payout_items, then filter
 * the completed orders in JS. Idempotency is still guaranteed by the
 * upsert(onConflict: 'order_id', ignoreDuplicates: true) — the filter is an
 * optimization, not the safety net.
 */
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROUTE = path.resolve(
  __dirname,
  '../../app/api/internal/settlement/sweep/route.ts',
);

describe('#1365 settlement sweep — no raw subquery (uuid-cast crash)', () => {
  const SRC = readFileSync(ROUTE, 'utf-8');

  it('never passes a raw SQL subquery string to PostgREST', () => {
    assert.doesNotMatch(
      SRC,
      /\(\s*SELECT[\s\S]*?FROM[\s\S]*?\)/i,
      'a raw "(SELECT ... FROM ...)" string is cast to uuid by PostgREST and 500s the sweep',
    );
  });

  it('does not use .not(..., \'in\', ...) with an interpolated query string', () => {
    assert.doesNotMatch(
      SRC,
      /\.not\(\s*['"]id['"]\s*,\s*['"]in['"]\s*,\s*`\(SELECT/i,
      'the .not(id,in,(SELECT…)) anti-pattern must be gone',
    );
  });

  it('pre-fetches already-settled order_ids from payout_items', () => {
    // a dedicated read of payout_items.order_id must exist before filtering
    assert.match(
      SRC,
      /\.from\(\s*['"]payout_items['"]\s*\)[\s\S]*?\.select\(\s*['"]order_id['"]\s*\)/,
      'must SELECT order_id FROM payout_items as a real PostgREST query',
    );
  });

  it('filters completed orders against the settled set in JS', () => {
    assert.match(SRC, /new Set\(/, 'build a Set of settled order_ids');
    // the completed-orders query keeps the status filter but drops the bad .not
    assert.match(SRC, /\.eq\(\s*['"]status['"]\s*,\s*['"]completed['"]\s*\)/);
  });
});
