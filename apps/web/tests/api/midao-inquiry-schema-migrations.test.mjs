import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const inquiriesMigrationUrl = new URL(
  '../../../../supabase/migrations/20260729190000_midao_inquiries.sql',
  import.meta.url,
);
const bookingMigrationUrl = new URL(
  '../../../../supabase/migrations/20260729191000_midao_booking_intake_pricing_and_confirmation.sql',
  import.meta.url,
);

async function readNormalized(url, label) {
  assert.equal(existsSync(url), true, `missing ${label}`);
  return (await readFile(url, 'utf8')).replace(/\s+/gu, ' ');
}

function assertRlsAndServiceRoleOnly(sql, table) {
  const escapedTable = table.replace('.', '\\.');
  assert.match(sql, new RegExp(`ALTER TABLE ${escapedTable} ENABLE ROW LEVEL SECURITY`, 'u'));
  assert.match(sql, new RegExp(`ALTER TABLE ${escapedTable} FORCE ROW LEVEL SECURITY`, 'u'));
  assert.match(sql, new RegExp(`REVOKE ALL ON TABLE ${escapedTable} FROM PUBLIC, anon, authenticated`, 'u'));
  assert.match(sql, new RegExp(`GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE ${escapedTable} TO service_role`, 'u'));
}

test('Task 32 inquiry migration defines state, ownership, indexes, and traveler RLS', async () => {
  const sql = await readNormalized(inquiriesMigrationUrl, 'Task 32 inquiries migration');

  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.guide_inquiries/u);
  assert.match(sql, /inquiry_no TEXT NOT NULL UNIQUE/u);
  assert.match(sql, /traveler_user_id UUID NOT NULL REFERENCES auth\.users\(id\)/u);
  assert.match(sql, /guide_id UUID NOT NULL REFERENCES public\.guide_profiles\(id\)/u);
  assert.match(sql, /activity_id UUID NOT NULL REFERENCES public\.activities\(id\)/u);
  assert.match(sql, /activity_plan_id UUID REFERENCES public\.activity_plans\(id\)/u);
  assert.match(sql, /status TEXT NOT NULL DEFAULT 'new'/u);
  assert.match(sql, /CHECK \(status IN \('new', 'opened', 'replied', 'ready_to_convert', 'converted', 'closed', 'expired'\)\)/u);
  assert.match(sql, /questionnaire_snapshot JSONB NOT NULL/u);
  assert.match(sql, /answers JSONB NOT NULL/u);
  assert.match(sql, /party_size INTEGER/u);
  assert.match(sql, /CHECK \(party_size IS NULL OR party_size >= 1\)/u);
  assert.match(sql, /converted_booking_id UUID UNIQUE/u);
  assert.match(sql, /CREATE INDEX IF NOT EXISTS midao_guide_inquiries_traveler_created_idx ON public\.guide_inquiries \(traveler_user_id, created_at DESC, id DESC\)/u);
  assert.match(sql, /CREATE INDEX IF NOT EXISTS midao_guide_inquiries_guide_status_updated_idx ON public\.guide_inquiries \(guide_id, status, updated_at DESC, id DESC\)/u);

  assertRlsAndServiceRoleOnly(sql, 'public.guide_inquiries');
  assert.match(sql, /CREATE POLICY midao_guide_inquiries_traveler_select ON public\.guide_inquiries FOR SELECT TO authenticated USING \(traveler_user_id = auth\.uid\(\)\)/u);
  assert.match(sql, /GRANT SELECT ON TABLE public\.guide_inquiries TO authenticated/u);
});

test('Task 32 booking migration binds one booking to one source inquiry and preserves immutable intake/pricing snapshots', async () => {
  const sql = await readNormalized(bookingMigrationUrl, 'Task 32 booking intake/pricing/confirmation migration');

  assert.match(sql, /ALTER TABLE public\.bookings ADD COLUMN IF NOT EXISTS source_inquiry_id UUID UNIQUE REFERENCES public\.guide_inquiries\(id\)/u);
  assert.match(sql, /ALTER TABLE public\.bookings ADD COLUMN IF NOT EXISTS traveler_confirmation_status TEXT NOT NULL DEFAULT 'not_required'/u);
  assert.match(sql, /CHECK \(traveler_confirmation_status IN \('not_required', 'pending', 'confirmed', 'expired'\)\)/u);
  assert.match(sql, /ALTER TABLE public\.bookings ADD COLUMN IF NOT EXISTS traveler_confirmation_expires_at TIMESTAMPTZ/u);
  assert.match(sql, /CREATE INDEX IF NOT EXISTS midao_bookings_source_inquiry_idx ON public\.bookings \(source_inquiry_id\) WHERE source_inquiry_id IS NOT NULL/u);

  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.booking_intake_responses/u);
  assert.match(sql, /booking_id UUID PRIMARY KEY REFERENCES public\.bookings\(id\)/u);
  assert.match(sql, /questionnaire_snapshot JSONB NOT NULL/u);
  assert.match(sql, /answers JSONB NOT NULL/u);

  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.booking_pricing_snapshots/u);
  assert.match(sql, /booking_id UUID PRIMARY KEY REFERENCES public\.bookings\(id\)/u);
  assert.match(sql, /source TEXT NOT NULL/u);
  assert.match(sql, /CHECK \(source IN \('plan_price', 'inquiry_quote'\)\)/u);
  assert.match(sql, /plan_base_price_twd INTEGER NOT NULL/u);
  assert.match(sql, /quoted_total_twd INTEGER NOT NULL/u);
  assert.match(sql, /currency TEXT NOT NULL DEFAULT 'TWD'/u);
  assert.match(sql, /party_size INTEGER NOT NULL/u);
  assert.match(sql, /CHECK \(plan_base_price_twd >= 0\)/u);
  assert.match(sql, /CHECK \(quoted_total_twd >= 0\)/u);
  assert.match(sql, /CHECK \(party_size >= 1\)/u);

  assertRlsAndServiceRoleOnly(sql, 'public.booking_intake_responses');
  assertRlsAndServiceRoleOnly(sql, 'public.booking_pricing_snapshots');
});

test('Task 32 confirmation storage is hash-only, one-time, and never persists a raw token', async () => {
  const sql = await readNormalized(bookingMigrationUrl, 'Task 32 booking intake/pricing/confirmation migration');

  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.booking_confirmation_tokens/u);
  assert.match(sql, /booking_id UUID PRIMARY KEY REFERENCES public\.bookings\(id\)/u);
  assert.match(sql, /token_hash TEXT NOT NULL UNIQUE/u);
  assert.match(sql, /expires_at TIMESTAMPTZ NOT NULL/u);
  assert.match(sql, /consumed_at TIMESTAMPTZ/u);
  assert.match(sql, /CREATE INDEX IF NOT EXISTS midao_booking_confirmation_tokens_pending_expiry_idx ON public\.booking_confirmation_tokens \(expires_at, booking_id\) WHERE consumed_at IS NULL/u);
  assert.doesNotMatch(sql, /\b(?:raw_)?token\s+(?:TEXT|VARCHAR|UUID)\b/iu);

  assertRlsAndServiceRoleOnly(sql, 'public.booking_confirmation_tokens');
});
