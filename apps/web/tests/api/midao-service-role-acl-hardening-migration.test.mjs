import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationPath = new URL('../../../../supabase/migrations/20260723003500_midao_service_role_acl_hardening.sql', import.meta.url);

const expectedStatements = [
  'REVOKE ALL ON TABLE public.midao_notification_outbox FROM service_role',
  'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.midao_notification_outbox TO service_role',
  'REVOKE ALL ON TABLE public.midao_idempotency_records FROM service_role',
  'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.midao_idempotency_records TO service_role',
  'REVOKE ALL ON TABLE public.midao_audit_events FROM service_role',
  'GRANT SELECT, INSERT ON TABLE public.midao_audit_events TO service_role',
];

test('service-role ACL hardening is an exact revoke-before-grant allowlist', async () => {
  const sql = await readFile(migrationPath, 'utf8');
  const statements = sql.split(';').map((statement) => statement.trim().replace(/\s+/gu, ' ')).filter(Boolean);
  assert.deepEqual(statements, expectedStatements);
});
