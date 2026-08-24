import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationUrl = new URL(
  '../../../../supabase/migrations/20260824135300_issue1861_midao_request_claims_bridge.sql',
  import.meta.url,
);

test('claim bridge migration is isolated, service-only, and never crosses booking or notification boundaries', async () => {
  const sql = await readFile(migrationUrl, 'utf8');
  for (const required of [
    'CREATE TABLE public.midao_request_claims',
    'CREATE TABLE public.midao_request_inquiry_mappings',
    'FORCE ROW LEVEL SECURITY',
    'SECURITY DEFINER',
    'SET search_path = pg_catalog',
    'REVOKE ALL ON FUNCTION',
    'GRANT EXECUTE ON FUNCTION',
    'midao_issue_request_with_claim',
    'midao_bridge_request_claim',
    "INTERVAL '24 hours'",
  ]) assert.match(sql, new RegExp(required.replaceAll(/[.*+?^${}()|[\]\\]/gu, '\\$&'), 'u'));

  for (const forbidden of ['public.orders', 'public.bookings', 'public.midao_notification_outbox', 'booking_confirmation_tokens']) {
    assert.equal(sql.includes(forbidden), false, `claim bridge must not touch ${forbidden}`);
  }
  assert.equal(sql.includes('p_raw_token'), false, 'raw capability must never enter SQL/RPC arguments');
});
